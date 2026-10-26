<?php

namespace App\Services\CRM\Zoho;

use App\Models\Integration;
use App\Models\IntegrationSecret;
use App\Models\Workspace;

/**
 * Resolves Zoho OAuth credentials for CRM (contacts/leads) and Books
 * (invoices / UAE e-invoice PDF path). Prefer Integrations UI secrets, then env.
 */
class ZohoCredentialStore
{
    public function clientId(?Workspace $workspace = null): string
    {
        return $this->resolve($workspace, 'client_id', (string) config('integrations.zoho.client_id', ''));
    }

    public function clientSecret(?Workspace $workspace = null): string
    {
        return $this->resolve($workspace, 'client_secret', (string) config('integrations.zoho.client_secret', ''));
    }

    public function refreshToken(?Workspace $workspace = null): string
    {
        return $this->resolve($workspace, 'refresh_token', (string) config('integrations.zoho.refresh_token', ''));
    }

    public function accessToken(?Workspace $workspace = null): string
    {
        return $this->resolve($workspace, 'access_token', (string) config('integrations.zoho.access_token', ''));
    }

    public function organizationId(?Workspace $workspace = null): string
    {
        $fromMeta = '';
        if ($workspace) {
            $integration = $this->integration($workspace);
            $fromMeta = (string) ($integration?->metadata['organization_id'] ?? '');
        }

        return $fromMeta !== ''
            ? $fromMeta
            : (string) config('integrations.zoho.organization_id', '');
    }

    public function isConfigured(?Workspace $workspace = null): bool
    {
        return $this->clientId($workspace) !== ''
            && $this->clientSecret($workspace) !== ''
            && ($this->refreshToken($workspace) !== '' || $this->accessToken($workspace) !== '');
    }

    public function isBooksConfigured(?Workspace $workspace = null): bool
    {
        return $this->isConfigured($workspace) && $this->organizationId($workspace) !== '';
    }

