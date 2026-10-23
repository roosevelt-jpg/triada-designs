<?php

namespace App\Services\WordPress;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * WordPress REST API client (wp-json/wp/v2).
 *
 * Local mode returns seeded fixture content so the platform runs without
 * WordPress credentials. Live mode uses Application Passwords.
 */
class WordPressClient
{
    public function mode(): string
    {
        $mode = (string) config('integrations.mode', 'local');

        return $mode === 'mock' ? 'local' : $mode;
    }

    public function isConfigured(): bool
    {
        $cfg = config('integrations.wordpress');

        return filled($cfg['base_url'])
            && filled($cfg['username'])
            && filled($cfg['application_password']);
    }

    /**
     * True when adapters should use seeded local fixtures instead of live HTTP.
     */
    public function usesLocalFallback(): bool
    {
        return $this->mode() !== 'live' || ! $this->isConfigured();
    }

    /**
     * @return array{status:string,mode:string,configured:bool,message:string,sample_posts?:int}
     */
    public function healthCheck(): array
    {
        if ($this->usesLocalFallback()) {
            $awaiting = ! $this->isConfigured();

            return [
                'status' => 'seeded',
                'mode' => 'local',
                'configured' => $this->isConfigured(),
                'message' => $awaiting
                    ? 'WordPress awaiting credentials. Using local seeded posts until WORDPRESS_* is set and INTEGRATION_MODE=live.'
                    : 'WordPress running in local seed mode. Set INTEGRATION_MODE=live to call the REST API.',
                'sample_posts' => count($this->listPosts(5)),
            ];
        }

        try {
            $response = $this->request()->get('/wp-json/wp/v2/posts', [
                'per_page' => 1,
                'status' => 'publish',
            ]);

            if (! $response->successful()) {
                return [
                    'status' => 'error',
                    'mode' => 'live',
                    'configured' => true,
                    'message' => 'WordPress health check failed: HTTP '.$response->status(),
                ];
            }

            return [
                'status' => 'healthy',
                'mode' => 'live',
                'configured' => true,
                'message' => 'WordPress REST API reachable.',
            ];
        } catch (\Throwable $e) {
            Log::warning('wordpress.health_failed', ['error' => $e->getMessage()]);

            return [
                'status' => 'error',
                'mode' => 'live',
                'configured' => true,
                'message' => 'WordPress health check exception: '.$e->getMessage(),
            ];
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listPosts(int $perPage = 10): array
    {
        if ($this->usesLocalFallback()) {
            return $this->seededPosts($perPage);
        }

        $response = $this->request()->get('/wp-json/wp/v2/posts', [
            'per_page' => $perPage,
            'status' => 'publish',
            '_embed' => 1,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('WordPress listPosts failed: HTTP '.$response->status());
        }

        return collect($response->json())
            ->map(fn (array $post) => $this->normalizePost($post))
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function createDraft(array $payload): array
    {
        if ($this->usesLocalFallback()) {
            return [
                'id' => 'seed-'.uniqid(),
                'title' => (string) ($payload['title'] ?? 'Untitled draft'),
                'status' => 'draft',
                'link' => null,
                'excerpt' => (string) ($payload['excerpt'] ?? ''),
                'source' => 'seeded',
            ];
        }

        $response = $this->request()->post('/wp-json/wp/v2/posts', [
            'title' => $payload['title'] ?? 'Untitled',
            'content' => $payload['content'] ?? '',
            'excerpt' => $payload['excerpt'] ?? '',
            'status' => 'draft',
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('WordPress createDraft failed: HTTP '.$response->status());
        }

        return $this->normalizePost($response->json());
    }

    /**
     * Verify webhook authenticity when a shared secret is configured.
     */
    public function verifyWebhook(?string $providedSecret): bool
    {
        $expected = (string) config('integrations.wordpress.webhook_secret');

        if ($expected === '') {
            return $this->usesLocalFallback();
        }

        return hash_equals($expected, (string) $providedSecret);
    }

    protected function request()
    {
        $cfg = config('integrations.wordpress');

        return Http::baseUrl($cfg['base_url'])
            ->timeout($cfg['timeout'])
            ->withBasicAuth($cfg['username'], $cfg['application_password'])
            ->acceptJson();
    }

    /**
     * @param  array<string, mixed>  $post
     * @return array<string, mixed>
     */
    protected function normalizePost(array $post): array
    {
        return [
            'id' => (string) ($post['id'] ?? ''),
            'title' => is_array($post['title'] ?? null)
                ? strip_tags((string) ($post['title']['rendered'] ?? ''))
                : (string) ($post['title'] ?? ''),
            'status' => (string) ($post['status'] ?? 'publish'),
            'link' => $post['link'] ?? null,
            'excerpt' => is_array($post['excerpt'] ?? null)
                ? trim(strip_tags((string) ($post['excerpt']['rendered'] ?? '')))
                : (string) ($post['excerpt'] ?? ''),
            'modified' => $post['modified'] ?? null,
            'source' => $this->usesLocalFallback() ? 'seeded' : 'wordpress',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    protected function seededPosts(int $perPage): array
    {
        $posts = [
            [
                'id' => 'seed-1',
                'title' => 'Quiet rituals for everyday care',
                'status' => 'publish',
                'link' => 'https://triada-designs.com/journal/quiet-rituals',
                'excerpt' => 'How Triada Designs thinks about materials, pacing, and personal care.',
                'modified' => now()->subDays(3)->toIso8601String(),
                'source' => 'seeded',
            ],
            [
                'id' => 'seed-2',
                'title' => 'Service inquiry FAQ',
                'status' => 'publish',
                'link' => 'https://triada-designs.com/faq',
                'excerpt' => 'Approved answers for delivery, returns, and appointment requests.',
                'modified' => now()->subDays(8)->toIso8601String(),
                'source' => 'seeded',
            ],
            [
                'id' => 'seed-3',
                'title' => 'Collection notes: warm neutrals',
                'status' => 'publish',
                'link' => 'https://triada-designs.com/journal/warm-neutrals',
                'excerpt' => 'Editorial notes used as approved brand knowledge for AI retrieval.',
                'modified' => now()->subDays(14)->toIso8601String(),
                'source' => 'seeded',
            ],
        ];

        return array_slice($posts, 0, max(1, $perPage));
    }
}
