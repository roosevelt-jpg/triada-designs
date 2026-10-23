<?php

namespace App\Services\Automations;

use App\Models\ContentItem;
use App\Models\Conversation;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Task;
use App\Models\Workspace;
use App\Services\AI\AiOrchestrator;
use App\Services\Creative\CreativeMediaService;
use App\Services\CRM\Zoho\ZohoCrmClient;
use App\Services\Messaging\DTOs\OutboundMessage;
use App\Services\Messaging\Meta\MetaChannelRegistry;
use App\Services\Messaging\Meta\OutboundEligibility;
use App\Services\Messaging\Meta\WhatsAppCloudTemplateService;
use Illuminate\Support\Str;

class ActionExecutor
{
    public function __construct(
        protected ZohoCrmClient $zoho,
        protected MetaChannelRegistry $metaChannels,
        protected OutboundEligibility $eligibility,
        protected AiOrchestrator $ai,
    ) {
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,dry_run?:bool,result?:array<string,mixed>,error?:string,skipped?:bool}
     */
    public function execute(
        Workspace $workspace,
        string $actionType,
        array $config,
        array &$context,
        bool $dryRun
    ): array {
        return match ($actionType) {
            'create_task' => $this->createTask($workspace, $config, $context, $dryRun),
            'update_lead_stage' => $this->updateLeadStage($workspace, $config, $context, $dryRun),
            'assign_conversation', 'assign_human' => $this->assignConversation($workspace, $config, $context, $dryRun),
            'add_tag' => $this->addTag($config, $context, $dryRun),
            'notify_team' => $this->notifyTeam($config, $context, $dryRun),
            'draft_reply', 'ai_reply' => $this->draftReply($workspace, $config, $context, $dryRun),
            'ai_classify' => $this->aiAction($workspace, 'support', 'classify', $context, $dryRun),
            'ai_qualify' => $this->aiAction($workspace, 'lead_qualification', 'qualify', $context, $dryRun),
            'ai_escalate' => $this->aiAction($workspace, 'support', 'escalate', $context, $dryRun),
            'send_eligible_reply' => $this->sendEligibleReply($workspace, $config, $context, $dryRun),
            'create_content_draft' => $this->createContentDraft($workspace, $config, $context, $dryRun),
            'sync_zoho_lead', 'sync_crm' => $this->syncZohoLead($workspace, $context, $dryRun),
            'sync_shopify' => $this->syncShopify($workspace, $config, $context, $dryRun),
            'publish_channel_template' => $this->publishChannelTemplate($workspace, $config, $context, $dryRun),
            'send_whatsapp_template' => $this->sendWhatsAppTemplate($workspace, $config, $context, $dryRun),
            'check_whatsapp_opt_out' => $this->checkWhatsAppOptOut($config, $context, $dryRun),
            'whatsapp_window_follow_up' => $this->whatsappWindowFollowUp($workspace, $config, $context, $dryRun),
            'generate_content_image' => $this->generateContentCreative($workspace, 'image', $config, $context, $dryRun),
            'generate_content_variants' => $this->generateContentCreative($workspace, 'variants', $config, $context, $dryRun),
            'generate_content_video' => $this->generateContentCreative($workspace, 'video', $config, $context, $dryRun),
            default => ['ok' => false, 'error' => "Unsupported action: {$actionType}"],
        };
    }

    protected function createTask(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $title = (string) ($config['title'] ?? 'Follow-up task');
        $payload = [
            'workspace_id' => $workspace->id,
            'contact_id' => $context['contact_id'] ?? null,
            'conversation_id' => $context['conversation_id'] ?? null,
            'lead_id' => $context['lead_id'] ?? null,
            'assigned_user_id' => $context['assigned_user_id'] ?? null,
            'type' => (string) ($config['type'] ?? 'follow_up'),
            'title' => $title,
            'description' => (string) ($config['description'] ?? ''),
            'due_at' => now()->addDay(),
            'status' => 'open',
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => ['would_create_task' => $payload]];
        }

