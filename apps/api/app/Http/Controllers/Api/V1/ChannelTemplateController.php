<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ChannelTemplate;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Templates\ChannelTemplateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChannelTemplateController extends Controller
{
    public function index(Request $request, ChannelTemplateService $templates): JsonResponse
    {
        $platform = $request->query('platform');
        $items = $templates->list(
            $this->workspace($request),
            is_string($platform) && $platform !== '' ? $platform : null
        );

        return response()->json([
            'data' => array_map(fn (ChannelTemplate $t) => $this->serialize($t), $items),
            'meta' => [
                'platforms' => ChannelTemplateService::PLATFORMS,
                'statuses' => ['draft', 'pending_approval', 'approved', 'published', 'rejected'],
            ],
        ]);
    }

    public function store(Request $request, ChannelTemplateService $templates): JsonResponse
    {
        $data = $request->validate([
            'platform' => ['required', 'in:'.implode(',', ChannelTemplateService::PLATFORMS)],
            'name' => ['required', 'string', 'max:160'],
            'slug' => ['nullable', 'string', 'max:160'],
            'category' => ['nullable', 'string', 'max:80'],
            'language' => ['nullable', 'string', 'max:16'],
            'body' => ['required', 'string'],
            'variables' => ['nullable', 'array'],
            'metadata' => ['nullable', 'array'],
        ]);

        $template = $templates->create(
            $this->workspace($request),
            $data,
            (string) $request->user()->id
        );

        return response()->json(['template' => $this->serialize($template)], 201);
    }

    public function show(Request $request, string $templateId): JsonResponse
    {
        $template = $this->find($request, $templateId);

        return response()->json(['template' => $this->serialize($template)]);
    }

    public function update(Request $request, string $templateId, ChannelTemplateService $templates): JsonResponse
    {
        $template = $this->find($request, $templateId);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'category' => ['nullable', 'string', 'max:80'],
            'language' => ['nullable', 'string', 'max:16'],
            'body' => ['sometimes', 'string'],
            'variables' => ['nullable', 'array'],
            'metadata' => ['nullable', 'array'],
        ]);

        $updated = $templates->update($template, $data, (string) $request->user()->id);

        return response()->json(['template' => $this->serialize($updated)]);
    }

    public function submitReview(Request $request, string $templateId, ChannelTemplateService $templates): JsonResponse
    {
        $template = $this->find($request, $templateId);
        $updated = $templates->submitForApproval($template, (string) $request->user()->id);

        return response()->json(['template' => $this->serialize($updated)]);
    }

    public function approve(Request $request, string $templateId, ChannelTemplateService $templates): JsonResponse
    {
        $template = $this->find($request, $templateId);
        $updated = $templates->approve($template, (string) $request->user()->id);

        return response()->json(['template' => $this->serialize($updated)]);
    }

    public function reject(Request $request, string $templateId, ChannelTemplateService $templates): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);
        $template = $this->find($request, $templateId);
        $updated = $templates->reject(
            $template,
            (string) $request->user()->id,
            $data['reason'] ?? null
        );

        return response()->json(['template' => $this->serialize($updated)]);
    }

    public function publish(Request $request, string $templateId, ChannelTemplateService $templates): JsonResponse
    {
        $template = $this->find($request, $templateId);
        $result = $templates->publish($template, (string) $request->user()->id);

        if (! $result['ok']) {
            return response()->json([
                'message' => $result['error'],
                'template' => $this->serialize($result['template']),
            ], 422);
        }

        return response()->json([
            'template' => $this->serialize($result['template']),
            'mode' => $result['mode'],
            'external_template_id' => $result['external_template_id'],
        ]);
    }

    protected function find(Request $request, string $templateId): ChannelTemplate
    {
        return ChannelTemplate::query()
            ->where('workspace_id', $this->workspace($request)->id)
            ->findOrFail($templateId);
    }

    protected function workspace(Request $request): Workspace
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');
        abort_unless($workspaceId, 403, 'No workspace membership.');

        return Workspace::query()->findOrFail($workspaceId);
    }

    /**
     * @return array<string, mixed>
     */
    protected function serialize(ChannelTemplate $template): array
    {
        return [
            'id' => $template->id,
            'platform' => $template->platform,
            'name' => $template->name,
            'slug' => $template->slug,
            'category' => $template->category,
            'language' => $template->language,
            'status' => $template->status,
            'body' => $template->body,
            'variables' => $template->variables ?? [],
            'metadata' => $template->metadata ?? [],
            'external_template_id' => $template->external_template_id,
            'approved_at' => optional($template->approved_at)?->toIso8601String(),
            'published_at' => optional($template->published_at)?->toIso8601String(),
            'publish_mode' => $template->publish_mode,
            'last_publish_error' => $template->last_publish_error,
            'created_at' => optional($template->created_at)?->toIso8601String(),
            'updated_at' => optional($template->updated_at)?->toIso8601String(),
        ];
    }
}
