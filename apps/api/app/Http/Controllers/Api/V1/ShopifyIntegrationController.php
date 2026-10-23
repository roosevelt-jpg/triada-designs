<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Commerce\Shopify\ShopifySyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShopifyIntegrationController extends Controller
{
    public function status(Request $request, ShopifySyncService $shopify): JsonResponse
    {
        return response()->json($shopify->status($this->workspace($request)));
    }

    public function connect(Request $request, ShopifySyncService $shopify): JsonResponse
    {
        $data = $request->validate([
            'shop_domain' => ['nullable', 'string', 'max:255'],
            'external_account_id' => ['nullable', 'string', 'max:255'],
            'display_name' => ['nullable', 'string', 'max:255'],
            'access_token' => ['nullable', 'string'],
            'scopes' => ['nullable', 'array'],
            'oauth_state' => ['nullable', 'string'],
        ]);
        $data['actor_id'] = (string) $request->user()->id;

        return response()->json($shopify->connect($this->workspace($request), $data));
    }

    public function disconnect(Request $request, ShopifySyncService $shopify): JsonResponse
    {
        return response()->json($shopify->disconnect($this->workspace($request)));
    }

    public function sync(Request $request, ShopifySyncService $shopify): JsonResponse
    {
        $data = $request->validate([
            'sync_type' => ['nullable', 'in:products,orders'],
        ]);

        $result = $shopify->syncNow($this->workspace($request), $data['sync_type'] ?? 'products');

        return response()->json($result, ($result['ok'] ?? false) ? 200 : 422);
    }

    protected function workspace(Request $request): Workspace
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');
        abort_unless($workspaceId, 403, 'No workspace membership.');

        return Workspace::query()->findOrFail($workspaceId);
    }
}
