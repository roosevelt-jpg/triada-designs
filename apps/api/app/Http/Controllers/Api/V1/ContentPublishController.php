<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ContentItem;
use App\Models\Publication;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Publishing\ContentPublishService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentPublishController extends Controller
{
    public function publications(Request $request): JsonResponse
    {
        $workspace = $this->workspace($request);

        return response()->json([
            'data' => Publication::query()
                ->where('workspace_id', $workspace->id)
                ->orderByDesc('created_at')
                ->limit(50)
                ->get(),
        ]);
    }

    public function schedule(Request $request, string $contentId, ContentPublishService $publisher): JsonResponse
    {
        $data = $request->validate([
            'scheduled_for' => ['required', 'date'],
        ]);

        $workspace = $this->workspace($request);
        $item = ContentItem::query()
            ->where('workspace_id', $workspace->id)
            ->findOrFail($contentId);

        $result = $publisher->schedule(
            $workspace,
            $item,
            $data['scheduled_for'],
            (string) $request->user()->id
        );

        return response()->json($result, ($result['ok'] ?? false) ? 200 : 422);
    }

    public function publish(Request $request, string $contentId, ContentPublishService $publisher): JsonResponse
    {
        $data = $request->validate([
            'adapter' => ['required', 'in:wordpress,meta_page'],
            'approval_version' => ['nullable', 'integer'],
        ]);

        $workspace = $this->workspace($request);
        $item = ContentItem::query()
            ->where('workspace_id', $workspace->id)
            ->findOrFail($contentId);

        $result = $publisher->publish(
            $workspace,
            $item,
            $data['adapter'],
            isset($data['approval_version']) ? (int) $data['approval_version'] : (int) $item->approval_version,
            (string) $request->user()->id
        );

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
