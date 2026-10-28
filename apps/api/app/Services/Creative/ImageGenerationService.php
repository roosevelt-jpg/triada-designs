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
                    ? 'Image credentials present but provider is local — jewellery preview only.'
                    : 'Add GEMINI_API_KEY for live photoreal jewellery images.',
                'engine_hint' => 'Set GEMINI_API_KEY (+ optional IMAGE_MODEL) for live pixels.',
            ];
        }

        // Gemini/Imagen pixel path is live whenever keyed (Production Vercel keys).
        if (in_array($provider, ['gemini', 'imagen'], true) && $configured) {
            return [
                'status' => 'live',
                'mode' => 'live',
                'provider' => $provider,
                'configured' => true,
                'message' => 'Live Gemini image path enabled ('.$provider.').',
                'engine_hint' => '',
            ];
        }

        if ($mode !== 'live') {
            return [
                'status' => 'local',
                'mode' => 'local_sim',
                'provider' => $provider,
                'configured' => true,
                'message' => 'Credentials present; INTEGRATION_MODE is not live — local_sim only.',
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
     * Public wrapper for video poster stills (VideoGenerationService fallback).
     *
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,model?:string,provider?:string,path?:string}
     */
    public function callPublicGeminiImageForPoster(string $prompt, int $width = 1080, int $height = 1920): array
    {
        return $this->callGeminiImage($prompt, $width, $height);
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
            $live = $this->callGeminiImage($prompt, $width, $height);
            if (! ($live['ok'] ?? false)) {
                // Honest: do not label SVG as live Gemini success.
                $local = $this->persistLocalSvg($workspace, $item, $prompt, $width, $height, array_merge($merged, [
                    'fallback_reason' => $live['error'] ?? 'provider_failed',
                ]));
                $local['ok'] = false;
                $local['error'] = $live['error'] ?? 'Image provider failed';
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
                (string) ($live['provider'] ?? config('creative.image.provider', 'gemini')),
                array_merge($merged, [
                    'model' => $live['model'] ?? null,
                    'media_path' => $live['path'] ?? null,
                ])
            );
        } catch (\Throwable $e) {
            Log::warning('creative.image_failed', ['error' => $e->getMessage()]);
            $local = $this->persistLocalSvg($workspace, $item, $prompt, $width, $height, array_merge($merged, [
                'fallback_reason' => $e->getMessage(),
            ]));
            $local['ok'] = false;
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
                'realistic_3d' => true,
                'model' => $context['model'] ?? null,
                'media_path' => $context['media_path'] ?? null,
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
     * Cascade: Interactions (Gemini apps path) → generateContent → Imagen predict.
     *
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,model?:string,provider?:string,path?:string}
     */
    protected function callGeminiImage(string $prompt, int $width, int $height): array
    {
        $key = $this->apiKey();
        if ($key === '') {
            return ['ok' => false, 'error' => 'GEMINI_API_KEY missing'];
        }

        $primary = (string) config('creative.image.model', 'gemini-3-pro-image');
        $fallbacks = (array) config('creative.image.fallback_models', []);
        $models = array_values(array_unique(array_filter(array_merge([$primary], $fallbacks))));
        $aspect = $this->aspectRatioLabel($width, $height);
        $errors = [];

        foreach ($models as $model) {
            $model = (string) $model;
            if ($model === '') {
                continue;
            }

            if (str_starts_with($model, 'imagen-')) {
                $imagen = $this->callImagenPredict($prompt, $model, $aspect, $key);
                if ($imagen['ok'] ?? false) {
                    return $imagen;
                }
                $errors[] = $model.': '.($imagen['error'] ?? 'failed');

                continue;
            }

            $interaction = $this->callInteractionsImage($prompt, $model, $aspect, $key);
            if ($interaction['ok'] ?? false) {
                return $interaction;
            }
            $errors[] = 'interactions:'.$model.': '.($interaction['error'] ?? 'failed');

            $gc = $this->callGenerateContentImage($prompt, $model, $aspect, $key);
            if ($gc['ok'] ?? false) {
                return $gc;
            }
            $errors[] = 'generateContent:'.$model.': '.($gc['error'] ?? 'failed');
        }

        return [
            'ok' => false,
            'error' => implode(' | ', array_slice($errors, 0, 6)) ?: 'Gemini image generation failed',
        ];
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,model?:string,provider?:string,path?:string}
     */
    protected function callInteractionsImage(string $prompt, string $model, string $aspect, string $key): array
    {
        $base = rtrim((string) config('creative.image.base_url'), '/');
        $response = Http::timeout((int) config('creative.image.timeout', 90))
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post($base.'/interactions?key='.urlencode($key), [
                'model' => $model,
                'input' => $prompt,
                'response_format' => [
                    'type' => 'image',
                    'aspect_ratio' => $aspect,
                ],
            ]);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'Interactions HTTP '.$response->status(),
                'model' => $model,
            ];
        }

        $json = $response->json();
        $b64 = data_get($json, 'output_image.data')
            ?? data_get($json, 'outputImage.data');
        $mime = data_get($json, 'output_image.mime_type')
            ?? data_get($json, 'outputImage.mimeType')
            ?? 'image/png';

        if (! is_string($b64) || $b64 === '') {
            foreach ((array) data_get($json, 'steps', []) as $step) {
                foreach ((array) data_get($step, 'content', []) as $part) {
                    $type = strtolower((string) data_get($part, 'type', ''));
                    if ($type === 'image' && is_string(data_get($part, 'data'))) {
                        $b64 = (string) data_get($part, 'data');
                        $mime = (string) (data_get($part, 'mime_type') ?: 'image/png');
                        break 2;
                    }
                }
            }
        }

        if (! is_string($b64) || $b64 === '') {
            return ['ok' => false, 'error' => 'Interactions returned no image', 'model' => $model];
        }

        $bytes = base64_decode($b64, true);
        if ($bytes === false) {
            return ['ok' => false, 'error' => 'Invalid image base64', 'model' => $model];
        }

        return [
            'ok' => true,
            'bytes' => $bytes,
            'mime_type' => is_string($mime) ? $mime : 'image/png',
            'model' => $model,
            'provider' => 'gemini',
            'path' => 'interactions',
        ];
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,model?:string,provider?:string,path?:string}
     */
    protected function callGenerateContentImage(string $prompt, string $model, string $aspect, string $key): array
    {
        $base = rtrim((string) config('creative.image.base_url'), '/');
        $response = Http::timeout((int) config('creative.image.timeout', 90))
            ->withHeaders(['Content-Type' => 'application/json'])
            ->post($base.'/models/'.$model.':generateContent?key='.urlencode($key), [
                'contents' => [
                    ['role' => 'user', 'parts' => [['text' => $prompt]]],
                ],
                'generationConfig' => [
                    'responseModalities' => ['TEXT', 'IMAGE'],
                    'imageConfig' => [
                        'aspectRatio' => $aspect,
                    ],
                ],
            ]);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'generateContent HTTP '.$response->status(),
                'model' => $model,
            ];
        }

        $parts = data_get($response->json(), 'candidates.0.content.parts', []);
        foreach ((array) $parts as $part) {
            $b64 = data_get($part, 'inlineData.data') ?? data_get($part, 'inline_data.data');
            if (is_string($b64) && $b64 !== '') {
                $bytes = base64_decode($b64, true);
                if ($bytes === false) {
                    return ['ok' => false, 'error' => 'Invalid generateContent base64', 'model' => $model];
                }

                return [
                    'ok' => true,
                    'bytes' => $bytes,
                    'mime_type' => (string) (
                        data_get($part, 'inlineData.mimeType')
                        ?? data_get($part, 'inline_data.mime_type')
                        ?? 'image/png'
                    ),
                    'model' => $model,
                    'provider' => 'gemini',
                    'path' => 'generateContent',
                ];
            }
        }

        return ['ok' => false, 'error' => 'generateContent returned no image parts', 'model' => $model];
    }

    /**
     * @return array{ok:bool,bytes?:string,mime_type?:string,error?:string,model?:string,provider?:string,path?:string}
     */
    protected function callImagenPredict(string $prompt, string $model, string $aspect, string $key): array
    {
        $base = rtrim((string) config('creative.image.base_url'), '/');
        $response = Http::timeout((int) config('creative.image.timeout', 90))
            ->withHeaders(['x-goog-api-key' => $key])
            ->post($base.'/models/'.$model.':predict', [
                'instances' => [
                    ['prompt' => $prompt],
                ],
                'parameters' => [
                    'sampleCount' => 1,
                    'aspectRatio' => $aspect,
                ],
            ]);

        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'Imagen HTTP '.$response->status(),
                'model' => $model,
            ];
        }

        $b64 = data_get($response->json(), 'predictions.0.bytesBase64Encoded')
            ?? data_get($response->json(), 'predictions.0.image.imageBytes');

        if (! is_string($b64) || $b64 === '') {
            return [
                'ok' => false,
                'error' => 'Imagen returned no image bytes',
                'model' => $model,
            ];
        }

        $bytes = base64_decode($b64, true);
        if ($bytes === false) {
            return ['ok' => false, 'error' => 'Invalid Imagen base64', 'model' => $model];
        }

        return [
            'ok' => true,
            'bytes' => $bytes,
            'mime_type' => 'image/png',
            'model' => $model,
            'provider' => 'imagen',
            'path' => 'predict',
        ];
    }

    protected function hasApiKey(): bool
    {
        return filled($this->apiKey());
    }

    protected function apiKey(): string
    {
        return trim((string) config('creative.image.api_key', ''));
    }

    protected function normalizeProvider(string $provider): string
    {
        $normalized = strtolower(str_replace('-', '_', trim($provider)));

        return match ($normalized) {
            'claude', 'anthropic_claude' => 'anthropic',
            'gemini', 'google', 'imagen', 'google_imagen' => 'gemini',
            'local', 'sim', 'simulator' => 'local',
            default => $normalized !== '' ? $normalized : 'gemini',
        };
    }

    protected function aspectRatioLabel(int $width, int $height): string
    {
        if ($height <= 0) {
            return '1:1';
        }
        $r = $width / $height;
        if (abs($r - 1) < 0.08) {
            return '1:1';
        }
        if ($r < 0.7) {
            return '9:16';
        }
        if ($r > 1.7) {
            return '16:9';
        }
        if ($r > 1.2) {
            return '5:4';
        }
        if ($r < 0.85) {
            return '4:5';
        }

        return '1:1';
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
