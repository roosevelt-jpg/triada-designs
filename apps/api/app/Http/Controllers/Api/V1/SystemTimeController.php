<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Workspace;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemTimeController extends Controller
{
    /**
     * Workspace-aware system clock for UI and scheduling consistency.
     *
     * Returns UTC and workspace-local ISO timestamps plus the workspace IANA timezone.
     */
    public function show(Request $request): JsonResponse
    {
        $workspace = $this->workspace($request);
        $timezone = $this->resolveTimezone($workspace->timezone);

        $utc = Carbon::now('UTC');
        $local = $utc->copy()->timezone($timezone);

        return response()->json([
            'utc' => $utc->toIso8601String(),
            'workspace_local' => $local->toIso8601String(),
            'timezone' => $timezone,
            'unix_ms' => (int) round(microtime(true) * 1000),
            'offset_minutes' => (int) round($local->getOffset() / 60),
            'server_generated_at' => $utc->toIso8601String(),
        ]);
    }

    protected function resolveTimezone(?string $timezone): string
    {
        $tz = trim((string) ($timezone ?: 'UTC'));
        if ($tz === '') {
            return 'UTC';
        }

        try {
            new \DateTimeZone($tz);

            return $tz;
        } catch (\Throwable) {
            return 'UTC';
        }
    }

    protected function workspace(Request $request): Workspace
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');
        abort_unless($workspaceId, 403, 'No workspace membership.');

        return Workspace::query()->findOrFail($workspaceId);
    }
}
