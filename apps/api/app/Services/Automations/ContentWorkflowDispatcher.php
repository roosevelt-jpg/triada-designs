<?php

namespace App\Services\Automations;

use App\Models\ContentItem;
use App\Models\Workspace;
use Illuminate\Support\Facades\Log;

/**
 * Fire active automation workflows for content lifecycle events
 * (content_created, content_approved). Failures are logged, never block the HTTP path.
 */
class ContentWorkflowDispatcher
{
    public function __construct(protected WorkflowExecutor $executor)
    {
    }

    /**
     * @param  array<string, mixed>  $extraContext
     * @return list<array{workflow_id:string,ok:bool,error:?string}>
     */
    public function dispatch(Workspace $workspace, ContentItem $item, string $triggerType, array $extraContext = []): array
    {
        $workflows = $workspace->automationWorkflows()
            ->where('status', 'active')
            ->where('trigger_type', $triggerType)
            ->get();

        $results = [];
        foreach ($workflows as $workflow) {
            try {
                $this->executor->execute(
                    $workflow,
                    array_merge([
                        'content_item_id' => $item->id,
                        'channel' => $item->channel,
                        'title' => $item->title,
                        'body' => $item->body,
                        'objective' => $item->objective,
                        'product' => data_get($item->product_context, 'name'),
                    ], $extraContext),
                    'live',
                    (string) $item->id,
                    'content-'.$triggerType.'-'.$item->id.'-'.$workflow->id,
                );
                $results[] = [
                    'workflow_id' => (string) $workflow->id,
                    'ok' => true,
                    'error' => null,
                ];
            } catch (\Throwable $e) {
                Log::warning('content.workflow_dispatch_failed', [
                    'trigger' => $triggerType,
                    'workflow_id' => $workflow->id,
                    'content_item_id' => $item->id,
                    'error' => $e->getMessage(),
                ]);
                $results[] = [
                    'workflow_id' => (string) $workflow->id,
                    'ok' => false,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return $results;
    }
}