    /**
     * @param  array{
     *   client_id?:string,
     *   client_secret?:string,
     *   refresh_token?:string,
     *   access_token?:string,
     *   organization_id?:string
     * }  $input
     * @return array<string, mixed>
     */
    public function save(Workspace $workspace, array $input): array
    {
        $integration = Integration::query()->firstOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => 'zoho',
            ],
            [
                'external_account_id' => 'zoho-primary',
                'display_name' => 'Zoho CRM + Books',
                'status' => 'awaiting_credentials',
                'capabilities' => ['contacts.upsert', 'leads.upsert', 'invoices.create', 'einvoice.uae', 'webhooks'],
                'metadata' => [],
            ]
        );

        foreach (['client_id', 'client_secret', 'refresh_token', 'access_token'] as $type) {
            $value = trim((string) ($input[$type] ?? ''));
            if ($value !== '') {
                $this->storeSecret($integration, $type, $value);
            }
        }

        $meta = $integration->metadata ?? [];
        $org = trim((string) ($input['organization_id'] ?? ''));
        if ($org !== '') {
            $meta['organization_id'] = $org;
            config(['integrations.zoho.organization_id' => $org]);
        }

        $hasCreds = $this->isConfigured($workspace)
            || trim((string) ($input['client_id'] ?? '')) !== ''
            || trim((string) ($input['refresh_token'] ?? '')) !== '';

        // Re-check after stores
        $configured = $this->clientId($workspace) !== ''
            && $this->clientSecret($workspace) !== ''
            && ($this->refreshToken($workspace) !== '' || $this->accessToken($workspace) !== '');

        if (! $configured) {
            // Count just-saved values for this request
            $cid = trim((string) ($input['client_id'] ?? '')) ?: $this->clientId($workspace);
            $csec = trim((string) ($input['client_secret'] ?? '')) ?: $this->clientSecret($workspace);
            $rt = trim((string) ($input['refresh_token'] ?? '')) ?: $this->refreshToken($workspace);
            $at = trim((string) ($input['access_token'] ?? '')) ?: $this->accessToken($workspace);
            $configured = $cid !== '' && $csec !== '' && ($rt !== '' || $at !== '');
        }

        $orgId = $org !== '' ? $org : $this->organizationId($workspace);

        $integration->forceFill([
            'display_name' => 'Zoho CRM + Books',
            'external_account_id' => $integration->external_account_id ?: 'zoho-primary',
            'status' => $configured ? 'connected' : 'awaiting_credentials',
            'capabilities' => ['contacts.upsert', 'leads.upsert', 'invoices.create', 'einvoice.uae', 'webhooks'],
            'last_health_check_at' => now(),
            'metadata' => array_merge($meta, [
                'organization_id' => $orgId !== '' ? $orgId : ($meta['organization_id'] ?? null),
                'has_oauth' => $configured,
                'has_books_org' => $orgId !== '',
                'source' => 'integrations_ui',
                'products' => [
                    'crm' => 'Zoho CRM — contacts/leads sync',
                    'books' => 'Zoho Books — invoices, PDF, UAE e-invoice path (preferred over CRM alone)',
                ],
                'mode_hint' => $configured
                    ? 'OAuth stored. Live Zoho calls need INTEGRATION_MODE=live. Books invoice/PDF needs organization_id.'
                    : 'Paste Zoho Client ID/Secret/Refresh token (+ Books organization ID for invoices). local_sim until keyed.',
            ]),
        ])->save();

        // Mirror into request-scoped config for immediate health checks
        if (trim((string) ($input['client_id'] ?? '')) !== '') {
            config(['integrations.zoho.client_id' => trim((string) $input['client_id'])]);
        }
        if (trim((string) ($input['client_secret'] ?? '')) !== '') {
            config(['integrations.zoho.client_secret' => trim((string) $input['client_secret'])]);
        }
        if (trim((string) ($input['refresh_token'] ?? '')) !== '') {
            config(['integrations.zoho.refresh_token' => trim((string) $input['refresh_token'])]);
        }
        if (trim((string) ($input['access_token'] ?? '')) !== '') {
            config(['integrations.zoho.access_token' => trim((string) $input['access_token'])]);
        }

        return $this->status($workspace);
    }

    public function clear(Workspace $workspace): array
    {
        $integration = $this->integration($workspace);
        if ($integration) {
            IntegrationSecret::query()
                ->where('integration_id', $integration->id)
                ->whereIn('secret_type', ['client_id', 'client_secret', 'refresh_token', 'access_token'])
                ->delete();

            $meta = $integration->metadata ?? [];
            unset($meta['organization_id'], $meta['has_oauth'], $meta['has_books_org']);

            $integration->forceFill([
                'status' => 'awaiting_credentials',
                'metadata' => array_merge($meta, [
                    'cleared_at' => now()->toIso8601String(),
                    'has_oauth' => false,
                    'has_books_org' => false,
                ]),
            ])->save();
        }

        config([
            'integrations.zoho.client_id' => env('ZOHO_CLIENT_ID') ?: null,
            'integrations.zoho.client_secret' => env('ZOHO_CLIENT_SECRET') ?: null,
            'integrations.zoho.refresh_token' => env('ZOHO_REFRESH_TOKEN') ?: null,
            'integrations.zoho.access_token' => env('ZOHO_ACCESS_TOKEN') ?: null,
            'integrations.zoho.organization_id' => env('ZOHO_ORGANIZATION_ID') ?: null,
        ]);

        return $this->status($workspace);
    }

    /**
     * @return array<string, mixed>
     */
    public function status(?Workspace $workspace = null): array
    {
        $configured = $this->isConfigured($workspace);
        $books = $this->isBooksConfigured($workspace);
        $integration = $workspace ? $this->integration($workspace) : null;
        $mode = (string) config('integrations.mode', 'local');
        if ($mode === 'mock') {
            $mode = 'local';
        }

        return [
            'provider' => 'zoho',
            'display_name' => 'Zoho CRM + Books',
            'status' => $configured ? 'connected' : 'awaiting_credentials',
            'has_credentials' => $configured,
            'has_books_org' => $books,
            'organization_id_present' => $this->organizationId($workspace) !== '',
            'mode' => $mode,
            'products' => [
                'crm' => 'Zoho CRM — customer/lead sync',
                'books' => 'Zoho Books — accounting PDF + UAE e-invoice (use Books/Invoice, not CRM alone)',
            ],
            'honesty' => $configured
                ? ($books
                    ? 'Zoho OAuth + Books organization ID present. Live API calls require INTEGRATION_MODE=live.'
                    : 'Zoho OAuth present; add Books organization ID for invoice PDF / UAE e-invoice. CRM sync can proceed without org ID.')
                : 'Zoho awaiting credentials. Paste Client ID, Client Secret, Refresh token (and Books org ID for invoices). local_sim until keyed.',
            'integration_id' => $integration?->id,
            'fields_needed' => [
                'client_id' => 'Zoho API Console Client ID',
                'client_secret' => 'Zoho API Console Client Secret',
                'refresh_token' => 'OAuth refresh token (CRM + Books scopes)',
                'organization_id' => 'Zoho Books organization ID (invoices / UAE e-invoice)',
            ],
        ];
    }

    protected function resolve(?Workspace $workspace, string $type, string $envFallback): string
    {
        if ($envFallback !== '') {
            return $envFallback;
        }

        if (! $workspace) {
            $any = Integration::query()->where('provider', 'zoho')->orderByDesc('updated_at')->first();
            if ($any) {
                $v = $this->secretValueForIntegration($any, $type);
                if ($v !== '') {
                    return $v;
                }
            }

            return '';
        }

        return $this->secretValueForIntegration($this->integration($workspace), $type);
    }

    protected function integration(Workspace $workspace): ?Integration
    {
        return Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', 'zoho')
            ->first();
    }

    protected function secretValueForIntegration(?Integration $integration, string $type): string
    {
        if (! $integration) {
            return '';
        }

        $secret = IntegrationSecret::query()
            ->where('integration_id', $integration->id)
            ->where('secret_type', $type)
            ->first();

        if (! $secret) {
            return '';
        }

        try {
            return trim($secret->getPlainValue());
        } catch (\Throwable) {
            return '';
        }
    }

    protected function storeSecret(Integration $integration, string $type, string $value): void
    {
        $secret = IntegrationSecret::query()->firstOrNew([
            'integration_id' => $integration->id,
            'secret_type' => $type,
        ]);
        $secret->setPlainValue($value);
        $secret->key_version = 'v1';
        $secret->save();
    }
}
