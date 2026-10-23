<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Messaging\Meta\MetaControlPlane;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MetaIntegrationController extends Controller
{
    public function status(Request $request, MetaControlPlane $plane): JsonResponse
    {
        return response()->json($plane->status($this->workspace($request)));
    }

    public function connect(Request $request, MetaControlPlane $plane): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', 'in:facebook,instagram,whatsapp'],
            'access_token' => ['nullable', 'string'],
            'external_account_id' => ['nullable', 'string', 'max:120'],
            'display_name' => ['nullable', 'string', 'max:120'],
            'scopes' => ['nullable', 'array'],
            'token_expires_at' => ['nullable', 'date'],
            'verify_token' => ['nullable', 'string', 'max:200'],
            'webhook_subscribed' => ['nullable', 'boolean'],
            'waba_id' => ['nullable', 'string', 'max:120'],
            'phone_number_id' => ['nullable', 'string', 'max:120'],
        ]);

        $data['actor_id'] = (string) $request->user()->id;

        return response()->json(
            $plane->connect($this->workspace($request), $data['channel'], $data)
        );
    }

    public function disconnect(Request $request, MetaControlPlane $plane): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', 'in:facebook,instagram,whatsapp'],
        ]);

        return response()->json(
            $plane->disconnect($this->workspace($request), $data['channel'])
        );
    }

    public function accounts(Request $request, MetaControlPlane $plane): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', 'in:facebook,instagram,whatsapp'],
        ]);

        return response()->json(
            $plane->accounts($this->workspace($request), $data['channel'])
        );
    }

    public function webhook(Request $request, MetaControlPlane $plane): JsonResponse
    {
        return response()->json($plane->webhookInfo($this->workspace($request)));
    }

    public function subscribeWebhook(Request $request, MetaControlPlane $plane): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', 'in:facebook,instagram,whatsapp'],
            'subscribed' => ['required', 'boolean'],
        ]);

        return response()->json(
            $plane->setWebhookSubscription(
                $this->workspace($request),
                $data['channel'],
                (bool) $data['subscribed']
            )
        );
    }

    public function rotateVerifyToken(Request $request, MetaControlPlane $plane): JsonResponse
    {
        return response()->json(
            $plane->rotateVerifyToken($this->workspace($request))
        );
    }

    public function testSend(Request $request, MetaControlPlane $plane): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', 'in:facebook,instagram,whatsapp'],
            'recipient_id' => ['nullable', 'string', 'max:120'],
            'body' => ['nullable', 'string', 'max:2000'],
            'page_or_account_id' => ['nullable', 'string', 'max:120'],
            'template_name' => ['nullable', 'string', 'max:120'],
            'purpose' => ['nullable', 'in:transactional,marketing'],
            'consent' => ['nullable', 'boolean'],
        ]);

        $result = $plane->testSend($this->workspace($request), $data['channel'], $data);
        $status = ($result['ok'] ?? false) ? 200 : 422;

        return response()->json($result, $status);
    }

    public function simulateInbound(Request $request, MetaControlPlane $plane): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', 'in:facebook,instagram,whatsapp'],
            'body' => ['nullable', 'string', 'max:5000'],
            'sender_id' => ['nullable', 'string', 'max:120'],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'provider_message_id' => ['nullable', 'string', 'max:120'],
        ]);

        return response()->json(
            $plane->simulateInbound($this->workspace($request), $data),
            201
        );
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
