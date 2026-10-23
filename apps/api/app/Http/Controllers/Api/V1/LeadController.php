<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\User;
use App\Services\CRM\Zoho\ZohoCrmClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $leads = Lead::query()
            ->where('workspace_id', $workspaceId)
            ->with(['contact:id,name,email'])
            ->orderByDesc('updated_at')
            ->paginate(50);

        return response()->json($leads);
    }

    public function syncZoho(Request $request, string $leadId, ZohoCrmClient $zoho): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $lead = Lead::query()
            ->where('workspace_id', $workspaceId)
            ->with('contact')
            ->findOrFail($leadId);

        $remote = $zoho->upsertLead([
            'name' => $lead->contact?->name,
            'email' => $lead->contact?->email,
            'source_channel' => $lead->source_channel,
            'stage' => $lead->stage,
            'score' => $lead->score,
            'qualification_data' => $lead->qualification_data,
            'external_crm_id' => $lead->external_crm_id,
        ]);

        $lead->forceFill(['external_crm_id' => $remote['id'] ?? null])->save();

        return response()->json([
            'lead' => $lead->fresh('contact'),
            'zoho' => $remote,
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
