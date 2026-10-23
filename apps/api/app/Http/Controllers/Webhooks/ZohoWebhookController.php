<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Integration;
use App\Models\WebhookEvent;
use App\Models\Workspace;
use App\Services\CRM\Zoho\ZohoCrmClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ZohoWebhookController extends Controller
{
    public function __invoke(Request $request, ZohoCrmClient $zoho): JsonResponse
    {
        if (! $zoho->verifyWebhook($request->header('X-Triada-Webhook-Secret'))) {
            return response()->json(['message' => 'Invalid webhook secret.'], 401);
        }

        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return response()->json(['message' => 'Workspace not found.'], 404);
        }

        $integration = Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', 'zoho')
            ->first();

        $providerEventId = (string) ($request->input('event_id') ?: $request->header('X-Zoho-Event-Id') ?: Str::uuid());

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
            'event_type' => (string) $request->input('event', 'crm.record.updated'),
            'payload_hash' => hash('sha256', $request->getContent()),
            'processing_status' => 'queued',
            'attempts' => 0,
            'received_at' => now(),
        ]);

        return response()->json(['ok' => true, 'queued' => true]);
    }
}
