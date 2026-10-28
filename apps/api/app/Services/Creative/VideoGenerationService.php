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
 * Dual-path video pixels (step 2).
 * Scripts/storyboards come from VideoScriptService (Anthropic). Claude cannot render frames —
 * this service needs VIDEO_PROVIDER=local|animation|http|gemini|veo|runway|luma.
 */
class VideoGenerationService
{
    public function __construct(
        protected JewelleryPromptBuilder $prompts,
        protected CreativeSvgRenderer $svg,
    ) {
    }

    /**
     * @return array{
     *   status:string,
     *   mode:string,
     *   provider:string,
     *   configured:bool,
     *   message:string,
     *   dual_path:array<string,mixed>,
     *   engine_hint:string
     * }
     */
    public function status(): array
    {
        $provider = $this->normalizeProvider((string) config('creative.video.provider', 'local'));
        $configured = $this->hasApiKey($provider);
        $mode = strtolower((string) config('integrations.mode', 'local'));
        $dual = [
            'scripts' => 'Anthropic (Claude) via Integrations / ANTHROPIC_API_KEY — scripts & storyboards only',
            'pixels' => 'VIDEO_PROVIDER + VIDEO_API_KEY (or GEMINI_API_KEY for veo/gemini) — Claude cannot render video alone',
            'local_fallback' => 'local / animation → SVG motion + placeholder mp4 (already in creative AI)',
            'providers' => ['local', 'animation', 'http', 'gemini', 'veo', 'runway', 'luma'],
        ];

        if (in_array($provider, ['local', 'animation'], true) || ! $configured || $mode !== 'live') {
            $awaiting = ! $configured && ! in_array($provider, ['local', 'animation'], true);

            return [
                'status' => $awaiting ? 'awaiting_credentials' : 'local',
                'mode' => 'local_sim',
                'provider' => $provider,
                'configured' => $configured || in_array($provider, ['local', 'animation'], true),
                'message' => $awaiting
                    ? 'Add VIDEO_PROVIDER (runway|luma|veo|gemini|http) + VIDEO_API_KEY and INTEGRATION_MODE=live for live pixels. Local animated SVG + placeholder mp4 is operable now.'
                    : ($configured && $mode !== 'live'
                        ? 'VIDEO_API_KEY present but INTEGRATION_MODE is not live — local_sim SVG/animation only.'
                        : 'Local creative animation pipeline active (SVG motion + placeholder mp4). Anthropic still handles scripts when keyed.'),
                'dual_path' => $dual,
                'engine_hint' => 'Claude ≠ video renderer. Wire VIDEO_PROVIDER=runway|luma|veo|gemini|http or keep local animation.',
            ];
        }

        return [
            'status' => 'live',
            'mode' => 'live',
            'provider' => $provider,
            'configured' => true,
            'message' => 'Live video provider path enabled ('.$provider.'). Scripts still come from Anthropic when keyed.',
            'dual_path' => $dual,
            'engine_hint' => '',
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
        $duration = (int) ($context['duration_ms'] ?? config('creative.video.default_duration_ms', 8000));
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

        $prompt = (string) ($context['video_prompt'] ?? $this->prompts->forVideo($caption, $merged));

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
                (string) ($this->status()['provider'] ?? 'video'),
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
        $duration = (int) ($context['duration_ms'] ?? config('creative.video.default_duration_ms', 8000));
        $width = (int) ($context['width'] ?? config('creative.video.default_width', 1080));
        $height = (int) ($context['height'] ?? config('creative.video.default_height', 1920));
        $merged = array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name') ?? $context['product'] ?? 'Triada Designs jewellery',
            'duration_ms' => $duration,
            'storyboard' => $context['storyboard'] ?? null,
            'style' => $context['style'] ?? 'editorial',
        ], $context);

        $prompt = (string) ($context['video_prompt'] ?? $this->prompts->forVideo($caption, $merged));

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
                (string) ($this->status()['provider'] ?? 'video'),
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
                'style' => $context['style'] ?? null,
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
        $style = (string) ($context['style'] ?? 'editorial');

