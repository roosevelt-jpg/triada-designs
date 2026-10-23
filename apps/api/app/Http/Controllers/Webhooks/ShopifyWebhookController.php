<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Workspace;
use App\Services\Commerce\Shopify\ShopifyClient;
use App\Services\Commerce\Shopify\ShopifySyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShopifyWebhookController extends Controller
{
    public function ingest(
        Request $request,
        ShopifyClient $client,
        ShopifySyncService $sync
    ): JsonResponse {
        $raw = $request->getContent();
        $headers = [];
        foreach ($request->headers->all() as $key => $values) {
            $headers[$key] = $values[0] ?? null;
        }

        if (! $client->verifyWebhook($headers, $raw)) {
            return response()->json(['message' => 'Invalid Shopify webhook signature.'], 401);
        }

        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return response()->json(['message' => 'Workspace not found.'], 404);
        }

        $topic = (string) ($headers['x-shopify-topic'] ?? $headers['X-Shopify-Topic'] ?? 'products/update');
        $result = $sync->ingestWebhook($workspace, $request->all(), $topic);

        return response()->json($result);
    }
}
