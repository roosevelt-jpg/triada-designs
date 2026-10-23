<?php

namespace App\Services\Publishing;

use App\Models\ContentItem;
use App\Models\Workspace;
use App\Services\Messaging\Meta\MetaGraphClient;
use App\Services\Publishing\Contracts\PublishAdapterInterface;
use Illuminate\Support\Str;

class MetaPagePublishAdapter implements PublishAdapterInterface
{
    public function __construct(protected MetaGraphClient $graph)
    {
    }

    public function key(): string
    {
        return 'meta_page';
    }

    public function publish(Workspace $workspace, ContentItem $item): array
    {
        $message = trim((string) ($item->body ?: $item->title));

        if ($this->graph->usesLocalFallback()) {
            return [
                'ok' => true,
                'mode' => 'local',
                'external_id' => 'local-meta-post-'.Str::ulid(),
                'external_url' => null,
                'raw' => [
                    'note' => 'Meta page publish simulated locally. Status remains awaiting_credentials until Graph tokens + live mode.',
                    'message_preview' => Str::limit($message, 180),
                ],
            ];
        }

        try {
            // Live path: Graph feed publish when client supports it; otherwise fail honestly.
            if (method_exists($this->graph, 'publishPagePost')) {
                $result = $this->graph->publishPagePost($message);

                return [
                    'ok' => (bool) ($result['ok'] ?? false),
                    'mode' => 'live',
                    'external_id' => $result['id'] ?? null,
                    'external_url' => $result['permalink_url'] ?? null,
                    'error' => $result['error_message'] ?? null,
                    'raw' => $result['raw'] ?? $result,
                ];
            }

            return [
                'ok' => false,
                'mode' => 'live',
                'error' => 'Meta Graph page publish method not available on client.',
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'mode' => 'live',
                'error' => $e->getMessage(),
            ];
        }
    }
}
