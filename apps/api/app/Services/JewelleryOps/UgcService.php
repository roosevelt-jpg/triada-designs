<?php

namespace App\Services\JewelleryOps;

use App\Models\UgcItem;
use App\Models\Workspace;

class UgcService
{
    public function __construct(protected TelegramAlertService $alerts)
    {
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function recordTag(Workspace $workspace, array $input): array
    {
        $item = UgcItem::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $input['contact_id'] ?? null,
            'commerce_order_id' => $input['commerce_order_id'] ?? null,
            'item_type' => 'tag_alert',
            'platform' => $input['platform'] ?? 'instagram',
            'external_post_url' => $input['external_post_url'] ?? null,
            'external_post_id' => $input['external_post_id'] ?? null,
            'status' => 'new',
            'metadata' => $input['metadata'] ?? [],
        ]);

        $candidate = UgcItem::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $input['contact_id'] ?? null,
            'item_type' => 'repost_candidate',
            'platform' => $item->platform,
            'external_post_url' => $item->external_post_url,
            'external_post_id' => $item->external_post_id,
            'status' => 'new',
            'permission_to_repost' => false,
            'metadata' => ['from_tag' => $item->id],
        ]);

        $alert = $this->alerts->send($workspace, 'tag', 'Tagged in '.$item->platform, $item->external_post_url, [
            'ugc_item_id' => $item->id,
        ]);

        return [
            'ok' => true,
            'tag' => $item,
            'repost_candidate' => $candidate,
            'alert' => $alert,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function requestRepostPermission(Workspace $workspace, string $itemId): array
    {
        $item = UgcItem::query()->where('workspace_id', $workspace->id)->where('id', $itemId)->firstOrFail();
        $item->forceFill(['status' => 'permission_requested'])->save();

        return [
            'ok' => true,
            'item' => $item,
            'message_draft' => 'May we repost your photo/reel on Triada Designs channels? Reply yes to grant permission.',
            'mode' => 'local_sim',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function listRepostQueue(Workspace $workspace): array
    {
        $items = UgcItem::query()
            ->where('workspace_id', $workspace->id)
            ->where('item_type', 'repost_candidate')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return ['ok' => true, 'data' => $items];
    }
}
