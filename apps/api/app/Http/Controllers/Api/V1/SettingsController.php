<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $workspace = $this->workspace($request);

        return response()->json([
            'workspace' => [
                'id' => $workspace->id,
                'name' => $workspace->name,
                'slug' => $workspace->slug,
                'timezone' => $workspace->timezone,
                'default_language' => $workspace->default_language,
                'settings' => $workspace->settings,
                'automations_paused' => (bool) $workspace->automations_paused,
                'outbound_paused' => (bool) $workspace->outbound_paused,
            ],
            'meta' => [
                'verify_token_set' => filled(($workspace->settings['meta_verify_token'] ?? null) ?: config('integrations.meta.verify_token')),
                'note' => 'Emergency pauses apply workspace-wide to automations and Meta/webchat outbound.',
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $workspace = $this->workspace($request);
        $data = $request->validate([
            'timezone' => ['sometimes', 'string', 'max:64'],
            'default_language' => ['sometimes', 'string', 'max:16'],
            'automations_paused' => ['sometimes', 'boolean'],
            'outbound_paused' => ['sometimes', 'boolean'],
        ]);

        $workspace->forceFill($data)->save();

        AuditLog::query()->create([
            'workspace_id' => $workspace->id,
            'actor_type' => 'user',
            'actor_id' => (string) $request->user()->id,
            'action' => 'settings.update',
            'target_type' => 'workspace',
            'target_id' => $workspace->id,
            'created_at' => now(),
            'metadata' => $data,
        ]);

        return $this->show($request);
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
