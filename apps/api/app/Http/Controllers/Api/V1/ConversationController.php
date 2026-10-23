<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $conversations = Conversation::query()
            ->where('workspace_id', $workspaceId)
            ->with(['contact:id,name,email,preferred_language'])
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('last_message_at')
            ->paginate(30);

        return response()->json($conversations);
    }

    public function show(Request $request, string $conversationId): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $conversation = Conversation::query()
            ->where('workspace_id', $workspaceId)
            ->with(['contact', 'messages' => fn ($q) => $q->orderBy('created_at')])
            ->findOrFail($conversationId);

        return response()->json($conversation);
    }

    public function takeover(Request $request, string $conversationId): JsonResponse
    {
        return $this->setMode($request, $conversationId, 'human', 'conversation.human_takeover');
    }

    public function resumeAi(Request $request, string $conversationId): JsonResponse
    {
        return $this->setMode($request, $conversationId, 'ai', 'conversation.resume_ai');
    }

    public function reply(Request $request, string $conversationId): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
        ]);

        $conversation = Conversation::query()
            ->where('workspace_id', $workspaceId)
            ->findOrFail($conversationId);

        $message = Message::query()->create([
            'workspace_id' => $workspaceId,
            'conversation_id' => $conversation->id,
            'direction' => 'outbound',
            'sender_type' => 'user',
            'sender_id' => (string) $request->user()->id,
            'message_type' => 'text',
            'body' => $data['body'],
            'delivery_status' => 'sent',
            'provider_timestamp' => now(),
        ]);

        $conversation->forceFill([
            'last_message_at' => now(),
            'automation_mode' => 'human',
        ])->save();

        return response()->json($message, 201);
    }

    protected function setMode(Request $request, string $conversationId, string $mode, string $action): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $conversation = Conversation::query()
            ->where('workspace_id', $workspaceId)
            ->findOrFail($conversationId);

        $conversation->forceFill([
            'automation_mode' => $mode,
            'assigned_user_id' => $mode === 'human' ? $request->user()->id : $conversation->assigned_user_id,
        ])->save();

        AuditLog::query()->create([
            'workspace_id' => $workspaceId,
            'actor_type' => 'user',
            'actor_id' => (string) $request->user()->id,
            'action' => $action,
            'target_type' => 'conversation',
            'target_id' => $conversation->id,
            'created_at' => now(),
            'metadata' => ['automation_mode' => $mode],
        ]);

        return response()->json($conversation->fresh(['contact']));
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
