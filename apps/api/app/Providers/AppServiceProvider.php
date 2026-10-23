<?php

namespace App\Providers;

use App\Services\AI\Contracts\LlmAdapterInterface;
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

        $this->app->bind(LlmAdapterInterface::class, function ($app) {
            $key = (string) config('integrations.llm.api_key');
            $mode = strtolower((string) config('integrations.mode', 'local'));

            if ($key !== '' && $mode === 'live') {
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
}
