<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\WebchatWidgetToken;
use App\Models\Workspace;
use App\Services\Messaging\Channels\ChannelControlPlane;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class WebchatPublicController extends Controller
{
    public function send(Request $request, ChannelControlPlane $channels): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'body' => ['required', 'string', 'max:4000'],
            'visitor_id' => ['nullable', 'string', 'max:128'],
            'name' => ['nullable', 'string', 'max:120'],
            'email' => ['nullable', 'email'],
        ]);

        $widget = WebchatWidgetToken::query()
            ->where('public_token', $data['token'])
            ->where('status', 'active')
            ->first();

        if (! $widget) {
            return response()->json(['message' => 'Invalid widget token.'], 401);
        }

        $rateKey = 'webchat-rate:'.$widget->id.':'.($request->ip() ?: 'unknown');
        $count = (int) Cache::get($rateKey, 0);
        if ($count >= (int) $widget->rate_limit_per_minute) {
            return response()->json(['message' => 'Rate limit exceeded.'], 429);
        }
        Cache::put($rateKey, $count + 1, 60);

        $widget->forceFill(['last_used_at' => now()])->save();
        $workspace = Workspace::query()->findOrFail($widget->workspace_id);

        $result = $channels->simulateInbound($workspace, 'webchat', [
            'body' => $data['body'],
            'external_user_id' => $data['visitor_id'] ?? ('visitor-'.substr(hash('sha256', $request->ip().$data['token']), 0, 12)),
            'contact_name' => $data['name'] ?? 'Website visitor',
            'email' => $data['email'] ?? null,
        ]);

        return response()->json([
            'ok' => true,
            'conversation_id' => data_get($result, 'messages.0.conversation.id'),
            'suggested_reply' => data_get($result, 'ai.suggested_reply'),
            'mode' => 'local_or_seeded',
        ]);
    }
}
