<?php

namespace App\Services\Commerce\Shopify;

use App\Models\AuditLog;
use App\Models\Integration;
use App\Models\IntegrationSecret;
use App\Models\Product;
use App\Models\ShopifySyncRun;
use App\Models\Workspace;
use Illuminate\Support\Str;

class ShopifySyncService
{
    public function __construct(protected ShopifyClient $client)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function status(Workspace $workspace): array
    {
        $integration = $this->findIntegration($workspace);
        $health = $this->client->healthCheck();
        $hasToken = $this->hasSecret($integration, 'access_token')
            || filled(config('integrations.shopify.access_token'));

        $publicStatus = match (true) {
            ($health['status'] ?? '') === 'healthy' && $hasToken => 'healthy',
            $hasToken && ($health['mode'] ?? '') === 'local' => 'awaiting_credentials',
            ($integration?->status === 'connected') && ! $hasToken => 'awaiting_credentials',
            default => $integration?->status ?: 'disconnected',
        };

        // Never report healthy without live mode + token proof from health check.
        if (($health['mode'] ?? 'local') !== 'live' || ($health['status'] ?? '') !== 'healthy') {
            if ($publicStatus === 'healthy') {
                $publicStatus = 'awaiting_credentials';
            }
        }

        $runs = ShopifySyncRun::query()
            ->where('workspace_id', $workspace->id)
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return [
            'provider' => 'shopify',
            'status' => $publicStatus,
            'mode' => $health['mode'] ?? 'local',
            'health' => $health,
            'integration_id' => $integration?->id,
            'shop_domain' => $integration?->external_account_id
                ?: config('integrations.shopify.shop_domain'),
            'has_access_token' => $hasToken,
            'oauth' => [
                'client_configured' => filled(config('integrations.shopify.client_id')),
                'redirect_uri' => config('integrations.shopify.redirect_uri'),
                'authorize_url_scaffold' => filled(config('integrations.shopify.client_id'))
                    ? $this->client->oauthAuthorizeUrl(
                        (string) ($integration?->external_account_id ?: 'your-shop.myshopify.com'),
                        'triada-local-state'
                    )
                    : null,
            ],
            'honesty' => 'Shopify stays disconnected/awaiting_credentials until OAuth tokens and INTEGRATION_MODE=live.',
            'recent_sync_runs' => $runs,
            'product_count' => Product::query()->where('workspace_id', $workspace->id)->count(),
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function connect(Workspace $workspace, array $input): array
    {
        $shop = (string) ($input['shop_domain'] ?? $input['external_account_id'] ?? 'awaiting.myshopify.com');
        $hasToken = filled($input['access_token'] ?? null);

        $integration = $this->findIntegration($workspace);
        if (! $integration) {
            $integration = new Integration([
                'workspace_id' => $workspace->id,
                'provider' => 'shopify',
            ]);
        }

        $integration->forceFill([
            'external_account_id' => $shop,
            'display_name' => (string) ($input['display_name'] ?? 'Shopify'),
            'status' => $hasToken ? 'connected' : 'awaiting_credentials',
            'granted_scopes' => $input['scopes'] ?? ['read_products', 'read_orders', 'read_inventory'],
            'capabilities' => ['products.read', 'orders.read', 'webhooks'],
            'last_health_check_at' => now(),
            'last_error_code' => null,
            'metadata' => array_merge($integration->metadata ?? [], [
                'connected_via' => 'triada_dashboard',
                'oauth_state' => $input['oauth_state'] ?? null,
            ]),
        ])->save();

        if ($hasToken) {
            $this->storeSecret($integration, 'access_token', (string) $input['access_token']);
        }

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => (string) ($input['actor_id'] ?? 'system'),
            'action' => 'shopify.connect',
            'target_type' => 'integration',
            'target_id' => $integration->id,
            'created_at' => now(),
            'metadata' => ['has_token' => $hasToken, 'shop' => $shop],
        ]);

        return $this->status($workspace);
    }

    public function disconnect(Workspace $workspace): array
    {
        $integration = $this->findIntegration($workspace);
        if ($integration) {
            $integration->secrets()->delete();
            $integration->forceFill([
                'status' => 'disconnected',
                'metadata' => array_merge($integration->metadata ?? [], [
                    'disconnected_at' => now()->toIso8601String(),
                ]),
            ])->save();
        }

        return $this->status($workspace);
    }

