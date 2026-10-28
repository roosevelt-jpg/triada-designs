<?php

namespace App\Services\Publishing;

use App\Models\AuditLog;
use App\Models\ContentItem;
use App\Models\Publication;
use App\Models\Workspace;
use App\Services\Publishing\Contracts\PublishAdapterInterface;
use InvalidArgumentException;

class ContentPublishService
{
    /** @var array<string, PublishAdapterInterface> */
    protected array $adapters;

    public function __construct(
        WordPressPublishAdapter $wordpress,
        MetaPagePublishAdapter $meta,
    ) {
        $this->adapters = [
            $wordpress->key() => $wordpress,
            $meta->key() => $meta,
        ];
    }

    /**
     * Publish only after human approval and matching approval_version.
     *
     * @return array<string, mixed>
     */
    public function publish(
        Workspace $workspace,
        ContentItem $item,
        string $adapterKey,
        ?int $expectedApprovalVersion = null,
        ?string $actorId = null
    ): array {
        if ($item->workspace_id !== $workspace->id) {
            throw new InvalidArgumentException('Content item workspace mismatch.');
        }

        if ($item->status !== 'approved' && $item->status !== 'scheduled') {
            return [
                'ok' => false,
                'error' => 'Content must be human-approved before publish.',
                'gate' => 'approval_required',
                'status' => $item->status,
            ];
        }

        if (empty($item->approved_by) || empty($item->approval_version)) {
            return [
                'ok' => false,
                'error' => 'Missing approval metadata.',
                'gate' => 'approval_metadata',
            ];
        }

        $version = (int) $item->approval_version;
        if ($expectedApprovalVersion !== null && $expectedApprovalVersion !== $version) {
            return [
                'ok' => false,
                'error' => 'Approval version mismatch. Re-approve the current draft before publishing.',
                'gate' => 'approval_version_mismatch',
                'expected' => $expectedApprovalVersion,
                'current' => $version,
            ];
        }

        $adapter = $this->adapters[$adapterKey] ?? null;
        if (! $adapter) {
            return [
                'ok' => false,
                'error' => "Unknown publish adapter: {$adapterKey}",
                'gate' => 'adapter',
            ];
        }

        $publication = Publication::query()->create([
            'workspace_id' => $workspace->id,
            'content_item_id' => $item->id,
            'adapter' => $adapterKey,
            'channel' => $item->channel ?: $adapterKey,
            'status' => 'publishing',
            'approval_version_checked' => $version,
        ]);

        $result = $adapter->publish($workspace, $item);

        if (! ($result['ok'] ?? false)) {
            $publication->forceFill([
                'status' => 'failed',
                'error_message' => $result['error'] ?? 'Publish failed',
                'metadata' => $result,
            ])->save();

            return [
                'ok' => false,
                'error' => $result['error'] ?? 'Publish failed',
                'publication' => $publication->fresh(),
                'result' => $result,
            ];
        }

        $publication->forceFill([
            'status' => 'published',
            'external_id' => $result['external_id'] ?? null,
            'external_url' => $result['external_url'] ?? null,
            'metadata' => $result,
            'published_at' => now(),
        ])->save();

        $item->forceFill([
            'status' => 'published',
            'published_at' => now(),
            'publish_metadata' => [
                'adapter' => $adapterKey,
                'mode' => $result['mode'] ?? 'local',
                'publication_id' => $publication->id,
                'external_id' => $result['external_id'] ?? null,
            ],
        ])->save();

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => $actorId ?? 'system',
            'action' => 'content.publish',
            'target_type' => 'content_item',
            'target_id' => $item->id,
            'created_at' => now(),
            'metadata' => [
                'adapter' => $adapterKey,
                'approval_version' => $version,
                'mode' => $result['mode'] ?? null,
            ],
        ]);

        return [
            'ok' => true,
            'publication' => $publication->fresh(),
            'content' => $item->fresh(),
            'result' => $result,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function schedule(Workspace $workspace, ContentItem $item, string $scheduledFor, ?string $actorId = null): array
    {
        if (! in_array($item->status, ['approved', 'scheduled'], true)) {
            return [
                'ok' => false,
                'error' => 'Only approved (or already scheduled) content can be scheduled.',
                'gate' => 'approval_required',
            ];
        }

        if (empty($item->approved_by) || empty($item->approval_version)) {
            return [
                'ok' => false,
                'error' => 'Missing approval metadata.',
                'gate' => 'approval_metadata',
            ];
        }

        $item->forceFill([
            'status' => 'scheduled',
            'scheduled_for' => $scheduledFor,
        ])->save();

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => $actorId ?? 'system',
            'action' => 'content.schedule',
            'target_type' => 'content_item',
            'target_id' => $item->id,
            'created_at' => now(),
            'metadata' => ['scheduled_for' => $scheduledFor],
        ]);

        return ['ok' => true, 'content' => $item->fresh()];
    }

    /**
     * Vercel Cron / worker: publish due scheduled posts (approval gates still enforced).
     *
     * @return array{ok:bool,processed:int,results:list<array<string,mixed>>}
     */
    public function processDue(Workspace $workspace): array
    {
        $due = ContentItem::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', 'scheduled')
            ->whereNotNull('scheduled_for')
            ->where('scheduled_for', '<=', now())
            ->orderBy('scheduled_for')
            ->limit(25)
            ->get();

        $results = [];
        foreach ($due as $item) {
            $adapters = $this->adaptersFor($item);
            $itemResults = [];
            $anyOk = false;
            foreach ($adapters as $adapterKey) {
                $out = $this->publish(
                    $workspace,
                    $item->fresh(),
                    $adapterKey,
                    (int) $item->approval_version,
                    'cron:content-publish'
                );
                $itemResults[] = [
                    'adapter' => $adapterKey,
                    'ok' => (bool) ($out['ok'] ?? false),
                    'error' => $out['error'] ?? null,
                    'mode' => data_get($out, 'result.mode'),
                ];
                if ($out['ok'] ?? false) {
                    $anyOk = true;
                    break; // one successful publish is enough for the content item status
                }
            }
            $results[] = [
                'content_item_id' => $item->id,
                'title' => $item->title,
                'scheduled_for' => optional($item->scheduled_for)?->toIso8601String(),
                'published' => $anyOk,
                'adapters' => $itemResults,
            ];
        }

        return [
            'ok' => true,
            'processed' => count($results),
            'results' => $results,
        ];
    }

    /**
     * @return list<string>
     */
    protected function adaptersFor(ContentItem $item): array
    {
        $configured = data_get($item->publish_metadata, 'adapters');
        if (is_array($configured) && $configured !== []) {
            return array_values(array_filter(array_map('strval', $configured)));
        }

        $channel = strtolower((string) ($item->channel ?? ''));

        return match (true) {
            in_array($channel, ['wordpress', 'blog', 'website'], true) => ['wordpress'],
            in_array($channel, ['instagram', 'facebook', 'meta', 'tiktok'], true) => ['meta_page'],
            default => ['meta_page', 'wordpress'],
        };
    }
}
