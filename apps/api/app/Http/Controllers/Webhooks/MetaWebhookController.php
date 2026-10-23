<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Workspace;
use App\Services\Messaging\Meta\FacebookMessengerAdapter;
use App\Services\Messaging\Meta\MetaControlPlane;
use App\Services\Messaging\Meta\MetaInboundProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class MetaWebhookController extends Controller
{
    public function verify(Request $request, MetaControlPlane $controlPlane): Response|JsonResponse
    {
        $mode = (string) $request->query('hub_mode', $request->query('hub.mode', ''));
        $token = (string) $request->query('hub_verify_token', $request->query('hub.verify_token', ''));
        $challenge = (string) $request->query('hub_challenge', $request->query('hub.challenge', ''));

        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        $expected = $workspace
            ? $controlPlane->resolveVerifyToken($workspace)
            : (string) (config('integrations.meta.verify_token') ?: 'triada-local-verify');

        if ($mode === 'subscribe' && hash_equals($expected, $token)) {
            return response($challenge, 200)->header('Content-Type', 'text/plain');
        }

        return response()->json(['message' => 'Verification failed.'], 403);
    }

    public function ingest(
        Request $request,
        MetaInboundProcessor $processor,
        FacebookMessengerAdapter $facebook,
    ): JsonResponse {
        $raw = $request->getContent();
        $headers = [];
        foreach ($request->headers->all() as $key => $values) {
            $headers[$key] = $values[0] ?? null;
        }

        if (! $facebook->verifyWebhook($headers, $raw)) {
            return response()->json(['message' => 'Invalid Meta webhook signature.'], 401);
        }

        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return response()->json(['message' => 'Workspace not found.'], 404);
        }

        $payload = $request->all();
        $result = $processor->ingest($workspace, $payload, $raw);

        return response()->json($result);
    }
}
