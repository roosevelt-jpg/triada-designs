<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AgentConfig;
use App\Models\AiRun;
use App\Models\AuditLog;
use App\Models\Contact;
use App\Models\ContentItem;
use App\Models\Conversation;
use App\Models\KnowledgeSource;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Opportunity;
use App\Models\Task;
use App\Models\User;
use App\Models\WorkspaceMembership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Production-shell APIs for agents, knowledge, analytics, team, audit, calendar, opportunities.
 */
class OpsDataController extends Controller
{
    public function agents(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $agents = AgentConfig::query()
            ->where('workspace_id', $workspaceId)
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $agents]);
    }

    public function updateAgent(Request $request, string $agentId): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $data = $request->validate([
            'status' => ['sometimes', 'in:active,paused,draft'],
            'paused' => ['sometimes', 'boolean'],
            'config' => ['sometimes', 'array'],
            'description' => ['sometimes', 'string', 'max:2000'],
            'name' => ['sometimes', 'string', 'max:255'],
        ]);

        $agent = AgentConfig::query()
            ->where('workspace_id', $workspaceId)
            ->findOrFail($agentId);

        if (array_key_exists('paused', $data)) {
            $data['status'] = $data['paused'] ? 'paused' : 'active';
            unset($data['paused']);
        }

        $agent->forceFill($data)->save();

        return response()->json($agent->fresh());
    }

    public function knowledge(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        return response()->json([
            'data' => KnowledgeSource::query()
                ->where('workspace_id', $workspaceId)
                ->orderByDesc('updated_at')
                ->get(),
        ]);
    }

    public function calendar(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $scheduled = ContentItem::query()
            ->where('workspace_id', $workspaceId)
            ->whereNotNull('scheduled_for')
            ->orderBy('scheduled_for')
            ->get();

        $pendingApproval = ContentItem::query()
            ->where('workspace_id', $workspaceId)
            ->whereIn('status', ['draft', 'in_review'])
            ->orderByDesc('updated_at')
            ->get();

        return response()->json([
            'data' => $scheduled,
            'pending_approval' => $pendingApproval,
            'flow' => 'generate → pending approval → calendar date → cron publish',
            'cron' => [
                'path' => '/api/cron/content-publish',
                'note' => 'Vercel Cron publishes due scheduled posts (approval gates enforced).',
            ],
        ]);
    }

    public function campaigns(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $items = ContentItem::query()
            ->where('workspace_id', $workspaceId)
            ->whereIn('content_type', ['campaign', 'social_post', 'email_campaign'])
            ->orderByDesc('updated_at')
            ->get()
            ->groupBy(fn (ContentItem $item) => $item->objective ?: 'general')
            ->map(fn ($group, $objective) => [
                'objective' => $objective,
                'items' => $group->values(),
                'count' => $group->count(),
            ])
            ->values();

        return response()->json(['data' => $items]);
    }

    public function analytics(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $byChannel = Conversation::query()
            ->where('workspace_id', $workspaceId)
            ->selectRaw('channel, count(*) as total')
            ->groupBy('channel')
            ->pluck('total', 'channel');

        return response()->json([
            'metrics' => [
                'conversations' => Conversation::query()->where('workspace_id', $workspaceId)->count(),
                'messages' => Message::query()->where('workspace_id', $workspaceId)->count(),
                'contacts' => Contact::query()->where('workspace_id', $workspaceId)->count(),
                'leads' => Lead::query()->where('workspace_id', $workspaceId)->count(),
                'open_tasks' => Task::query()->where('workspace_id', $workspaceId)->where('status', 'open')->count(),
                'opportunities' => Opportunity::query()->where('workspace_id', $workspaceId)->count(),
                'content_items' => ContentItem::query()->where('workspace_id', $workspaceId)->count(),
                'human_takeovers' => Conversation::query()->where('workspace_id', $workspaceId)->where('automation_mode', 'human')->count(),
                'ai_runs' => AiRun::query()->where('workspace_id', $workspaceId)->count(),
                'ai_prompt_tokens' => (int) AiRun::query()->where('workspace_id', $workspaceId)->sum('prompt_tokens'),
                'ai_completion_tokens' => (int) AiRun::query()->where('workspace_id', $workspaceId)->sum('completion_tokens'),
            ],
            'conversations_by_channel' => $byChannel,
            'notes' => [
                'Metrics are derived from persisted workspace records only.',
                'AI cost and live Meta delivery rates appear after usage events and live credentials.',
            ],
        ]);
    }

    public function team(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $members = WorkspaceMembership::query()
            ->where('workspace_id', $workspaceId)
            ->with(['user:id,name,email,last_login_at', 'role:id,name,permissions'])
            ->get()
            ->map(fn (WorkspaceMembership $m) => [
                'id' => $m->id,
                'status' => $m->status,
                'user' => $m->user,
                'role' => $m->role,
            ]);

        return response()->json(['data' => $members]);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $logs = AuditLog::query()
            ->where('workspace_id', $workspaceId)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json(['data' => $logs]);
    }

    public function opportunities(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        return response()->json([
            'data' => Opportunity::query()
                ->where('workspace_id', $workspaceId)
                ->with('contact:id,name,email')
                ->orderByDesc('updated_at')
                ->get(),
        ]);
    }

    protected function workspaceId(Request $request): string
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');
        abort_unless($workspaceId, 403, 'No workspace membership.');

        return (string) $workspaceId;
    }
}
