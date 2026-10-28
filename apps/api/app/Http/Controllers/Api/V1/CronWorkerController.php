<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Workspace;
use App\Services\JewelleryOps\AbandonmentService;
use App\Services\JewelleryOps\AfterSaleService;
use App\Services\Publishing\ContentPublishService;
use Illuminate\Http\JsonResponse;

/**
 * Process-on-demand workers for Vercel Cron Jobs (not always-on daemons).
 * Secured by VerifyCronSecret; iterates all workspaces.
 */
class CronWorkerController extends Controller
{
    public function processAbandonment(AbandonmentService $svc): JsonResponse
    {
        $results = [];
        foreach (Workspace::query()->orderBy('created_at')->get() as $workspace) {
            $out = $svc->processDue($workspace);
            $results[] = [
                'workspace_id' => $workspace->id,
                'slug' => $workspace->slug,
                'processed' => $out['processed'] ?? 0,
                'ok' => (bool) ($out['ok'] ?? false),
            ];
        }

        return response()->json([
            'ok' => true,
            'worker' => 'abandonment',
            'workspaces' => count($results),
            'results' => $results,
            'time' => now()->toIso8601String(),
        ]);
    }

    public function processAfterSale(AfterSaleService $svc): JsonResponse
    {
        $results = [];
        foreach (Workspace::query()->orderBy('created_at')->get() as $workspace) {
            $out = $svc->processDue($workspace);
            $results[] = [
                'workspace_id' => $workspace->id,
                'slug' => $workspace->slug,
                'processed' => $out['processed'] ?? 0,
                'ok' => (bool) ($out['ok'] ?? false),
            ];
        }

        return response()->json([
            'ok' => true,
            'worker' => 'after_sale',
            'workspaces' => count($results),
            'results' => $results,
            'time' => now()->toIso8601String(),
        ]);
    }

    public function processContentPublish(ContentPublishService $publisher): JsonResponse
    {
        $results = [];
        foreach (Workspace::query()->orderBy('created_at')->get() as $workspace) {
            $out = $publisher->processDue($workspace);
            $results[] = [
                'workspace_id' => $workspace->id,
                'slug' => $workspace->slug,
                'processed' => $out['processed'] ?? 0,
                'ok' => (bool) ($out['ok'] ?? false),
                'items' => $out['results'] ?? [],
            ];
        }

        return response()->json([
            'ok' => true,
            'worker' => 'content_publish',
            'workspaces' => count($results),
            'results' => $results,
            'time' => now()->toIso8601String(),
            'note' => 'Publishes human-approved content_items with scheduled_for <= now. Approval gates still enforced.',
        ]);
    }
}
