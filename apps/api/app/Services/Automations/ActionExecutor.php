<?php

namespace App\Services\Automations;

use App\Models\ContentItem;
use App\Models\Conversation;
use App\Models\Lead;
use App\Models\Task;
use App\Models\Workspace;
use App\Services\CRM\Zoho\ZohoCrmClient;
use Illuminate\Support\Str;

class ActionExecutor
{
    public function __construct(protected ZohoCrmClient $zoho)
    {
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
            'assign_conversation' => $this->assignConversation($workspace, $config, $context, $dryRun),
            'add_tag' => $this->addTag($config, $context, $dryRun),
            'notify_team' => $this->notifyTeam($config, $context, $dryRun),
            'draft_reply' => $this->draftReply($config, $context, $dryRun),
            'send_eligible_reply' => $this->sendEligibleReply($workspace, $config, $context, $dryRun),
            'create_content_draft' => $this->createContentDraft($workspace, $config, $context, $dryRun),
            'sync_zoho_lead' => $this->syncZohoLead($workspace, $context, $dryRun),
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

    protected function draftReply(array $config, array &$context, bool $dryRun): array
    {
        $template = (string) ($config['template'] ?? 'Thanks for reaching out. A Triada Designs specialist will help shortly.');
        $draft = [
            'body' => $template,
            'ai_generated' => true,
            'channel' => $context['channel'] ?? 'webchat',
        ];

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => $draft];
        }

        $context['draft_reply'] = $draft;

        return ['ok' => true, 'result' => $draft];
    }

    protected function sendEligibleReply(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        if ($workspace->outbound_paused) {
            return ['ok' => true, 'skipped' => true, 'result' => ['reason' => 'outbound_paused']];
        }

        if (($context['automation_mode'] ?? 'ai') === 'human') {
            return ['ok' => true, 'skipped' => true, 'result' => ['reason' => 'human_takeover']];
        }

        if (($context['marketing_opt_out'] ?? false) === true && ($config['purpose'] ?? 'transactional') === 'marketing') {
            return ['ok' => true, 'skipped' => true, 'result' => ['reason' => 'marketing_opt_out']];
        }

        $body = $context['draft_reply']['body']
            ?? (string) ($config['body'] ?? 'Thanks for contacting Triada Designs.');

        if ($dryRun) {
            return ['ok' => true, 'dry_run' => true, 'result' => [
                'would_send' => true,
                'body' => $body,
                'channel' => $context['channel'] ?? null,
            ]];
        }

        $context['sent_reply'] = [
            'body' => $body,
            'sent_at' => now()->toIso8601String(),
            'channel' => $context['channel'] ?? 'webchat',
        ];

        return ['ok' => true, 'result' => $context['sent_reply']];
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
}