    /**
     * @return array<string, mixed>
     */
    public function syncNow(Workspace $workspace, string $syncType = 'products'): array
    {
        $integration = $this->findIntegration($workspace);
        $run = ShopifySyncRun::query()->create([
            'workspace_id' => $workspace->id,
            'integration_id' => $integration?->id,
            'sync_type' => $syncType,
            'mode' => $this->client->usesLocalFallback() ? 'local' : 'live',
            'status' => 'running',
            'started_at' => now(),
        ]);

        try {
            $upserted = 0;
            $failed = 0;
            $summary = [];

            if ($syncType === 'orders') {
                $orders = $this->client->listOrders();
                $summary['orders_seen'] = count($orders);
                $summary['orders'] = collect($orders)->take(5)->values()->all();
                $upserted = count($orders);
            } else {
                $products = $this->client->listProducts();
                foreach ($products as $remote) {
                    try {
                        $variant = $remote['variants'][0] ?? [];
                        $availability = match (true) {
                            (($variant['inventory_quantity'] ?? 1) <= 0) => 'out_of_stock',
                            default => 'in_stock',
                        };

                        Product::query()->updateOrCreate(
                            [
                                'workspace_id' => $workspace->id,
                                'external_product_id' => (string) ($remote['id'] ?? Str::ulid()),
                            ],
                            [
                                'integration_id' => $integration?->id,
                                'sku' => $variant['sku'] ?? null,
                                'title' => (string) ($remote['title'] ?? 'Untitled'),
                                'description' => strip_tags((string) ($remote['body_html'] ?? '')),
                                'price' => isset($variant['price']) ? (float) $variant['price'] : null,
                                'currency' => 'USD',
                                'availability_status' => $availability,
                                'published_status' => ($remote['status'] ?? 'active') === 'active' ? 'published' : 'draft',
                                'metadata' => [
                                    'source' => $run->mode,
                                    'shopify_status' => $remote['status'] ?? null,
                                ],
                                'synced_at' => now(),
                            ]
                        );
                        $upserted++;
                    } catch (\Throwable $e) {
                        $failed++;
                    }
                }
                $summary['products_seen'] = count($products);
            }

            $run->forceFill([
                'status' => 'completed',
                'records_upserted' => $upserted,
                'records_failed' => $failed,
                'summary' => $summary,
                'finished_at' => now(),
            ])->save();

            if ($integration) {
                $integration->forceFill([
                    'last_health_check_at' => now(),
                    'metadata' => array_merge($integration->metadata ?? [], [
                        'last_sync_at' => now()->toIso8601String(),
                        'last_sync_type' => $syncType,
                        'last_sync_mode' => $run->mode,
                    ]),
                ])->save();
            }

            return [
                'ok' => true,
                'run' => $run->fresh(),
                'status' => $this->status($workspace),
            ];
        } catch (\Throwable $e) {
            $run->forceFill([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'finished_at' => now(),
            ])->save();

            return [
                'ok' => false,
                'error' => $e->getMessage(),
                'run' => $run->fresh(),
                'status' => $this->status($workspace),
            ];
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function ingestWebhook(Workspace $workspace, array $payload, string $topic = 'products/update'): array
    {
        if (str_starts_with($topic, 'products')) {
            return $this->syncNow($workspace, 'products');
        }

        if (str_starts_with($topic, 'orders')) {
            return $this->syncNow($workspace, 'orders');
        }

        return ['ok' => true, 'ignored' => true, 'topic' => $topic];
    }

    protected function findIntegration(Workspace $workspace): ?Integration
    {
        return Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', 'shopify')
            ->first();
    }

    protected function hasSecret(?Integration $integration, string $type): bool
    {
        if (! $integration) {
            return false;
        }

        return $integration->secrets()->where('secret_type', $type)->exists();
    }

    protected function storeSecret(Integration $integration, string $type, string $value): void
    {
        $secret = IntegrationSecret::query()->firstOrNew([
            'integration_id' => $integration->id,
            'secret_type' => $type,
        ]);
        $secret->key_version = 'v1';
        $secret->setPlainValue($value);
        $secret->save();
    }
}