        Storage::disk($disk)->put($animPath, $this->svg->animated($width, $height, $product, $prompt));
        Storage::disk($disk)->put($mp4Path, $this->minimalMp4Stub());
        Storage::disk($disk)->put($readmePath, implode("\n", [
            'Triada Designs local_sim video stub',
            'Claude/Anthropic wrote the script/storyboard only — this file is NOT a live render.',
            'Style: '.$style,
            'Set VIDEO_PROVIDER=runway|luma|veo|gemini|http + VIDEO_API_KEY + INTEGRATION_MODE=live for pixels,',
            'or keep VIDEO_PROVIDER=local|animation for this SVG motion pipeline.',
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
                'style' => $style,
                'script' => $context['script'] ?? null,
                'placeholder_mp4' => $mp4Path,
                'placeholder_mp4_url' => '/storage/'.$mp4Path,
                'readme' => $readmePath,
                'provider_status' => $status,
                'dual_path' => $status['dual_path'] ?? null,
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
                'script' => $context['script'] ?? null,
                'style' => $context['style'] ?? null,
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
     * Route to provider-specific HTTP shapes. Without a compatible response, callers fall back to local_sim.
     *
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,provider?:string}
     */
    protected function callProvider(string $prompt, int $durationMs): array
    {
        $provider = $this->normalizeProvider((string) config('creative.video.provider', 'local'));
        $key = $this->apiKeyFor($provider);
        $model = (string) config('creative.video.model', 'veo-2.0-generate-001');
        $timeout = (int) config('creative.video.timeout', 120);

        if ($key === '' && ! in_array($provider, ['local', 'animation'], true)) {
            return ['ok' => false, 'error' => 'VIDEO_API_KEY missing for provider '.$provider];
        }

        return match ($provider) {
            'runway' => $this->callRunway($prompt, $durationMs, $key, $model, $timeout),
            'luma' => $this->callLuma($prompt, $durationMs, $key, $model, $timeout),
            'gemini', 'veo' => $this->callGeminiVeo($prompt, $durationMs, $key, $model, $timeout),
            default => $this->callGenericHttp($prompt, $durationMs, $key, $model, $timeout),
        };
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,provider?:string}
     */
    protected function callGenericHttp(string $prompt, int $durationMs, string $key, string $model, int $timeout): array
    {
        $base = rtrim((string) config('creative.video.base_url', ''), '/');
        if ($base === '' || $key === '') {
            return ['ok' => false, 'error' => 'VIDEO_BASE_URL or VIDEO_API_KEY missing'];
        }

        $response = Http::timeout($timeout)
            ->withToken($key)
            ->post($base.'/v1/videos/generate', [
                'model' => $model,
                'prompt' => $prompt,
                'duration_ms' => $durationMs,
            ]);

        return $this->decodeVideoResponse($response, 'http');
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,provider?:string}
     */
    protected function callRunway(string $prompt, int $durationMs, string $key, string $model, int $timeout): array
    {
        $base = rtrim((string) (
            config('creative.video.base_url')
            ?: config('creative.video.runway_base_url')
            ?: 'https://api.dev.runwayml.com'
        ), '/');

        $response = Http::timeout($timeout)
            ->withHeaders([
                'Authorization' => 'Bearer '.$key,
                'X-Runway-Version' => '2024-11-06',
                'Content-Type' => 'application/json',
            ])
            ->post($base.'/v1/image_to_video', [
                'model' => $model !== '' && $model !== 'veo-2.0-generate-001' ? $model : 'gen3a_turbo',
                'promptText' => $prompt,
                'duration' => max(2, (int) round($durationMs / 1000)),
            ]);

        // Runway is typically async — accept base64 if present, else surface honest pending/error.
        return $this->decodeVideoResponse($response, 'runway');
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,provider?:string}
     */
    protected function callLuma(string $prompt, int $durationMs, string $key, string $model, int $timeout): array
    {
        $base = rtrim((string) (
            config('creative.video.base_url')
            ?: config('creative.video.luma_base_url')
            ?: 'https://api.lumalabs.ai'
        ), '/');

        $response = Http::timeout($timeout)
            ->withToken($key)
            ->post($base.'/dream-machine/v1/generations', [
                'prompt' => $prompt,
                'model' => $model !== '' && ! str_starts_with($model, 'veo') ? $model : 'ray-2',
                'aspect_ratio' => '9:16',
            ]);

        return $this->decodeVideoResponse($response, 'luma');
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,provider?:string}
     */
    protected function callGeminiVeo(string $prompt, int $durationMs, string $key, string $model, int $timeout): array
    {
        $base = rtrim((string) (
            config('creative.video.base_url')
            ?: config('creative.video.gemini_base_url')
            ?: 'https://generativelanguage.googleapis.com/v1beta'
        ), '/');
        $modelId = $model !== '' ? $model : 'veo-2.0-generate-001';

        // Prefer a gateway that returns video_base64 immediately; document async Veo ops separately.
        $response = Http::timeout($timeout)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post($base.'/models/'.$modelId.':predict?key='.urlencode($key), [
                'instances' => [['prompt' => $prompt]],
                'parameters' => [
                    'durationSeconds' => max(2, (int) round($durationMs / 1000)),
                    'aspectRatio' => '9:16',
                ],
            ]);

        return $this->decodeVideoResponse($response, 'veo');
    }

    /**
     * @param  \Illuminate\Http\Client\Response  $response
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,provider?:string}
     */
    protected function decodeVideoResponse($response, string $provider): array
    {
        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'Video provider '.$provider.' HTTP '.$response->status(),
                'provider' => $provider,
            ];
        }

        $json = $response->json();
        $b64 = data_get($json, 'video_base64')
            ?? data_get($json, 'data.0.b64_json')
            ?? data_get($json, 'output.0.b64')
            ?? data_get($json, 'candidates.0.content.parts.0.inlineData.data');

        if (is_string($b64) && $b64 !== '') {
            $bytes = base64_decode($b64, true);
            if ($bytes === false) {
                return ['ok' => false, 'error' => 'Invalid video base64 from '.$provider, 'provider' => $provider];
            }

            return [
                'ok' => true,
                'bytes' => $bytes,
                'mime_type' => (string) (data_get($json, 'mime_type')
                    ?? data_get($json, 'candidates.0.content.parts.0.inlineData.mimeType')
                    ?? 'video/mp4'),
                'provider' => $provider,
            ];
        }

        $url = data_get($json, 'video_url')
            ?? data_get($json, 'output.0.url')
            ?? data_get($json, 'assets.video')
            ?? data_get($json, 'url');

        if (is_string($url) && str_starts_with($url, 'http')) {
            $download = Http::timeout((int) config('creative.video.timeout', 120))->get($url);
            if ($download->successful() && strlen($download->body()) > 32) {
                return [
                    'ok' => true,
                    'bytes' => $download->body(),
                    'mime_type' => (string) ($download->header('Content-Type') ?: 'video/mp4'),
                    'provider' => $provider,
                ];
            }
        }

        // Async job ids without bytes — honest failure so local_sim stub is written.
        if (data_get($json, 'id') || data_get($json, 'task_id') || data_get($json, 'name')) {
            return [
                'ok' => false,
                'error' => 'Video provider '.$provider.' returned an async job without downloadable bytes yet. Polling not enabled — local_sim stub will be used until a sync gateway or poller is configured.',
                'provider' => $provider,
            ];
        }

        return ['ok' => false, 'error' => 'Video provider '.$provider.' returned no bytes', 'provider' => $provider];
    }

