<?php

namespace App\Services\Creative;

use App\Models\ContentItem;
use App\Models\ContentVariant;
use App\Models\MediaAsset;
use App\Models\Workspace;

/**
 * Facade for Content Studio creative actions.
 * Approval is still required before public publish — these tools only produce drafts/assets.
 */
class CreativeMediaService
{
    public function __construct(
        protected ImageGenerationService $images,
        protected ImageResizeService $resize,
        protected VideoGenerationService $videos,
        protected JewelleryPromptBuilder $prompts,
        protected PlatformSizeCatalog $sizes,
    ) {
    }

    /**
     * @return array{image:array,video:array,resize_engine:string,platforms:array}
     */
    public function status(): array
    {
        return [
            'image' => $this->images->status(),
            'video' => $this->videos->status(),
            'resize_engine' => $this->resize->engine(),
            'platforms' => $this->sizes->all(),
            'honesty' => 'Creative tools never auto-publish. Human approval remains required before public posts.',
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,brief:array,asset:?MediaAsset,mode:string,error:?string}
     */
    public function generateImage(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $caption = (string) ($context['caption'] ?? $item->body ?? '');
        $brief = $this->prompts->creativeBrief($caption, array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name'),
        ], $context));

        $item->forceFill([
            'creative_brief' => array_merge($item->creative_brief ?? [], [
                'image' => $brief,
                'updated_at' => now()->toIso8601String(),
            ]),
        ])->save();

        $result = $this->images->generateForContent($workspace, $item, $context);

        return [
            'ok' => (bool) ($result['ok'] ?? false),
            'brief' => $brief,
            'asset' => $result['asset'] ?? null,
            'mode' => (string) ($result['mode'] ?? 'local_sim'),
            'prompt' => $result['prompt'] ?? $brief['image_prompt'],
            'error' => $result['error'] ?? null,
        ];
    }

    /**
     * @param  list<string>|null  $platforms
     * @return array{ok:bool,variants:list<ContentVariant>,source:?MediaAsset,mode:string,error:?string}
     */
    public function generateVariants(
        Workspace $workspace,
        ContentItem $item,
        ?string $sourceAssetId = null,
        ?array $platforms = null
    ): array {
        $source = null;
        if ($sourceAssetId) {
            $source = MediaAsset::query()
                ->where('workspace_id', $workspace->id)
                ->where('id', $sourceAssetId)
                ->first();
        }

        if (! $source) {
            $source = MediaAsset::query()
                ->where('workspace_id', $workspace->id)
                ->where('content_item_id', $item->id)
                ->where('kind', 'image')
                ->orderByDesc('created_at')
                ->first();
        }

        if (! $source) {
            $generated = $this->generateImage($workspace, $item);
            $source = $generated['asset'] ?? null;
            if (! $source) {
                return [
                    'ok' => false,
                    'variants' => [],
                    'source' => null,
                    'mode' => 'local_sim',
                    'error' => 'No source image available to resize.',
                ];
            }
        }

        $variants = $this->resize->generateVariants($workspace, $source, $platforms, $item->id);

        return [
            'ok' => true,
            'variants' => $variants,
            'source' => $source,
            'mode' => $source->mode ?: 'local_sim',
            'error' => null,
            'resize_engine' => $this->resize->engine(),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,brief:array,asset:?MediaAsset,mode:string,error:?string,sidecar:?array}
     */
    public function generateVideo(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $caption = (string) ($context['caption'] ?? $item->body ?? '');
        $brief = $this->prompts->creativeBrief($caption, array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name'),
        ], $context));

        $item->forceFill([
            'creative_brief' => array_merge($item->creative_brief ?? [], [
                'video' => $brief,
                'updated_at' => now()->toIso8601String(),
            ]),
        ])->save();

        $result = $this->videos->generateForContent($workspace, $item, $context);

        return [
            'ok' => (bool) ($result['ok'] ?? false),
            'brief' => $brief,
            'asset' => $result['asset'] ?? null,
            'mode' => (string) ($result['mode'] ?? 'local_sim'),
            'prompt' => $result['prompt'] ?? $brief['video_prompt'],
            'error' => $result['error'] ?? null,
            'sidecar' => $result['sidecar'] ?? null,
        ];
    }

    /**
     * @return array{assets:list<MediaAsset>,variants:list<ContentVariant>}
     */
    public function listForContent(Workspace $workspace, ContentItem $item): array
    {
        return [
            'assets' => MediaAsset::query()
                ->where('workspace_id', $workspace->id)
                ->where('content_item_id', $item->id)
                ->orderByDesc('created_at')
                ->get()
                ->all(),
            'variants' => ContentVariant::query()
                ->where('workspace_id', $workspace->id)
                ->where('content_item_id', $item->id)
                ->with('mediaAsset')
                ->orderBy('platform_target')
                ->get()
                ->all(),
        ];
    }
}
