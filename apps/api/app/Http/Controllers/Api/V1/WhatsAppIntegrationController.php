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

    public function updateTemplate(Request $request, string $templateId, WhatsAppCloudTemplateService $wa): JsonResponse
    {
        $workspace = $this->workspace($request);
        $template = ChannelTemplate::query()
            ->where('workspace_id', $workspace->id)
            ->where('platform', 'whatsapp')
            ->where('id', $templateId)
            ->firstOrFail();

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'body' => ['nullable', 'string', 'max:4000'],
            'language' => ['nullable', 'string', 'max:16'],
            'category' => ['nullable', 'string', 'max:40'],
            'variables' => ['nullable', 'array'],
            'components' => ['nullable', 'array'],
        ]);

        $result = $wa->updateAndSubmit(
            $workspace,
            $template,
            $data,
            (string) $request->user()->id
        );

        return response()->json($result, ($result['ok'] ?? false) ? 200 : 422);
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
            'media_id' => ['nullable', 'string', 'max:120'],
            'header_media_id' => ['nullable', 'string', 'max:120'],
            'media_url' => ['nullable', 'string', 'max:2048'],
            'media_link' => ['nullable', 'string', 'max:2048'],
            'media_type' => ['nullable', 'string', 'max:32'],
            'header_media_type' => ['nullable', 'string', 'max:32'],
            'mime_type' => ['nullable', 'string', 'max:80'],
            'filename' => ['nullable', 'string', 'max:180'],
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
            [
                'components' => $data['components'] ?? [],
                'media_id' => $data['media_id'] ?? $data['header_media_id'] ?? null,
                'header_media_id' => $data['header_media_id'] ?? $data['media_id'] ?? null,
                'media_url' => $data['media_url'] ?? null,
                'media_link' => $data['media_link'] ?? null,
                'media_type' => $data['media_type'] ?? $data['header_media_type'] ?? null,
                'header_media_type' => $data['header_media_type'] ?? $data['media_type'] ?? null,
                'mime_type' => $data['mime_type'] ?? null,
                'filename' => $data['filename'] ?? null,
            ]
        );

        return response()->json(array_merge($result, [
            'eligibility' => $check,
        ]));
    }

    public function uploadMedia(Request $request, \App\Services\Messaging\Meta\MetaGraphClient $graph): JsonResponse
    {
        $data = $request->validate([
            'media_url' => ['nullable', 'string', 'max:2048'],
            'media_base64' => ['nullable', 'string'],
            'mime_type' => ['nullable', 'string', 'max:80'],
            'media_type' => ['nullable', 'string', 'max:32'],
            'filename' => ['nullable', 'string', 'max:180'],
        ]);

        if (empty($data['media_url']) && empty($data['media_base64'])) {
            return response()->json([
                'ok' => false,
                'error' => 'media_url or media_base64 is required.',
            ], 422);
        }

        $contents = null;
        if (! empty($data['media_base64'])) {
            $raw = preg_replace('#^data:[^;]+;base64,#', '', (string) $data['media_base64']);
            $contents = base64_decode((string) $raw, true) ?: null;
        }

        $result = $graph->uploadWhatsAppMedia([
            'url' => $data['media_url'] ?? null,
            'contents' => $contents,
            'mime_type' => $data['mime_type'] ?? null,
            'media_type' => $data['media_type'] ?? null,
            'filename' => $data['filename'] ?? null,
        ]);

        return response()->json($result, ($result['ok'] ?? false) ? 200 : 422);
    }

    public function sendMedia(Request $request, \App\Services\Messaging\Meta\MetaGraphClient $graph, OutboundEligibility $eligibility): JsonResponse
    {
        $data = $request->validate([
            'to' => ['required', 'string', 'max:40'],
            'media_id' => ['nullable', 'string', 'max:120'],
            'media_url' => ['nullable', 'string', 'max:2048'],
            'media_link' => ['nullable', 'string', 'max:2048'],
            'media_type' => ['nullable', 'string', 'max:32'],
            'mime_type' => ['nullable', 'string', 'max:80'],
            'filename' => ['nullable', 'string', 'max:180'],
            'caption' => ['nullable', 'string', 'max:1024'],
            'conversation_id' => ['nullable', 'string'],
            'purpose' => ['nullable', 'in:transactional,marketing'],
            'consent' => ['nullable', 'boolean'],
            'marketing_opt_out' => ['nullable', 'boolean'],
        ]);

        if (empty($data['media_id']) && empty($data['media_url']) && empty($data['media_link'])) {
            return response()->json([
                'ok' => false,
                'error' => 'media_id, media_url, or media_link is required.',
            ], 422);
        }

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
            (string) ($data['purpose'] ?? 'transactional'),
            null,
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

        $result = $graph->sendWhatsApp($data['to'], '', [
            'media_message' => true,
            'media_id' => $data['media_id'] ?? null,
            'media_url' => $data['media_url'] ?? null,
            'media_link' => $data['media_link'] ?? null,
            'media_type' => $data['media_type'] ?? 'image',
            'mime_type' => $data['mime_type'] ?? null,
            'filename' => $data['filename'] ?? null,
            'caption' => $data['caption'] ?? null,
        ]);

        return response()->json(array_merge([
            'ok' => (bool) ($result['ok'] ?? false),
            'mode' => $result['mode'] ?? 'local',
            'provider_message_id' => $result['provider_message_id'] ?? null,
            'media_id' => $result['media_id'] ?? null,
            'error' => $result['error_message'] ?? null,
            'raw' => $result['raw'] ?? [],
            'eligibility' => $check,
        ], []), ($result['ok'] ?? false) ? 200 : 422);
    }

    protected function workspace(Request $request): Workspace
    {
        /** @var User $user */
        $user = $request->user();
        $membership = $user->memberships()->with('workspace')->firstOrFail();

        return $membership->workspace;
    }
}
