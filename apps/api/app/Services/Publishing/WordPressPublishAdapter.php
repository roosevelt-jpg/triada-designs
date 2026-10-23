<?php

namespace App\Services\Publishing;

use App\Models\ContentItem;
use App\Models\Workspace;
use App\Services\Publishing\Contracts\PublishAdapterInterface;
use App\Services\WordPress\WordPressClient;
use Illuminate\Support\Str;

class WordPressPublishAdapter implements PublishAdapterInterface
{
    public function __construct(protected WordPressClient $wordpress)
    {
    }

    public function key(): string
    {
        return 'wordpress';
    }

    public function publish(Workspace $workspace, ContentItem $item): array
    {
        // Prefer creating a draft remotely when live; local mode returns seeded publication proof.
        try {
            if (method_exists($this->wordpress, 'createDraft')) {
                $result = $this->wordpress->createDraft([
                    'title' => $item->title,
                    'content' => $item->body,
                    'status' => 'draft',
                ]);

                $mode = (string) ($result['source'] ?? $result['mode'] ?? 'local');
                $id = (string) ($result['id'] ?? $result['post']['id'] ?? ('local-wp-'.Str::ulid()));

                return [
                    'ok' => true,
                    'mode' => $mode === 'live' ? 'live' : 'local',
                    'external_id' => $id,
                    'external_url' => $result['link'] ?? $result['post']['link'] ?? null,
                    'raw' => is_array($result) ? $result : [],
                ];
            }
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'mode' => 'error',
                'error' => $e->getMessage(),
            ];
        }

        return [
            'ok' => true,
            'mode' => 'local',
            'external_id' => 'local-wp-'.Str::ulid(),
            'external_url' => null,
            'raw' => ['note' => 'WordPress local publication recorded without live credentials.'],
        ];
    }
}
