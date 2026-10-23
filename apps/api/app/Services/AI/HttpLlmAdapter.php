<?php

namespace App\Services\AI;

use App\Services\AI\Contracts\LlmAdapterInterface;
use Illuminate\Support\Facades\Http;

/**
 * Provider-independent HTTP LLM adapter.
 * Activates only when LLM_API_KEY is set and INTEGRATION_MODE=live.
 */
class HttpLlmAdapter implements LlmAdapterInterface
{
    public function __construct(protected LocalHeuristicLlmAdapter $fallback)
    {
    }

    public function providerKey(): string
    {
        return (string) (config('integrations.llm.provider') ?: 'http_llm');
    }

    public function model(): string
    {
        return (string) (config('integrations.llm.model') ?: 'gpt-4o-mini');
    }

    public function isLive(): bool
    {
        $mode = strtolower((string) config('integrations.mode', 'local'));
        if (in_array($mode, ['local', 'mock'], true)) {
            return false;
        }

        return filled(config('integrations.llm.api_key'));
    }

    public function complete(array $request): array
    {
        if (! $this->isLive()) {
            $local = $this->fallback->complete($request);
            $local['raw'] = array_merge($local['raw'] ?? [], [
                'note' => 'Fell back to local heuristic — LLM_API_KEY or live mode missing.',
            ]);

            return $local;
        }

        $base = rtrim((string) config('integrations.llm.base_url', 'https://api.openai.com/v1'), '/');
        $key = (string) config('integrations.llm.api_key');

        try {
            $response = Http::timeout((int) config('integrations.llm.timeout', 30))
                ->withToken($key)
                ->post($base.'/chat/completions', [
                    'model' => $this->model(),
                    'temperature' => $request['temperature'] ?? 0.3,
                    'max_tokens' => $request['max_tokens'] ?? 600,
                    'messages' => array_values(array_filter([
                        ! empty($request['system']) ? ['role' => 'system', 'content' => $request['system']] : null,
                        ['role' => 'user', 'content' => (string) ($request['prompt'] ?? '')],
                    ])),
                ]);

            if (! $response->successful()) {
                return [
                    'ok' => false,
                    'provider' => $this->providerKey(),
                    'model' => $this->model(),
                    'prompt_tokens' => 0,
                    'completion_tokens' => 0,
                    'error' => 'LLM HTTP '.$response->status().': '.$response->body(),
                    'raw' => $response->json() ?? [],
                ];
            }

            $json = $response->json();
            $text = (string) data_get($json, 'choices.0.message.content', '');

            return [
                'ok' => true,
                'text' => $text,
                'provider' => $this->providerKey(),
                'model' => $this->model(),
                'prompt_tokens' => (int) data_get($json, 'usage.prompt_tokens', 0),
                'completion_tokens' => (int) data_get($json, 'usage.completion_tokens', 0),
                'raw' => $json,
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'provider' => $this->providerKey(),
                'model' => $this->model(),
                'prompt_tokens' => 0,
                'completion_tokens' => 0,
                'error' => $e->getMessage(),
            ];
        }
    }
}
