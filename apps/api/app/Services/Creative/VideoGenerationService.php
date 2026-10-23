<?php

namespace App\Services\Creative;

use App\Models\ContentItem;
use App\Models\MediaAsset;
use App\Models\Workspace;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Short video / animation generation with production provider adapter + local stub.
 * Without VIDEO_API_KEY writes documented local_sim assets (animated SVG + placeholder mp4 sidecar).
 */
class VideoGenerationService
{
    public function __construct(
        protected JewelleryPromptBuilder $prompts,
        protected CreativeSvgRenderer $svg,
    ) {
    }

    /**
     * @return array{status:string,mode:string,provider:string,configured:bool,message:string}
     */
    public function status(): array
    {
        $provider = strtolower((string) config('creative.video.provider', 'local'));
        $configured = filled(config('creative.video.api_key'));
        $mode = strtolower((string) config('integrations.mode', 'local'));

        if ($provider === 'local' || ! $configured || $mode !== 'live') {
            return [
                'status' => $configured && $mode !== 'live' ? 'local' : ($configured ? 'local' : 'awaiting_credentials'),
                'mode' => 'local_sim',
                'provider' => $provider,
                'configured' => $configured,
                'message' => $configured
                    ? 'VIDEO_API_KEY present but INTEGRATION_MODE is not live — local_sim placeholder video/animation only.'
                    : 'Add VIDEO_PROVIDER + VIDEO_API_KEY for live short video. Local animated SVG + placeholder mp4 stub is operable.',
            ];
        }

        return [
            'status' => 'live',
            'mode' => 'live',
            'provider' => $provider,
            'configured' => true,
            'message' => 'Live video provider path enabled ('.$provider.').',
        ];
    }

    public function usesLocalSimulator(): bool
    {
        return ($this->status()['mode'] ?? 'local_sim') !== 'live';
    }

