<?php

namespace App\Services\Creative;

use Illuminate\Support\Str;

/**
 * Local-only jewellery product preview SVG (unkeyed / fallback).
 * Matches apps/web preview-svg style — never used as fake live Gemini success.
 */
class CreativeSvgRenderer
{
    public function canvas(int $width, int $height, string $title, string $target, string $prompt): string
    {
        return $this->jewelleryProduct($width, $height, $title, $target, $prompt, false);
    }

    /**
     * Minimal animated SVG (CSS) used as a local short-animation stand-in.
     */
    public function animated(int $width, int $height, string $title, string $prompt): string
    {
        return $this->jewelleryProduct($width, $height, $title, 'animation', $prompt, true);
    }

    protected function jewelleryProduct(
        int $width,
        int $height,
        string $title,
        string $target,
        string $prompt,
        bool $animated
    ): string {
        $safeTitle = htmlspecialchars(Str::limit($title, 48), ENT_QUOTES | ENT_XML1);
        $safeTarget = htmlspecialchars(Str::limit($target, 40), ENT_QUOTES | ENT_XML1);
        $safePrompt = htmlspecialchars(Str::limit($prompt, 120), ENT_QUOTES | ENT_XML1);
        $cx = (int) ($width / 2);
        $cy = (int) ($height / 2.35);
        $ringR = (int) (min($width, $height) / 4.2);
        $stoneR = (int) ($ringR * 0.22);
        $titleSize = max(18, (int) ($width * 0.032));
        $metaSize = max(12, (int) ($width * 0.02));
        $promptSize = max(10, (int) ($width * 0.015));
        $strokeW = max(10, (int) ($ringR * 0.18));
        $shadowDy = (int) ($ringR * 0.08);
        $shadowStd = max(2, (int) ($ringR * 0.08));
        $shadowCy = $cy + $ringR + (int) ($ringR * 0.55);
        $shadowRx = (int) ($ringR * 1.15);
        $shadowRy = max(8, (int) ($ringR * 0.22));
        $titleY = (int) ($height * 0.78);
        $metaY = (int) ($height * 0.83);
        $promptY = (int) ($height * 0.88);
        $footY = (int) ($height * 0.94);
        $hlCx = $cx - (int) ($stoneR * 0.25);
        $hlCy = $cy - $ringR - (int) ($stoneR * 0.2);
        $hlRx = max(2, (int) ($stoneR * 0.35));
        $hlRy = max(1, (int) ($stoneR * 0.2));
        $stoneCy = $cy - $ringR;

        $animStyle = $animated
            ? <<<CSS
  <style>
    .piece { transform-origin: {$cx}px {$cy}px; animation: tilt 5s ease-in-out infinite; }
    @keyframes tilt { 0%,100% { transform: rotate(-4deg) scale(1); } 50% { transform: rotate(4deg) scale(1.03); } }
  </style>
CSS
            : '';
        $pieceClass = $animated ? ' class="piece"' : '';

        return <<<SVG
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{$width}" height="{$height}" viewBox="0 0 {$width} {$height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EE"/>
      <stop offset="55%" stop-color="#E8DFD4"/>
      <stop offset="100%" stop-color="#C4A484"/>
    </linearGradient>
    <radialGradient id="metal" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#F3E3C3"/>
      <stop offset="45%" stop-color="#C9A36A"/>
      <stop offset="100%" stop-color="#8A6A3D"/>
    </radialGradient>
    <radialGradient id="stone" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#F8F4EC"/>
      <stop offset="55%" stop-color="#D8C4A0"/>
      <stop offset="100%" stop-color="#7A6244"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="{$shadowDy}" stdDeviation="{$shadowStd}" flood-color="#3B2A1F" flood-opacity="0.28"/>
    </filter>
  </defs>
{$animStyle}
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="{$cx}" cy="{$shadowCy}" rx="{$shadowRx}" ry="{$shadowRy}" fill="#3B2A1F" opacity="0.12"/>
  <g filter="url(#soft)"{$pieceClass}>
    <circle cx="{$cx}" cy="{$cy}" r="{$ringR}" fill="none" stroke="url(#metal)" stroke-width="{$strokeW}"/>
    <circle cx="{$cx}" cy="{$stoneCy}" r="{$stoneR}" fill="url(#stone)" stroke="#E8D7B5" stroke-width="2"/>
    <ellipse cx="{$hlCx}" cy="{$hlCy}" rx="{$hlRx}" ry="{$hlRy}" fill="#fff" opacity="0.45"/>
  </g>
  <text x="50%" y="{$titleY}" text-anchor="middle" font-family="Georgia, serif" font-size="{$titleSize}" fill="#3B2A1F">{$safeTitle}</text>
  <text x="50%" y="{$metaY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="{$metaSize}" fill="#6B4F3A">{$safeTarget} · product preview</text>
  <text x="50%" y="{$promptY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="{$promptSize}" fill="#8A7464">{$safePrompt}</text>
  <text x="50%" y="{$footY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#8A7464">Triada Designs · waiting live media</text>
</svg>
SVG;
    }
}
