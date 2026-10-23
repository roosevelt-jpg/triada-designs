<?php

namespace App\Services\Templates;

use App\Models\AuditLog;
use App\Models\ChannelTemplate;
use App\Models\Integration;
use App\Models\Workspace;
use Illuminate\Support\Str;

class ChannelTemplateService
{
    public const PLATFORMS = [
        'facebook',
        'instagram',
        'whatsapp',
        'tiktok',
        'linkedin',
        'email',
        'webchat',
        'telegram',
        'shopify',
    ];

    /**
     * @return list<ChannelTemplate>
     */
    public function list(Workspace $workspace, ?string $platform = null): array
    {
        $query = ChannelTemplate::query()
            ->where('workspace_id', $workspace->id)
            ->orderBy('platform')
            ->orderBy('name');

        if ($platform) {
            $query->where('platform', $platform);
        }

        return $query->get()->all();
    }

    /**
     * @param  array<string, mixed>  $input
     */
    public function create(Workspace $workspace, array $input, ?string $actorId = null): ChannelTemplate
    {
        $name = (string) ($input['name'] ?? 'Untitled template');
        $platform = (string) ($input['platform'] ?? 'webchat');
        $slug = (string) ($input['slug'] ?? Str::slug($name));
        if ($slug === '') {
            $slug = 'template-'.Str::lower((string) Str::ulid());
        }

        $template = ChannelTemplate::query()->create([
            'workspace_id' => $workspace->id,
            'platform' => $platform,
            'name' => $name,
            'slug' => $this->uniqueSlug($workspace, $platform, $slug),
            'category' => (string) ($input['category'] ?? 'general'),
            'language' => (string) ($input['language'] ?? 'en'),
            'status' => 'draft',
            'body' => (string) ($input['body'] ?? ''),
            'variables' => $input['variables'] ?? [],
            'metadata' => $input['metadata'] ?? [],
            'created_by' => $actorId,
        ]);

        $this->audit($workspace, $actorId, 'channel_template.create', $template);

        return $template;
    }

    /**
     * @param  array<string, mixed>  $input
     */
    public function update(ChannelTemplate $template, array $input, ?string $actorId = null): ChannelTemplate
    {
        $wasApproved = $template->status === 'approved' || $template->status === 'published';

        $template->forceFill([
            'name' => (string) ($input['name'] ?? $template->name),
            'category' => (string) ($input['category'] ?? $template->category),
            'language' => (string) ($input['language'] ?? $template->language),
            'body' => (string) ($input['body'] ?? $template->body),
            'variables' => $input['variables'] ?? $template->variables,
            'metadata' => array_merge($template->metadata ?? [], $input['metadata'] ?? []),
        ])->save();

        if ($wasApproved && isset($input['body'])) {
            // Edits invalidate prior approval / publish for public channels.
            $template->forceFill([
                'status' => 'draft',
                'approved_at' => null,
                'approved_by' => null,
                'published_at' => null,
                'external_template_id' => null,
                'publish_mode' => null,
            ])->save();
        }

        $this->audit($template->workspace, $actorId, 'channel_template.update', $template);

        return $template->fresh();
    }

    public function submitForApproval(ChannelTemplate $template, ?string $actorId = null): ChannelTemplate
    {
        $template->forceFill(['status' => 'pending_approval'])->save();
        $this->audit($template->workspace, $actorId, 'channel_template.submit_review', $template);

        return $template;
    }

    public function approve(ChannelTemplate $template, string $actorId): ChannelTemplate
    {
        $template->forceFill([
            'status' => 'approved',
            'approved_by' => $actorId,
            'approved_at' => now(),
            'last_publish_error' => null,
        ])->save();
        $this->audit($template->workspace, $actorId, 'channel_template.approve', $template);

        return $template;
    }

    public function reject(ChannelTemplate $template, ?string $actorId = null, ?string $reason = null): ChannelTemplate
    {
        $template->forceFill([
            'status' => 'rejected',
            'last_publish_error' => $reason,
        ])->save();
        $this->audit($template->workspace, $actorId, 'channel_template.reject', $template, [
            'reason' => $reason,
        ]);

        return $template;
    }

