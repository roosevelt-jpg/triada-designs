<?php

namespace App\Services\Messaging\Channels;

use App\Models\AuditLog;
use App\Models\Integration;
use App\Models\IntegrationSecret;
use App\Models\WebchatWidgetToken;
use App\Models\Workspace;
use App\Services\Messaging\DTOs\NormalizedMessage;
use Illuminate\Support\Str;

class ChannelControlPlane
{
    /** Channels managed from the Channels / Integrations dashboard (credential paste + local sim). */
    public const CHANNELS = [
        'webchat',
        'facebook',
        'instagram',
        'whatsapp',
        'shopify',
        'tiktok',
        'linkedin',
        'email',
        'telegram',
    ];

    public function __construct(protected ChannelInboundProcessor $inbound)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function status(Workspace $workspace): array
    {
        $channels = [];
        foreach (self::CHANNELS as $channel) {
            $integration = $this->find($workspace, $channel);
            $hasSecret = $this->hasCredential($integration, $channel);
            $status = $integration?->status ?: 'disconnected';

            if ($status === 'connected' && ! $hasSecret && $channel !== 'webchat') {
                $status = 'awaiting_credentials';
            }

            // Never report healthy without live mode + credentials.
            $mode = strtolower((string) config('integrations.mode', 'local'));
            $live = $mode === 'live' && ($hasSecret || $channel === 'webchat');
            if (in_array($status, ['healthy', 'connected'], true) && ! $live && $channel !== 'webchat') {
                // Connected with pasted token still stays local until INTEGRATION_MODE=live.
                if ($hasSecret) {
                    $status = 'local';
                } elseif ($status === 'healthy') {
                    $status = 'awaiting_credentials';
                }
            }
            if ($status === 'seeded' && $channel === 'webchat') {
                // Website chat can operate on seed widget tokens locally.
                $status = 'local';
            }

            $channels[$channel] = [
                'provider' => $channel,
                'integration_id' => $integration?->id,
                'display_name' => $integration?->display_name ?: $this->label($channel),
                'status' => $status,
                'mode' => $live ? 'live' : 'local',
                'has_credentials' => $hasSecret || ($channel === 'webchat' && $status === 'local'),
                'webhook_path' => in_array($channel, ['facebook', 'instagram', 'whatsapp'], true)
                    ? '/api/webhooks/meta'
                    : '/api/webhooks/'.$channel,
                'capabilities' => $this->capabilities($channel),
                'hub' => $this->hubPath($channel),
            ];
        }

        $widget = WebchatWidgetToken::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', 'active')
            ->first();

        return [
            'honesty' => 'Jewellery sales channels stay awaiting_credentials / local / disconnected until provider tokens and INTEGRATION_MODE=live. Never shown as healthy live without credentials.',
            'channels' => $channels,
            'webchat_widget' => $widget ? [
                'id' => $widget->id,
                'name' => $widget->name,
                'public_token' => $widget->public_token,
                'rate_limit_per_minute' => $widget->rate_limit_per_minute,
                'embed_path' => '/widget/chat.js',
            ] : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function connect(Workspace $workspace, string $channel, array $input): array
    {
        if (! in_array($channel, self::CHANNELS, true)) {
            abort(422, 'Unsupported channel');
        }

        $token = (string) ($input['access_token'] ?? $input['bot_token'] ?? $input['api_key'] ?? '');
        $integration = Integration::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => $channel,
                'external_account_id' => (string) ($input['external_account_id'] ?? $channel.'-primary'),
            ],
            [
                'display_name' => (string) ($input['display_name'] ?? $this->label($channel)),
                'status' => $token !== ''
                    ? (strtolower((string) config('integrations.mode', 'local')) === 'live' ? 'connected' : 'local')
                    : 'awaiting_credentials',
                'granted_scopes' => $input['scopes'] ?? $this->capabilities($channel),
                'capabilities' => $this->capabilities($channel),
                'last_health_check_at' => now(),
                'metadata' => [
                    'connected_via' => 'triada_dashboard',
                    'from_address' => $input['from_address'] ?? null,
                    'shop_domain' => $input['shop_domain'] ?? null,
                ],
            ]
        );

        if ($token !== '') {
            $secretType = match ($channel) {
                'telegram' => 'bot_token',
                'email' => 'api_key',
                'shopify' => 'admin_access_token',
                default => 'access_token',
            };
            $this->storeSecret($integration, $secretType, $token);
        }

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => (string) ($input['actor_id'] ?? 'system'),
            'action' => $channel.'.connect',
            'target_type' => 'integration',
            'target_id' => $integration->id,
            'created_at' => now(),
            'metadata' => ['has_token' => $token !== ''],
        ]);

        return $this->status($workspace);
    }

    public function disconnect(Workspace $workspace, string $channel): array
    {
        $integration = $this->find($workspace, $channel);
        if ($integration) {
            $integration->secrets()->delete();
            $integration->forceFill(['status' => 'disconnected'])->save();
        }

        return $this->status($workspace);
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function simulateInbound(Workspace $workspace, string $channel, array $input): array
    {
        if (! in_array($channel, self::CHANNELS, true) || $channel === 'shopify') {
            abort(422, 'Inbound simulation not supported for this channel');
        }

        $body = (string) ($input['body'] ?? 'Hello from local '.$channel.' simulator');
        $externalUser = (string) ($input['external_user_id'] ?? ('sim-'.$channel.'-user'));
        $eventId = (string) ($input['provider_event_id'] ?? Str::ulid());

        $item = new NormalizedMessage(
            channel: $channel,
            providerEventId: $eventId,
            externalUserId: $externalUser,
            externalConversationId: $channel.':'.$externalUser,
            pageOrAccountId: null,
            messageType: 'text',
            body: $body,
            providerMessageId: 'sim-'.$eventId,
            timestamp: now()->toIso8601String(),
            metadata: [
                'contact_name' => $input['contact_name'] ?? ('Simulator '.$channel),
                'email' => $input['email'] ?? null,
                'simulated' => true,
            ],
        );

        return $this->inbound->ingestNormalized($workspace, $channel, $item, json_encode($input));
    }

    /**
     * @return array<string, mixed>
     */
    public function ensureWebchatToken(Workspace $workspace): array
    {
        $token = WebchatWidgetToken::query()->firstOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => 'Website widget',
            ],
            [
                'public_token' => 'wc_'.Str::lower((string) Str::ulid()),
                'status' => 'active',
                'rate_limit_per_minute' => 30,
                'allowed_origins' => ['*'],
                'metadata' => ['created_via' => 'triada_dashboard'],
            ]
        );

        Integration::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => 'webchat',
                'external_account_id' => 'webchat-primary',
            ],
            [
                'display_name' => 'Website Live Chat',
                'status' => 'local',
                'capabilities' => ['messages.send', 'messages.receive', 'widget'],
                'metadata' => ['widget_token_id' => $token->id],
            ]
        );

        return $this->status($workspace);
    }

    protected function find(Workspace $workspace, string $channel): ?Integration
    {
        return Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', $channel)
            ->first();
    }

    protected function hasCredential(?Integration $integration, string $channel): bool
    {
        $cfg = config('integrations.'.$channel, []);
        $envFilled = match ($channel) {
            'telegram' => filled($cfg['bot_token'] ?? null),
            'tiktok' => filled($cfg['access_token'] ?? null),
            'linkedin' => filled($cfg['access_token'] ?? null),
            'email' => filled($cfg['api_key'] ?? null) || filled(config('mail.mailers.smtp.username')),
            'facebook', 'instagram', 'whatsapp' => filled(config('integrations.meta.access_token')),
            'shopify' => filled(config('integrations.shopify.access_token')),
            'webchat' => true,
            default => false,
        };

        if ($envFilled) {
            return true;
        }

        if (! $integration) {
            return false;
        }

        return $integration->secrets()->exists();
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

    protected function label(string $channel): string
    {
        return match ($channel) {
            'telegram' => 'Telegram Bot',
            'tiktok' => 'TikTok',
            'linkedin' => 'LinkedIn',
            'email' => 'Email',
            'webchat' => 'Website Live Chat',
            'facebook' => 'Facebook',
            'instagram' => 'Instagram',
            'whatsapp' => 'WhatsApp',
            'shopify' => 'Shopify',
            default => ucfirst($channel),
        };
    }

    protected function hubPath(string $channel): ?string
    {
        return match ($channel) {
            'facebook', 'instagram', 'whatsapp' => '/integrations/meta',
            'shopify' => '/integrations/shopify',
            default => '/integrations/channels',
        };
    }

    /**
     * @return list<string>
     */
    protected function capabilities(string $channel): array
    {
        return match ($channel) {
            'telegram' => ['messages.send', 'messages.receive', 'webhooks', 'templates'],
            'tiktok' => ['posts.publish', 'templates', 'webhooks'],
            'linkedin' => ['posts.publish', 'templates', 'messaging'],
            'email' => ['messages.send', 'messages.receive', 'templates'],
            'webchat' => ['messages.send', 'messages.receive', 'widget'],
            'facebook' => ['messages.send', 'messages.receive', 'webhooks', 'pages', 'templates'],
            'instagram' => ['messages.send', 'messages.receive', 'webhooks', 'comments', 'templates'],
            'whatsapp' => ['messages.send', 'messages.receive', 'templates', 'webhooks'],
            'shopify' => ['products.read', 'orders.read', 'orders.notify', 'templates'],
            default => ['messages.send', 'messages.receive'],
        };
    }
}