    /**
     * Marketing animation (animated SVG locally; live video provider when configured).
     *
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string,sidecar:?array}
     */
    public function generateAnimationForContent(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $caption = (string) ($context['caption'] ?? $item->body ?? $item->title ?? '');
        $duration = (int) ($context['duration_ms'] ?? config('creative.video.default_duration_ms', 4000));
        $width = (int) ($context['width'] ?? 1080);
        $height = (int) ($context['height'] ?? 1080);
        $merged = array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name') ?? $context['product'] ?? 'Triada Designs jewellery',
            'duration_ms' => $duration,
            'storyboard' => $context['storyboard'] ?? 'Subtle jewellery motion loop for feed/stories.',
            'format' => 'animation',
        ], $context);

        $prompt = $this->prompts->forVideo($caption, $merged);

        // Local path always produces a first-class animation asset; live still falls back here without keys.
        if ($this->usesLocalSimulator()) {
            return $this->persistAnimationOnly($workspace, $item, $prompt, $width, $height, $duration, $merged);
        }

        try {
            $live = $this->callProvider($prompt.' — short looping marketing animation', $duration);
            if (! ($live['ok'] ?? false)) {
                $local = $this->persistAnimationOnly($workspace, $item, $prompt, $width, $height, $duration, array_merge($merged, [
                    'fallback_reason' => $live['error'] ?? 'provider_failed',
                ]));
                $local['error'] = $live['error'] ?? 'Animation provider failed; wrote local_sim animation.';

                return $local;
            }

            return $this->persistBinary(
                $workspace,
                $item,
                $prompt,
                (string) $live['bytes'],
                (string) ($live['mime_type'] ?? 'video/mp4'),
                $width,
                $height,
                $duration,
                'live',
                (string) config('creative.video.provider', 'video'),
                array_merge($merged, ['kind' => 'animation'])
            );
        } catch (\Throwable $e) {
            Log::warning('creative.animation_failed', ['error' => $e->getMessage()]);
            $local = $this->persistAnimationOnly($workspace, $item, $prompt, $width, $height, $duration, array_merge($merged, [
                'fallback_reason' => $e->getMessage(),
            ]));
            $local['error'] = $e->getMessage();

            return $local;
        }
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string,sidecar:?array}
     */
    public function generateForContent(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $caption = (string) ($context['caption'] ?? $item->body ?? $item->title ?? '');
        $duration = (int) ($context['duration_ms'] ?? config('creative.video.default_duration_ms', 4000));
        $width = (int) ($context['width'] ?? config('creative.video.default_width', 1080));
        $height = (int) ($context['height'] ?? config('creative.video.default_height', 1920));
        $merged = array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name') ?? $context['product'] ?? 'Triada Designs jewellery',
            'duration_ms' => $duration,
            'storyboard' => $context['storyboard'] ?? null,
        ], $context);

        $prompt = $this->prompts->forVideo($caption, $merged);

        if ($this->usesLocalSimulator()) {
            return $this->persistLocalStub($workspace, $item, $prompt, $width, $height, $duration, $merged);
        }

        try {
            $live = $this->callProvider($prompt, $duration);
            if (! ($live['ok'] ?? false)) {
                $local = $this->persistLocalStub($workspace, $item, $prompt, $width, $height, $duration, array_merge($merged, [
                    'fallback_reason' => $live['error'] ?? 'provider_failed',
                ]));
                $local['error'] = $live['error'] ?? 'Video provider failed; wrote local_sim stub.';

                return $local;
            }

            return $this->persistBinary(
                $workspace,
                $item,
                $prompt,
                (string) $live['bytes'],
                (string) ($live['mime_type'] ?? 'video/mp4'),
                $width,
                $height,
                $duration,
                'live',
                (string) config('creative.video.provider', 'video'),
                $merged
            );
        } catch (\Throwable $e) {
            Log::warning('creative.video_failed', ['error' => $e->getMessage()]);
            $local = $this->persistLocalStub($workspace, $item, $prompt, $width, $height, $duration, array_merge($merged, [
                'fallback_reason' => $e->getMessage(),
            ]));
            $local['error'] = $e->getMessage();

            return $local;
        }
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string,sidecar:?array}
     */
    protected function persistAnimationOnly(
        Workspace $workspace,
        ContentItem $item,
        string $prompt,
        int $width,
        int $height,
        int $durationMs,
        array $context
    ): array {
        $disk = (string) config('creative.storage_disk', 'public');
        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $id = (string) Str::ulid();
        $animPath = $prefix.'/animation/'.$id.'.svg';
        $product = (string) ($context['product'] ?? 'Triada Designs');

        Storage::disk($disk)->put($animPath, $this->svg->animated($width, $height, $product, $prompt));

        $status = $this->status();
        $asset = MediaAsset::query()->create([
            'workspace_id' => $workspace->id,
            'content_item_id' => $item->id,
            'kind' => 'animation',
            'provider' => (string) ($status['provider'] ?? 'local'),
            'status' => 'ready',
            'mode' => 'local_sim',
            'mime_type' => 'image/svg+xml',
            'disk' => $disk,
            'path' => $animPath,
            'url' => '/storage/'.$animPath,
            'width' => $width,
            'height' => $height,
            'aspect_ratio' => $width === $height ? '1:1' : '9:16',
            'duration_ms' => $durationMs,
            'prompt' => $prompt,
            'metadata' => [
                'product' => $product,
                'storyboard' => $context['storyboard'] ?? null,
                'format' => 'animation',
                'provider_status' => $status,
                'note' => 'local_sim CSS-animated SVG — replace with VIDEO_API_KEY for live motion',
            ],
        ]);

        return [
            'ok' => true,
            'asset' => $asset,
            'mode' => 'local_sim',
            'prompt' => $prompt,
            'error' => null,
            'sidecar' => [
                'animation_svg' => $animPath,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string,sidecar:?array}
     */
    protected function persistLocalStub(
        Workspace $workspace,
        ContentItem $item,
        string $prompt,
        int $width,
        int $height,
        int $durationMs,
        array $context
    ): array {
        $disk = (string) config('creative.storage_disk', 'local');
        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $id = (string) Str::ulid();
        $animPath = $prefix.'/video/'.$id.'-animation.svg';
        $mp4Path = $prefix.'/video/'.$id.'-placeholder.mp4';
        $readmePath = $prefix.'/video/'.$id.'-README.txt';
        $product = (string) ($context['product'] ?? 'Triada Designs');

        Storage::disk($disk)->put($animPath, $this->svg->animated($width, $height, $product, $prompt));
        // Minimal ISO BMFF "ftyp" stub so the path exists as a documented placeholder mp4.
        Storage::disk($disk)->put($mp4Path, $this->minimalMp4Stub());
        Storage::disk($disk)->put($readmePath, implode("\n", [
            'Triada Designs local_sim video stub',
            'This is not a real rendered clip.',
            'Replace by setting VIDEO_PROVIDER + VIDEO_API_KEY and INTEGRATION_MODE=live.',
            'Companion animated SVG: '.$animPath,
            'Prompt: '.$prompt,
        ]));

        $status = $this->status();
        $asset = MediaAsset::query()->create([
            'workspace_id' => $workspace->id,
            'content_item_id' => $item->id,
            'kind' => 'video',
            'provider' => (string) ($status['provider'] ?? 'local'),
            'status' => 'ready',
            'mode' => 'local_sim',
            'mime_type' => 'image/svg+xml',
            'disk' => $disk,
            'path' => $animPath,
            'url' => '/storage/'.$animPath,
            'width' => $width,
            'height' => $height,
            'aspect_ratio' => '9:16',
            'duration_ms' => $durationMs,
            'prompt' => $prompt,
            'metadata' => [
                'product' => $product,
                'storyboard' => $context['storyboard'] ?? null,
                'placeholder_mp4' => $mp4Path,
                'placeholder_mp4_url' => '/storage/'.$mp4Path,
                'readme' => $readmePath,
                'provider_status' => $status,
                'note' => 'local_sim animation + placeholder mp4 — not a live render',
            ],
        ]);

        return [
            'ok' => true,
            'asset' => $asset,
            'mode' => 'local_sim',
            'prompt' => $prompt,
            'error' => null,
            'sidecar' => [
                'animation_svg' => $animPath,
                'placeholder_mp4' => $mp4Path,
                'readme' => $readmePath,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string,sidecar:?array}
     */
    protected function persistBinary(
        Workspace $workspace,
        ContentItem $item,
        string $prompt,
        string $bytes,
        string $mime,
        int $width,
        int $height,
        int $durationMs,
        string $mode,
        string $provider,
        array $context
    ): array {
        $disk = (string) config('creative.storage_disk', 'local');
        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $ext = str_contains($mime, 'webm') ? 'webm' : 'mp4';
        $path = $prefix.'/video/'.Str::ulid().'.'.$ext;
        Storage::disk($disk)->put($path, $bytes);

        $asset = MediaAsset::query()->create([
            'workspace_id' => $workspace->id,
            'content_item_id' => $item->id,
            'kind' => (string) ($context['kind'] ?? 'video'),
            'provider' => $provider,
            'status' => 'ready',
            'mode' => $mode,
            'mime_type' => $mime,
            'disk' => $disk,
            'path' => $path,
            'url' => '/storage/'.$path,
            'width' => $width,
            'height' => $height,
            'aspect_ratio' => '9:16',
            'duration_ms' => $durationMs,
            'prompt' => $prompt,
            'metadata' => [
                'product' => $context['product'] ?? null,
                'storyboard' => $context['storyboard'] ?? null,
                'format' => $context['format'] ?? ($context['kind'] ?? 'video'),
            ],
        ]);

        return [
            'ok' => true,
            'asset' => $asset,
            'mode' => $mode,
            'prompt' => $prompt,
            'error' => null,
            'sidecar' => null,
        ];
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string}
     */
    protected function callProvider(string $prompt, int $durationMs): array
    {
        $base = rtrim((string) config('creative.video.base_url', ''), '/');
        $key = (string) config('creative.video.api_key', '');
        $model = (string) config('creative.video.model', 'veo-2.0-generate-001');

        if ($base === '' || $key === '') {
            return ['ok' => false, 'error' => 'VIDEO_BASE_URL or VIDEO_API_KEY missing'];
        }

        $response = Http::timeout((int) config('creative.video.timeout', 120))
            ->withToken($key)
            ->post($base.'/v1/videos/generate', [
                'model' => $model,
                'prompt' => $prompt,
                'duration_ms' => $durationMs,
            ]);

        if (! $response->successful()) {
            return ['ok' => false, 'error' => 'Video provider HTTP '.$response->status()];
        }

        $b64 = data_get($response->json(), 'video_base64')
            ?? data_get($response->json(), 'data.0.b64_json');

        if (! is_string($b64) || $b64 === '') {
            return ['ok' => false, 'error' => 'Video provider returned no bytes'];
        }

        $bytes = base64_decode($b64, true);
        if ($bytes === false) {
            return ['ok' => false, 'error' => 'Invalid video base64'];
        }

        return [
            'ok' => true,
            'bytes' => $bytes,
            'mime_type' => (string) (data_get($response->json(), 'mime_type') ?? 'video/mp4'),
        ];
    }

    /**
     * Tiny valid-enough ftyp box so tools can detect an mp4 container stub.
     */
    protected function minimalMp4Stub(): string
    {
        // size(4) + 'ftyp' + 'isom' + minor_version + compatible brands
        return pack('N', 20).'ftyp'.'isom'.pack('N', 0).'isom';
    }
}
