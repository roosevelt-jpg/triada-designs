<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ContentItem;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Creative\CreativeMediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CreativeMediaController extends Controller
{
    public function status(CreativeMediaService $creative): JsonResponse
    {
        return response()->json($creative->status());
    }

    public function generateImage(Request $request, string $contentId, CreativeMediaService $creative): JsonResponse
    {
        $workspace = $this->workspace($request);
        $item = $this->content($workspace, $contentId);

        $data = $request->validate([
            'product' => ['nullable', 'string', 'max:200'],
            'materials' => ['nullable', 'string', 'max:200'],
            'mood' => ['nullable', 'string', 'max:200'],
            'caption' => ['nullable', 'string', 'max:4000'],
            'width' => ['nullable', 'integer', 'min:64', 'max:4096'],
            'height' => ['nullable', 'integer', 'min:64', 'max:4096'],
        ]);

        if (! empty($data['product']) || ! empty($data['materials'])) {
            $item->forceFill([
                'product_context' => array_merge($item->product_context ?? [], array_filter([
                    'name' => $data['product'] ?? null,
                    'materials' => $data['materials'] ?? null,
                ])),
            ])->save();
        }

        $result = $creative->generateImage($workspace, $item, $data);

        return response()->json([
            'ok' => $result['ok'],
            'mode' => $result['mode'],
            'prompt' => $result['prompt'] ?? null,
            'brief' => $result['brief'] ?? null,
            'error' => $result['error'],
            'asset' => $result['asset'],
            'content' => $result['content'] ?? null,
            'preview_required' => true,
            'review_url' => '/content/review',
            'admin_notified' => $result['admin_notified'] ?? false,
            'notify' => $result['notify'] ?? null,
            'note' => 'Image draft ready — preview before approval.',
        ]);
    }

    public function generateVariants(Request $request, string $contentId, CreativeMediaService $creative): JsonResponse
    {
        $workspace = $this->workspace($request);
        $item = $this->content($workspace, $contentId);

        $data = $request->validate([
            'source_media_asset_id' => ['nullable', 'string'],
            'platforms' => ['nullable', 'array'],
            'platforms.*' => ['string'],
        ]);

        $result = $creative->generateVariants(
            $workspace,
            $item,
            $data['source_media_asset_id'] ?? null,
            $data['platforms'] ?? null
        );

        return response()->json([
            'ok' => $result['ok'],
            'mode' => $result['mode'],
            'resize_engine' => $result['resize_engine'] ?? null,
            'error' => $result['error'] ?? null,
            'source' => $result['source'] ?? null,
            'variants' => $result['variants'] ?? [],
            'note' => 'Platform variants stored with width/height/aspect — publish still requires approval.',
        ]);
    }

    public function generateVideo(Request $request, string $contentId, CreativeMediaService $creative): JsonResponse
    {
        $workspace = $this->workspace($request);
        $item = $this->content($workspace, $contentId);

        $data = $request->validate([
            'product' => ['nullable', 'string', 'max:200'],
            'storyboard' => ['nullable', 'string', 'max:2000'],
            'caption' => ['nullable', 'string', 'max:4000'],
            'duration_ms' => ['nullable', 'integer', 'min:1000', 'max:60000'],
            'style' => ['nullable', 'string', 'in:editorial,ugc,animation'],
        ]);

        $isUgc = strtolower((string) ($data['style'] ?? '')) === 'ugc';
        $result = $isUgc
            ? $creative->generateUgcVideo($workspace, $item, $data)
            : $creative->generateVideo($workspace, $item, $data);

        return response()->json([
            'ok' => $result['ok'],
            'mode' => $result['mode'],
            'prompt' => $result['prompt'] ?? null,
            'brief' => $result['brief'] ?? null,
            'script' => $result['script'] ?? null,
            'flow' => $result['flow'] ?? null,
            'error' => $result['error'],
            'asset' => $result['asset'],
            'sidecar' => $result['sidecar'] ?? null,
            'content' => $result['content'] ?? null,
            'preview_required' => true,
            'review_url' => '/content/review',
            'admin_notified' => $result['admin_notified'] ?? false,
            'notify' => $result['notify'] ?? null,
            'note' => $result['note'] ?? 'Short video draft ready — preview before approval.',
        ]);
    }

    public function generateUgcVideo(Request $request, string $contentId, CreativeMediaService $creative): JsonResponse
    {
        $workspace = $this->workspace($request);
        $item = $this->content($workspace, $contentId);

        $data = $request->validate([
            'product' => ['nullable', 'string', 'max:200'],
            'storyboard' => ['nullable', 'string', 'max:2000'],
            'caption' => ['nullable', 'string', 'max:4000'],
            'duration_ms' => ['nullable', 'integer', 'min:1000', 'max:60000'],
        ]);

        $result = $creative->generateUgcVideo($workspace, $item, $data);

        return response()->json([
            'ok' => $result['ok'],
            'mode' => $result['mode'],
            'prompt' => $result['prompt'] ?? null,
            'brief' => $result['brief'] ?? null,
            'script' => $result['script'] ?? null,
            'flow' => $result['flow'] ?? null,
            'error' => $result['error'],
            'asset' => $result['asset'],
            'sidecar' => $result['sidecar'] ?? null,
            'content' => $result['content'] ?? null,
            'preview_required' => true,
            'review_url' => '/content/review',
            'admin_notified' => $result['admin_notified'] ?? false,
            'notify' => $result['notify'] ?? null,
            'note' => $result['note'] ?? 'UGC video ready — preview before approval.',
        ]);
    }

    public function generateAnimation(Request $request, string $contentId, CreativeMediaService $creative): JsonResponse
    {
        $workspace = $this->workspace($request);
        $item = $this->content($workspace, $contentId);

        $data = $request->validate([
            'product' => ['nullable', 'string', 'max:200'],
            'storyboard' => ['nullable', 'string', 'max:2000'],
            'caption' => ['nullable', 'string', 'max:4000'],
            'duration_ms' => ['nullable', 'integer', 'min:1000', 'max:60000'],
            'width' => ['nullable', 'integer', 'min:64', 'max:4096'],
            'height' => ['nullable', 'integer', 'min:64', 'max:4096'],
        ]);

        $result = $creative->generateAnimation($workspace, $item, $data);

        return response()->json([
            'ok' => $result['ok'],
            'mode' => $result['mode'],
            'prompt' => $result['prompt'] ?? null,
            'brief' => $result['brief'] ?? null,
            'error' => $result['error'],
            'asset' => $result['asset'],
            'sidecar' => $result['sidecar'] ?? null,
            'note' => 'Marketing animation draft only — human approval still required before public publish.',
        ]);
    }

    public function ensureCreative(Request $request, string $contentId, CreativeMediaService $creative): JsonResponse
    {
        $workspace = $this->workspace($request);
        $item = $this->content($workspace, $contentId);

        $data = $request->validate([
            'force' => ['nullable', 'boolean'],
            'with_video' => ['nullable', 'boolean'],
            'with_animation' => ['nullable', 'boolean'],
            'product' => ['nullable', 'string', 'max:200'],
            'platforms' => ['nullable', 'array'],
            'platforms.*' => ['string'],
        ]);

        $result = $creative->ensureCreativePack($workspace, $item, $data);

        return response()->json($result, ($result['ok'] ?? false) ? 200 : 422);
    }

    public function media(Request $request, string $contentId, CreativeMediaService $creative): JsonResponse
    {
        $workspace = $this->workspace($request);
        $item = $this->content($workspace, $contentId);

        return response()->json($creative->listForContent($workspace, $item));
    }

    protected function content(Workspace $workspace, string $contentId): ContentItem
    {
        return ContentItem::query()
            ->where('workspace_id', $workspace->id)
            ->where('id', $contentId)
            ->firstOrFail();
    }

    protected function workspace(Request $request): Workspace
    {
        /** @var User $user */
        $user = $request->user();
        $membership = $user->memberships()->with('workspace')->firstOrFail();

        return $membership->workspace;
    }
}
