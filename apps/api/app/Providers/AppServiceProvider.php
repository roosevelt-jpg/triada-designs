<?php

namespace App\Providers;

use App\Services\AI\Contracts\LlmAdapterInterface;
use App\Services\AI\GeminiHttpAdapter;
use App\Services\AI\HttpLlmAdapter;
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

        $this->app->bind(LlmAdapterInterface::class, function ($app) {
            $provider = $this->normalizeProvider((string) config('integrations.llm.provider', 'gemini'));
            $mode = strtolower((string) config('integrations.mode', 'local'));
            $openaiKey = (string) config('integrations.llm.api_key', '');
            $geminiKey = (string) config('integrations.llm.gemini.api_key', '');

            if ($provider === 'local') {
                return $app->make(LocalHeuristicLlmAdapter::class);
            }

            if ($provider === 'gemini') {
                // Bind Gemini adapter when selected; it falls back locally without a key.
                // Live calls require GEMINI_API_KEY (LLM_API_KEY accepted as alias).
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
            'openai', 'openai_compatible', 'http', 'http_llm' => 'openai_compatible',
            'gemini', 'google', 'google_gemini' => 'gemini',
            'local', 'heuristic', 'local_heuristic' => 'local',
            default => $normalized !== '' ? $normalized : 'gemini',
        };
    }
}
