<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\ContentItem;
use App\Models\Conversation;
use App\Models\Integration;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');

        if (! $workspaceId) {
            return response()->json(['message' => 'No workspace membership.'], 403);
        }

        $conversations = Conversation::query()->where('workspace_id', $workspaceId);
        $openConversations = (clone $conversations)->where('status', 'open')->count();
        $unanswered = (clone $conversations)
            ->where('status', 'open')
            ->where('automation_mode', 'ai')
            ->whereNotNull('last_inbound_at')
            ->count();
        $humanEscalations = (clone $conversations)->where('automation_mode', 'human')->count();
        $aiHandled = (clone $conversations)->where('automation_mode', 'ai')->count();

        return response()->json([
            'workspace_id' => $workspaceId,
            'metrics' => [
                'total_conversations' => (clone $conversations)->count(),
                'open_conversations' => $openConversations,
                'unanswered_conversations' => $unanswered,
                'ai_handled_conversations' => $aiHandled,
                'human_escalations' => $humanEscalations,
                'contacts' => Contact::query()->where('workspace_id', $workspaceId)->count(),
                'new_leads' => Lead::query()->where('workspace_id', $workspaceId)->where('stage', 'new_lead')->count(),
                'qualified_leads' => Lead::query()->where('workspace_id', $workspaceId)->where('stage', 'qualified')->count(),
                'open_tasks' => Task::query()->where('workspace_id', $workspaceId)->where('status', 'open')->count(),
                'content_awaiting_approval' => ContentItem::query()->where('workspace_id', $workspaceId)->where('status', 'in_review')->count(),
                'integration_failures' => Integration::query()->where('workspace_id', $workspaceId)->whereNotNull('last_error_code')->count(),
            ],
            'channel_health' => Integration::query()
                ->where('workspace_id', $workspaceId)
                ->get(['id', 'provider', 'display_name', 'status', 'last_health_check_at', 'last_error_code']),
            'notes' => [
                'All metrics are derived from persisted demo or live records.',
                'Estimated AI cost is omitted until LLM usage events are recorded.',
            ],
        ]);
    }
}
