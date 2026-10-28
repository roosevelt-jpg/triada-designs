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
        $style = strtolower((string) ($context['style'] ?? 'editorial'));
        $storyboard = (string) ($context['storyboard'] ?? 'slow push-in on jewellery, soft light shift, gentle end frame with brand restraint');
        $ugcLine = $style === 'ugc'
            ? 'Format: authentic UGC / creator-style vertical (9:16), natural handheld feel, soft Gulf light, jewellery hero — not studio hard-sell.'
            : 'Format: calm premium motion from stills or soft camera move.';

        return trim(<<<TXT
Short marketing video / motion for Triada Designs jewellery ({$seconds}s).
Subject: {$product}.
Style: {$style}.
{$ugcLine}
Storyboard: {$storyboard}.
Script/caption cue: {$scriptOrCaption}
No loud effects, no fake urgency text overlays, no invented claims or logos.
TXT);
    }

    public function ugcScriptSystemPrompt(): string
    {
        return 'You write short UGC-style jewellery video scripts for Triada Designs. '
            .'Return compact JSON with keys: hook, script, storyboard, cta. '
            .'Authentic creator voice, calm Gulf-light luxury, no fake claims, no invented discounts. '
            .'Human approval is always required before public publish. Claude writes text only — never claim you rendered video pixels.';
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function ugcScriptUserPrompt(string $caption, array $context = []): string
    {
        $product = (string) ($context['product'] ?? 'Triada Designs jewellery');
        $channel = (string) ($context['channel'] ?? 'instagram');
        $seconds = (int) ($context['seconds'] ?? 8);
        $style = (string) ($context['style'] ?? 'ugc');
        $storyboardHint = (string) ($context['storyboard'] ?? '');
        $captionClean = trim(preg_replace('/\s+/', ' ', $caption) ?: '');

        return trim(<<<TXT
Write a {$seconds}s {$style} video package for Triada Designs.
Product: {$product}
Channel: {$channel}
Caption / brief: {$captionClean}
Storyboard hint: {$storyboardHint}
Respond with JSON only: {"hook":"...","script":"...","storyboard":"...","cta":"..."}.
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
