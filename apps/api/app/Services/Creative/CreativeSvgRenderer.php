<?php

namespace App\Services\Creative;

use Illuminate\Support\Str;

class CreativeSvgRenderer
{
    public function canvas(int $width, int $height, string $title, string $target, string $prompt): string
    {
        $safeTitle = htmlspecialchars(Str::limit($title, 48), ENT_QUOTES | ENT_XML1);
        $safeTarget = htmlspecialchars($target, ENT_QUOTES | ENT_XML1);
        $safePrompt = htmlspecialchars(Str::limit($prompt, 160), ENT_QUOTES | ENT_XML1);
        $cx = (int) ($width / 2);
        $cy = (int) ($height / 2.4);
        $radius = (int) (min($width, $height) / 5);
        $titleSize = max(18, (int) ($width * 0.035));
        $metaSize = max(12, (int) ($width * 0.022));
        $promptSize = max(10, (int) ($width * 0.016));

        return <<<SVG
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{$width}" height="{$height}" viewBox="0 0 {$width} {$height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EE"/>
      <stop offset="55%" stop-color="#E8DFD4"/>
      <stop offset="100%" stop-color="#C4A484"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="{$cx}" cy="{$cy}" r="{$radius}" fill="none" stroke="#6B4F3A" stroke-width="3" opacity="0.55"/>
  <text x="50%" y="58%" text-anchor="middle" font-family="Georgia, serif" font-size="{$titleSize}" fill="#3B2A1F">{$safeTitle}</text>
  <text x="50%" y="64%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="{$metaSize}" fill="#6B4F3A">{$safeTarget} · {$width}×{$height}</text>
  <text x="50%" y="72%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="{$promptSize}" fill="#8A7464">{$safePrompt}</text>
  <text x="50%" y="92%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#8A7464">Triada Designs · local_sim creative</text>
</svg>
SVG;
    }

    /**
     * Minimal animated SVG (CSS) used as a local short-animation stand-in.
     */
    public function animated(int $width, int $height, string $title, string $prompt): string
    {
        $safeTitle = htmlspecialchars(Str::limit($title, 40), ENT_QUOTES | ENT_XML1);
        $safePrompt = htmlspecialchars(Str::limit($prompt, 120), ENT_QUOTES | ENT_XML1);
        $cx = (int) ($width / 2);
        $cy = (int) ($height / 2);
        $radius = (int) (min($width, $height) / 6);

        return <<<SVG
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{$width}" height="{$height}" viewBox="0 0 {$width} {$height}">
  <style>
    .ring { transform-origin: {$cx}px {$cy}px; animation: spin 4s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  </style>
  <rect width="100%" height="100%" fill="#F7F3EE"/>
  <circle class="ring" cx="{$cx}" cy="{$cy}" r="{$radius}" fill="none" stroke="#C4A484" stroke-width="4"/>
  <text x="50%" y="78%" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#3B2A1F">{$safeTitle}</text>
  <text x="50%" y="84%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#6B4F3A">{$safePrompt}</text>
  <text x="50%" y="94%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#8A7464">local_sim animation · replace with VIDEO_API_KEY</text>
</svg>
SVG;
    }
}
