<?php

namespace App\Services\Messaging\Meta;

use App\Models\AuditLog;
use App\Models\ChannelTemplate;
use App\Models\Workspace;
use Illuminate\Support\Str;

/**
 * WhatsApp Cloud API template sync / submit / send orchestration.
 * Uses local jewellery catalog when META_WA_* / WABA credentials are absent.
 */
class WhatsAppCloudTemplateService
{
    public function __construct(protected MetaGraphClient $graph)
    {
    }

    /**
     * @return array{mode:string,status:string,configured:bool,phone_number_id:?string,business_account_id:?string,message:string}
     */
    public function status(): array
    {
        $cfg = config('integrations.meta');
        $local = $this->graph->usesWhatsAppTemplateLocalFallback();
        $configured = $this->graph->whatsappTemplateConfigured();

        return [
            'mode' => $local ? 'local_sim' : 'live',
            'status' => $local
                ? ($configured ? 'local' : 'awaiting_credentials')
                : 'live',
            'configured' => $configured,
            'phone_number_id' => $cfg['whatsapp_phone_number_id'] ?? null,
            'business_account_id' => $cfg['whatsapp_business_account_id'] ?? null,
            'message' => $local
                ? 'WhatsApp Cloud templates use the local jewellery catalog until META_WA_ACCESS_TOKEN (or WHATSAPP_ACCESS_TOKEN), META_WA_PHONE_NUMBER_ID, and META_WA_BUSINESS_ACCOUNT_ID are set (leave INTEGRATION_MODE unset/live — local forces the sim catalog).'
                : 'Live WhatsApp Cloud API template path enabled (Meta Graph message_templates).',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listRemote(): array
    {
        return $this->graph->listWhatsAppMessageTemplates();
    }

    /**
     * Sync remote (or local seed) templates into channel_templates.
     *
     * @return array{ok:bool,mode:string,synced:int,templates:list<ChannelTemplate>}
     */
    public function sync(Workspace $workspace, ?string $actorId = null): array
    {
        $remote = $this->listRemote();
        $mode = $this->graph->usesWhatsAppTemplateLocalFallback() ? 'local_sim' : 'live';
        $synced = [];

        foreach ($remote as $row) {
            $name = (string) ($row['name'] ?? 'untitled');
            $slug = Str::slug($name);
            if ($slug === '') {
                $slug = 'wa-'.Str::lower((string) Str::ulid());
            }

            $status = $this->mapMetaStatus((string) ($row['status'] ?? 'PENDING'));
            $body = $this->extractBody($row);

            $template = ChannelTemplate::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'platform' => 'whatsapp',
                    'slug' => $slug,
                ],
                [
                    'name' => $name,
                    'category' => strtolower((string) ($row['category'] ?? 'marketing')),
                    'language' => (string) (data_get($row, 'language') ?? data_get($row, 'language.code') ?? 'en'),
                    'status' => $status,
                    'body' => $body,
                    'variables' => $row['variables'] ?? [],
                    'external_template_id' => (string) ($row['id'] ?? ('sim-'.$slug)),
                    'publish_mode' => $mode,
                    'metadata' => array_merge($row['metadata'] ?? [], [
                        'synced_from' => $mode,
                        'meta_status' => $row['status'] ?? null,
                        'vertical' => 'jewellery',
                    ]),
                    'approved_at' => in_array($status, ['approved', 'published'], true) ? now() : null,
                ]
            );

            $synced[] = $template;
        }

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => $actorId ? 'user' : 'system',
            'actor_id' => $actorId,
            'action' => 'whatsapp.templates.sync',
            'target_type' => 'channel_template',
            'target_id' => null,
            'metadata' => ['count' => count($synced), 'mode' => $mode],
            'created_at' => now(),
        ]);

        return [
            'ok' => true,
            'mode' => $mode,
            'synced' => count($synced),
            'templates' => $synced,
        ];
    }

    /**
     * Submit a draft template to Cloud API (or local sim catalog).
     *
     * @param  array<string, mixed>  $input
     * @return array{ok:bool,mode:string,template:ChannelTemplate,external:?array,error:?string}
     */
    public function createAndSubmit(Workspace $workspace, array $input, ?string $actorId = null): array
    {
        $name = (string) ($input['name'] ?? 'jewellery_update');
        $slug = Str::slug((string) ($input['slug'] ?? $name));
        $body = (string) ($input['body'] ?? '');
        $language = (string) ($input['language'] ?? 'en');
        $category = strtoupper((string) ($input['category'] ?? 'MARKETING'));

        $template = ChannelTemplate::query()->create([
            'workspace_id' => $workspace->id,
            'platform' => 'whatsapp',
            'name' => $name,
            'slug' => $slug !== '' ? $slug : 'wa-'.Str::lower((string) Str::ulid()),
            'category' => strtolower($category),
            'language' => $language,
            'status' => 'pending_approval',
            'body' => $body,
            'variables' => $input['variables'] ?? [],
            'metadata' => [
                'vertical' => 'jewellery',
                'components' => $input['components'] ?? [
                    [
                        'type' => 'BODY',
                        'text' => $body,
                    ],
                ],
            ],
            'created_by' => $actorId,
        ]);

        $submit = $this->graph->submitWhatsAppMessageTemplate([
            'name' => preg_replace('/[^a-z0-9_]/', '_', strtolower($name)) ?: 'jewellery_update',
            'language' => $language,
            'category' => $category,
            'components' => $template->metadata['components'] ?? [
                ['type' => 'BODY', 'text' => $body],
            ],
        ]);

        if (! ($submit['ok'] ?? false)) {
            $template->forceFill([
                'status' => 'draft',
                'last_publish_error' => $submit['error_message'] ?? 'submit_failed',
            ])->save();

            return [
                'ok' => false,
                'mode' => (string) ($submit['mode'] ?? 'local_sim'),
                'template' => $template->fresh(),
                'external' => $submit,
                'error' => $submit['error_message'] ?? 'Template submit failed',
            ];
        }

        $template->forceFill([
            'status' => ($submit['mode'] ?? '') === 'live' ? 'pending_approval' : 'approved',
            'external_template_id' => $submit['external_template_id'] ?? null,
            'publish_mode' => $submit['mode'] ?? 'local_sim',
            'approved_at' => ($submit['mode'] ?? '') === 'local_sim' ? now() : null,
            'metadata' => array_merge($template->metadata ?? [], [
                'submit_result' => $submit,
            ]),
        ])->save();

        return [
            'ok' => true,
            'mode' => (string) ($submit['mode'] ?? 'local_sim'),
            'template' => $template->fresh(),
            'external' => $submit,
            'error' => null,
        ];
    }

    /**
     * Update a local WhatsApp template draft and re-submit to Cloud API (or local sim).
     *
     * @param  array<string, mixed>  $input
     * @return array{ok:bool,mode:string,template:ChannelTemplate,external:?array,error:?string}
     */
    public function updateAndSubmit(
        Workspace $workspace,
        ChannelTemplate $template,
        array $input,
        ?string $actorId = null
    ): array {
        if ($template->platform !== 'whatsapp') {
            return [
                'ok' => false,
                'mode' => 'local_sim',
                'template' => $template,
                'external' => null,
                'error' => 'Template is not a WhatsApp Cloud template',
            ];
        }

        $name = (string) ($input['name'] ?? $template->name);
        $body = (string) ($input['body'] ?? $template->body);
        $language = (string) ($input['language'] ?? $template->language ?? 'en');
        $category = strtoupper((string) ($input['category'] ?? $template->category ?? 'MARKETING'));
        $components = $input['components'] ?? [
            ['type' => 'BODY', 'text' => $body],
        ];

        $template->forceFill([
            'name' => $name,
            'body' => $body,
            'language' => $language,
            'category' => strtolower($category),
            'variables' => $input['variables'] ?? $template->variables,
            'status' => 'pending_approval',
            'metadata' => array_merge($template->metadata ?? [], [
                'components' => $components,
                'updated_by' => $actorId,
                'updated_at' => now()->toIso8601String(),
            ]),
        ])->save();

        $submit = $this->graph->submitWhatsAppMessageTemplate([
            'name' => preg_replace('/[^a-z0-9_]/', '_', strtolower($name)) ?: 'jewellery_update',
            'language' => $language,
            'category' => $category,
            'components' => $components,
        ]);

        if (! ($submit['ok'] ?? false)) {
            $template->forceFill([
                'status' => 'draft',
                'last_publish_error' => $submit['error_message'] ?? 'submit_failed',
            ])->save();

            return [
                'ok' => false,
                'mode' => (string) ($submit['mode'] ?? 'local_sim'),
                'template' => $template->fresh(),
                'external' => $submit,
                'error' => $submit['error_message'] ?? 'Template update submit failed',
            ];
        }

        $template->forceFill([
            'status' => ($submit['mode'] ?? '') === 'live' ? 'pending_approval' : 'approved',
            'external_template_id' => $submit['external_template_id'] ?? $template->external_template_id,
            'publish_mode' => $submit['mode'] ?? 'local_sim',
            'approved_at' => ($submit['mode'] ?? '') === 'local_sim' ? now() : null,
            'last_publish_error' => null,
            'metadata' => array_merge($template->metadata ?? [], [
                'submit_result' => $submit,
            ]),
        ])->save();

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => $actorId ? 'user' : 'system',
            'actor_id' => $actorId,
            'action' => 'whatsapp.templates.update',
            'target_type' => 'channel_template',
            'target_id' => $template->id,
            'metadata' => ['mode' => $submit['mode'] ?? 'local_sim'],
            'created_at' => now(),
        ]);

        return [
            'ok' => true,
            'mode' => (string) ($submit['mode'] ?? 'local_sim'),
            'template' => $template->fresh(),
            'external' => $submit,
            'error' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array{ok:bool,mode:string,provider_message_id:?string,error:?string,raw:array}
     */
    public function sendTemplate(
        string $to,
        string $templateName,
        string $language = 'en',
        array $options = []
    ): array {
        $result = $this->graph->sendWhatsApp($to, '', array_merge($options, [
            'template_name' => $templateName,
            'language' => $language,
            'components' => $options['components'] ?? [],
        ]));

        return [
            'ok' => (bool) ($result['ok'] ?? false),
            'mode' => (string) ($result['mode'] ?? 'local'),
            'provider_message_id' => $result['provider_message_id'] ?? null,
            'error' => $result['error_message'] ?? null,
            'raw' => $result['raw'] ?? [],
        ];
    }

    /**
     * @param  array<string, mixed>  $row
     */
    protected function extractBody(array $row): string
    {
        if (! empty($row['body'])) {
            return (string) $row['body'];
        }

        foreach ($row['components'] ?? [] as $component) {
            if (strtoupper((string) ($component['type'] ?? '')) === 'BODY') {
                return (string) ($component['text'] ?? '');
            }
        }

        return '';
    }

    protected function mapMetaStatus(string $status): string
    {
        return match (strtoupper($status)) {
            'APPROVED' => 'approved',
            'REJECTED' => 'rejected',
            'PENDING', 'IN_APPEAL', 'PENDING_DELETION' => 'pending_approval',
            'DISABLED', 'PAUSED' => 'draft',
            default => 'draft',
        };
    }
}
