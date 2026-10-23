<?php

namespace App\Services\Creative;

/**
 * Builds jewellery-aware image/video prompts from post caption, objective, and product context.
 */
class JewelleryPromptBuilder
{
    /**
     * @param  array<string, mixed>  $context
     */
    public function forImage(string $caption, array $context = []): string
    {
        $objective = (string) ($context['objective'] ?? 'awareness');
        $product = (string) ($context['product'] ?? $context['product_name'] ?? 'Triada Designs jewellery');
        $materials = (string) ($context['materials'] ?? 'precious metals, refined stones');
        $mood = (string) ($context['mood'] ?? 'calm editorial, warm neutrals, tactile luxury');
        $channel = (string) ($context['channel'] ?? 'instagram');

        $captionClean = trim(preg_replace('/\s+/', ' ', $caption) ?: '');

        return trim(<<<TXT
Premium jewellery product photography for Triada Designs.
Piece/focus: {$product}.
Materials: {$materials}.
Campaign objective: {$objective}.
Channel context: {$channel}.
Mood: {$mood}. Soft natural light, editorial composition, no neon, no fake badges, no invented logos.
Caption alignment: {$captionClean}
Style: refined, human, trustworthy beauty/lifestyle jewellery still — photoreal or high-end studio look.
TXT);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function forVideo(string $scriptOrCaption, array $context = []): string
    {
        $duration = (int) ($context['duration_ms'] ?? 4000);
        $seconds = max(2, (int) round($duration / 1000));
        $product = (string) ($context['product'] ?? 'Triada Designs jewellery piece');
        $storyboard = (string) ($context['storyboard'] ?? 'slow push-in on jewellery, soft light shift, gentle end frame with brand restraint');

        return trim(<<<TXT
Short marketing video / motion for Triada Designs jewellery ({$seconds}s).
Subject: {$product}.
Storyboard: {$storyboard}.
Script/caption cue: {$scriptOrCaption}
No loud effects, no fake urgency text overlays, no invented claims. Calm premium motion from stills or soft camera move.
TXT);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function creativeBrief(string $caption, array $context = []): array
    {
        return [
            'caption' => $caption,
            'objective' => $context['objective'] ?? 'awareness',
            'product' => $context['product'] ?? $context['product_name'] ?? null,
            'materials' => $context['materials'] ?? null,
            'channel' => $context['channel'] ?? null,
            'image_prompt' => $this->forImage($caption, $context),
            'video_prompt' => $this->forVideo($caption, $context),
            'platforms' => array_keys((array) config('creative.platform_sizes', [])),
            'approval_required' => true,
            'note' => 'Creative brief only — public publish still requires human approval.',
        ];
    }
}
