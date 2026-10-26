<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Integration;
use App\Models\User;
use App\Models\Workspace;
use App\Services\AI\AiOrchestrator;
use App\Services\AI\LlmCredentialStore;
use App\Services\CRM\Zoho\ZohoCrmClient;
use App\Services\Messaging\Meta\MetaControlPlane;
use App\Services\WordPress\WordPressClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $integrations = Integration::query()
            ->where('workspace_id', $workspaceId)
            ->orderBy('provider')
            ->get();

        return response()->json(['data' => $integrations]);
    }

    public function health(
        Request $request,
        WordPressClient $wordpress,
        ZohoCrmClient $zoho,
        MetaControlPlane $meta,
        LlmCredentialStore $llmCreds,
        AiOrchestrator $orchestrator,
    ): JsonResponse {
        $workspaceId = $this->workspaceId($request);
        $workspace = Workspace::query()->findOrFail($workspaceId);

        $wpHealth = $wordpress->healthCheck();
        $zohoHealth = $zoho->healthCheck();
        $metaStatus = $meta->status($workspace);
        $anthropic = $llmCreds->status($workspace);
        $llm = $orchestrator->llmStatus();

        $this->touchHealth($workspaceId, 'wordpress', $wpHealth);
        $this->touchHealth($workspaceId, 'zoho', $zohoHealth);
        $this->touchHealth($workspaceId, 'anthropic', [
            'status' => $anthropic['has_credentials'] ? 'healthy' : 'awaiting_credentials',
            'message' => $anthropic['honesty'] ?? null,
        ]);

        foreach ($metaStatus['channels'] as $channel => $info) {
            $this->touchHealth($workspaceId, $channel, [
                'status' => $info['health']['status'] ?? 'awaiting_credentials',
                'message' => $info['health']['message'] ?? null,
            ]);
        }

        $mode = (string) config('integrations.mode', 'local');
        if ($mode === 'mock') {
            $mode = 'local';
        }

        return response()->json([
            'mode' => $mode,
            'wordpress' => $wpHealth,
            'zoho' => $zohoHealth,
            'meta' => $metaStatus,
            'anthropic' => $anthropic,
            // Active LLM (Anthropic / Gemini / local) — not Anthropic-only.
            'llm' => $llm,
            'wordpress_posts' => $wordpress->listPosts(5),
            'zoho_leads' => $zoho->listRecentLeads(5),
        ]);
    }

    public function anthropicStatus(Request $request, LlmCredentialStore $llmCreds): JsonResponse
    {
        $workspace = Workspace::query()->findOrFail($this->workspaceId($request));

        return response()->json($llmCreds->status($workspace));
    }

    public function saveAnthropic(Request $request, LlmCredentialStore $llmCreds): JsonResponse
    {
        $data = $request->validate([
            'api_key' => ['nullable', 'string', 'max:500'],
            'model' => ['nullable', 'string', 'max:120'],
        ]);

        $workspace = Workspace::query()->findOrFail($this->workspaceId($request));
        $status = $llmCreds->saveAnthropic($workspace, $data);

        return response()->json([
            'ok' => true,
            'anthropic' => $status,
        ]);
    }

    public function clearAnthropic(Request $request, LlmCredentialStore $llmCreds): JsonResponse
    {
        $workspace = Workspace::query()->findOrFail($this->workspaceId($request));

        return response()->json([
            'ok' => true,
            'anthropic' => $llmCreds->clearAnthropic($workspace),
        ]);
    }

    public function wordpressPosts(WordPressClient $wordpress): JsonResponse
    {
        return response()->json([
            'mode' => $wordpress->mode(),
            'data' => $wordpress->listPosts(20),
        ]);
    }

    public function createWordpressDraft(Request $request, WordPressClient $wordpress): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:200'],
            'content' => ['nullable', 'string'],
            'excerpt' => ['nullable', 'string', 'max:500'],
        ]);

        return response()->json($wordpress->createDraft($data), 201);
    }

    /**
     * @param  array{status:string,message?:string}  $health
     */
    protected function touchHealth(string $workspaceId, string $provider, array $health): void
    {
        $integration = Integration::query()
            ->where('workspace_id', $workspaceId)
            ->where('provider', $provider)
            ->first();

        if (! $integration) {
            return;
        }

        $status = match ($health['status']) {
            'healthy' => 'connected',
            'seeded', 'local', 'mock' => 'local',
            'awaiting_credentials' => 'awaiting_credentials',
            default => 'error',
        };

        $integration->forceFill([
            'status' => $status,
            'last_health_check_at' => now(),
            'last_error_code' => $health['status'] === 'error' ? 'health_check_failed' : null,
            'metadata' => array_merge($integration->metadata ?? [], [
                'last_health_message' => $health['message'] ?? null,
            ]),
        ])->save();
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
