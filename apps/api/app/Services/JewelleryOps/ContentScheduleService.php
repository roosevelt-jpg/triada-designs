<?php

namespace App\Services\JewelleryOps;

use App\Models\ContentItem;
use App\Models\ContentPerformanceSummary;
use App\Models\Publication;
use App\Models\Workspace;

class ContentScheduleService
{
    /**
     * Cross-post one reel across IG / TikTok / FB / LinkedIn — never live without approval.
     *
     * @param  list<string>  $channels
     * @return array<string, mixed>
     */
    public function scheduleCrossPost(Workspace $workspace, string $contentId, array $channels, ?string $scheduledFor = null): array
    {
        $content = ContentItem::query()->where('workspace_id', $workspace->id)->where('id', $contentId)->firstOrFail();
        if ($content->status !== 'approved' && ($content->approval_version ?? 0) < 1) {
            return [
                'ok' => false,
                'error' => 'Human approval required before scheduling cross-post.',
                'content_status' => $content->status,
            ];
        }

        $allowed = ['instagram', 'tiktok', 'facebook', 'linkedin'];
        $channels = array_values(array_intersect($channels ?: $allowed, $allowed));
        $pubs = [];
        foreach ($channels as $channel) {
            $pubs[] = Publication::query()->create([
                'workspace_id' => $workspace->id,
                'content_item_id' => $content->id,
                'adapter' => 'local_sim',
                'channel' => $channel,
                'status' => 'scheduled',
                'approval_version_checked' => (int) ($content->approval_version ?? 1),
                'metadata' => [
                    'cross_post' => true,
                    'scheduled_for' => $scheduledFor ?: ($content->scheduled_for?->toIso8601String()),
                    'requires_human_before_live' => true,
                ],
            ]);
        }

        $content->forceFill([
            'scheduled_for' => $scheduledFor ?: $content->scheduled_for ?: now()->addDay(),
            'publish_metadata' => array_merge($content->publish_metadata ?? [], [
                'cross_post_channels' => $channels,
                'awaiting_go_live_approval' => true,
            ]),
        ])->save();

        return [
            'ok' => true,
            'publications' => $pubs,
            'note' => 'Cross-post scheduled — approve again before anything goes live.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function weeklyPerformanceSummary(Workspace $workspace): array
    {
        $weekStart = now()->startOfWeek()->toDateString();
        $posts = ContentItem::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('status', ['approved', 'published', 'scheduled'])
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get();

        $top = $posts->take(5)->map(fn (ContentItem $c) => [
            'id' => $c->id,
            'title' => $c->title,
            'channel' => $c->channel,
            'status' => $c->status,
            'engagement_proxy' => data_get($c->publish_metadata, 'engagement_proxy', 'local_sim'),
        ])->values()->all();

        $summaryText = 'Weekly content summary (local_sim metrics): top drafts/posts ready for review. '.
            'Best performers by status freshness — connect live analytics when credentials are present.';

        $row = ContentPerformanceSummary::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'week_starting' => $weekStart,
            ],
            [
                'status' => 'ready',
                'top_posts' => $top,
                'metrics' => [
                    'posts_considered' => $posts->count(),
                    'mode' => 'local_sim',
                ],
                'summary_text' => $summaryText,
            ]
        );

        return ['ok' => true, 'summary' => $row];
    }
}
