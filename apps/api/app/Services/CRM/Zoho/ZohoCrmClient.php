<?php

namespace App\Services\CRM\Zoho;

use App\Services\CRM\Contracts\CrmClientInterface;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Zoho CRM API client with mock/local fallback.
 *
 * Live mode expects OAuth client credentials + refresh token.
 * Secrets stay server-side; never expose them to the Next.js client.
 */
class ZohoCrmClient implements CrmClientInterface
{
    public function provider(): string
    {
        return 'zoho';
    }

    public function mode(): string
    {
        return (string) config('integrations.mode', 'mock');
    }

    public function isConfigured(): bool
    {
        $cfg = config('integrations.zoho');

        return filled($cfg['client_id'])
            && filled($cfg['client_secret'])
            && (filled($cfg['refresh_token']) || filled($cfg['access_token']));
    }

    public function healthCheck(): array
    {
        if ($this->mode() === 'mock' || ! $this->isConfigured()) {
            return [
                'status' => 'mock',
                'mode' => $this->mode(),
                'configured' => $this->isConfigured(),
                'message' => 'Zoho CRM running in mock/local fallback. Set ZOHO_* env vars and INTEGRATION_MODE=live to connect.',
            ];
        }

        try {
            $token = $this->accessToken();
            $module = config('integrations.zoho.module_leads');
            $response = Http::baseUrl(config('integrations.zoho.api_domain'))
                ->timeout((int) config('integrations.zoho.timeout'))
                ->withToken($token)
                ->acceptJson()
                ->get('/crm/v2/settings/modules');

            if (! $response->successful()) {
                return [
                    'status' => 'error',
                    'mode' => 'live',
                    'configured' => true,
                    'message' => 'Zoho health check failed: HTTP '.$response->status(),
                ];
            }

            return [
                'status' => 'healthy',
                'mode' => 'live',
                'configured' => true,
                'message' => "Zoho CRM reachable. Default leads module: {$module}",
            ];
        } catch (\Throwable $e) {
            Log::warning('zoho.health_failed', ['error' => $e->getMessage()]);

            return [
                'status' => 'error',
                'mode' => 'live',
                'configured' => true,
                'message' => 'Zoho health check exception: '.$e->getMessage(),
            ];
        }
    }

    public function upsertContact(array $contact): array
    {
        if ($this->mode() === 'mock' || ! $this->isConfigured()) {
            return [
                'id' => $contact['external_crm_id'] ?? ('mock-contact-'.uniqid()),
                'provider' => 'zoho',
                'source' => 'mock',
                'email' => $contact['email'] ?? null,
                'name' => $contact['name'] ?? null,
            ];
        }

        $module = config('integrations.zoho.module_contacts');
        $payload = [
            'data' => [[
                'Last_Name' => $contact['name'] ?? 'Unknown',
                'Email' => $contact['email'] ?? null,
                'Phone' => $contact['phone'] ?? null,
            ]],
        ];

        $response = $this->api()->post("/crm/v2/{$module}/upsert", $payload);

        if (! $response->successful()) {
            throw new RuntimeException('Zoho upsertContact failed: HTTP '.$response->status());
        }

        $record = $response->json('data.0.details') ?? $response->json('data.0') ?? [];

        return [
            'id' => (string) ($record['id'] ?? ''),
            'provider' => 'zoho',
            'source' => 'zoho',
            'raw' => $record,
        ];
    }

    public function upsertLead(array $lead): array
    {
        if ($this->mode() === 'mock' || ! $this->isConfigured()) {
            return [
                'id' => $lead['external_crm_id'] ?? ('mock-lead-'.uniqid()),
                'provider' => 'zoho',
                'source' => 'mock',
                'stage' => $lead['stage'] ?? 'new_lead',
                'score' => $lead['score'] ?? 0,
            ];
        }

        $module = config('integrations.zoho.module_leads');
        $payload = [
            'data' => [[
                'Last_Name' => $lead['name'] ?? 'Lead',
                'Email' => $lead['email'] ?? null,
                'Lead_Source' => $lead['source_channel'] ?? 'Website',
                'Description' => json_encode($lead['qualification_data'] ?? []),
            ]],
        ];

        $response = $this->api()->post("/crm/v2/{$module}/upsert", $payload);

        if (! $response->successful()) {
            throw new RuntimeException('Zoho upsertLead failed: HTTP '.$response->status());
        }

        $record = $response->json('data.0.details') ?? $response->json('data.0') ?? [];

        return [
            'id' => (string) ($record['id'] ?? ''),
            'provider' => 'zoho',
            'source' => 'zoho',
            'raw' => $record,
        ];
    }

    public function listRecentLeads(int $limit = 10): array
    {
        if ($this->mode() === 'mock' || ! $this->isConfigured()) {
            return [
                [
                    'id' => 'mock-lead-1',
                    'name' => 'Amelia Chen',
                    'email' => 'amelia@example.com',
                    'stage' => 'qualified',
                    'source' => 'mock',
                ],
                [
                    'id' => 'mock-lead-2',
                    'name' => 'Noah Patel',
                    'email' => 'noah@example.com',
                    'stage' => 'contacted',
                    'source' => 'mock',
                ],
            ];
        }

        $module = config('integrations.zoho.module_leads');
        $response = $this->api()->get("/crm/v2/{$module}", [
            'per_page' => $limit,
            'sort_by' => 'Modified_Time',
            'sort_order' => 'desc',
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Zoho listRecentLeads failed: HTTP '.$response->status());
        }

        return collect($response->json('data') ?? [])
            ->map(fn (array $row) => [
                'id' => (string) ($row['id'] ?? ''),
                'name' => trim(($row['First_Name'] ?? '').' '.($row['Last_Name'] ?? '')),
                'email' => $row['Email'] ?? null,
                'stage' => $row['Lead_Status'] ?? null,
                'source' => 'zoho',
            ])
            ->values()
            ->all();
    }

    public function verifyWebhook(?string $providedSecret): bool
    {
        $expected = (string) config('integrations.zoho.webhook_secret');

        if ($expected === '') {
            return $this->mode() === 'mock';
        }

        return hash_equals($expected, (string) $providedSecret);
    }

    protected function api()
    {
        return Http::baseUrl(config('integrations.zoho.api_domain'))
            ->timeout((int) config('integrations.zoho.timeout'))
            ->withToken($this->accessToken())
            ->acceptJson();
    }

    protected function accessToken(): string
    {
        $configured = config('integrations.zoho.access_token');
        if (filled($configured)) {
            return (string) $configured;
        }

        $response = Http::asForm()
            ->timeout((int) config('integrations.zoho.timeout'))
            ->post(config('integrations.zoho.accounts_url').'/oauth/v2/token', [
                'refresh_token' => config('integrations.zoho.refresh_token'),
                'client_id' => config('integrations.zoho.client_id'),
                'client_secret' => config('integrations.zoho.client_secret'),
                'grant_type' => 'refresh_token',
            ]);

        if (! $response->successful() || blank($response->json('access_token'))) {
            throw new RuntimeException('Unable to refresh Zoho access token.');
        }

        return (string) $response->json('access_token');
    }
}