        $task = Task::query()->create($payload);
        $context['task_id'] = $task->id;

        return ['ok' => true, 'result' => ['task_id' => $task->id, 'title' => $task->title]];
    }

    protected function updateLeadStage(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $stage = (string) ($config['stage'] ?? 'contacted');
        $leadId = $context['lead_id'] ?? null;

        if (! $leadId) {
            return ['ok' => false, 'error' => 'No lead_id in context'];
        }

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => ['lead_id' => $leadId, 'stage' => $stage]];
        }

        $lead = Lead::query()
            ->where('workspace_id', $workspace->id)
            ->where('id', $leadId)
            ->first();

        if (! $lead) {
            return ['ok' => false, 'error' => 'Lead not found'];
        }

        $lead->forceFill(['stage' => $stage])->save();
        $context['lead_stage'] = $stage;

        return ['ok' => true, 'result' => ['lead_id' => $lead->id, 'stage' => $stage]];
    }

    protected function assignConversation(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $conversationId = $context['conversation_id'] ?? null;
        $userId = $config['user_id'] ?? $context['assigned_user_id'] ?? null;

        if (! $conversationId) {
            return ['ok' => false, 'error' => 'No conversation_id in context'];
        }

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => [
                'conversation_id' => $conversationId,
                'assigned_user_id' => $userId,
            ]];
        }

        $conversation = Conversation::query()
            ->where('workspace_id', $workspace->id)
            ->where('id', $conversationId)
            ->first();

        if (! $conversation) {
            return ['ok' => false, 'error' => 'Conversation not found'];
        }

        $conversation->forceFill([
            'assigned_user_id' => $userId,
            'automation_mode' => 'human',
        ])->save();

        return ['ok' => true, 'result' => [
            'conversation_id' => $conversation->id,
            'assigned_user_id' => $userId,
            'automation_mode' => 'human',
        ]];
    }

    protected function addTag(array $config, array &$context, bool $dryRun): array
    {
        $tag = (string) ($config['tag'] ?? 'automation');
        $tags = $context['tags'] ?? [];
        if (! in_array($tag, $tags, true)) {
            $tags[] = $tag;
        }

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => ['tags' => $tags]];
        }

        $context['tags'] = $tags;

        return ['ok' => true, 'result' => ['tags' => $tags]];
    }

    protected function notifyTeam(array $config, array &$context, bool $dryRun): array
    {
        $message = (string) ($config['message'] ?? 'Automation notification');
        $notification = [
            'id' => (string) Str::ulid(),
            'message' => $message,
            'at' => now()->toIso8601String(),
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => $notification];
        }

        $context['notifications'] = array_values(array_merge($context['notifications'] ?? [], [$notification]));

        return ['ok' => true, 'result' => $notification];
    }

    protected function draftReply(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $message = (string) ($context['message_body'] ?? $context['body'] ?? $context['message'] ?? '');
        $useAi = (bool) ($config['use_ai'] ?? true);

        if ($useAi && $message !== '') {
            $result = $this->ai->runAgent($workspace, (string) ($config['agent_key'] ?? 'support'), 'draft_reply', [
                'message' => $message,
                'channel' => $context['channel'] ?? 'webchat',
                'conversation_id' => $context['conversation_id'] ?? null,
                'contact_id' => $context['contact_id'] ?? null,
                'dry_run' => $dryRun,
            ]);

            $draft = [
                'body' => (string) ($result['text'] ?? $config['template'] ?? ''),
                'ai_generated' => true,
                'provider' => $result['provider'] ?? 'local_heuristic',
                'ai_run_id' => $result['ai_run_id'] ?? null,
                'channel' => $context['channel'] ?? 'webchat',
            ];

            if ($dryRun) {
                return ['ok' => true, 'dry_run' => true, 'result' => $draft];
            }

            $context['draft_reply'] = $draft;

            return ['ok' => (bool) ($result['ok'] ?? false), 'result' => $draft];
        }

        $template = (string) ($config['template'] ?? 'Thanks for reaching out. A Triada Designs specialist will help shortly.');
        $draft = [
            'body' => $template,
            'ai_generated' => false,
            'channel' => $context['channel'] ?? 'webchat',
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => $draft];
        }

        $context['draft_reply'] = $draft;

        return ['ok' => true, 'result' => $draft];
    }

    protected function aiAction(
        Workspace $workspace,
        string $agentKey,
        string $purpose,
        array &$context,
        bool $dryRun
    ): array {
        $result = $this->ai->runAgent($workspace, $agentKey, $purpose, array_merge($context, [
            'message' => $context['message_body'] ?? $context['body'] ?? $context['message'] ?? '',
            'dry_run' => $dryRun,
        ]));

        if (! $dryRun && ($result['ok'] ?? false)) {
            $context['ai_'.$purpose] = $result['parsed'] ?? $result;
            if (! empty($result['side_effects']['lead_id'])) {
                $context['lead_id'] = $result['side_effects']['lead_id'];
            }
        }

        return [
            'ok' => (bool) ($result['ok'] ?? false),
            'dry_run' => $dryRun,
            'result' => $result,
            'error' => $result['error'] ?? null,
        ];
    }

    protected function sendEligibleReply(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $channel = (string) ($context['channel'] ?? $config['channel'] ?? 'webchat');
        $purpose = (string) ($config['purpose'] ?? 'transactional');
        $templateName = $config['template_name'] ?? $context['template_name'] ?? null;

        $conversation = null;
        if (! empty($context['conversation_id'])) {
            $conversation = Conversation::query()
                ->where('workspace_id', $workspace->id)
                ->find($context['conversation_id']);
        }

        $check = $this->eligibility->check(
            $workspace,
            $conversation,
            $channel,
            $purpose,
            $templateName,
            [
                'automation_mode' => $context['automation_mode'] ?? $conversation?->automation_mode ?? 'ai',
                'marketing_opt_out' => $context['marketing_opt_out'] ?? false,
                'consent' => $context['consent'] ?? true,
                'sender_type' => 'ai',
            ]
        );

        if (! $check['eligible']) {
            return ['ok' => true, 'skipped' => true, 'result' => $check];
        }

        $body = $context['draft_reply']['body']
            ?? (string) ($config['body'] ?? 'Thanks for contacting Triada Designs.');

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => [
                'would_send' => true,
                'body' => $body,
                'channel' => $channel,
                'eligibility' => $check,
            ]];
        }

        $sent = [
            'body' => $body,
            'sent_at' => now()->toIso8601String(),
            'channel' => $channel,
            'eligibility' => $check,
            'mode' => 'local_record',
        ];

        if (in_array($channel, ['facebook', 'instagram', 'whatsapp'], true) && $conversation) {
            $recipient = (string) (
                $context['external_user_id']
                ?? data_get($conversation, 'external_conversation_id')
            );
            if (str_contains($recipient, ':')) {
                $recipient = explode(':', $recipient)[1] ?? $recipient;
            }

            $adapter = $this->metaChannels->get($channel);
            $result = $adapter->sendMessage(new OutboundMessage(
                channel: $channel,
                recipientExternalId: $recipient ?: 'unknown',
                body: $body,
                pageOrAccountId: $context['page_or_account_id'] ?? null,
                templateName: $templateName,
                purpose: $purpose,
            ));

            $message = Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $conversation->id,
                'provider_message_id' => $result->providerMessageId,
                'direction' => 'outbound',
                'sender_type' => 'ai',
                'message_type' => 'text',
                'body' => $body,
                'delivery_status' => $result->ok ? 'sent' : 'failed',
                'provider_timestamp' => now(),
                'metadata' => [
                    'mode' => $result->mode,
                    'eligibility' => $check,
                    'send_result' => $result->toArray(),
                ],
            ]);

            $conversation->forceFill(['last_message_at' => now()])->save();

            $sent = array_merge($sent, [
                'mode' => $result->mode,
                'message_id' => $message->id,
                'provider_message_id' => $result->providerMessageId,
                'ok' => $result->ok,
            ]);

            if (! $result->ok) {
                return ['ok' => false, 'error' => $result->errorMessage ?: 'Meta send failed', 'result' => $sent];
            }
        }

        $context['sent_reply'] = $sent;

        return ['ok' => true, 'result' => $sent];
    }

    protected function createContentDraft(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $title = (string) ($config['title'] ?? 'Automation content draft');
        $payload = [
            'workspace_id' => $workspace->id,
            'title' => $title,
            'content_type' => 'social_post',
            'objective' => (string) ($config['objective'] ?? 'awareness'),
            'status' => 'draft',
            'body' => (string) ($config['body'] ?? ''),
            'channel' => (string) ($config['channel'] ?? 'instagram'),
            'approval_version' => 0,
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => ['would_create_content' => $payload]];
        }

        $item = ContentItem::query()->create($payload);
        $context['content_item_id'] = $item->id;

        return ['ok' => true, 'result' => ['content_item_id' => $item->id, 'status' => 'draft']];
    }

    protected function syncZohoLead(Workspace $workspace, array &$context, bool $dryRun): array
    {
        $leadId = $context['lead_id'] ?? null;
        if (! $leadId) {
            return ['ok' => false, 'error' => 'No lead_id in context'];
        }

        $lead = Lead::query()
            ->where('workspace_id', $workspace->id)
            ->with('contact')
            ->find($leadId);

        if (! $lead) {
            return ['ok' => false, 'error' => 'Lead not found'];
        }

        $payload = [
            'name' => $lead->contact?->name,
            'email' => $lead->contact?->email,
            'source_channel' => $lead->source_channel,
            'stage' => $lead->stage,
            'score' => $lead->score,
            'qualification_data' => $lead->qualification_data,
            'external_crm_id' => $lead->external_crm_id,
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => ['would_sync_zoho' => $payload]];
        }

        $remote = $this->zoho->upsertLead($payload);
        $lead->forceFill(['external_crm_id' => $remote['id'] ?? null])->save();

        return ['ok' => true, 'result' => ['zoho' => $remote, 'lead_id' => $lead->id]];
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,dry_run?:bool,result?:array<string,mixed>,error?:string}
     */
    protected function syncShopify(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $resource = (string) ($config['resource'] ?? $context['shopify_resource'] ?? 'order');
        $externalId = $context['shopify_order_id'] ?? $context['external_order_id'] ?? null;

        $payload = [
            'workspace_id' => $workspace->id,
            'resource' => $resource,
            'external_id' => $externalId,
            'note' => 'Shopify sync queued via automation. Live Admin API requires credentials.',
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => ['would_sync_shopify' => $payload]];
        }

        $context['shopify_sync'] = array_merge($payload, [
            'synced_at' => now()->toIso8601String(),
            'mode' => 'local_record',
        ]);

        return ['ok' => true, 'result' => $context['shopify_sync']];
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,dry_run?:bool,result?:array<string,mixed>,error?:string,skipped?:bool}
     */
    protected function publishChannelTemplate(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $templateId = $config['template_id'] ?? $context['channel_template_id'] ?? null;
        $platform = (string) ($config['platform'] ?? $context['channel'] ?? 'whatsapp');
        $slug = (string) ($config['template_slug'] ?? $context['template_slug'] ?? '');

        $query = \App\Models\ChannelTemplate::query()->where('workspace_id', $workspace->id);
        if ($templateId) {
            $query->where('id', $templateId);
        } elseif ($slug !== '') {
            $query->where('platform', $platform)->where('slug', $slug);
        } else {
            return ['ok' => false, 'error' => 'publish_channel_template requires template_id or template_slug'];
        }

        $template = $query->first();
        if (! $template) {
            return ['ok' => false, 'error' => 'Channel template not found'];
        }

        if ($dryRun) {
            return [
                'ok' => true,
                'dry_run' => true,
                'result' => [
                    'would_publish' => [
                        'id' => $template->id,
                        'platform' => $template->platform,
                        'slug' => $template->slug,
                        'status' => $template->status,
                    ],
                ],
            ];
        }

        // Automations never auto-approve public posts; only publish already-approved templates.
        if (! in_array($template->status, ['approved', 'published'], true)) {
            return [
                'ok' => true,
                'skipped' => true,
                'result' => [
                    'reason' => 'template_not_approved',
                    'status' => $template->status,
                    'note' => 'Human approval required before automation can publish a channel template.',
                ],
            ];
        }

        $service = app(\App\Services\Templates\ChannelTemplateService::class);
        $result = $service->publish($template, $context['actor_id'] ?? null);
        $context['channel_template_publish'] = $result;

        return [
            'ok' => (bool) ($result['ok'] ?? false),
            'result' => $result,
            'error' => $result['error'] ?? null,
        ];
    }

    /**
     * Send an approved WhatsApp Cloud template (local sim when no credentials).
     *
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,dry_run?:bool,result?:array<string,mixed>,error?:string,skipped?:bool}
     */
    protected function sendWhatsAppTemplate(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        if (($context['marketing_opt_out'] ?? false) === true && ($config['purpose'] ?? 'marketing') === 'marketing') {
            return [
                'ok' => true,
                'skipped' => true,
                'result' => ['reason' => 'marketing_opt_out'],
            ];
        }

        $templateName = (string) ($config['template_name'] ?? $context['template_name'] ?? 'jewellery_follow_up');
        $to = (string) ($config['to'] ?? $context['external_user_id'] ?? $context['wa_id'] ?? '');
        $language = (string) ($config['language'] ?? 'en');

        $conversation = null;
        if (! empty($context['conversation_id'])) {
            $conversation = Conversation::query()
                ->where('workspace_id', $workspace->id)
                ->find($context['conversation_id']);
        }

        $check = $this->eligibility->check(
            $workspace,
            $conversation,
            'whatsapp',
            (string) ($config['purpose'] ?? 'marketing'),
            $templateName,
            [
                'marketing_opt_out' => $context['marketing_opt_out'] ?? false,
                'consent' => $context['consent'] ?? true,
                'sender_type' => 'ai',
            ]
        );

        if (! $check['eligible']) {
            return ['ok' => true, 'skipped' => true, 'result' => $check];
        }

        if ($to === '') {
            return ['ok' => false, 'error' => 'send_whatsapp_template requires recipient (to / external_user_id)'];
        }

        if ($dryRun) {
            return [
                'ok' => true,
                'dry_run' => true,
                'result' => [
                    'would_send_template' => $templateName,
                    'to' => $to,
                    'eligibility' => $check,
                ],
            ];
        }

        $wa = app(WhatsAppCloudTemplateService::class);
        $sent = $wa->sendTemplate($to, $templateName, $language, [
            'components' => $config['components'] ?? [],
        ]);

        $context['whatsapp_template_send'] = $sent;

        return [
            'ok' => (bool) ($sent['ok'] ?? false),
            'result' => array_merge($sent, ['eligibility' => $check]),
            'error' => $sent['error'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,dry_run?:bool,result?:array<string,mixed>}
     */
    protected function checkWhatsAppOptOut(array $config, array &$context, bool $dryRun): array
    {
        $body = strtolower((string) ($context['message_body'] ?? $context['body'] ?? $context['message'] ?? ''));
        $keywords = $config['keywords'] ?? ['stop', 'unsubscribe', 'opt out', 'opt-out'];
        $optedOut = false;
        foreach ($keywords as $keyword) {
            if ($keyword !== '' && str_contains($body, strtolower((string) $keyword))) {
                $optedOut = true;
                break;
            }
        }

        $context['marketing_opt_out'] = $optedOut || (bool) ($context['marketing_opt_out'] ?? false);

        $result = [
            'marketing_opt_out' => $context['marketing_opt_out'],
            'matched' => $optedOut,
            'keywords' => $keywords,
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => $result];
        }

        return ['ok' => true, 'result' => $result];
    }

    /**
     * Outside the 24h window → route to approved template path (never free-form marketing).
     *
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,dry_run?:bool,result?:array<string,mixed>,error?:string}
     */
    protected function whatsappWindowFollowUp(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $conversation = null;
        if (! empty($context['conversation_id'])) {
            $conversation = Conversation::query()
                ->where('workspace_id', $workspace->id)
                ->find($context['conversation_id']);
        }

        $templateName = (string) ($config['template_name'] ?? $context['template_name'] ?? 'jewellery_follow_up');
        $check = $this->eligibility->check(
            $workspace,
            $conversation,
            'whatsapp',
            (string) ($config['purpose'] ?? 'marketing'),
            null,
            [
                'marketing_opt_out' => $context['marketing_opt_out'] ?? false,
                'consent' => $context['consent'] ?? true,
                'sender_type' => 'ai',
            ]
        );

        if ($check['window_open']) {
            $context['whatsapp_path'] = 'session_message';

            return [
                'ok' => true,
                'result' => [
                    'path' => 'session_message',
                    'window_open' => true,
                    'note' => 'Customer service window open — free-form reply allowed if eligible.',
                    'eligibility' => $check,
                ],
                'dry_run' => $dryRun,
            ];
        }

        $context['whatsapp_path'] = 'template';
        $context['template_name'] = $templateName;

        if ($dryRun) {
            return [
                'ok' => true,
                'dry_run' => true,
                'result' => [
                    'path' => 'template',
                    'would_use_template' => $templateName,
                    'window_open' => false,
                ],
            ];
        }

        // Create ops task; do not auto-send marketing templates without explicit send_whatsapp_template node.
        $task = Task::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $context['contact_id'] ?? null,
            'conversation_id' => $context['conversation_id'] ?? null,
            'type' => 'follow_up',
            'title' => 'WhatsApp template path: '.$templateName,
            'description' => 'Service window closed. Use approved template "'.$templateName.'" — never free-form marketing outside the window.',
            'due_at' => now()->addHours(2),
            'status' => 'open',
        ]);

        $context['task_id'] = $task->id;

        return [
            'ok' => true,
            'result' => [
                'path' => 'template',
                'template_name' => $templateName,
                'task_id' => $task->id,
                'window_open' => false,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,dry_run?:bool,result?:array<string,mixed>,error?:string}
     */
    protected function generateContentCreative(
        Workspace $workspace,
        string $kind,
        array $config,
        array &$context,
        bool $dryRun
    ): array {
        $contentId = $config['content_item_id'] ?? $context['content_item_id'] ?? null;
        $item = null;
        if ($contentId) {
            $item = ContentItem::query()
                ->where('workspace_id', $workspace->id)
                ->find($contentId);
        }

        if (! $item) {
            $created = $this->createContentDraft($workspace, $config, $context, $dryRun);
            if ($dryRun) {
                return $created;
            }
            $item = ContentItem::query()->find($context['content_item_id'] ?? null);
        }

        if (! $item) {
            return ['ok' => false, 'error' => 'No content item for creative generation'];
        }

        if ($dryRun) {
            return [
                'ok' => true,
                'dry_run' => true,
                'result' => [
                    'would_generate' => $kind,
                    'content_item_id' => $item->id,
                    'note' => 'Creative drafts only — approval still required before publish.',
                ],
            ];
        }

        $creative = app(CreativeMediaService::class);
        $result = match ($kind) {
            'image' => $creative->generateImage($workspace, $item, $config),
            'variants' => $creative->generateVariants($workspace, $item, $config['source_media_asset_id'] ?? null, $config['platforms'] ?? null),
            'video' => $creative->generateVideo($workspace, $item, $config),
            default => ['ok' => false, 'error' => 'Unknown creative kind'],
        };

        $context['creative_'.$kind] = [
            'mode' => $result['mode'] ?? null,
            'asset_id' => data_get($result, 'asset.id'),
            'variant_count' => isset($result['variants']) ? count($result['variants']) : null,
        ];

        return [
            'ok' => (bool) ($result['ok'] ?? false),
            'result' => $result,
            'error' => $result['error'] ?? null,
        ];
    }
}

