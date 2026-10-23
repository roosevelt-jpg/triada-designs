<?php

namespace App\Services\Messaging\Meta;

use App\Models\AuditLog;
use App\Models\Integration;
use App\Models\IntegrationSecret;
use App\Models\Workspace;
use App\Services\Messaging\DTOs\OutboundMessage;
use Illuminate\Support\Str;

class MetaControlPlane
{
    public function __construct(
        protected MetaGraphClient $graph,
        protected MetaChannelRegistry $registry,
        protected OutboundEligibility $eligibility,
        protected MetaInboundProcessor $inbound,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function status(Workspace $workspace): array
    {
        $channels = [];
        foreach (['facebook', 'instagram', 'whatsapp'] as $channel) {
            $integration = $this->findIntegration($workspace, $channel);
            $health = $this->graph->healthCheck($channel === 'whatsapp' ? 'whatsapp' : 'facebook');
            $meta = $integration?->metadata ?? [];

            $channels[$channel] = [
                'provider' => $channel,
                'integration_id' => $integration?->id,
                'display_name' => $integration?->display_name,
                'status' => $this->publicStatus($integration, $health),
                'health' => $health,
                'capabilities' => $this->registry->get($channel)->getCapabilities()->toArray(),
                'granted_scopes' => $integration?->granted_scopes ?? [],
                'token_expires_at' => optional($integration?->token_expires_at)->toIso8601String(),
                'last_error_code' => $integration?->last_error_code,
                'webhook_subscribed' => (bool) ($meta['webhook_subscribed'] ?? false),
                'selected_account_id' => $meta['selected_account_id'] ?? $integration?->external_account_id,
                'has_page_token' => $this->hasSecret($integration, 'page_access_token')
                    || filled(config('integrations.meta.page_access_token')),
                'has_whatsapp_token' => $this->hasSecret($integration, 'whatsapp_access_token')
                    || filled(config('integrations.meta.whatsapp_access_token')),
            ];
        }

        return [
            'mode' => $this->graph->mode(),
            'webhook' => $this->webhookInfo($workspace),
            'honesty' => [
                'live_graph_requires' => 'INTEGRATION_MODE=live plus Meta tokens',
                'one_time_meta_developer_setup' => 'Creating the Meta Developer App and completing App Review may still require the Meta developer console once.',
                'day_to_day' => 'After connect, Triada owns Pages/IG/WABA selection, webhook subscribe, token health, messaging, templates eligibility, automation rules, pause/resume, and logs.',
            ],
            'channels' => $channels,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function connect(Workspace $workspace, string $channel, array $input): array
    {
        $integration = Integration::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => $channel,
                'external_account_id' => (string) ($input['external_account_id'] ?? $channel.'-primary'),
            ],
            [
                'display_name' => (string) ($input['display_name'] ?? match ($channel) {
                    'facebook' => 'Facebook Messenger',
                    'instagram' => 'Instagram Messaging',
                    'whatsapp' => 'WhatsApp Cloud API',
                    default => ucfirst($channel),
                }),
                'status' => filled($input['access_token'] ?? null) ? 'connected' : 'awaiting_credentials',
                'granted_scopes' => $input['scopes'] ?? $this->defaultScopes($channel),
                'capabilities' => $this->registry->get($channel)->getCapabilities()->features,
                'token_expires_at' => ! empty($input['token_expires_at']) ? $input['token_expires_at'] : null,
                'last_health_check_at' => now(),
                'last_error_code' => null,
                'metadata' => array_filter([
                    'selected_account_id' => $input['external_account_id'] ?? null,
                    'webhook_subscribed' => (bool) ($input['webhook_subscribed'] ?? false),
                    'connected_via' => 'triada_dashboard',
                    'waba_id' => $input['waba_id'] ?? null,
                    'phone_number_id' => $input['phone_number_id'] ?? null,
                ]),
            ]
        );

        if (! empty($input['access_token'])) {
            $this->storeSecret($integration, $channel === 'whatsapp' ? 'whatsapp_access_token' : 'page_access_token', (string) $input['access_token']);
        }

        if (! empty($input['verify_token'])) {
            $this->storeSecret($integration, 'verify_token', (string) $input['verify_token']);
            $workspace->forceFill([
                'settings' => array_merge($workspace->settings ?? [], [
                    'meta_verify_token' => (string) $input['verify_token'],
                ]),
            ])->save();
        }

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => (string) ($input['actor_id'] ?? 'system'),
            'action' => 'meta.connect',
            'target_type' => 'integration',
            'target_id' => $integration->id,
            'created_at' => now(),
            'metadata' => ['channel' => $channel, 'has_token' => filled($input['access_token'] ?? null)],
        ]);

