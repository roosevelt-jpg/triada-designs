<?php

namespace App\Services\AI;

use App\Services\AI\Contracts\LlmAdapterInterface;
use Illuminate\Support\Facades\Http;

/**
 * Google Gemini generateContent adapter.
 *
 * Activates only when GEMINI_API_KEY (or LLM_API_KEY with LLM_PROVIDER=gemini) is set.
 * Never reports live success without a real key and a successful HTTP response.
 */
class GeminiHttpAdapter implements LlmAdapterInterface
{
    public function __construct(protected LocalHeuristicLlmAdapter $fallback)
    {
    }

    public function providerKey(): string
    {
        return 'gemini';
    }

    public function model(): string
    {
        return (string) (config('integrations.llm.gemini.model')
            ?: config('integrations.llm.model')
            ?: 'gemini-2.0-flash');
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
                'note' => 'Fell back to local heuristic — GEMINI_API_KEY missing (awaiting_credentials).',
                'status' => 'awaiting_credentials',
            ]);

            return $local;
        }

        $model = $this->model();
        $base = rtrim((string) config(
            'integrations.llm.gemini.base_url',
            'https://generativelanguage.googleapis.com/v1beta'
        ), '/');
        $key = $this->apiKey();
        $url = $base.'/models/'.$model.':generateContent';

        $contents = [
            [
                'role' => 'user',
                'parts' => [
                    ['text' => (string) ($request['prompt'] ?? '')],
                ],
            ],
        ];

        $payload = [
            'contents' => $contents,
            'generationConfig' => [
                'temperature' => (float) ($request['temperature'] ?? 0.3),
                'maxOutputTokens' => (int) ($request['max_tokens'] ?? 600),
            ],
        ];

        if (! empty($request['system'])) {
            $payload['systemInstruction'] = [
                'parts' => [
                    ['text' => (string) $request['system']],
                ],
            ];
        }

        try {
            $response = Http::timeout((int) config('integrations.llm.timeout', 30))
                ->withHeaders([
                    'x-goog-api-key' => $key,
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
                    'error' => 'Gemini HTTP '.$response->status().': '.$response->body(),
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
                'prompt_tokens' => (int) data_get($json, 'usageMetadata.promptTokenCount', 0),
                'completion_tokens' => (int) data_get($json, 'usageMetadata.candidatesTokenCount', 0),
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
        return filled($this->apiKey());
    }

    protected function apiKey(): string
    {
        $gemini = (string) config('integrations.llm.gemini.api_key', '');
        if ($gemini !== '') {
            return $gemini;
        }

        // Allow LLM_API_KEY when provider is explicitly gemini.
        $provider = $this->normalizeProvider((string) config('integrations.llm.provider', ''));
        if ($provider === 'gemini') {
            return (string) config('integrations.llm.api_key', '');
        }

        return '';
    }

    protected function normalizeProvider(string $provider): string
    {
        return strtolower(str_replace('-', '_', trim($provider)));
    }

    /**
     * @param  array<string, mixed>  $json
     */
    protected function extractText(array $json): string
    {
        $parts = data_get($json, 'candidates.0.content.parts', []);
        if (! is_array($parts)) {
            return '';
        }

        $chunks = [];
        foreach ($parts as $part) {
            if (is_array($part) && isset($part['text'])) {
                $chunks[] = (string) $part['text'];
            }
        }

        return trim(implode('', $chunks));
    }
}
