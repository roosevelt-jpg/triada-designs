<?php

namespace App\Services\Messaging\Meta;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Thin Meta Graph API client with honest local fallback.
 * Never reports live/healthy Graph success without credentials.
 */
class MetaGraphClient
{
    public function mode(): string
    {
        $mode = (string) config('integrations.mode', 'local');

        return $mode === 'mock' ? 'local' : $mode;
    }

    public function isConfigured(): bool
    {
        $cfg = config('integrations.meta');

        return filled($cfg['app_id'] ?? null)
            && filled($cfg['app_secret'] ?? null)
            && filled($cfg['page_access_token'] ?? null);
    }

    public function whatsappConfigured(): bool
    {
        $cfg = config('integrations.meta');

        return filled($cfg['whatsapp_phone_number_id'] ?? null)
            && filled($cfg['whatsapp_access_token'] ?? ($cfg['page_access_token'] ?? null));
    }

    public function usesLocalFallback(): bool
    {
        return $this->mode() !== 'live' || ! $this->isConfigured();
    }

    public function usesWhatsAppLocalFallback(): bool
    {
        return $this->mode() !== 'live' || ! $this->whatsappConfigured();
    }

    /**
     * @return array{status:string,mode:string,configured:bool,message:string,app_id_set:bool,verify_token_set:bool}
     */
    public function healthCheck(string $channel = 'facebook'): array
    {
        $cfg = config('integrations.meta');
        $configured = $channel === 'whatsapp' ? $this->whatsappConfigured() : $this->isConfigured();
        $local = $channel === 'whatsapp' ? $this->usesWhatsAppLocalFallback() : $this->usesLocalFallback();

        if ($local) {
            return [
                'status' => $configured ? 'local' : 'awaiting_credentials',
                'mode' => 'local',
                'configured' => $configured,
                'message' => $configured
                    ? 'Meta credentials present but INTEGRATION_MODE is not live — using local simulator.'
                    : 'Meta awaiting credentials. Dashboard control plane and local simulator are operable; Graph API calls are not live.',
                'app_id_set' => filled($cfg['app_id'] ?? null),
                'verify_token_set' => filled($cfg['verify_token'] ?? null),
            ];
        }

        try {
            $token = $channel === 'whatsapp'
                ? (string) ($cfg['whatsapp_access_token'] ?: $cfg['page_access_token'])
                : (string) $cfg['page_access_token'];

            $response = Http::timeout((int) ($cfg['timeout'] ?? 15))
                ->withToken($token)
                ->get($this->graphUrl('/me'), ['fields' => 'id,name']);

            if (! $response->successful()) {
                return [
                    'status' => 'error',
                    'mode' => 'live',
                    'configured' => true,
                    'message' => 'Meta Graph health check failed: HTTP '.$response->status(),
                    'app_id_set' => true,
                    'verify_token_set' => filled($cfg['verify_token'] ?? null),
                ];
            }

            return [
                'status' => 'healthy',
                'mode' => 'live',
                'configured' => true,
                'message' => 'Meta Graph API reachable for '.$channel.'.',
                'app_id_set' => true,
                'verify_token_set' => filled($cfg['verify_token'] ?? null),
                'account' => $response->json(),
            ];
        } catch (\Throwable $e) {
            Log::warning('meta.health_failed', ['channel' => $channel, 'error' => $e->getMessage()]);

            return [
                'status' => 'error',
                'mode' => 'live',
                'configured' => true,
                'message' => 'Meta health exception: '.$e->getMessage(),
                'app_id_set' => true,
                'verify_token_set' => filled($cfg['verify_token'] ?? null),
            ];
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listPages(): array
    {
        if ($this->usesLocalFallback()) {
            return [
                [
                    'id' => 'seed-page-triada',
                    'name' => 'Triada Designs',
                    'category' => 'Beauty, Cosmetic & Personal Care',
                    'source' => 'seeded',
                ],
                [
                    'id' => 'seed-page-triada-care',
                    'name' => 'Triada Care',
                    'category' => 'Product/Service',
                    'source' => 'seeded',
                ],
            ];
        }

        $token = (string) config('integrations.meta.page_access_token');
        $response = Http::timeout((int) config('integrations.meta.timeout', 15))
            ->withToken($token)
            ->get($this->graphUrl('/me/accounts'), ['fields' => 'id,name,category']);

        if (! $response->successful()) {
            throw new \RuntimeException('Failed to list Meta pages: HTTP '.$response->status());
        }

        return collect($response->json('data') ?? [])->map(fn ($row) => array_merge($row, ['source' => 'live']))->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listInstagramAccounts(): array
    {
        if ($this->usesLocalFallback()) {
            return [
                [
                    'id' => 'seed-ig-triada',
                    'username' => 'triada.designs',
                    'name' => 'Triada Designs',
                    'source' => 'seeded',
                ],
            ];
        }

        $pages = $this->listPages();
        $accounts = [];
        $token = (string) config('integrations.meta.page_access_token');

        foreach ($pages as $page) {
            $response = Http::timeout((int) config('integrations.meta.timeout', 15))
                ->withToken($token)
                ->get($this->graphUrl('/'.$page['id']), ['fields' => 'instagram_business_account{id,username,name}']);

            $ig = $response->json('instagram_business_account');
            if (is_array($ig) && isset($ig['id'])) {
                $accounts[] = array_merge($ig, ['source' => 'live', 'page_id' => $page['id']]);
            }
        }

        return $accounts;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listWhatsAppNumbers(): array
    {
        if ($this->usesWhatsAppLocalFallback()) {
            return [
                [
                    'id' => (string) (config('integrations.meta.whatsapp_phone_number_id') ?: 'seed-wa-phone'),
                    'display_phone_number' => '+1 555 010 2345',
                    'verified_name' => 'Triada Designs',
                    'source' => 'seeded',
                ],
            ];
        }

        $phoneId = (string) config('integrations.meta.whatsapp_phone_number_id');
        $token = (string) (config('integrations.meta.whatsapp_access_token') ?: config('integrations.meta.page_access_token'));
        $response = Http::timeout((int) config('integrations.meta.timeout', 15))
            ->withToken($token)
            ->get($this->graphUrl('/'.$phoneId), ['fields' => 'id,display_phone_number,verified_name']);

        if (! $response->successful()) {
            throw new \RuntimeException('Failed to load WhatsApp phone: HTTP '.$response->status());
        }

        return [array_merge($response->json() ?? [], ['source' => 'live'])];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{ok:bool,mode:string,provider_message_id:?string,raw:array<string,mixed>,error_code?:string,error_message?:string}
     */
    public function sendMessenger(string $pageId, string $recipientId, string $body): array
    {
        if ($this->usesLocalFallback()) {
            return [
                'ok' => true,
                'mode' => 'local',
                'provider_message_id' => 'local-fb-'.Str::ulid(),
                'raw' => ['recipient_id' => $recipientId, 'page_id' => $pageId, 'simulated' => true],
            ];
        }

        $token = (string) config('integrations.meta.page_access_token');
        $response = Http::timeout((int) config('integrations.meta.timeout', 15))
            ->withToken($token)
            ->post($this->graphUrl('/me/messages'), [
                'recipient' => ['id' => $recipientId],
                'messaging_type' => 'RESPONSE',
                'message' => ['text' => $body],
            ]);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'mode' => 'live',
                'provider_message_id' => null,
                'error_code' => 'graph_send_failed',
                'error_message' => 'HTTP '.$response->status(),
                'raw' => $response->json() ?? [],
            ];
        }

        return [
            'ok' => true,
            'mode' => 'live',
            'provider_message_id' => (string) ($response->json('message_id') ?? Str::ulid()),
            'raw' => $response->json() ?? [],
        ];
    }

    /**
     * @return array{ok:bool,mode:string,provider_message_id:?string,raw:array<string,mixed>,error_code?:string,error_message?:string}
     */
    public function sendInstagram(string $igUserId, string $recipientId, string $body): array
    {
        if ($this->usesLocalFallback()) {
            return [
                'ok' => true,
                'mode' => 'local',
                'provider_message_id' => 'local-ig-'.Str::ulid(),
                'raw' => ['recipient_id' => $recipientId, 'ig_user_id' => $igUserId, 'simulated' => true],
            ];
        }

        $token = (string) config('integrations.meta.page_access_token');
        $response = Http::timeout((int) config('integrations.meta.timeout', 15))
            ->withToken($token)
            ->post($this->graphUrl('/'.$igUserId.'/messages'), [
                'recipient' => ['id' => $recipientId],
                'message' => ['text' => $body],
            ]);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'mode' => 'live',
                'provider_message_id' => null,
                'error_code' => 'graph_send_failed',
                'error_message' => 'HTTP '.$response->status(),
                'raw' => $response->json() ?? [],
            ];
        }

        return [
            'ok' => true,
            'mode' => 'live',
            'provider_message_id' => (string) ($response->json('message_id') ?? Str::ulid()),
            'raw' => $response->json() ?? [],
        ];
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array{ok:bool,mode:string,provider_message_id:?string,raw:array<string,mixed>,error_code?:string,error_message?:string}
     */
    public function sendWhatsApp(string $to, string $body, array $options = []): array
    {
        if ($this->usesWhatsAppLocalFallback()) {
            return [
                'ok' => true,
                'mode' => 'local',
                'provider_message_id' => 'local-wa-'.Str::ulid(),
                'raw' => [
                    'to' => $to,
                    'simulated' => true,
                    'template' => $options['template_name'] ?? null,
                ],
            ];
        }

        $phoneId = (string) config('integrations.meta.whatsapp_phone_number_id');
        $token = (string) (config('integrations.meta.whatsapp_access_token') ?: config('integrations.meta.page_access_token'));

        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => 'text',
            'text' => ['body' => $body],
        ];

        if (! empty($options['template_name'])) {
            $payload = [
                'messaging_product' => 'whatsapp',
                'to' => $to,
                'type' => 'template',
                'template' => [
                    'name' => $options['template_name'],
                    'language' => ['code' => $options['language'] ?? 'en'],
                ],
            ];
        }

        $response = Http::timeout((int) config('integrations.meta.timeout', 15))
            ->withToken($token)
            ->post($this->graphUrl('/'.$phoneId.'/messages'), $payload);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'mode' => 'live',
                'provider_message_id' => null,
                'error_code' => 'graph_send_failed',
                'error_message' => 'HTTP '.$response->status(),
                'raw' => $response->json() ?? [],
            ];
        }

        $messages = $response->json('messages') ?? [];

        return [
            'ok' => true,
            'mode' => 'live',
            'provider_message_id' => (string) ($messages[0]['id'] ?? Str::ulid()),
            'raw' => $response->json() ?? [],
        ];
    }

    protected function graphUrl(string $path): string
    {
        $version = (string) config('integrations.meta.graph_version', 'v21.0');
        $base = rtrim((string) config('integrations.meta.graph_base', 'https://graph.facebook.com'), '/');

        return $base.'/'.$version.'/'.ltrim($path, '/');
    }
}
