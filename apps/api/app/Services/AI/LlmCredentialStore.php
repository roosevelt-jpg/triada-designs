<?php

namespace App\Services\AI;

use App\Models\Integration;
use App\Models\IntegrationSecret;
use App\Models\Workspace;

/**
 * Resolves Anthropic (primary) and related LLM credentials.
 * Prefer workspace Integration secrets (Integrations page), then env.
 */
class LlmCredentialStore
{
    public function anthropicApiKey(?Workspace $workspace = null): string
    {
        $env = (string) config('integrations.llm.anthropic.api_key', '');
        if ($env !== '') {
            return $env;
        }

        // Accept LLM_API_KEY when provider is anthropic.
        $provider = $this->normalizeProvider((string) config('integrations.llm.provider', 'anthropic'));
        if ($provider === 'anthropic') {
            $generic = (string) config('integrations.llm.api_key', '');
            if ($generic !== '') {
                return $generic;
            }
        }

        $fromDb = $this->secretValue($workspace, 'anthropic', 'api_key');
        if ($fromDb !== '') {
            return $fromDb;
        }

        // Runtime bind (agents / creative) may not have a request workspace — use any stored Anthropic secret.
        if (! $workspace) {
            $any = Integration::query()->where('provider', 'anthropic')->orderBy('updated_at', 'desc')->first();
            if ($any) {
                $fromAny = $this->secretValueForIntegration($any, 'api_key');
                if ($fromAny !== '') {
                    return $fromAny;
                }
            }
        }

        return '';
    }

    public function anthropicModel(): string
    {
        return (string) (config('integrations.llm.anthropic.model')
            ?: config('integrations.llm.model')
            ?: 'claude-sonnet-4-20250514');
    }

    public function anthropicBaseUrl(): string
    {
        return (string) config('integrations.llm.anthropic.base_url', 'https://api.anthropic.com');
    }

    /**
     * Persist Anthropic credentials from the Integrations UI.
     *
     * @param  array{api_key?:string,model?:string}  $input
     * @return array<string, mixed>
     */
    public function saveAnthropic(Workspace $workspace, array $input): array
    {
        $integration = Integration::query()->firstOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => 'anthropic',
                'external_account_id' => null,
            ],
            [
                'display_name' => 'Anthropic (Claude)',
                'status' => 'awaiting_credentials',
                'capabilities' => ['llm.chat', 'agents', 'creative_prompts'],
                'metadata' => [],
            ]
        );

        $apiKey = trim((string) ($input['api_key'] ?? ''));
        if ($apiKey !== '') {
            $this->storeSecret($integration, 'api_key', $apiKey);
        }

        $model = trim((string) ($input['model'] ?? ''));
        $meta = $integration->metadata ?? [];
        if ($model !== '') {
            $meta['model'] = $model;
            // Runtime prefers config; mirror into config for this request.
            config(['integrations.llm.anthropic.model' => $model]);
        }

        $hasKey = $this->anthropicApiKey($workspace) !== '' || $apiKey !== '';
        $integration->forceFill([
            'display_name' => 'Anthropic (Claude)',
            'status' => $hasKey ? 'connected' : 'awaiting_credentials',
            'capabilities' => ['llm.chat', 'agents', 'creative_prompts'],
            'last_health_check_at' => now(),
            'metadata' => array_merge($meta, [
                'provider' => 'anthropic',
                'model' => $model !== '' ? $model : $this->anthropicModel(),
                'source' => $apiKey !== '' ? 'integrations_ui' : ($meta['source'] ?? 'env_or_prior'),
                'has_api_key' => $hasKey,
                'mode_hint' => $hasKey
                    ? 'Credentials stored. Live calls require INTEGRATION_MODE=live for outbound adapters; agents use the key when present.'
                    : 'Paste ANTHROPIC_API_KEY here or set env. local_sim / local heuristic until keyed.',
            ]),
        ])->save();

        if ($hasKey) {
            config(['integrations.llm.provider' => 'anthropic']);
            if ($apiKey !== '') {
                config(['integrations.llm.anthropic.api_key' => $apiKey]);
            }
        }

        return $this->status($workspace);
    }

    /**
     * @return array<string, mixed>
     */
    public function status(?Workspace $workspace = null): array
    {
        $configured = $this->normalizeProvider((string) config('integrations.llm.provider', 'anthropic'));
        $key = $this->anthropicApiKey($workspace);
        $hasKey = $key !== '';
        $integration = null;
        if ($workspace) {
            $integration = Integration::query()
                ->where('workspace_id', $workspace->id)
                ->where('provider', 'anthropic')
                ->first();
        }

        $status = match (true) {
            $hasKey && $configured === 'anthropic' => 'connected',
            $configured === 'anthropic' && ! $hasKey => 'awaiting_credentials',
            default => $configured === 'local' ? 'local' : 'awaiting_credentials',
        };

        return [
            'provider' => 'anthropic',
            'configured_provider' => $configured,
            'display_name' => 'Anthropic (Claude)',
            'status' => $status,
            'has_credentials' => $hasKey,
            'model' => ($integration?->metadata['model'] ?? null) ?: $this->anthropicModel(),
            'mode' => (string) config('integrations.mode', 'local'),
            'honesty' => $hasKey
                ? 'Anthropic API key is configured (Integrations page or env). Agents use Claude when provider=anthropic.'
                : 'No Anthropic key yet — agents stay on local_sim / local heuristic. Paste key on Integrations; never reports live Claude without credentials.',
            'integration_id' => $integration?->id,
            'ui_hint' => 'Paste your Anthropic API key on Integrations. Optional model override (default claude-sonnet-4-20250514).',
        ];
    }

    public function clearAnthropic(Workspace $workspace): array
    {
        $integration = Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', 'anthropic')
            ->first();

        if ($integration) {
            IntegrationSecret::query()
                ->where('integration_id', $integration->id)
                ->where('secret_type', 'api_key')
                ->delete();

            $integration->forceFill([
                'status' => 'awaiting_credentials',
                'metadata' => array_merge($integration->metadata ?? [], [
                    'has_api_key' => false,
                    'cleared_at' => now()->toIso8601String(),
                ]),
            ])->save();
        }

        // Clear request-scoped config mirrors from Integrations UI saves.
        // Do not wipe a real env ANTHROPIC_API_KEY — only empty the runtime override
        // when it came from the UI (env remains authoritative on next boot).
        config([
            'integrations.llm.anthropic.api_key' => env('ANTHROPIC_API_KEY') ?: null,
            'integrations.llm.api_key' => env('LLM_API_KEY') ?: null,
        ]);

        return $this->status($workspace);
    }

    protected function secretValue(?Workspace $workspace, string $provider, string $type): string
    {
        if (! $workspace) {
            return '';
        }

        $integration = Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', $provider)
            ->first();

        if (! $integration) {
            return '';
        }

        return $this->secretValueForIntegration($integration, $type);
    }

    protected function secretValueForIntegration(Integration $integration, string $type): string
    {
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

    protected function normalizeProvider(string $provider): string
    {
        $normalized = strtolower(str_replace('-', '_', trim($provider)));

        return match ($normalized) {
            'claude', 'anthropic_claude' => 'anthropic',
            'openai', 'openai_compatible', 'http', 'http_llm' => 'openai_compatible',
            'gemini', 'google', 'google_gemini' => 'gemini',
            'local', 'heuristic', 'local_heuristic' => 'local',
            default => $normalized !== '' ? $normalized : 'anthropic',
        };
    }
}
