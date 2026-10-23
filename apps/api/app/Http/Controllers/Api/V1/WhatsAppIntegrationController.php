<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ChannelTemplate;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Messaging\Meta\OutboundEligibility;
use App\Services\Messaging\Meta\WhatsAppCloudTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WhatsAppIntegrationController extends Controller
{
    public function status(WhatsAppCloudTemplateService $wa): JsonResponse
    {
        return response()->json($wa->status());
    }

    public function templates(Request $request, WhatsAppCloudTemplateService $wa): JsonResponse
    {
        $workspace = $this->workspace($request);
        $remote = $wa->listRemote();
        $local = ChannelTemplate::query()
            ->where('workspace_id', $workspace->id)
            ->where('platform', 'whatsapp')
            ->orderBy('name')
            ->get();

        return response()->json([
            'status' => $wa->status(),
            'remote' => $remote,
            'data' => $local,
        ]);
    }

    public function syncTemplates(Request $request, WhatsAppCloudTemplateService $wa): JsonResponse
    {
        $result = $wa->sync($this->workspace($request), (string) $request->user()->id);

        return response()->json($result);
    }

    public function createTemplate(Request $request, WhatsAppCloudTemplateService $wa): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:120'],
            'body' => ['required', 'string', 'max:4000'],
            'language' => ['nullable', 'string', 'max:16'],
            'category' => ['nullable', 'string', 'max:40'],
            'variables' => ['nullable', 'array'],
            'components' => ['nullable', 'array'],
        ]);

        $result = $wa->createAndSubmit(
            $this->workspace($request),
            $data,
            (string) $request->user()->id
        );

        return response()->json($result, ($result['ok'] ?? false) ? 201 : 422);
    }

    public function sendTemplate(Request $request, WhatsAppCloudTemplateService $wa, OutboundEligibility $eligibility): JsonResponse
    {
        $data = $request->validate([
            'to' => ['required', 'string', 'max:40'],
            'template_name' => ['required', 'string', 'max:120'],
            'language' => ['nullable', 'string', 'max:16'],
            'components' => ['nullable', 'array'],
            'conversation_id' => ['nullable', 'string'],
            'purpose' => ['nullable', 'in:transactional,marketing'],
            'consent' => ['nullable', 'boolean'],
            'marketing_opt_out' => ['nullable', 'boolean'],
        ]);

        $workspace = $this->workspace($request);
        $conversation = null;
        if (! empty($data['conversation_id'])) {
            $conversation = \App\Models\Conversation::query()
                ->where('workspace_id', $workspace->id)
                ->find($data['conversation_id']);
        }

        $check = $eligibility->check(
            $workspace,
            $conversation,
            'whatsapp',
            (string) ($data['purpose'] ?? 'marketing'),
            $data['template_name'],
            [
                'consent' => $data['consent'] ?? true,
                'marketing_opt_out' => $data['marketing_opt_out'] ?? false,
                'sender_type' => 'human',
            ]
        );

        if (! $check['eligible']) {
            return response()->json([
                'ok' => false,
                'error' => $check['reason'],
                'eligibility' => $check,
            ], 422);
        }

        $result = $wa->sendTemplate(
            $data['to'],
            $data['template_name'],
            $data['language'] ?? 'en',
            ['components' => $data['components'] ?? []]
        );

        return response()->json(array_merge($result, [
            'eligibility' => $check,
        ]));
    }

    protected function workspace(Request $request): Workspace
    {
        /** @var User $user */
        $user = $request->user();
        $membership = $user->memberships()->with('workspace')->firstOrFail();

        return $membership->workspace;
    }
}
