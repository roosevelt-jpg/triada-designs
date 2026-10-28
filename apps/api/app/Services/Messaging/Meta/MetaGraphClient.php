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

    /**
     * Template list/create requires WABA id in addition to phone + token.
     */
    public function whatsappTemplateConfigured(): bool
    {
        return $this->whatsappConfigured()
            && filled(config('integrations.meta.whatsapp_business_account_id'));
    }

    public function usesLocalFallback(): bool
    {
        return $this->mode() !== 'live' || ! $this->isConfigured();
    }

    public function usesWhatsAppLocalFallback(): bool
    {
        return $this->mode() !== 'live' || ! $this->whatsappConfigured();
    }

    public function usesWhatsAppTemplateLocalFallback(): bool
    {
        if (! $this->whatsappTemplateConfigured()) {
            return true;
        }

        // Explicit local mode keeps the jewellery sim catalog; otherwise META_WA_*
        // credentials drive live Graph message_templates (create/sync/submit).
        return $this->mode() === 'local';
    }

    public function usesWhatsAppSendLocalFallback(): bool
    {
        if (! $this->whatsappConfigured()) {
            return true;
        }

        return $this->mode() === 'local';
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
     * Upload media to Meta Cloud API (POST /{phone-number-id}/media).
     *
     * @param  array{path?:string,contents?:string,url?:string,mime_type?:string,media_type?:string,filename?:string}  $input
     * @return array{ok:bool,mode:string,media_id:?string,media_type:string,error:?string,raw:array<string,mixed>}
     */
    public function uploadWhatsAppMedia(array $input = []): array
    {
        $kind = $this->normalizeWhatsAppMediaKind($input['media_type'] ?? $input['mime_type'] ?? 'image');
        $mime = (string) ($input['mime_type'] ?? ($kind === 'video' ? 'video/mp4' : 'image/jpeg'));
        $filename = (string) ($input['filename'] ?? ($kind === 'video' ? 'triada-media.mp4' : 'triada-media.jpg'));
        $contents = null;

        if (! empty($input['contents'])) {
            $contents = (string) $input['contents'];
        } elseif (! empty($input['path']) && is_readable((string) $input['path'])) {
            $contents = (string) file_get_contents((string) $input['path']);
        } elseif (! empty($input['url'])) {
            $fetched = Http::timeout((int) config('integrations.meta.timeout', 15))
                ->get((string) $input['url']);
            if (! $fetched->successful()) {
                return [
                    'ok' => false,
                    'mode' => $this->usesWhatsAppSendLocalFallback() ? 'local_sim' : 'live',
                    'media_id' => null,
                    'media_type' => $kind,
                    'error' => 'media_url_fetch_failed',
                    'raw' => [],
                ];
            }
            $contents = $fetched->body();
            if (empty($input['mime_type']) && $fetched->header('Content-Type')) {
                $mime = (string) $fetched->header('Content-Type');
            }
        }

        if ($this->usesWhatsAppSendLocalFallback()) {
            return [
                'ok' => true,
                'mode' => 'local_sim',
                'media_id' => 'local-media-'.$kind.'-'.Str::lower((string) Str::ulid()),
                'media_type' => $kind,
                'error' => null,
                'raw' => [
                    'simulated' => true,
                    'filename' => $filename,
                    'bytes' => $contents !== null ? strlen($contents) : 0,
                ],
            ];
        }

        if ($contents === null || $contents === '') {
            return [
                'ok' => false,
                'mode' => 'live',
                'media_id' => null,
                'media_type' => $kind,
                'error' => 'media_bytes_required',
                'raw' => [],
            ];
        }

        $phoneId = (string) config('integrations.meta.whatsapp_phone_number_id');
        $token = (string) (config('integrations.meta.whatsapp_access_token') ?: config('integrations.meta.page_access_token'));

        $response = Http::timeout((int) config('integrations.meta.timeout', 30))
            ->withToken($token)
            ->attach('file', $contents, $filename)
            ->post($this->graphUrl('/'.$phoneId.'/media'), [
                'messaging_product' => 'whatsapp',
                'type' => $mime,
            ]);

        if (! $response->successful() || empty($response->json('id'))) {
            return [
                'ok' => false,
                'mode' => 'live',
                'media_id' => null,
                'media_type' => $kind,
                'error' => (string) ($response->json('error.message') ?? ('HTTP '.$response->status())),
                'raw' => $response->json() ?? [],
            ];
        }

        return [
            'ok' => true,
            'mode' => 'live',
            'media_id' => (string) $response->json('id'),
            'media_type' => $kind,
            'error' => null,
            'raw' => ['id' => $response->json('id')],
        ];
    }

    /**
     * @param  array<string, mixed>  $options
     * @return list<array<string, mixed>>
     */
    public function mergeWhatsAppTemplateMediaComponents(array $components, array $options = []): array
    {
        $mediaId = (string) ($options['media_id'] ?? $options['header_media_id'] ?? '');
        $mediaLink = (string) ($options['media_link'] ?? $options['header_media_link'] ?? $options['media_url'] ?? '');
        if ($mediaId === '' && $mediaLink === '') {
            return $components;
        }

        $kind = $this->normalizeWhatsAppMediaKind(
            $options['media_type'] ?? $options['header_media_type'] ?? 'image'
        );
        $payload = $mediaId !== '' ? ['id' => $mediaId] : ['link' => $mediaLink];
        $header = [
            'type' => 'HEADER',
            'parameters' => [[
                'type' => $kind,
                $kind => $payload,
            ]],
        ];

        $replaced = false;
        $next = [];
        foreach ($components as $component) {
            if (strtoupper((string) ($component['type'] ?? '')) === 'HEADER') {
                $next[] = $header;
                $replaced = true;
            } else {
                $next[] = $component;
            }
        }

        return $replaced ? $next : array_merge([$header], $next);
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array{ok:bool,mode:string,provider_message_id:?string,media_id:?string,raw:array<string,mixed>,error_code?:string,error_message?:string}
     */
    public function sendWhatsApp(string $to, string $body, array $options = []): array
    {
        $components = is_array($options['components'] ?? null) ? $options['components'] : [];
        $resolvedMediaId = (string) ($options['media_id'] ?? $options['header_media_id'] ?? '');
        $mediaUrl = (string) ($options['media_url'] ?? $options['header_media_url'] ?? '');
        $mediaLink = (string) ($options['media_link'] ?? $options['header_media_link'] ?? '');

        if ($resolvedMediaId === '' && $mediaUrl !== '') {
            $uploaded = $this->uploadWhatsAppMedia([
                'url' => $mediaUrl,
                'mime_type' => $options['mime_type'] ?? null,
                'media_type' => $options['media_type'] ?? $options['header_media_type'] ?? 'image',
                'filename' => $options['filename'] ?? null,
            ]);
            if (! ($uploaded['ok'] ?? false)) {
                return [
                    'ok' => false,
                    'mode' => (string) ($uploaded['mode'] ?? 'live'),
                    'provider_message_id' => null,
                    'media_id' => null,
                    'error_code' => 'media_upload_failed',
                    'error_message' => (string) ($uploaded['error'] ?? 'media_upload_failed'),
                    'raw' => $uploaded['raw'] ?? [],
                ];
            }
            $resolvedMediaId = (string) ($uploaded['media_id'] ?? '');
            $options['media_type'] = $uploaded['media_type'] ?? ($options['media_type'] ?? 'image');
        }

        $components = $this->mergeWhatsAppTemplateMediaComponents($components, array_merge($options, [
            'media_id' => $resolvedMediaId !== '' ? $resolvedMediaId : null,
            'media_link' => $mediaLink !== '' ? $mediaLink : null,
        ]));

        if ($this->usesWhatsAppSendLocalFallback()) {
            return [
                'ok' => true,
                'mode' => 'local',
                'provider_message_id' => 'local-wa-'.Str::ulid(),
                'media_id' => $resolvedMediaId !== '' ? $resolvedMediaId : null,
                'raw' => [
                    'to' => $to,
                    'simulated' => true,
                    'template' => $options['template_name'] ?? null,
                    'components' => $components,
                    'media_attached' => $resolvedMediaId !== '' || $mediaLink !== '',
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
            $template = [
                'name' => $options['template_name'],
                'language' => ['code' => $options['language'] ?? 'en'],
            ];
            if ($components !== []) {
                $template['components'] = $components;
            }
            $payload = [
                'messaging_product' => 'whatsapp',
                'to' => $to,
                'type' => 'template',
                'template' => $template,
            ];
        } elseif (! empty($options['media_message']) || ($resolvedMediaId !== '' || $mediaLink !== '')) {
            $kind = $this->normalizeWhatsAppMediaKind($options['media_type'] ?? 'image');
            $mediaPayload = $resolvedMediaId !== ''
                ? ['id' => $resolvedMediaId]
                : ['link' => $mediaLink !== '' ? $mediaLink : $mediaUrl];
            if (! empty($options['caption'])) {
                $mediaPayload['caption'] = (string) $options['caption'];
            }
            $payload = [
                'messaging_product' => 'whatsapp',
                'to' => $to,
                'type' => $kind,
                $kind => $mediaPayload,
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
                'media_id' => $resolvedMediaId !== '' ? $resolvedMediaId : null,
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
            'media_id' => $resolvedMediaId !== '' ? $resolvedMediaId : null,
            'raw' => $response->json() ?? [],
        ];
    }

    protected function normalizeWhatsAppMediaKind(mixed $value): string
    {
        $raw = strtolower(trim((string) $value));
        if ($raw === '' || str_starts_with($raw, 'image') || in_array($raw, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
            return 'image';
        }
        if (str_starts_with($raw, 'video') || in_array($raw, ['mp4', '3gp'], true)) {
            return 'video';
        }

        return 'image';
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listWhatsAppMessageTemplates(): array
    {
        if ($this->usesWhatsAppTemplateLocalFallback()) {
            return $this->localJewelleryWhatsAppTemplates();
        }

        $waba = (string) config('integrations.meta.whatsapp_business_account_id');
        $token = (string) (config('integrations.meta.whatsapp_access_token') ?: config('integrations.meta.page_access_token'));
        $response = Http::timeout((int) config('integrations.meta.timeout', 15))
            ->withToken($token)
            ->get($this->graphUrl('/'.$waba.'/message_templates'), [
                'fields' => 'id,name,status,category,language,components',
                'limit' => 100,
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Failed to list WhatsApp templates: HTTP '.$response->status());
        }

        return collect($response->json('data') ?? [])->map(fn ($row) => array_merge($row, [
            'source' => 'live',
        ]))->all();
    }

    /**
     * Submit a template for Meta review (or local sim catalog).
     *
     * @param  array<string, mixed>  $payload
     * @return array{ok:bool,mode:string,external_template_id:?string,raw:array<string,mixed>,error_code?:string,error_message?:string}
     */
    public function submitWhatsAppMessageTemplate(array $payload): array
    {
        if ($this->usesWhatsAppTemplateLocalFallback()) {
            return [
                'ok' => true,
                'mode' => 'local_sim',
                'external_template_id' => 'sim-wa-tpl-'.Str::ulid(),
                'raw' => array_merge($payload, [
                    'status' => 'APPROVED',
                    'simulated' => true,
                    'note' => 'Local sim catalog — not submitted to Meta Cloud API.',
                ]),
            ];
        }

        $waba = (string) config('integrations.meta.whatsapp_business_account_id');
        $token = (string) (config('integrations.meta.whatsapp_access_token') ?: config('integrations.meta.page_access_token'));
        $response = Http::timeout((int) config('integrations.meta.timeout', 15))
            ->withToken($token)
            ->post($this->graphUrl('/'.$waba.'/message_templates'), $payload);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'mode' => 'live',
                'external_template_id' => null,
                'error_code' => 'template_submit_failed',
                'error_message' => 'HTTP '.$response->status(),
                'raw' => $response->json() ?? [],
            ];
        }

        return [
            'ok' => true,
            'mode' => 'live',
            'external_template_id' => (string) ($response->json('id') ?? Str::ulid()),
            'raw' => $response->json() ?? [],
        ];
    }

    /**
     * Seeded jewellery WhatsApp template catalog for local_sim.
     *
     * @return list<array<string, mixed>>
     */
    public function localJewelleryWhatsAppTemplates(): array
    {
        return [
            [
                'id' => 'sim-wa-jewellery-follow-up',
                'name' => 'jewellery_follow_up',
                'status' => 'APPROVED',
                'category' => 'MARKETING',
                'language' => 'en',
                'body' => 'Hi {{1}}, following up on your Triada Designs jewellery inquiry. Reply YES to continue, or visit triada-designs.com.',
                'variables' => ['name'],
                'components' => [
                    ['type' => 'BODY', 'text' => 'Hi {{1}}, following up on your Triada Designs jewellery inquiry. Reply YES to continue, or visit triada-designs.com.'],
                ],
                'source' => 'seeded',
                'metadata' => ['vertical' => 'jewellery'],
            ],
            [
                'id' => 'sim-wa-order-update',
                'name' => 'jewellery_order_update',
                'status' => 'APPROVED',
                'category' => 'UTILITY',
                'language' => 'en',
                'body' => 'Your Triada Designs order {{1}} update: {{2}}. Reply STOP to opt out of marketing messages.',
                'variables' => ['order_number', 'status'],
                'components' => [
                    ['type' => 'BODY', 'text' => 'Your Triada Designs order {{1}} update: {{2}}. Reply STOP to opt out of marketing messages.'],
                ],
                'source' => 'seeded',
                'metadata' => ['vertical' => 'jewellery'],
            ],
            [
                'id' => 'sim-wa-consultation',
                'name' => 'jewellery_consultation_invite',
                'status' => 'PENDING',
                'category' => 'MARKETING',
                'language' => 'en',
                'body' => 'Triada Designs can arrange a personal jewellery consultation. Reply BOOK to request a time — a specialist will confirm.',
                'components' => [
                    ['type' => 'BODY', 'text' => 'Triada Designs can arrange a personal jewellery consultation. Reply BOOK to request a time — a specialist will confirm.'],
                ],
                'source' => 'seeded',
                'metadata' => ['vertical' => 'jewellery'],
            ],
            [
                'id' => 'sim-wa-new-piece',
                'name' => 'new_piece_preview',
                'status' => 'APPROVED',
                'category' => 'MARKETING',
                'language' => 'en',
                'body' => '{{1}}, a new Triada Designs piece is ready to view. Open the link we share in-session, or reply INTERESTED.',
                'variables' => ['name'],
                'components' => [
                    ['type' => 'BODY', 'text' => '{{1}}, a new Triada Designs piece is ready to view. Open the link we share in-session, or reply INTERESTED.'],
                ],
                'source' => 'seeded',
                'metadata' => ['vertical' => 'jewellery'],
            ],
        ];
    }

    protected function graphUrl(string $path): string
    {
        $version = (string) config('integrations.meta.graph_version', 'v21.0');
        $base = rtrim((string) config('integrations.meta.graph_base', 'https://graph.facebook.com'), '/');

        return $base.'/'.$version.'/'.ltrim($path, '/');
    }
}

