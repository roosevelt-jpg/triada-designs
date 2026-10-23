<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Messaging\DTOs\OutboundMessage;
use App\Services\Messaging\Meta\MetaChannelRegistry;
use App\Services\Messaging\Meta\OutboundEligibility;
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
            ->when($request->string('channel')->toString(), fn ($q, $channel) => $q->where('channel', $channel))
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

    public function reply(
        Request $request,
        string $conversationId,
        MetaChannelRegistry $channels,
        OutboundEligibility $eligibility,
    ): JsonResponse {
        $workspaceId = $this->workspaceId($request);
        $workspace = Workspace::query()->findOrFail($workspaceId);
        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'template_name' => ['nullable', 'string', 'max:120'],
            'purpose' => ['nullable', 'in:transactional,marketing'],
        ]);

        $conversation = Conversation::query()
            ->where('workspace_id', $workspaceId)
            ->findOrFail($conversationId);

        $channel = (string) $conversation->channel;
        $purpose = (string) ($data['purpose'] ?? 'transactional');
        $check = $eligibility->check(
            $workspace,
            $conversation,
            $channel,
            $purpose,
            $data['template_name'] ?? null,
            [
                'automation_mode' => 'human',
                'sender_type' => 'user',
                'consent' => true,
            ]
        );

        // Human staff replies still respect workspace outbound pause + WA template window.
        if (! $check['eligible'] && in_array($check['reason'], ['outbound_paused', 'whatsapp_template_required', 'consent_required', 'marketing_opt_out'], true)) {
            return response()->json([
                'message' => 'Outbound not eligible: '.$check['reason'],
                'eligibility' => $check,
            ], 422);
        }

        $providerMessageId = null;
        $sendMeta = null;
        $deliveryStatus = 'sent';

        if (in_array($channel, ['facebook', 'instagram', 'whatsapp'], true)) {
            $recipient = (string) $conversation->external_conversation_id;
            if (str_contains($recipient, ':')) {
                $recipient = explode(':', $recipient)[1] ?? $recipient;
            }

            $result = $channels->get($channel)->sendMessage(new OutboundMessage(
                channel: $channel,
                recipientExternalId: $recipient ?: 'unknown',
                body: $data['body'],
                templateName: $data['template_name'] ?? null,
                purpose: $purpose,
            ));

            $sendMeta = $result->toArray();
            $providerMessageId = $result->providerMessageId;
            $deliveryStatus = $result->ok ? 'sent' : 'failed';

            if (! $result->ok) {
                return response()->json([
                    'message' => $result->errorMessage ?: 'Failed to send via Meta adapter',
                    'result' => $sendMeta,
                    'eligibility' => $check,
                ], 422);
            }
        }

        $message = Message::query()->create([
            'workspace_id' => $workspaceId,
            'conversation_id' => $conversation->id,
            'provider_message_id' => $providerMessageId,
            'direction' => 'outbound',
            'sender_type' => 'user',
            'sender_id' => (string) $request->user()->id,
            'message_type' => 'text',
            'body' => $data['body'],
            'delivery_status' => $deliveryStatus,
            'provider_timestamp' => now(),
            'metadata' => array_filter([
                'eligibility' => $check,
                'send_result' => $sendMeta,
            ]),
        ]);

        $conversation->forceFill([
            'last_message_at' => now(),
            'automation_mode' => 'human',
            'assigned_user_id' => $request->user()->id,
        ])->save();

        return response()->json($message->fresh(), 201);
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
