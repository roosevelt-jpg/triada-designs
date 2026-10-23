<?php

namespace App\Services\Creative;

use App\Models\ContentItem;
use App\Models\MediaAsset;
use App\Models\Workspace;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImageGenerationService
{
    public function __construct(
        protected JewelleryPromptBuilder $prompts,
        protected CreativeSvgRenderer $svg,
    ) {
    }

    /**
     * @return array{status:string,mode:string,provider:string,configured:bool,message:string,engine_hint:string}
     */
    public function status(): array
    {
        $provider = $this->normalizeProvider((string) config('creative.image.provider', 'gemini'));
        $configured = $this->hasApiKey();
        $mode = strtolower((string) config('integrations.mode', 'local'));

        if ($provider === 'local' || ! $configured) {
            return [
                'status' => $configured ? 'local' : 'awaiting_credentials',
                'mode' => 'local_sim',
                'provider' => $provider,
                'configured' => $configured,
                'message' => $configured
                    ? 'Image API key present but INTEGRATION_MODE is not live — using local jewellery SVG simulator.'
                    : 'Add IMAGE_API_KEY or GEMINI_API_KEY for live image generation. Local jewellery simulator is operable.',
                'engine_hint' => 'Set IMAGE_PROVIDER=gemini, IMAGE_API_KEY (or GEMINI_API_KEY), INTEGRATION_MODE=live.',
            ];
        }

        if ($mode !== 'live') {
            return [
                'status' => 'local',
                'mode' => 'local_sim',
                'provider' => $provider,
                'configured' => true,
                'message' => 'Credentials present; INTEGRATION_MODE is not live — local_sim only. Never report live-healthy without tokens + live mode.',
                'engine_hint' => 'Set INTEGRATION_MODE=live to enable provider calls.',
            ];
        }

        return [
            'status' => 'live',
            'mode' => 'live',
            'provider' => $provider,
            'configured' => true,
            'message' => 'Live image provider path enabled ('.$provider.').',
            'engine_hint' => '',
        ];
    }

    public function usesLocalSimulator(): bool
    {
        $status = $this->status();

        return ($status['mode'] ?? 'local_sim') !== 'live';
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string}
     */
    public function generateForContent(Workspace $workspace, ContentItem $item, array $context = []): array
    {
        $caption = (string) ($context['caption'] ?? $item->body ?? $item->title ?? '');
        $merged = array_merge([
            'objective' => $item->objective,
            'channel' => $item->channel,
            'product' => data_get($item->product_context, 'name')
                ?? data_get($context, 'product')
                ?? 'Triada Designs jewellery',
            'materials' => data_get($item->product_context, 'materials')
                ?? data_get($context, 'materials')
                ?? 'gold, refined stones',
        ], $context);

        $prompt = $this->prompts->forImage($caption, $merged);
        $width = (int) ($context['width'] ?? config('creative.image.default_width', 1080));
        $height = (int) ($context['height'] ?? config('creative.image.default_height', 1080));

        if ($this->usesLocalSimulator()) {
            return $this->persistLocalSvg($workspace, $item, $prompt, $width, $height, $merged);
        }

        try {
            $live = $this->callGeminiImage($prompt);
            if (! ($live['ok'] ?? false)) {
                // Honest fallback — do not pretend live succeeded.
                $local = $this->persistLocalSvg($workspace, $item, $prompt, $width, $height, array_merge($merged, [
                    'fallback_reason' => $live['error'] ?? 'provider_failed',
                ]));
                $local['error'] = $live['error'] ?? 'Image provider failed; wrote local_sim asset.';
                $local['mode'] = 'local_sim';

                return $local;
            }

            return $this->persistBinary(
                $workspace,
                $item,
                $prompt,
                (string) $live['bytes'],
                (string) ($live['mime_type'] ?? 'image/png'),
                $width,
                $height,
                'live',
                (string) config('creative.image.provider', 'gemini'),
                $merged
            );
        } catch (\Throwable $e) {
            Log::warning('creative.image_failed', ['error' => $e->getMessage()]);
            $local = $this->persistLocalSvg($workspace, $item, $prompt, $width, $height, array_merge($merged, [
                'fallback_reason' => $e->getMessage(),
            ]));
            $local['error'] = $e->getMessage();

            return $local;
        }
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string}
     */
    protected function persistLocalSvg(
        Workspace $workspace,
        ContentItem $item,
        string $prompt,
        int $width,
        int $height,
        array $context
    ): array {
        $disk = (string) config('creative.storage_disk', 'local');
        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $path = $prefix.'/images/'.Str::ulid().'.svg';
        $product = (string) ($context['product'] ?? 'Triada Designs');
        $status = $this->status();

        $body = $this->svg->canvas(
            $width,
            $height,
            $product,
            (string) ($item->channel ?? 'social'),
            $prompt
        );

        Storage::disk($disk)->put($path, $body);

        $asset = MediaAsset::query()->create([
            'workspace_id' => $workspace->id,
            'content_item_id' => $item->id,
            'kind' => 'image',
            'provider' => (string) ($status['provider'] ?? 'local'),
            'status' => 'ready',
            'mode' => 'local_sim',
            'mime_type' => 'image/svg+xml',
            'disk' => $disk,
            'path' => $path,
            'url' => '/storage/'.$path,
            'width' => $width,
            'height' => $height,
            'aspect_ratio' => $this->aspect($width, $height),
            'prompt' => $prompt,
            'metadata' => [
                'product' => $product,
                'objective' => $context['objective'] ?? $item->objective,
                'caption' => $item->body,
                'provider_status' => $status,
                'jewellery_aware' => true,
                'fallback_reason' => $context['fallback_reason'] ?? null,
            ],
        ]);

        return [
            'ok' => true,
            'asset' => $asset,
            'mode' => 'local_sim',
            'prompt' => $prompt,
            'error' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{ok:bool,asset:?MediaAsset,mode:string,prompt:string,error:?string}
     */
    protected function persistBinary(
        Workspace $workspace,
        ContentItem $item,
        string $prompt,
        string $bytes,
        string $mime,
        int $width,
        int $height,
        string $mode,
        string $provider,
        array $context
    ): array {
        $disk = (string) config('creative.storage_disk', 'local');
        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $ext = str_contains($mime, 'jpeg') || str_contains($mime, 'jpg') ? 'jpg' : 'png';
        $path = $prefix.'/images/'.Str::ulid().'.'.$ext;
        Storage::disk($disk)->put($path, $bytes);

        $asset = MediaAsset::query()->create([
            'workspace_id' => $workspace->id,
            'content_item_id' => $item->id,
            'kind' => 'image',
            'provider' => $provider,
            'status' => 'ready',
            'mode' => $mode,
            'mime_type' => $mime,
            'disk' => $disk,
            'path' => $path,
            'url' => '/storage/'.$path,
            'width' => $width,
            'height' => $height,
            'aspect_ratio' => $this->aspect($width, $height),
            'prompt' => $prompt,
            'metadata' => [
                'product' => $context['product'] ?? null,
                'jewellery_aware' => true,
            ],
        ]);

        return [
            'ok' => true,
            'asset' => $asset,
            'mode' => $mode,
            'prompt' => $prompt,
            'error' => null,
        ];
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string}
     */
    protected function callGeminiImage(string $prompt): array
    {
        $key = $this->apiKey();
        $model = (string) config('creative.image.model', 'imagen-3.0-generate-002');
        $base = rtrim((string) config('creative.image.base_url'), '/');

        // Imagen predict endpoint (production path). Failures return ok=false — never fake success.
        $url = $base.'/models/'.$model.':predict';

        $response = Http::timeout((int) config('creative.image.timeout', 60))
            ->withHeaders(['x-goog-api-key' => $key])
            ->post($url, [
                'instances' => [
                    ['prompt' => $prompt],
                ],
                'parameters' => [
                    'sampleCount' => 1,
                ],
            ]);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'Image provider HTTP '.$response->status(),
            ];
        }

        $b64 = data_get($response->json(), 'predictions.0.bytesBase64Encoded')
            ?? data_get($response->json(), 'predictions.0.image.imageBytes');

        if (! is_string($b64) || $b64 === '') {
            return [
                'ok' => false,
                'error' => 'Image provider returned no image bytes',
            ];
        }

        $bytes = base64_decode($b64, true);
        if ($bytes === false) {
            return ['ok' => false, 'error' => 'Invalid base64 image payload'];
        }

        return [
            'ok' => true,
            'bytes' => $bytes,
            'mime_type' => 'image/png',
        ];
    }

    protected function hasApiKey(): bool
    {
        return filled(config('creative.image.api_key'));
    }

    protected function apiKey(): string
    {
        return (string) config('creative.image.api_key', '');
    }

    protected function normalizeProvider(string $provider): string
    {
        $normalized = strtolower(str_replace('-', '_', trim($provider)));

        return match ($normalized) {
            'gemini', 'google', 'imagen', 'google_imagen' => 'gemini',
            'local', 'sim', 'simulator' => 'local',
            default => $normalized !== '' ? $normalized : 'gemini',
        };
    }

    protected function aspect(int $width, int $height): string
    {
        if ($height <= 0) {
            return (string) $width;
        }
        $g = $this->gcd($width, $height);

        return ($width / $g).':'.($height / $g);
    }

    protected function gcd(int $a, int $b): int
    {
        while ($b !== 0) {
            [$a, $b] = [$b, $a % $b];
        }

        return max(1, abs($a));
    }
}