    protected function normalizeProvider(string $provider): string
    {
        $p = strtolower(trim($provider));

        return match ($p) {
            'google', 'google_veo', 'veo-2', 'veo2' => 'veo',
            'runwayml', 'runway_ml' => 'runway',
            'lumalabs', 'dream-machine' => 'luma',
            'generic', 'custom' => 'http',
            'svg', 'ffmpeg', 'anim' => 'animation',
            default => $p !== '' ? $p : 'local',
        };
    }

    protected function hasApiKey(string $provider): bool
    {
        if (in_array($provider, ['local', 'animation'], true)) {
            return true;
        }

        return $this->apiKeyFor($provider) !== '';
    }

    protected function apiKeyFor(string $provider): string
    {
        $primary = trim((string) config('creative.video.api_key', ''));
        if ($primary !== '') {
            return $primary;
        }

        if (in_array($provider, ['gemini', 'veo'], true)) {
            return trim((string) (
                env('GEMINI_API_KEY')
                ?: env('GOOGLE_GEMINI_API_KEY')
                ?: ''
            ));
        }

        return '';
    }

    /**
     * Tiny valid-enough ftyp box so tools can detect an mp4 container stub.
     */
    protected function minimalMp4Stub(): string
    {
        return pack('N', 20).'ftyp'.'isom'.pack('N', 0).'isom';
    }
}
