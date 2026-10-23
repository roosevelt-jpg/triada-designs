<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Integration;
use App\Models\WebhookEvent;
use App\Models\Workspace;
use App\Services\WordPress\WordPressClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WordPressWebhookController extends Controller
{
    public function __invoke(Request $request, WordPressClient $wordpress): JsonResponse
    {
        if (! $wordpress->verifyWebhook($request->header('X-Triada-Webhook-Secret'))) {
            return response()->json(['message' => 'Invalid webhook secret.'], 401);
        }

        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return response()->json(['message' => 'Workspace not found.'], 404);
        }

        $integration = Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', 'wordpress')
            ->first();

        $providerEventId = (string) ($request->input('id') ?: $request->header('X-WP-Event-Id') ?: Str::uuid());
        $payloadHash = hash('sha256', $request->getContent());

        $existing = WebhookEvent::query()
            ->where('integration_id', $integration?->id)
            ->where('provider_event_id', $providerEventId)
            ->first();

        if ($existing) {
            return response()->json(['ok' => true, 'deduplicated' => true]);
        }

        WebhookEvent::query()->create([
            'workspace_id' => $workspace->id,
            'integration_id' => $integration?->id,
            'provider_event_id' => $providerEventId,
            'event_type' => (string) $request->input('event', 'post.updated'),
            'payload_hash' => $payloadHash,
            'processing_status' => 'queued',
            'attempts' => 0,
            'received_at' => now(),
        ]);

        return response()->json(['ok' => true, 'queued' => true]);
    }
}