        return $this->status($workspace);
    }

    public function disconnect(Workspace $workspace, string $channel): array
    {
        $integration = $this->findIntegration($workspace, $channel);
        if ($integration) {
            $integration->secrets()->delete();
            $integration->forceFill([
                'status' => 'disconnected',
                'last_error_code' => null,
                'token_expires_at' => null,
                'metadata' => array_merge($integration->metadata ?? [], [
                    'webhook_subscribed' => false,
                    'disconnected_at' => now()->toIso8601String(),
                ]),
            ])->save();
        }

        return $this->status($workspace);
    }

    /**
     * @return array<string, mixed>
     */
    public function accounts(Workspace $workspace, string $channel): array
    {
        $data = match ($channel) {
            'facebook' => $this->graph->listPages(),
            'instagram' => $this->graph->listInstagramAccounts(),
            'whatsapp' => $this->graph->listWhatsAppNumbers(),
            default => [],
        };

        return [
            'channel' => $channel,
            'mode' => $channel === 'whatsapp'
                ? ($this->graph->usesWhatsAppLocalFallback() ? 'local' : 'live')
                : ($this->graph->usesLocalFallback() ? 'local' : 'live'),
            'data' => $data,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function setWebhookSubscription(Workspace $workspace, string $channel, bool $subscribed): array
    {
        $integration = $this->findIntegration($workspace, $channel);
        if (! $integration) {
            $this->connect($workspace, $channel, [
                'display_name' => ucfirst($channel),
                'webhook_subscribed' => $subscribed,
            ]);
            $integration = $this->findIntegration($workspace, $channel);
        }

        $integration?->forceFill([
            'metadata' => array_merge($integration->metadata ?? [], [
                'webhook_subscribed' => $subscribed,
                'webhook_updated_at' => now()->toIso8601String(),
            ]),
            'status' => $integration->status === 'disconnected'
                ? 'awaiting_credentials'
                : $integration->status,
        ])->save();

        return [
            'channel' => $channel,
            'webhook_subscribed' => $subscribed,
            'webhook' => $this->webhookInfo($workspace),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function rotateVerifyToken(Workspace $workspace): array
    {
        $token = 'triada-verify-'.Str::lower((string) Str::ulid());
        $workspace->forceFill([
            'settings' => array_merge($workspace->settings ?? [], [
                'meta_verify_token' => $token,
            ]),
        ])->save();

        foreach (['facebook', 'instagram', 'whatsapp'] as $channel) {
            $integration = $this->findIntegration($workspace, $channel);
            if ($integration) {
                $this->storeSecret($integration, 'verify_token', $token);
            }
        }

        return $this->webhookInfo($workspace);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function testSend(Workspace $workspace, string $channel, array $input): array
    {
        $eligibility = $this->eligibility->check(
            $workspace,
            null,
            $channel,
            (string) ($input['purpose'] ?? 'transactional'),
            $input['template_name'] ?? null,
            [
                'consent' => $input['consent'] ?? true,
                'sender_type' => 'user',
            ]
        );

        if (! $eligibility['eligible']) {
            return [
                'ok' => false,
                'eligibility' => $eligibility,
                'message' => 'Outbound blocked: '.$eligibility['reason'],
            ];
        }

        $adapter = $this->registry->get($channel);
        $result = $adapter->sendMessage(new OutboundMessage(
            channel: $channel,
            recipientExternalId: (string) ($input['recipient_id'] ?? 'seed-recipient'),
            body: (string) ($input['body'] ?? 'Triada Designs test message from the ops dashboard.'),
            pageOrAccountId: $input['page_or_account_id'] ?? null,
            templateName: $input['template_name'] ?? null,
            purpose: (string) ($input['purpose'] ?? 'transactional'),
        ));

        return [
            'ok' => $result->ok,
            'eligibility' => $eligibility,
            'result' => $result->toArray(),
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function simulateInbound(Workspace $workspace, array $input): array
    {
        $channel = (string) ($input['channel'] ?? 'facebook');
        $body = (string) ($input['body'] ?? 'Hello from Meta local simulator');
        $sender = (string) ($input['sender_id'] ?? 'seed-user-'.Str::lower(Str::random(6)));
        $mid = (string) ($input['provider_message_id'] ?? 'sim-'.Str::ulid());

        $payload = match ($channel) {
            'whatsapp' => [
                'object' => 'whatsapp_business_account',
                'entry' => [[
                    'id' => 'seed-waba',
                    'changes' => [[
                        'value' => [
                            'metadata' => [
                                'phone_number_id' => (string) (config('integrations.meta.whatsapp_phone_number_id') ?: 'seed-wa-phone'),
                            ],
                            'contacts' => [['profile' => ['name' => $input['contact_name'] ?? 'WA Simulator'], 'wa_id' => $sender]],
                            'messages' => [[
                                'from' => $sender,
                                'id' => $mid,
                                'timestamp' => (string) time(),
                                'type' => 'text',
                                'text' => ['body' => $body],
                            ]],
                        ],
                        'field' => 'messages',
                    ]],
                ]],
            ],
            'instagram' => [
                'object' => 'instagram',
                'channel' => 'instagram',
                'entry' => [[
                    'id' => 'seed-ig-triada',
                    'messaging' => [[
                        'sender' => ['id' => $sender],
                        'recipient' => ['id' => 'seed-ig-triada'],
                        'timestamp' => (int) (microtime(true) * 1000),
                        'message' => ['mid' => $mid, 'text' => $body],
                    ]],
                ]],
            ],
            default => [
                'object' => 'page',
                'entry' => [[
                    'id' => 'seed-page-triada',
                    'messaging' => [[
                        'sender' => ['id' => $sender],
                        'recipient' => ['id' => 'seed-page-triada'],
                        'timestamp' => (int) (microtime(true) * 1000),
                        'message' => ['mid' => $mid, 'text' => $body],
                    ]],
                ]],
            ],
        };

        return $this->inbound->ingest($workspace, $payload, json_encode($payload) ?: null);
    }

    /**
     * @return array<string, mixed>
     */
    public function webhookInfo(Workspace $workspace): array
    {
        $apiUrl = rtrim((string) config('app.url'), '/');
        $verify = (string) (($workspace->settings['meta_verify_token'] ?? null)
            ?: config('integrations.meta.verify_token')
            ?: 'triada-local-verify');

        return [
            'meta_webhook_url' => $apiUrl.'/api/webhooks/meta',
            'whatsapp_webhook_url' => $apiUrl.'/api/webhooks/whatsapp',
            'verify_token' => $verify,
            'verify_token_source' => isset($workspace->settings['meta_verify_token'])
                ? 'workspace'
                : (filled(config('integrations.meta.verify_token')) ? 'env' : 'default_local'),
            'app_secret_configured' => filled(config('integrations.meta.app_secret')),
            'webhook_secret_configured' => filled(config('integrations.meta.webhook_secret')),
            'note' => 'Point Meta Developer webhook callbacks here once. Day-to-day subscribe/unsubscribe and health stay in Triada.',
        ];
    }

    public function resolveVerifyToken(Workspace $workspace): string
    {
        return (string) (($workspace->settings['meta_verify_token'] ?? null)
            ?: config('integrations.meta.verify_token')
            ?: 'triada-local-verify');
    }

    protected function findIntegration(Workspace $workspace, string $channel): ?Integration
    {
        return Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', $channel)
            ->first();
    }

    /**
     * @param  array{status:string}  $health
     */
    protected function publicStatus(?Integration $integration, array $health): string
    {
        if (! $integration || $integration->status === 'disconnected') {
            return 'disconnected';
        }

        // Never claim live healthy without Graph credentials + live mode.
        if (($health['status'] ?? '') === 'healthy') {
            return 'connected';
        }

        if (in_array($health['status'] ?? '', ['awaiting_credentials', 'local', 'seeded'], true)) {
            return $health['status'] === 'awaiting_credentials' ? 'awaiting_credentials' : 'local';
        }

        if (($health['status'] ?? '') === 'error') {
            return 'error';
        }

        return $integration->status;
    }

    /**
     * @return list<string>
     */
    protected function defaultScopes(string $channel): array
    {
        return match ($channel) {
            'facebook' => ['pages_messaging', 'pages_manage_metadata', 'pages_read_engagement'],
            'instagram' => ['instagram_manage_messages', 'instagram_basic', 'pages_manage_metadata'],
            'whatsapp' => ['whatsapp_business_messaging', 'whatsapp_business_management'],
            default => [],
        };
    }

    protected function storeSecret(Integration $integration, string $type, string $value): void
    {
        $secret = IntegrationSecret::query()->firstOrNew([
            'integration_id' => $integration->id,
            'secret_type' => $type,
        ]);
        $secret->key_version = 'v1';
        $secret->setPlainValue($value);
        $secret->save();
    }

    protected function hasSecret(?Integration $integration, string $type): bool
    {
        if (! $integration) {
            return false;
        }

        return $integration->secrets()->where('secret_type', $type)->exists();
    }
}
