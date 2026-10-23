<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AiRun;
use App\Models\User;
use App\Models\Workspace;
use App\Services\AI\AiOrchestrator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AgentOrchestrationController extends Controller
{
    public function llmStatus(Request $request, AiOrchestrator $ai): JsonResponse
    {
        return response()->json($ai->llmStatus());
    }

    public function activity(Request $request): JsonResponse
    {
        $workspace = $this->workspace($request);

        return response()->json([
            'data' => AiRun::query()
                ->where('workspace_id', $workspace->id)
                ->orderByDesc('created_at')
                ->limit(50)
                ->get(),
            'metrics' => [
                'total_runs' => AiRun::query()->where('workspace_id', $workspace->id)->count(),
                'failed_runs' => AiRun::query()->where('workspace_id', $workspace->id)->where('status', 'failed')->count(),
                'prompt_tokens' => (int) AiRun::query()->where('workspace_id', $workspace->id)->sum('prompt_tokens'),
                'completion_tokens' => (int) AiRun::query()->where('workspace_id', $workspace->id)->sum('completion_tokens'),
            ],
        ]);
    }

    public function testRun(Request $request, AiOrchestrator $ai): JsonResponse
    {
        $data = $request->validate([
            'agent_key' => ['required', 'string'],
            'purpose' => ['nullable', 'string'],
            'message' => ['required', 'string'],
            'dry_run' => ['nullable', 'boolean'],
        ]);

        $result = $ai->runAgent(
            $this->workspace($request),
            $data['agent_key'],
            $data['purpose'] ?? 'draft_reply',
            [
                'message' => $data['message'],
                'dry_run' => (bool) ($data['dry_run'] ?? true),
            ]
        );

        return response()->json($result, ($result['ok'] ?? false) ? 200 : 422);
    }

    public function processInbound(Request $request, AiOrchestrator $ai): JsonResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string'],
            'channel' => ['nullable', 'string'],
            'conversation_id' => ['nullable', 'string'],
            'contact_id' => ['nullable', 'string'],
        ]);

        return response()->json($ai->processInbound($this->workspace($request), $data));
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
