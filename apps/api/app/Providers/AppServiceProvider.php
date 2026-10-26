<?php

namespace App\Providers;

use App\Services\AI\AnthropicHttpAdapter;
use App\Services\AI\Contracts\LlmAdapterInterface;
use App\Services\AI\GeminiHttpAdapter;
use App\Services\AI\HttpLlmAdapter;
use App\Services\AI\LlmCredentialStore;
use App\Services\AI\LocalHeuristicLlmAdapter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(LocalHeuristicLlmAdapter::class);
        $this->app->singleton(HttpLlmAdapter::class);
        $this->app->singleton(GeminiHttpAdapter::class);
        $this->app->singleton(AnthropicHttpAdapter::class);
        $this->app->singleton(LlmCredentialStore::class);

        $this->app->bind(LlmAdapterInterface::class, function ($app) {
            $provider = $this->normalizeProvider((string) config('integrations.llm.provider', 'anthropic'));
            $mode = strtolower((string) config('integrations.mode', 'local'));
            /** @var LlmCredentialStore $creds */
            $creds = $app->make(LlmCredentialStore::class);
            $anthropicKey = $creds->anthropicApiKey();
            $openaiKey = (string) config('integrations.llm.api_key', '');
            $geminiKey = (string) config('integrations.llm.gemini.api_key', '');

            if ($provider === 'local') {
                return $app->make(LocalHeuristicLlmAdapter::class);
            }

            if ($provider === 'anthropic') {
                // Bind Anthropic adapter when selected; falls back locally without a key.
                if ($anthropicKey !== '') {
                    return $app->make(AnthropicHttpAdapter::class);
                }

                return $app->make(LocalHeuristicLlmAdapter::class);
            }

            if ($provider === 'gemini') {
                if ($geminiKey !== '' || $openaiKey !== '') {
                    return $app->make(GeminiHttpAdapter::class);
                }

                return $app->make(LocalHeuristicLlmAdapter::class);
            }

            // openai_compatible / openai-compatible / http
            if ($openaiKey !== '' && $mode === 'live') {
                return $app->make(HttpLlmAdapter::class);
            }

            return $app->make(LocalHeuristicLlmAdapter::class);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
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
