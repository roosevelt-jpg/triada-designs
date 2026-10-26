<?php

namespace App\Services\AI;

use App\Services\AI\Contracts\LlmAdapterInterface;
use App\Services\AI\LlmCredentialStore;
use Illuminate\Support\Facades\Http;

/**
 * Anthropic Messages API adapter (primary Triada LLM).
 *
 * Activates when ANTHROPIC_API_KEY / Integration secret is present.
 * Without a key, falls back to LocalHeuristicLlmAdapter (awaiting_credentials).
 * Never reports live Anthropic success without a real key and successful HTTP response.
 */
class AnthropicHttpAdapter implements LlmAdapterInterface
{
    public function __construct(
        protected LocalHeuristicLlmAdapter $fallback,
        protected LlmCredentialStore $credentials,
    ) {
    }

    public function providerKey(): string
    {
        return 'anthropic';
    }

    public function model(): string
    {
        return $this->credentials->anthropicModel();
    }

    public function isLive(): bool
    {
        return $this->hasApiKey();
    }

    public function complete(array $request): array
    {
        if (! $this->hasApiKey()) {
            $local = $this->fallback->complete($request);
            $local['raw'] = array_merge($local['raw'] ?? [], [
                'note' => 'Fell back to local heuristic — Anthropic API key missing (awaiting_credentials). Paste key on Integrations or set ANTHROPIC_API_KEY.',
                'status' => 'awaiting_credentials',
            ]);

            return $local;
        }

        $model = $this->model();
        $base = rtrim($this->credentials->anthropicBaseUrl(), '/');
        $key = $this->credentials->anthropicApiKey();
        $url = $base.'/v1/messages';

        $messages = [
            [
                'role' => 'user',
                'content' => (string) ($request['prompt'] ?? ''),
            ],
        ];

        $payload = [
            'model' => $model,
            'max_tokens' => (int) ($request['max_tokens'] ?? 1024),
            'temperature' => (float) ($request['temperature'] ?? 0.3),
            'messages' => $messages,
        ];

        if (! empty($request['system'])) {
            $payload['system'] = (string) $request['system'];
        }

        try {
            $response = Http::timeout((int) config('integrations.llm.timeout', 45))
                ->withHeaders([
                    'x-api-key' => $key,
                    'anthropic-version' => (string) config('integrations.llm.anthropic.version', '2023-06-01'),
                    'Content-Type' => 'application/json',
                ])
                ->post($url, $payload);

            if (! $response->successful()) {
                return [
                    'ok' => false,
                    'provider' => $this->providerKey(),
                    'model' => $model,
                    'prompt_tokens' => 0,
                    'completion_tokens' => 0,
                    'error' => 'Anthropic HTTP '.$response->status().': '.$response->body(),
                    'raw' => $response->json() ?? [],
                ];
            }

            $json = $response->json() ?? [];
            $text = $this->extractText($json);

            return [
                'ok' => true,
                'text' => $text,
                'provider' => $this->providerKey(),
                'model' => $model,
                'prompt_tokens' => (int) data_get($json, 'usage.input_tokens', 0),
                'completion_tokens' => (int) data_get($json, 'usage.output_tokens', 0),
                'raw' => $json,
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'provider' => $this->providerKey(),
                'model' => $model,
                'prompt_tokens' => 0,
                'completion_tokens' => 0,
                'error' => $e->getMessage(),
            ];
        }
    }

    protected function hasApiKey(): bool
    {
        return filled($this->credentials->anthropicApiKey());
    }

    /**
     * @param  array<string, mixed>  $json
     */
    protected function extractText(array $json): string
    {
        $blocks = data_get($json, 'content', []);
        if (! is_array($blocks)) {
            return '';
        }

        $chunks = [];
        foreach ($blocks as $block) {
            if (is_array($block) && ($block['type'] ?? '') === 'text' && isset($block['text'])) {
                $chunks[] = (string) $block['text'];
            }
        }

        return trim(implode('', $chunks));
    }
}
