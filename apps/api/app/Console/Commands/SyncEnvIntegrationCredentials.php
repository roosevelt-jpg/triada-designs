<?php

namespace App\Console\Commands;

use App\Models\Integration;
use App\Models\IntegrationSecret;
use App\Models\Workspace;
use Illuminate\Console\Command;

/**
 * Copy non-empty env credentials into encrypted IntegrationSecret rows and
 * refresh honest integration statuses for INTEGRATION_MODE.
 *
 * Never prints secret values — only provider names and presence flags.
 */
class SyncEnvIntegrationCredentials extends Command
{
    protected $signature = 'integrations:sync-env-credentials
                            {--workspace= : Workspace ULID (defaults to first workspace)}';

    protected $description = 'Sync SHOPIFY_/TELEGRAM_/GEMINI_/RESEND_/META_/ZOHO_ env credentials into encrypted integration stores';

    public function handle(): int
    {
        $workspaceId = $this->option('workspace');
        $workspace = $workspaceId
            ? Workspace::query()->findOrFail($workspaceId)
            : Workspace::query()->orderBy('created_at')->first();

        if (! $workspace) {
            $this->error('No workspace found.');

            return self::FAILURE;
        }

        $live = strtolower((string) config('integrations.mode', 'local')) === 'live';
        $this->info('workspace='.$workspace->id);
        $this->info('INTEGRATION_MODE='.($live ? 'live' : 'local'));

        $synced = [];

        $telegram = (string) config('integrations.telegram.bot_token', '');
        $synced['telegram'] = $this->upsertProvider(
            $workspace,
            'telegram',
            'Telegram Bot',
            ['messages.send', 'messages.receive', 'webhooks', 'templates'],
            filled($telegram) ? ['bot_token' => $telegram] : [],
            $live,
            'telegram-primary'
        );

        $emailKey = (string) (config('integrations.email.api_key') ?: config('services.resend.key') ?: '');
        $synced['email'] = $this->upsertProvider(
            $workspace,
            'email',
            'Email (Resend)',
            ['messages.send', 'messages.receive', 'templates'],
            filled($emailKey) ? ['api_key' => $emailKey] : [],
            $live,
            'email-primary',
            ['from_address' => config('integrations.email.from_address')]
        );

        $gemini = (string) config('integrations.llm.gemini.api_key', '');
        $synced['gemini'] = $this->upsertProvider(
            $workspace,
            'gemini',
            'Google Gemini',
            ['llm.chat', 'agents', 'creative_prompts'],
            filled($gemini) ? ['api_key' => $gemini] : [],
            $live,
            'gemini-primary',
            ['model' => config('integrations.llm.gemini.model')]
        );

        $shopifyToken = (string) config('integrations.shopify.access_token', '');
        $shopDomain = (string) config('integrations.shopify.shop_domain', 'jwtjzw-nu.myshopify.com');
        $synced['shopify'] = $this->upsertProvider(
            $workspace,
            'shopify',
            'Shopify',
            ['products.read', 'orders.read', 'webhooks'],
            filled($shopifyToken) ? ['access_token' => $shopifyToken] : [],
            $live,
            $shopDomain !== '' ? $shopDomain : 'shopify-primary',
            ['shop_domain' => $shopDomain]
        );

        $metaPage = (string) config('integrations.meta.page_access_token', '');
        $metaWa = (string) config('integrations.meta.whatsapp_access_token', '');
        foreach ([
            'facebook' => ['Facebook Messenger', $metaPage, ['messages.send', 'messages.receive', 'webhooks', 'pages']],
            'instagram' => ['Instagram Messaging', $metaPage, ['messages.send', 'messages.receive', 'webhooks']],
            'whatsapp' => ['WhatsApp Cloud API', $metaWa !== '' ? $metaWa : $metaPage, ['messages.send', 'messages.receive', 'templates', 'webhooks']],
        ] as $provider => [$label, $token, $caps]) {
            $synced[$provider] = $this->upsertProvider(
                $workspace,
                $provider,
                $label,
                $caps,
                filled($token) ? ['access_token' => $token] : [],
                $live,
                $provider.'-primary'
            );
        }

        $zohoReady = filled(config('integrations.zoho.client_id'))
            && filled(config('integrations.zoho.client_secret'))
            && filled(config('integrations.zoho.refresh_token'));
        $zohoSecrets = [];
        foreach (['client_id', 'client_secret', 'refresh_token', 'access_token'] as $key) {
            $val = (string) config('integrations.zoho.'.$key, '');
            if ($val !== '') {
                $zohoSecrets[$key] = $val;
            }
        }
        $synced['zoho'] = $this->upsertProvider(
            $workspace,
            'zoho',
            'Zoho CRM + Books',
            ['crm.leads', 'crm.contacts', 'books.invoices'],
            $zohoSecrets,
            $live,
            'zoho-primary',
            [
                'organization_id' => config('integrations.zoho.organization_id'),
                'oauth_configured' => $zohoReady,
            ]
        );

        $this->table(
            ['provider', 'has_credentials', 'status', 'secrets_written'],
            collect($synced)->map(fn (array $row, string $provider) => [
                $provider,
                $row['has_credentials'] ? 'yes' : 'no',
                $row['status'],
                $row['secrets_written'] ? 'yes' : 'no',
            ])->values()->all()
        );

        $this->info('Done. Secret values were not printed.');

        return self::SUCCESS;
    }

    /**
     * @param  list<string>  $capabilities
     * @param  array<string, string>  $secrets
     * @param  array<string, mixed>  $metadata
     * @return array{has_credentials:bool,status:string,secrets_written:bool}
     */
    protected function upsertProvider(
        Workspace $workspace,
        string $provider,
        string $displayName,
        array $capabilities,
        array $secrets,
        bool $live,
        ?string $externalAccountId,
        array $metadata = [],
    ): array {
        $has = $secrets !== [];
        $status = $has
            ? ($live ? 'connected' : 'local')
            : 'awaiting_credentials';

        $integration = Integration::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => $provider,
                'external_account_id' => $externalAccountId,
            ],
            [
                'display_name' => $displayName,
                'status' => $status,
                'capabilities' => $capabilities,
                'last_health_check_at' => now(),
                'last_error_code' => null,
                'metadata' => array_merge($metadata, [
                    'synced_from_env' => true,
                    'has_env_credentials' => $has,
                    'mode_hint' => $has
                        ? ($live ? 'Credentials present; INTEGRATION_MODE=live' : 'Credentials present; local until INTEGRATION_MODE=live')
                        : 'Awaiting provider credentials',
                ]),
            ]
        );

        $wrote = false;
        foreach ($secrets as $type => $value) {
            if ($value === '') {
                continue;
            }
            $secret = IntegrationSecret::query()->firstOrNew([
                'integration_id' => $integration->id,
                'secret_type' => $type,
            ]);
            $secret->key_version = 'v1';
            $secret->setPlainValue($value);
            $secret->save();
            $wrote = true;
        }

        return [
            'has_credentials' => $has,
            'status' => $status,
            'secrets_written' => $wrote,
        ];
    }
}
