<?php

namespace App\Services\Commerce\Shopify;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ShopifyClient
{
    public function mode(): string
    {
        $mode = strtolower((string) config('integrations.mode', 'local'));

        return in_array($mode, ['mock', 'local'], true) ? 'local' : 'live';
    }

    public function usesLocalFallback(): bool
    {
        if ($this->mode() === 'local') {
            return true;
        }

        return blank(config('integrations.shopify.shop_domain'))
            || blank(config('integrations.shopify.access_token'));
    }

    /**
     * @return array{ok:bool,status:string,mode:string,message:string,shop?:array<string,mixed>}
     */
    public function healthCheck(): array
    {
        if ($this->usesLocalFallback()) {
            return [
                'ok' => true,
                'status' => filled(config('integrations.shopify.client_id')) ? 'awaiting_credentials' : 'disconnected',
                'mode' => 'local',
                'message' => 'Shopify Admin API not live. Use Connect + Sync simulator until OAuth tokens exist.',
            ];
        }

        try {
            $response = $this->adminRequest('GET', 'shop.json');
            if (! $response->successful()) {
                return [
                    'ok' => false,
                    'status' => 'error',
                    'mode' => 'live',
                    'message' => 'Shopify health failed: HTTP '.$response->status(),
                ];
            }

            return [
                'ok' => true,
                'status' => 'healthy',
                'mode' => 'live',
                'message' => 'Shopify Admin API reachable.',
                'shop' => $response->json('shop') ?? [],
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'status' => 'error',
                'mode' => 'live',
                'message' => $e->getMessage(),
            ];
        }
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function listProducts(int $limit = 50): array
    {
        if ($this->usesLocalFallback()) {
            return $this->seedProducts();
        }

        $response = $this->adminRequest('GET', 'products.json', ['limit' => $limit]);
        if (! $response->successful()) {
            throw new \RuntimeException('Shopify products failed: HTTP '.$response->status());
        }

        return $response->json('products') ?? [];
    }

    /**
     * @return list<array<string,mixed>>
     */
    public function listOrders(int $limit = 25): array
    {
        if ($this->usesLocalFallback()) {
            return $this->seedOrders();
        }

        $response = $this->adminRequest('GET', 'orders.json', ['limit' => $limit, 'status' => 'any']);
        if (! $response->successful()) {
            throw new \RuntimeException('Shopify orders failed: HTTP '.$response->status());
        }

        return $response->json('orders') ?? [];
    }

    /**
     * @param  array<string,mixed>  $query
     */
    protected function adminRequest(string $method, string $path, array $query = [])
    {
        $shop = rtrim((string) config('integrations.shopify.shop_domain'), '/');
        $version = (string) config('integrations.shopify.api_version', '2025-01');
        $token = (string) config('integrations.shopify.access_token');
        $url = "https://{$shop}/admin/api/{$version}/{$path}";

        return Http::timeout((int) config('integrations.shopify.timeout', 20))
            ->withHeaders([
                'X-Shopify-Access-Token' => $token,
                'Accept' => 'application/json',
            ])
            ->send($method, $url, ['query' => $query]);
    }

    /**
     * @return list<array<string,mixed>>
     */
    protected function seedProducts(): array
    {
        return [
            [
                'id' => 'local-prod-cleanser',
                'title' => 'Gentle Daily Cleanser',
                'body_html' => 'Mild cleanser for daily use.',
                'status' => 'active',
                'variants' => [['sku' => 'TDC-CLN-01', 'price' => '28.00', 'inventory_quantity' => 42]],
            ],
            [
                'id' => 'local-prod-barrier',
                'title' => 'Barrier Recovery Cream',
                'body_html' => 'Barrier-supporting cream. No medical claims.',
                'status' => 'active',
                'variants' => [['sku' => 'TDC-BRC-01', 'price' => '48.00', 'inventory_quantity' => 18]],
            ],
            [
                'id' => 'local-prod-serum',
                'title' => 'Botanical Calm Serum',
                'body_html' => 'Lightweight serum for evening routines.',
                'status' => 'active',
                'variants' => [['sku' => 'TDC-SER-01', 'price' => '56.00', 'inventory_quantity' => 0]],
            ],
        ];
    }

    /**
     * @return list<array<string,mixed>>
     */
    protected function seedOrders(): array
    {
        return [
            [
                'id' => 'local-order-1001',
                'name' => '#1001',
                'email' => 'customer@example.com',
                'financial_status' => 'paid',
                'fulfillment_status' => 'fulfilled',
                'total_price' => '76.00',
                'currency' => 'USD',
                'created_at' => now()->subDays(3)->toIso8601String(),
            ],
            [
                'id' => 'local-order-1002',
                'name' => '#1002',
                'email' => 'amelia@example.com',
                'financial_status' => 'paid',
                'fulfillment_status' => null,
                'total_price' => '48.00',
                'currency' => 'USD',
                'created_at' => now()->subDay()->toIso8601String(),
            ],
        ];
    }

    public function verifyWebhook(array $headers, string $rawBody): bool
    {
        $secret = (string) (config('integrations.shopify.webhook_secret') ?: config('integrations.shopify.client_secret') ?: '');
        if ($secret === '') {
            return $this->usesLocalFallback();
        }

        $hmac = (string) ($headers['x-shopify-hmac-sha256'] ?? $headers['X-Shopify-Hmac-Sha256'] ?? '');
        if ($hmac === '') {
            return false;
        }

        $expected = base64_encode(hash_hmac('sha256', $rawBody, $secret, true));

        return hash_equals($expected, $hmac);
    }

    public function oauthAuthorizeUrl(string $shop, string $state): string
    {
        $clientId = (string) config('integrations.shopify.client_id');
        $redirect = (string) config('integrations.shopify.redirect_uri');
        $scopes = (string) config('integrations.shopify.scopes', 'read_products,read_orders,read_inventory');
        $shop = preg_replace('/[^a-zA-Z0-9.-]/', '', $shop) ?: 'example.myshopify.com';

        return 'https://'.$shop.'/admin/oauth/authorize?'.http_build_query([
            'client_id' => $clientId,
            'scope' => $scopes,
            'redirect_uri' => $redirect,
            'state' => $state ?: (string) Str::ulid(),
        ]);
    }
}
