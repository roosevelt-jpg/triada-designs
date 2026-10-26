<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Workspace;
use App\Services\JewelleryOps\AbandonmentService;
use App\Services\JewelleryOps\AfterSaleService;
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
}
