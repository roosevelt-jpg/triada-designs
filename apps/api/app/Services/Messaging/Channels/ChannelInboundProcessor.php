<?php

namespace App\Services\Messaging\Channels;

use App\Models\Contact;
use App\Models\ContactIdentity;
use App\Models\Conversation;
use App\Models\Integration;
use App\Models\Message;
use App\Models\WebhookEvent;
use App\Models\Workspace;
use App\Services\AI\AiOrchestrator;
use App\Services\Automations\WorkflowExecutor;
use App\Services\Messaging\DTOs\NormalizedMessage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Shared inbound path for Telegram, TikTok, Email, and Webchat.
 */
class ChannelInboundProcessor
{
    public function __construct(
        protected WorkflowExecutor $workflows,
        protected AiOrchestrator $ai,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function ingestNormalized(
        Workspace $workspace,
        string $channel,
        NormalizedMessage $item,
        ?string $rawBody = null,
        bool $runAi = true
    ): array {
        $integration = Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', $channel)
            ->first();

        $persisted = DB::transaction(function () use ($workspace, $integration, $item, $rawBody, $channel) {
            $eventId = $item->providerEventId ?: (string) Str::ulid();

            if ($integration) {
                $existing = WebhookEvent::query()
                    ->where('integration_id', $integration->id)
                    ->where('provider_event_id', $eventId)
                    ->first();

                if ($existing) {
                    return ['deduplicated' => true, 'provider_message_id' => $item->providerMessageId];
                }
            }

            if ($item->providerMessageId) {
                $dupMessage = Message::query()
                    ->where('workspace_id', $workspace->id)
                    ->where('provider_message_id', $item->providerMessageId)
                    ->first();
                if ($dupMessage) {
                    return ['deduplicated' => true, 'provider_message_id' => $item->providerMessageId];
                }
            }

            $identity = ContactIdentity::query()->firstOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'provider' => $channel,
                    'external_identity_id' => $item->externalUserId,
                ],
                [
                    'contact_id' => Contact::query()->create([
                        'workspace_id' => $workspace->id,
                        'name' => $item->metadata['contact_name'] ?? (ucfirst($channel).' contact'),
                        'email' => $item->metadata['email'] ?? null,
                        'email_normalized' => isset($item->metadata['email'])
                            ? strtolower((string) $item->metadata['email'])
                            : null,
                        'source' => $channel,
                        'lifecycle_status' => 'lead',
                        'preferred_language' => 'en',
                    ])->id,
                    'identity_type' => 'user',
                    'verified_at' => now(),
                ]
            );

            $contact = Contact::query()->findOrFail($identity->contact_id);

            $conversation = Conversation::query()->firstOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'external_conversation_id' => $item->externalConversationId ?: ($channel.':'.$item->externalUserId),
                ],
                [
                    'contact_id' => $contact->id,
                    'integration_id' => $integration?->id,
                    'channel' => $channel,
                    'status' => 'open',
                    'priority' => 'normal',
                    'automation_mode' => 'ai',
                    'detected_language' => 'en',
                    'last_message_at' => now(),
                    'last_inbound_at' => now(),
                ]
            );

            $message = Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $conversation->id,
                'provider_message_id' => $item->providerMessageId ?: $eventId,
                'direction' => 'inbound',
                'sender_type' => 'contact',
                'sender_id' => $contact->id,
                'message_type' => $item->messageType ?: 'text',
                'body' => $item->body,
                'detected_language' => 'en',
                'delivery_status' => 'received',
                'provider_timestamp' => $item->timestamp ? date('Y-m-d H:i:s', strtotime($item->timestamp)) : now(),
                'metadata' => $item->metadata,
            ]);

            $conversation->forceFill([
                'last_message_at' => now(),
                'last_inbound_at' => now(),
                'integration_id' => $conversation->integration_id ?: $integration?->id,
            ])->save();

            if ($integration) {
                WebhookEvent::query()->create([
                    'workspace_id' => $workspace->id,
                    'integration_id' => $integration->id,
                    'provider_event_id' => $eventId,
                    'event_type' => $channel.'.message',
                    'payload_hash' => $rawBody ? hash('sha256', $rawBody) : hash('sha256', json_encode($item->toArray())),
                    'processing_status' => 'processed',
                    'attempts' => 1,
                    'received_at' => now(),
                    'processed_at' => now(),
                ]);
            }

            return [
                'deduplicated' => false,
                'contact' => $contact->toArray(),
                'conversation' => $conversation->fresh()->toArray(),
                'message' => $message->toArray(),
            ];
        });

        if ($persisted['deduplicated'] ?? false) {
            return ['ok' => true, 'channel' => $channel, 'messages' => [$persisted], 'ai' => null];
        }

        $ai = null;
        $automation = null;

        if ($runAi
            && (($persisted['conversation']['automation_mode'] ?? 'ai') === 'ai')
            && ! $workspace->automations_paused
        ) {
            $ai = $this->ai->processInbound($workspace, [
                'message' => $item->body,
                'channel' => $channel,
                'conversation_id' => $persisted['conversation']['id'] ?? null,
                'contact_id' => $persisted['contact']['id'] ?? null,
            ]);

            $workflow = $workspace->automationWorkflows()
                ->where('status', 'active')
                ->whereIn('trigger_type', ['incoming_message', 'incoming_meta_message'])
                ->first();

            if ($workflow) {
                try {
                    $executed = $this->workflows->execute(
                        $workflow,
                        [
                            'channel' => $channel,
                            'conversation_id' => $persisted['conversation']['id'] ?? null,
                            'contact_id' => $persisted['contact']['id'] ?? null,
                            'message_body' => $item->body,
                            'draft_reply' => ['body' => $ai['suggested_reply'] ?? null],
                            'automation_mode' => 'ai',
                        ],
                        'live',
                        $item->providerMessageId,
                        $channel.'-inbound-'.$item->providerEventId,
                    );
                    $automation = [
                        'workflow_id' => $workflow->id,
                        'run_id' => $executed['run']->id,
                        'status' => $executed['run']->status,
                    ];
                } catch (\Throwable $e) {
                    $automation = ['error' => $e->getMessage()];
                }
            }
        }

        return [
            'ok' => true,
            'channel' => $channel,
            'messages' => [$persisted],
            'ai' => $ai,
            'automations' => $automation ? [$automation] : [],
        ];
    }
}
