<?php

namespace App\Services\Messaging\Meta;

use App\Models\AuditLog;
use App\Models\Contact;
use App\Models\ContactIdentity;
use App\Models\Conversation;
use App\Models\Integration;
use App\Models\Message;
use App\Models\WebhookEvent;
use App\Models\Workspace;
use App\Services\AI\AiOrchestrator;
use App\Services\AI\CustomerLanguageDetector;
use App\Services\Automations\WorkflowExecutor;
use App\Services\Messaging\DTOs\NormalizedMessage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MetaInboundProcessor
{
    public function __construct(
        protected MetaChannelRegistry $registry,
        protected WorkflowExecutor $workflows,
        protected AiOrchestrator $ai,
    ) {
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok:bool,deduplicated?:bool,messages:list<array<string,mixed>>,automations:list<array<string,mixed>>}
     */
    public function ingest(Workspace $workspace, array $payload, ?string $rawBody = null): array
    {
        $adapter = $this->registry->resolveFromPayload($payload);
        if (! $adapter) {
            return ['ok' => false, 'messages' => [], 'automations' => [], 'error' => 'Unrecognized Meta payload'];
        }

        $channel = $adapter->channelKey();
        $integration = $this->integrationFor($workspace, $channel);
        $normalized = $adapter->normalizeIncomingEvent($payload);

        if ($normalized === []) {
            return ['ok' => true, 'messages' => [], 'automations' => [], 'ignored' => true];
        }

        $stored = [];
        $automations = [];

        foreach ($normalized as $item) {
            $result = $this->persistNormalized($workspace, $integration, $item, $rawBody);
            if ($result['deduplicated'] ?? false) {
                $stored[] = ['deduplicated' => true, 'provider_message_id' => $item->providerMessageId];
                continue;
            }

            $stored[] = $result;

            if (($result['conversation']['automation_mode'] ?? 'ai') === 'human') {
                $automations[] = [
                    'skipped' => true,
                    'reason' => 'human_takeover',
                    'conversation_id' => $result['conversation']['id'] ?? null,
                ];
                continue;
            }

            if ($workspace->automations_paused) {
                $automations[] = [
                    'skipped' => true,
                    'reason' => 'automations_paused',
                    'conversation_id' => $result['conversation']['id'] ?? null,
                ];
                continue;
            }

            $aiResult = null;
            try {
                $aiResult = $this->ai->processInbound($workspace, [
                    'message' => $item->body,
                    'channel' => $channel,
                    'conversation_id' => $result['conversation']['id'] ?? null,
                    'contact_id' => $result['contact']['id'] ?? null,
                    'detected_language' => $result['conversation']['detected_language']
                        ?? $result['message']['detected_language']
                        ?? null,
                    'preferred_language' => $result['contact']['preferred_language'] ?? null,
                ]);
            } catch (\Throwable $e) {
                $aiResult = ['ok' => false, 'error' => $e->getMessage()];
            }

            $run = $this->maybeRunAutomation($workspace, $channel, $result, $item, $aiResult);
            if ($run) {
                $automations[] = $run;
            }

            $result['ai'] = [
                'intent' => $aiResult['intent'] ?? null,
                'suggested_reply' => $aiResult['suggested_reply'] ?? null,
                'needs_human' => $aiResult['needs_human'] ?? false,
            ];
            $stored[array_key_last($stored)] = $result;
        }

        return [
            'ok' => true,
            'channel' => $channel,
            'messages' => $stored,
            'automations' => $automations,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function persistNormalized(
        Workspace $workspace,
        ?Integration $integration,
        NormalizedMessage $item,
        ?string $rawBody
    ): array {
        return DB::transaction(function () use ($workspace, $integration, $item, $rawBody) {
            $eventId = $item->providerEventId ?: (string) Str::ulid();

            if ($integration) {
                $existingEvent = WebhookEvent::query()
                    ->where('integration_id', $integration->id)
                    ->where('provider_event_id', $eventId)
                    ->first();

                if ($existingEvent) {
                    return ['deduplicated' => true];
                }
            }

            if ($item->providerMessageId) {
                $existingMessage = Message::query()
                    ->where('workspace_id', $workspace->id)
                    ->where('provider_message_id', $item->providerMessageId)
                    ->first();

                if ($existingMessage) {
                    if ($integration) {
                        WebhookEvent::query()->firstOrCreate(
                            [
                                'integration_id' => $integration->id,
                                'provider_event_id' => $eventId,
                            ],
                            [
                                'workspace_id' => $workspace->id,
                                'event_type' => $item->channel.'.message',
                                'payload_hash' => $rawBody ? hash('sha256', $rawBody) : null,
                                'processing_status' => 'deduplicated',
                                'attempts' => 1,
                                'received_at' => now(),
                                'processed_at' => now(),
                            ]
                        );
                    }

                    return ['deduplicated' => true];
                }
            }

            $identity = ContactIdentity::query()->firstOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'provider' => $item->channel,
                    'external_identity_id' => $item->externalUserId,
                ],
                [
                    'contact_id' => Contact::query()->create([
                        'workspace_id' => $workspace->id,
                        'name' => $item->metadata['contact_name'] ?? ucfirst($item->channel).' contact',
                        'phone' => $item->channel === 'whatsapp' ? $item->externalUserId : null,
                        'phone_normalized' => $item->channel === 'whatsapp' ? preg_replace('/\D+/', '', $item->externalUserId) : null,
                        'preferred_language' => 'en',
                        'lifecycle_status' => 'lead',
                        'source' => $item->channel,
                        'metadata' => ['page_or_account_id' => $item->pageOrAccountId],
                    ])->id,
                    'identity_type' => 'user',
                    'verified_at' => now(),
                ]
            );

            $contact = Contact::query()->findOrFail($identity->contact_id);

            $detected = app(CustomerLanguageDetector::class)->detect((string) $item->body, [
                'hint' => (string) ($contact->preferred_language ?? ''),
                'fallback' => 'en',
            ]);
            $langCode = $detected['code'];

            $conversation = Conversation::query()->firstOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'external_conversation_id' => $item->externalConversationId ?: ($item->channel.':'.$item->externalUserId),
                ],
                [
                    'contact_id' => $contact->id,
                    'integration_id' => $integration?->id,
                    'channel' => $item->channel,
                    'status' => 'open',
                    'priority' => 'normal',
                    'automation_mode' => 'ai',
                    'detected_language' => $langCode,
                    'last_message_at' => now(),
                    'last_inbound_at' => now(),
                ]
            );

            $message = Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $conversation->id,
                'provider_message_id' => $item->providerMessageId,
                'direction' => 'inbound',
                'sender_type' => 'contact',
                'sender_id' => $contact->id,
                'message_type' => $item->messageType,
                'body' => $item->body,
                'detected_language' => $langCode,
                'delivery_status' => 'received',
                'provider_timestamp' => $item->timestamp ? date('Y-m-d H:i:s', strtotime($item->timestamp)) : now(),
                'metadata' => array_merge($item->metadata, [
                    'page_or_account_id' => $item->pageOrAccountId,
                    'language_method' => $detected['method'],
                    'language_confidence' => $detected['confidence'],
                ]),
            ]);

            $conversation->forceFill([
                'last_message_at' => now(),
                'last_inbound_at' => now(),
                'detected_language' => $langCode,
                'integration_id' => $conversation->integration_id ?: $integration?->id,
            ])->save();

            // Do not overwrite preferred_language on first contact before the
            // English greeting + language-preference ask locks a choice.
            $contactMeta = is_array($contact->metadata) ? $contact->metadata : [];
            $langLocked = ($contactMeta['language_preference_locked'] ?? false) === true
                || ($contactMeta['language_preference_confirmed'] ?? false) === true;
            $langAsked = ($contactMeta['language_preference_asked'] ?? false) === true;
            if ($langLocked && $detected['confidence'] >= 0.7 && $langCode !== ($contact->preferred_language ?: '')) {
                // Customer switched languages mid-thread — follow them.
                $contactMeta['language_preference_locked'] = true;
                $contactMeta['language_preference_confirmed'] = true;
                $contact->forceFill([
                    'preferred_language' => $langCode,
                    'metadata' => $contactMeta,
                ])->save();
            } elseif (! $langAsked && ! $langLocked && empty($contact->preferred_language)) {
                $contact->forceFill(['preferred_language' => 'en'])->save();
            }

            if ($integration) {
                WebhookEvent::query()->create([
                    'workspace_id' => $workspace->id,
                    'integration_id' => $integration->id,
                    'provider_event_id' => $eventId,
                    'event_type' => $item->channel.'.message',
                    'payload_hash' => $rawBody ? hash('sha256', $rawBody) : null,
                    'processing_status' => 'processed',
                    'attempts' => 1,
                    'received_at' => now(),
                    'processed_at' => now(),
                ]);
            }

            AuditLog::query()->create([
                'workspace_id' => $workspace->id,
                'actor_type' => 'system',
                'actor_id' => $item->channel,
                'action' => 'meta.inbound_message',
                'target_type' => 'conversation',
                'target_id' => $conversation->id,
                'created_at' => now(),
                'metadata' => [
                    'message_id' => $message->id,
                    'provider_message_id' => $item->providerMessageId,
                ],
            ]);

            return [
                'deduplicated' => false,
                'message' => $message->toArray(),
                'conversation' => $conversation->fresh()->toArray(),
                'contact' => $contact->toArray(),
            ];
        });
    }

    /**
     * @param  array<string, mixed>  $persisted
     * @return array<string, mixed>|null
     */
    protected function maybeRunAutomation(
        Workspace $workspace,
        string $channel,
        array $persisted,
        NormalizedMessage $item,
        ?array $aiResult = null
    ): ?array {
        $trigger = in_array($channel, ['facebook', 'instagram', 'whatsapp'], true)
            ? 'incoming_meta_message'
            : 'incoming_message';

        $workflow = $workspace->automationWorkflows()
            ->where('status', 'active')
            ->whereIn('trigger_type', [$trigger, 'incoming_message'])
            ->orderByRaw("CASE WHEN trigger_type = ? THEN 0 ELSE 1 END", [$trigger])
            ->first();

        if (! $workflow) {
            return null;
        }

        $context = [
            'channel' => $channel,
            'intent' => $aiResult['intent'] ?? 'product_inquiry',
            'automation_mode' => $persisted['conversation']['automation_mode'] ?? 'ai',
            'conversation_id' => $persisted['conversation']['id'] ?? null,
            'contact_id' => $persisted['contact']['id'] ?? null,
            'message_body' => $item->body,
            'customer_message' => $item->body,
            'detected_language' => $aiResult['detected_language']
                ?? $persisted['conversation']['detected_language']
                ?? $persisted['message']['detected_language']
                ?? null,
            'preferred_language' => $persisted['contact']['preferred_language'] ?? null,
            'draft_reply' => ['body' => $aiResult['suggested_reply'] ?? null],
            'requires_whatsapp_template' => false,
            'needs_human' => $aiResult['needs_human'] ?? false,
        ];

        try {
            $executed = $this->workflows->execute(
                $workflow,
                $context,
                'live',
                $item->providerMessageId,
                'meta-inbound-'.$item->providerEventId,
            );

            $run = $executed['run'];

            return [
                'workflow_id' => $workflow->id,
                'run_id' => $run->id,
                'status' => $run->status,
            ];
        } catch (\Throwable $e) {
            return [
                'workflow_id' => $workflow->id,
                'error' => $e->getMessage(),
            ];
        }
    }

    protected function integrationFor(Workspace $workspace, string $channel): ?Integration
    {
        $provider = match ($channel) {
            'facebook' => 'facebook',
            'instagram' => 'instagram',
            'whatsapp' => 'whatsapp',
            default => $channel,
        };

        return Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', $provider)
            ->first();
    }
}
