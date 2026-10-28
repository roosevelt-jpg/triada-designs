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
        protected VideoScriptService $scripts,
        protected JewelleryPromptBuilder $prompts,
        protected PlatformSizeCatalog $sizes,
    ) {
    }

    /**
     * @return array{image:array,video:array,resize_engine:string,platforms:array,dual_path:array,honesty:string,summary:string}
     */
    public function status(): array
    {
        $video = $this->videos->status();

        return [
            'image' => $this->images->status(),
            'video' => $video,
            'resize_engine' => $this->resize->engine(),
            'platforms' => $this->sizes->all(),
            'dual_path' => [
                'scripts' => 'Anthropic Claude (Integrations) — captions, UGC scripts, storyboards',
                'pixels' => $video['dual_path']['pixels'] ?? 'VIDEO_PROVIDER for video frames',
                'local_animation' => 'VIDEO_PROVIDER=local|animation uses existing creative SVG motion + mp4 stub',
                'claude_alone' => false,
                'note' => 'Claude cannot render video pixels. Admin needs a video provider OR the local animation pipeline — not Claude alone.',
            ],
            'honesty' => 'Creative tools never auto-publish. Human approval + calendar schedule remain required before public posts. Claude writes scripts only.',
            'summary' => 'Dual path: Anthropic scripts/storyboards → VIDEO_PROVIDER (or local animation) for pixels → pending approval → calendar date → cron publish.',
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
     * Dual path: Anthropic script/storyboard → VIDEO_PROVIDER / local animation pixels.
     * Moves draft items into in_review (pending approval) when assets are produced.
     *
     * @param  array<string, mixed>  $context
     * @return array{
     *   ok:bool,
     *   brief:array,
     *   script:?array,
     *   asset:?MediaAsset,
     *   mode:string,
     *   prompt:string,
     *   error:?string,
     *   sidecar:?array,
     *   content:?ContentItem,
     *   dual_path:array
     * }
     */
    public function generateVideo(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $style = strtolower((string) ($context['style'] ?? 'editorial'));
        $caption = (string) ($context['caption'] ?? $item->body ?? '');
        $script = $this->scripts->compose($item, array_merge($context, ['style' => $style]));

        $mergedContext = array_merge($context, [
            'style' => $style,
            'script' => $script['script'],
            'storyboard' => $context['storyboard'] ?? $script['storyboard'],
            'video_prompt' => $script['video_prompt'],
            'caption' => $caption !== '' ? $caption : $script['script'],
        ]);

        $brief = $this->prompts->creativeBrief($caption !== '' ? $caption : $script['script'], array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name'),
            'style' => $style,
            'storyboard' => $mergedContext['storyboard'],
        ], $context));

        $result = $this->videos->generateForContent($workspace, $item, $mergedContext);

        $statusPatch = [];
        if (in_array($item->status, ['draft', ''], true) || $item->status === null) {
            $statusPatch['status'] = 'in_review';
        }

        $item->forceFill(array_merge([
            'creative_brief' => array_merge($item->creative_brief ?? [], [
                'video' => $brief,
                'ugc_script' => $script,
                'updated_at' => now()->toIso8601String(),
            ]),
        ], $statusPatch))->save();

        return [
            'ok' => (bool) ($result['ok'] ?? false),
            'brief' => $brief,
            'script' => $script,
            'asset' => $result['asset'] ?? null,
            'mode' => (string) ($result['mode'] ?? 'local_sim'),
            'prompt' => $result['prompt'] ?? $script['video_prompt'],
            'error' => $result['error'] ?? null,
            'sidecar' => $result['sidecar'] ?? null,
            'content' => $item->fresh(),
            'dual_path' => [
                'script_mode' => $script['mode'],
                'script_provider' => $script['provider'],
                'pixel_mode' => $result['mode'] ?? 'local_sim',
                'pixel_provider' => data_get($result, 'asset.provider') ?? config('creative.video.provider'),
                'claude_renders_pixels' => false,
            ],
        ];
    }

    /**
     * UGC-style short video: force style=ugc, ensure in_review for admin approval.
     *
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function generateUgcVideo(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $result = $this->generateVideo($workspace, $item, array_merge($context, [
            'style' => 'ugc',
            'duration_ms' => (int) ($context['duration_ms'] ?? 8000),
        ]));

        $fresh = $item->fresh();
        if ($fresh && ! in_array($fresh->status, ['approved', 'scheduled', 'published'], true)) {
            $fresh->forceFill(['status' => 'in_review'])->save();
            $result['content'] = $fresh->fresh();
        }

        $result['flow'] = 'generate → pending approval (in_review) → calendar date → publish on schedule';
        $result['note'] = 'UGC video draft queued for admin approval. Claude wrote the script; pixels used VIDEO_PROVIDER or local animation.';

        return $result;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,brief:array,asset:?MediaAsset,mode:string,error:?string,sidecar:?array}
     */
    public function generateAnimation(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $caption = (string) ($context['caption'] ?? $item->body ?? '');
        $brief = $this->prompts->creativeBrief($caption, array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name'),
        ], $context));

        $item->forceFill([
            'creative_brief' => array_merge($item->creative_brief ?? [], [
                'animation' => $brief,
                'updated_at' => now()->toIso8601String(),
            ]),
        ])->save();

        $result = $this->videos->generateAnimationForContent($workspace, $item, $context);

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
     * Ensure every post has post-aligned image + platform variants (+ optional video/animation).
     * Used by Content Studio, agents, automations, and seed so creatives exist for every item.
     *
     * @param  array<string, mixed>  $options
     * @return array{
     *   ok:bool,
     *   mode:string,
     *   image:?array,
     *   variants:?array,
     *   video:?array,
     *   animation:?array,
     *   error:?string
     * }
     */
    public function ensureCreativePack(Workspace $workspace, ContentItem $item, array $options = []): array
    {
        $withVideo = (bool) ($options['with_video'] ?? true);
        $withAnimation = (bool) ($options['with_animation'] ?? true);
        $force = (bool) ($options['force'] ?? false);

        // Prefer a non-variant source image (variants store platform_target in metadata).
        $existingImage = MediaAsset::query()
            ->where('workspace_id', $workspace->id)
            ->where('content_item_id', $item->id)
            ->where('kind', 'image')
            ->orderByDesc('created_at')
            ->get()
            ->first(fn (MediaAsset $asset) => empty(data_get($asset->metadata, 'platform_target')));

        $imageResult = null;
        if ($force || ! $existingImage) {
            $imageResult = $this->generateImage($workspace, $item, $options);
            if (! ($imageResult['ok'] ?? false)) {
                return [
                    'ok' => false,
                    'mode' => (string) ($imageResult['mode'] ?? 'local_sim'),
                    'image' => $imageResult,
                    'variants' => null,
                    'video' => null,
                    'animation' => null,
                    'error' => $imageResult['error'] ?? 'Image generation failed',
                ];
            }
        } else {
            $imageResult = [
                'ok' => true,
                'asset' => $existingImage,
                'mode' => $existingImage->mode ?: 'local_sim',
                'skipped' => true,
            ];
        }

        $variantCount = ContentVariant::query()
            ->where('workspace_id', $workspace->id)
            ->where('content_item_id', $item->id)
            ->count();

        $variantsResult = null;
        if ($force || $variantCount === 0) {
            $variantsResult = $this->generateVariants(
                $workspace,
                $item,
                data_get($imageResult, 'asset.id'),
                $options['platforms'] ?? null
            );
        } else {
            $variantsResult = [
                'ok' => true,
                'variants' => ContentVariant::query()
                    ->where('content_item_id', $item->id)
                    ->get()
                    ->all(),
                'mode' => data_get($imageResult, 'mode', 'local_sim'),
                'skipped' => true,
            ];
        }

        $videoResult = null;
        if ($withVideo) {
            $hasVideo = MediaAsset::query()
                ->where('content_item_id', $item->id)
                ->where('kind', 'video')
                ->exists();
            if ($force || ! $hasVideo) {
                $videoResult = $this->generateVideo($workspace, $item, $options);
            } else {
                $videoResult = ['ok' => true, 'skipped' => true, 'mode' => data_get($imageResult, 'mode', 'local_sim')];
            }
        }

        $animationResult = null;
        if ($withAnimation) {
            $hasAnim = MediaAsset::query()
                ->where('content_item_id', $item->id)
                ->where('kind', 'animation')
                ->exists();
            if ($force || ! $hasAnim) {
                $animationResult = $this->generateAnimation($workspace, $item, $options);
            } else {
                $animationResult = ['ok' => true, 'skipped' => true, 'mode' => data_get($imageResult, 'mode', 'local_sim')];
            }
        }

        return [
            'ok' => true,
            'mode' => (string) (data_get($imageResult, 'mode') ?? 'local_sim'),
            'image' => $imageResult,
            'variants' => $variantsResult,
            'video' => $videoResult,
            'animation' => $animationResult,
            'error' => null,
            'note' => 'Creative pack is draft-only — human approval still required before public publish.',
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
