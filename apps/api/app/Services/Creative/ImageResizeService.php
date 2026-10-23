<?php

namespace App\Services\Creative;

use App\Models\ContentVariant;
use App\Models\MediaAsset;
use App\Models\Workspace;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Resize media into platform variants.
 * Prefers PHP GD/Imagick when available; otherwise SVG viewBox rewrite or Node sharp helper.
 */
class ImageResizeService
{
    public function __construct(
        protected PlatformSizeCatalog $sizes,
        protected CreativeSvgRenderer $svg,
    ) {
    }

    public function engine(): string
    {
        if (extension_loaded('gd') && function_exists('imagecreatetruecolor')) {
            return 'gd';
        }
        if (extension_loaded('imagick') && class_exists(\Imagick::class)) {
            return 'imagick';
        }
        if ($this->sharpHelperAvailable()) {
            return 'sharp_node';
        }

        return 'svg_viewbox';
    }

    /**
     * @param  list<string>|null  $platformTargets
     * @return list<ContentVariant>
     */
    public function generateVariants(
        Workspace $workspace,
        MediaAsset $source,
        ?array $platformTargets = null,
        ?string $contentItemId = null
    ): array {
        $targets = $this->sizes->resolve($platformTargets);
        $variants = [];
        $engine = $this->engine();

        foreach ($targets as $key => $spec) {
            $width = (int) $spec['width'];
            $height = (int) $spec['height'];
            $aspect = (string) $spec['aspect'];

            $resized = $this->resizeAsset($source, $width, $height, $key, $engine);

            $variantAsset = MediaAsset::query()->create([
                'workspace_id' => $workspace->id,
                'content_item_id' => $contentItemId ?? $source->content_item_id,
                'kind' => 'image',
                'provider' => $source->provider,
                'status' => 'ready',
                'mode' => $source->mode === 'live' && $engine !== 'svg_viewbox' ? $source->mode : ($source->mode ?: 'local_sim'),
                'mime_type' => $resized['mime_type'],
                'disk' => $resized['disk'],
                'path' => $resized['path'],
                'url' => $resized['url'],
                'width' => $width,
                'height' => $height,
                'aspect_ratio' => $aspect,
                'prompt' => $source->prompt,
                'metadata' => [
                    'platform_target' => $key,
                    'source_media_asset_id' => $source->id,
                    'resize_engine' => $engine,
                    'label' => $spec['label'] ?? $key,
                ],
            ]);

            $variants[] = ContentVariant::query()->create([
                'workspace_id' => $workspace->id,
                'content_item_id' => $contentItemId ?? $source->content_item_id,
                'source_media_asset_id' => $source->id,
                'media_asset_id' => $variantAsset->id,
                'platform_target' => $key,
                'width' => $width,
                'height' => $height,
                'aspect_ratio' => $aspect,
                'status' => 'ready',
                'mode' => $variantAsset->mode,
                'metadata' => [
                    'label' => $spec['label'] ?? $key,
                    'resize_engine' => $engine,
                ],
            ]);
        }

        return $variants;
    }

    /**
     * @return array{path:string,url:?string,disk:string,mime_type:string}
     */
    protected function resizeAsset(MediaAsset $source, int $width, int $height, string $targetKey, string $engine): array
    {
        $disk = (string) config('creative.storage_disk', 'local');
        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $filename = $prefix.'/variants/'.Str::ulid().'-'.$targetKey.'.svg';
        $sourcePath = $source->path;

        if ($engine === 'gd' && $sourcePath && Storage::disk($disk)->exists($sourcePath)) {
            $result = $this->resizeWithGd($disk, $sourcePath, $width, $height, $targetKey);
            if ($result) {
                return $result;
            }
        }

        if ($engine === 'sharp_node' && $sourcePath && Storage::disk($disk)->exists($sourcePath)) {
            $result = $this->resizeWithSharp($disk, $sourcePath, $width, $height, $targetKey);
            if ($result) {
                return $result;
            }
        }

        // SVG viewBox / placeholder path — always available without GD.
        $svg = $this->svg->canvas(
            $width,
            $height,
            (string) ($source->metadata['product'] ?? 'Triada Designs'),
            $targetKey,
            (string) ($source->prompt ?? '')
        );
        Storage::disk($disk)->put($filename, $svg);

        return [
            'path' => $filename,
            'url' => '/storage/'.$filename,
            'disk' => $disk,
            'mime_type' => 'image/svg+xml',
        ];
    }

    /**
     * @return array{path:string,url:?string,disk:string,mime_type:string}|null
     */
    protected function resizeWithGd(string $disk, string $sourcePath, int $width, int $height, string $targetKey): ?array
    {
        if (! function_exists('imagecreatetruecolor')) {
            return null;
        }

        $absolute = Storage::disk($disk)->path($sourcePath);
        $info = @getimagesize($absolute);
        if (! $info) {
            return null;
        }

        $src = match ($info[2] ?? null) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($absolute),
            IMAGETYPE_PNG => @imagecreatefrompng($absolute),
            IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($absolute) : false,
            default => false,
        };

        if (! $src) {
            return null;
        }

        $dst = imagecreatetruecolor($width, $height);
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $width, $height, imagesx($src), imagesy($src));

        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $filename = $prefix.'/variants/'.Str::ulid().'-'.$targetKey.'.png';
        $outAbsolute = Storage::disk($disk)->path($filename);
        @mkdir(dirname($outAbsolute), 0775, true);
        imagepng($dst, $outAbsolute);
        imagedestroy($src);
        imagedestroy($dst);

        return [
            'path' => $filename,
            'url' => '/storage/'.$filename,
            'disk' => $disk,
            'mime_type' => 'image/png',
        ];
    }

    /**
     * @return array{path:string,url:?string,disk:string,mime_type:string}|null
     */
    protected function resizeWithSharp(string $disk, string $sourcePath, int $width, int $height, string $targetKey): ?array
    {
        $helper = base_path('scripts/resize-image.mjs');
        if (! is_file($helper)) {
            return null;
        }

        $prefix = trim((string) config('creative.public_path_prefix', 'creative'), '/');
        $filename = $prefix.'/variants/'.Str::ulid().'-'.$targetKey.'.png';
        $in = Storage::disk($disk)->path($sourcePath);
        $out = Storage::disk($disk)->path($filename);
        @mkdir(dirname($out), 0775, true);

        $result = Process::timeout(30)->run([
            'node',
            $helper,
            '--input',
            $in,
            '--output',
            $out,
            '--width',
            (string) $width,
            '--height',
            (string) $height,
        ]);

        if (! $result->successful() || ! is_file($out)) {
            return null;
        }

        return [
            'path' => $filename,
            'url' => '/storage/'.$filename,
            'disk' => $disk,
            'mime_type' => 'image/png',
        ];
    }

    protected function sharpHelperAvailable(): bool
    {
        $helper = base_path('scripts/resize-image.mjs');
        if (! is_file($helper)) {
            return false;
        }

        $webSharp = base_path('../web/node_modules/sharp');

        return is_dir($webSharp);
    }

}
