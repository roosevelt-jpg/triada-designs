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
     * Human admin sets or overrides the go-live datetime. AI proposals never call this.
     *
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

        $wasScheduled = $item->status === 'scheduled';
        $previous = optional($item->scheduled_for)?->toIso8601String();
        $meta = is_array($item->publish_metadata) ? $item->publish_metadata : [];
        unset($meta['proposed_scheduled_for']);
        $meta['schedule_source'] = 'human';
        $meta['scheduled_by'] = $actorId ?? 'admin';
        $meta['scheduled_at'] = now()->toIso8601String();

        $item->forceFill([
            'status' => 'scheduled',
            'scheduled_for' => $scheduledFor,
            'proposed_scheduled_for' => null,
            'publish_metadata' => $meta,
        ])->save();

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => $actorId ?? 'system',
            'action' => $wasScheduled ? 'content.reschedule' : 'content.schedule',
            'target_type' => 'content_item',
            'target_id' => $item->id,
            'created_at' => now(),
            'metadata' => [
                'scheduled_for' => $scheduledFor,
                'previous_scheduled_for' => $previous,
                'schedule_source' => 'human',
            ],
        ]);

        return ['ok' => true, 'content' => $item->fresh()];
    }

    /**
     * Human admin cancels a scheduled go-live. Reverts to approved; cron will not publish.
     *
     * @return array<string, mixed>
     */
    public function cancelSchedule(Workspace $workspace, ContentItem $item, ?string $actorId = null): array
    {
        if ($item->workspace_id !== $workspace->id) {
            throw new InvalidArgumentException('Content item workspace mismatch.');
        }

        if ($item->status !== 'scheduled' && empty($item->scheduled_for)) {
            return [
                'ok' => false,
                'error' => 'Content is not scheduled.',
                'gate' => 'not_scheduled',
            ];
        }

        if ($item->status === 'published') {
            return [
                'ok' => false,
                'error' => 'Published content cannot be unscheduled.',
                'gate' => 'already_published',
            ];
        }

        $previous = optional($item->scheduled_for)?->toIso8601String();
        $meta = is_array($item->publish_metadata) ? $item->publish_metadata : [];
        $meta['schedule_source'] = 'human_cancelled';
        $meta['schedule_cancelled_by'] = $actorId ?? 'admin';
        $meta['schedule_cancelled_at'] = now()->toIso8601String();
        unset($meta['scheduled_by'], $meta['scheduled_at']);

        $item->forceFill([
            'status' => 'approved',
            'scheduled_for' => null,
            'publish_metadata' => $meta,
        ])->save();

        Publication::query()
            ->where('workspace_id', $workspace->id)
            ->where('content_item_id', $item->id)
            ->where('status', 'scheduled')
            ->update([
                'status' => 'cancelled',
                'updated_at' => now(),
            ]);

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => $actorId ?? 'system',
            'action' => 'content.schedule_cancelled',
            'target_type' => 'content_item',
            'target_id' => $item->id,
            'created_at' => now(),
            'metadata' => [
                'previous_scheduled_for' => $previous,
                'schedule_source' => 'human',
            ],
        ]);

        return ['ok' => true, 'content' => $item->fresh()];
    }

    /**
     * AI / automation may propose a slot only — never sets status=scheduled.
     *
     * @return array<string, mixed>
     */
    public function proposeSchedule(Workspace $workspace, ContentItem $item, string $proposedFor, ?string $actorId = null): array
    {
        if ($item->workspace_id !== $workspace->id) {
            throw new InvalidArgumentException('Content item workspace mismatch.');
        }

        if (in_array($item->status, ['published'], true)) {
            return [
                'ok' => false,
                'error' => 'Published content cannot receive schedule proposals.',
                'gate' => 'already_published',
            ];
        }

        $meta = is_array($item->publish_metadata) ? $item->publish_metadata : [];
        $meta['proposed_scheduled_for'] = $proposedFor;
        $meta['proposal_source'] = 'ai';
        $meta['proposed_at'] = now()->toIso8601String();
        $meta['proposed_by'] = $actorId ?? 'ai';

        $item->forceFill([
            'proposed_scheduled_for' => $proposedFor,
            'publish_metadata' => $meta,
        ])->save();

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'agent',
            'actor_id' => $actorId ?? 'ai',
            'action' => 'content.schedule_proposed',
            'target_type' => 'content_item',
            'target_id' => $item->id,
            'created_at' => now(),
            'metadata' => ['proposed_scheduled_for' => $proposedFor],
        ]);

        return [
            'ok' => true,
            'content' => $item->fresh(),
            'note' => 'Proposal only — admin must confirm a go-live date on Calendar or Content Studio.',
        ];
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
