<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Messaging\Channels\ChannelControlPlane;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ChannelIntegrationController extends Controller
{
    public function status(Request $request, ChannelControlPlane $channels): JsonResponse
    {
        return response()->json($channels->status($this->workspace($request)));
    }

    public function connect(Request $request, ChannelControlPlane $channels): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', Rule::in(ChannelControlPlane::CHANNELS)],
            'access_token' => ['nullable', 'string'],
            'bot_token' => ['nullable', 'string'],
            'api_key' => ['nullable', 'string'],
            'external_account_id' => ['nullable', 'string'],
            'display_name' => ['nullable', 'string'],
            'from_address' => ['nullable', 'email'],
            'shop_domain' => ['nullable', 'string'],
            'scopes' => ['nullable', 'array'],
        ]);
        $data['actor_id'] = (string) $request->user()->id;
        $channel = $data['channel'];
        unset($data['channel']);

        return response()->json($channels->connect($this->workspace($request), $channel, $data));
    }

    public function disconnect(Request $request, ChannelControlPlane $channels): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', Rule::in(ChannelControlPlane::CHANNELS)],
        ]);

        return response()->json($channels->disconnect($this->workspace($request), $data['channel']));
    }

    public function simulateInbound(Request $request, ChannelControlPlane $channels): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', Rule::in(ChannelControlPlane::CHANNELS)],
            'body' => ['required', 'string'],
            'external_user_id' => ['nullable', 'string'],
            'contact_name' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
        ]);

        $channel = $data['channel'];
        unset($data['channel']);

        return response()->json($channels->simulateInbound($this->workspace($request), $channel, $data));
    }

    public function ensureWebchatToken(Request $request, ChannelControlPlane $channels): JsonResponse
    {
        return response()->json($channels->ensureWebchatToken($this->workspace($request)));
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
