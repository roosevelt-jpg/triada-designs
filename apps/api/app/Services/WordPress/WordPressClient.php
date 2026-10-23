<?php

namespace App\Services\WordPress;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * WordPress REST API client (wp-json/wp/v2).
 *
 * Local/mock mode returns fixture content so the platform runs without
 * WordPress credentials. Live mode uses Application Passwords.
 */
class WordPressClient
{
    public function mode(): string
    {
        return (string) config('integrations.mode', 'mock');
    }

    public function isConfigured(): bool
    {
        $cfg = config('integrations.wordpress');

        return filled($cfg['base_url'])
            && filled($cfg['username'])
            && filled($cfg['application_password']);
    }

    /**
     * @return array{status:string,mode:string,configured:bool,message:string,sample_posts?:int}
     */
    public function healthCheck(): array
    {
        if ($this->mode() === 'mock' || ! $this->isConfigured()) {
            return [
                'status' => 'mock',
                'mode' => $this->mode(),
                'configured' => $this->isConfigured(),
                'message' => 'WordPress running in mock/local fallback. Set WORDPRESS_* env vars and INTEGRATION_MODE=live to connect.',
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
        if ($this->mode() === 'mock' || ! $this->isConfigured()) {
            return $this->mockPosts($perPage);
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
        if ($this->mode() === 'mock' || ! $this->isConfigured()) {
            return [
                'id' => 'mock-'.uniqid(),
                'title' => (string) ($payload['title'] ?? 'Untitled draft'),
                'status' => 'draft',
                'link' => null,
                'excerpt' => (string) ($payload['excerpt'] ?? ''),
                'source' => 'mock',
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
            return $this->mode() === 'mock';
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
            'source' => $this->mode() === 'mock' ? 'mock' : 'wordpress',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    protected function mockPosts(int $perPage): array
    {
        $posts = [
            [
                'id' => 'mock-1',
                'title' => 'Quiet rituals for everyday care',
                'status' => 'publish',
                'link' => 'https://triada-designs.com/journal/quiet-rituals',
                'excerpt' => 'How Triada Designs thinks about materials, pacing, and personal care.',
                'modified' => now()->subDays(3)->toIso8601String(),
                'source' => 'mock',
            ],
            [
                'id' => 'mock-2',
                'title' => 'Service inquiry FAQ',
                'status' => 'publish',
                'link' => 'https://triada-designs.com/faq',
                'excerpt' => 'Approved answers for delivery, returns, and appointment requests.',
                'modified' => now()->subDays(8)->toIso8601String(),
                'source' => 'mock',
            ],
            [
                'id' => 'mock-3',
                'title' => 'Collection notes: warm neutrals',
                'status' => 'publish',
                'link' => 'https://triada-designs.com/journal/warm-neutrals',
                'excerpt' => 'Editorial notes used as approved brand knowledge for AI retrieval.',
                'modified' => now()->subDays(14)->toIso8601String(),
                'source' => 'mock',
            ],
        ];

        return array_slice($posts, 0, max(1, $perPage));
    }
}
