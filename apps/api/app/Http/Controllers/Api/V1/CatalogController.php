<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ContentItem;
use App\Models\Product;
use App\Models\ServiceOffering;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Automations\ContentWorkflowDispatcher;
use App\Services\Creative\CreativeMediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CatalogController extends Controller
{
    public function products(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        return response()->json(
            Product::query()->where('workspace_id', $workspaceId)->orderBy('title')->paginate(50)
        );
    }

    public function services(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        return response()->json(
            ServiceOffering::query()->where('workspace_id', $workspaceId)->orderBy('name')->paginate(50)
        );
    }

    public function content(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        return response()->json(
            ContentItem::query()->where('workspace_id', $workspaceId)->orderByDesc('updated_at')->paginate(50)
        );
    }

    public function approveContent(
        Request $request,
        string $contentId,
        CreativeMediaService $creative,
        ContentWorkflowDispatcher $dispatcher
    ): JsonResponse {
        $workspaceId = $this->workspaceId($request);
        $item = ContentItem::query()
            ->where('workspace_id', $workspaceId)
            ->findOrFail($contentId);

        if ($item->status === 'published') {
            return response()->json(['message' => 'Already published.'], 422);
        }

        $workspace = Workspace::query()->findOrFail($workspaceId);

        // Every approved post must have post-aligned creative (image + variants at minimum).
        $pack = $creative->ensureCreativePack($workspace, $item, [
            'with_video' => true,
            'with_animation' => true,
        ]);

        $version = ((int) $item->approval_version) + 1;
        $item->forceFill([
            'status' => 'approved',
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'approval_version' => $version,
        ])->save();

        $workflows = $dispatcher->dispatch($workspace, $item->fresh(), 'content_approved');

        return response()->json([
            'content' => $item->fresh(),
            'creative' => [
                'ok' => $pack['ok'] ?? false,
                'mode' => $pack['mode'] ?? null,
                'image_asset_id' => data_get($pack, 'image.asset.id'),
                'variant_count' => isset($pack['variants']['variants']) ? count($pack['variants']['variants']) : null,
            ],
            'automations' => $workflows,
        ]);
    }

    protected function workspaceId(Request $request): string
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');
        abort_unless($workspaceId, 403, 'No workspace membership.');

        return (string) $workspaceId;
    }
}
