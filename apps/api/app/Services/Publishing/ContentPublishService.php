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
        if ($item->status !== 'approved') {
            return [
                'ok' => false,
                'error' => 'Only approved content can be scheduled.',
                'gate' => 'approval_required',
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
}