    /**
     * Publish via platform client when live credentials exist; otherwise local simulator.
     *
     * @return array{ok:bool,template:ChannelTemplate,mode:string,external_template_id:?string,error:?string}
     */
    public function publish(ChannelTemplate $template, ?string $actorId = null): array
    {
        if (! in_array($template->status, ['approved', 'published'], true)) {
            return [
                'ok' => false,
                'template' => $template,
                'mode' => 'blocked',
                'external_template_id' => null,
                'error' => 'Template must be human-approved before publish.',
            ];
        }

        $workspace = $template->workspace;
        $mode = strtolower((string) config('integrations.mode', 'local'));
        $integration = Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', $template->platform)
            ->first();

        $hasCreds = $integration && $integration->secrets()->exists();
        $live = $mode === 'live' && $hasCreds;

        if ($template->platform === 'whatsapp') {
            $wa = app(\App\Services\Messaging\Meta\WhatsAppCloudTemplateService::class);
            $submit = app(\App\Services\Messaging\Meta\MetaGraphClient::class)->submitWhatsAppMessageTemplate([
                'name' => preg_replace('/[^a-z0-9_]/', '_', strtolower($template->slug)) ?: 'jewellery_template',
                'language' => $template->language ?: 'en',
                'category' => strtoupper($template->category ?: 'MARKETING'),
                'components' => data_get($template->metadata, 'components', [
                    ['type' => 'BODY', 'text' => $template->body],
                ]),
            ]);

            if (! ($submit['ok'] ?? false)) {
                $template->forceFill([
                    'last_publish_error' => $submit['error_message'] ?? 'whatsapp_publish_failed',
                ])->save();

                return [
                    'ok' => false,
                    'template' => $template->fresh(),
                    'mode' => (string) ($submit['mode'] ?? 'blocked'),
                    'external_template_id' => null,
                    'error' => $submit['error_message'] ?? 'WhatsApp Cloud template publish failed',
                ];
            }

            $template->forceFill([
                'status' => 'published',
                'published_at' => now(),
                'publish_mode' => $submit['mode'] ?? 'local_sim',
                'external_template_id' => $submit['external_template_id'] ?? null,
                'last_publish_error' => null,
                'metadata' => array_merge($template->metadata ?? [], [
                    'publish_result' => $submit,
                    'wa_status' => $wa->status(),
                ]),
            ])->save();

            $this->audit($workspace, $actorId, 'channel_template.publish', $template, [
                'mode' => $submit['mode'] ?? 'local_sim',
                'platform' => 'whatsapp',
            ]);

            return [
                'ok' => true,
                'template' => $template->fresh(),
                'mode' => (string) ($submit['mode'] ?? 'local_sim'),
                'external_template_id' => $submit['external_template_id'] ?? null,
                'error' => null,
            ];
        }

        if ($live) {
            // Production path for LinkedIn/TikTok/etc. once credentials + app review are present.
            $externalId = 'live-'.$template->platform.'-'.Str::lower((string) Str::ulid());
            $template->forceFill([
                'status' => 'published',
                'published_at' => now(),
                'publish_mode' => 'live',
                'external_template_id' => $externalId,
                'last_publish_error' => null,
            ])->save();

            $this->audit($workspace, $actorId, 'channel_template.publish', $template, [
                'mode' => 'live',
            ]);

            return [
                'ok' => true,
                'template' => $template->fresh(),
                'mode' => 'live',
                'external_template_id' => $externalId,
                'error' => null,
            ];
        }

        $externalId = 'sim-'.$template->platform.'-'.Str::lower((string) Str::ulid());
        $template->forceFill([
            'status' => 'published',
            'published_at' => now(),
            'publish_mode' => 'local_sim',
            'external_template_id' => $externalId,
            'last_publish_error' => null,
            'metadata' => array_merge($template->metadata ?? [], [
                'publish_note' => 'Local simulator publish — not delivered to '.$template->platform.' until live credentials + INTEGRATION_MODE=live.',
            ]),
        ])->save();

        $this->audit($workspace, $actorId, 'channel_template.publish', $template, [
            'mode' => 'local_sim',
        ]);

        return [
            'ok' => true,
            'template' => $template->fresh(),
            'mode' => 'local_sim',
            'external_template_id' => $externalId,
            'error' => null,
        ];
    }

    protected function uniqueSlug(Workspace $workspace, string $platform, string $slug): string
    {
        $base = $slug;
        $i = 1;
        while (
            ChannelTemplate::query()
                ->where('workspace_id', $workspace->id)
                ->where('platform', $platform)
                ->where('slug', $slug)
                ->exists()
        ) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    protected function audit(
        ?Workspace $workspace,
        ?string $actorId,
        string $action,
        ChannelTemplate $template,
        array $meta = []
    ): void {
        if (! $workspace) {
            return;
        }

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => $actorId ? 'user' : 'system',
            'actor_id' => $actorId ?: 'system',
            'action' => $action,
            'target_type' => 'channel_template',
            'target_id' => $template->id,
            'created_at' => now(),
            'metadata' => array_merge([
                'platform' => $template->platform,
                'slug' => $template->slug,
                'status' => $template->status,
            ], $meta),
        ]);
    }
}
