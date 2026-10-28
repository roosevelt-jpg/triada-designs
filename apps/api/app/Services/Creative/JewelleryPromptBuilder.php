<?php

namespace App\Services\Creative;

/**
 * Builds jewellery-aware image/video prompts from post caption, objective, and product context.
 * Under the hood: Claude = scripts/storyboards/copy; Gemini = video + image pixels.
 * Do not surface provider dual-path jargon in product UI responses.
 */
class JewelleryPromptBuilder
{
    public const PROMPT_VERSION = 2;

    /**
     * @param  array<string, mixed>  $context
     */
    public function forImage(string $caption, array $context = []): string
    {
        $objective = (string) ($context['objective'] ?? 'conversion');
        $product = (string) ($context['product'] ?? $context['product_name'] ?? 'Triada Designs jewellery');
        $materials = (string) ($context['materials'] ?? 'precious metals, refined stones, Gulf-light luxury finish');
        $mood = (string) ($context['mood'] ?? 'calm editorial, warm neutrals, tactile luxury, soft Gulf natural light');
        $channel = (string) ($context['channel'] ?? 'instagram');
        $style = strtolower((string) ($context['style'] ?? 'ugc'));

        $captionClean = trim(preg_replace('/\s+/', ' ', $caption) ?: '');
        $ugcLine = $style === 'ugc'
            ? 'Look: authentic UGC / creator phone still — natural desk or soft window light, jewellery hero, lived-in elegance, not glossy catalog hard-sell.'
            : 'Look: refined editorial product photography — photoreal or high-end studio, restrained luxury.';

        return trim(<<<TXT
Premium jewellery visual for Triada Designs — high-converting social creative.
Piece/focus: {$product}.
Materials: {$materials}.
Campaign objective: {$objective} (drive saves, DMs, soft shop intent).
Channel: {$channel} (Meta/IG/TikTok/WhatsApp ready crop).
Mood: {$mood}.
{$ugcLine}
Composition: jewellery dominates frame; shallow depth; tactile metal/stone detail; warm ivory–champagne neutrals.
Avoid: neon, purple glow, fake badges, invented logos, watermark spam, text-heavy overlays, medical claims.
Caption alignment: {$captionClean}
Style keywords for generation: viral UGC jewellery, soft Gulf light, quiet luxury, conversion-ready still.
TXT);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public function forVideo(string $scriptOrCaption, array $context = []): string
    {
        $duration = (int) ($context['duration_ms'] ?? 8000);
        $seconds = max(2, (int) round($duration / 1000));
        $product = (string) ($context['product'] ?? 'Triada Designs jewellery piece');
        $style = strtolower((string) ($context['style'] ?? 'ugc'));
        $channel = (string) ($context['channel'] ?? 'instagram');
        $storyboard = (string) ($context['storyboard'] ?? '0-1s hook close-up; mid authentic voiceover + soft light shift; end brand-restrained CTA frame');
        $hook = trim((string) ($context['hook'] ?? ''));
        $ugcLine = $style === 'ugc'
            ? 'Format: authentic UGC / creator-style vertical 9:16, natural handheld micro-shake, soft Gulf window light, jewellery hero — scroll-stopping first frame, not studio hard-sell.'
            : 'Format: calm premium motion from stills or soft camera push-in; conversion-ready end frame.';
        $hookLine = $hook !== ''
            ? "Opening hook cue: {$hook}"
            : 'Opening: pattern-interrupt close-up of the piece in the first second.';

        return trim(<<<TXT
Short high-converting marketing video for Triada Designs jewellery ({$seconds}s).
Subject: {$product}.
Style: {$style}. Channel: {$channel} (Reels / TikTok / Stories / WhatsApp Status).
{$ugcLine}
{$hookLine}
Storyboard: {$storyboard}.
Script/caption cue: {$scriptOrCaption}
Pacing: hook → desire → soft CTA. End frame calm brand restraint.
Avoid: loud effects, fake urgency text overlays, invented claims/logos, neon glows, stock influencer clichés.
Generation keywords: viral jewellery UGC, Gulf light, quiet luxury, Meta/TikTok native.
TXT);
    }

    public function ugcScriptSystemPrompt(): string
    {
        return implode("\n", [
            'You are Triada Designs\' Creative copywriter for luxury jewellery (UAE / Gulf light aesthetic, Salt & Spirit collections).',
            'Write HIGH-CONVERTING, viral-ready UGC-style creative for Meta (Facebook/Instagram), TikTok, and WhatsApp Status/broadcasts.',
            'Return compact JSON only with keys: hook, script, storyboard, cta, caption, hashtags, platform_notes.',
            '',
            'Conversion rules:',
            '- Hook in the first 1–2 seconds / first line — pattern interrupt, sensory, or soft POV. No clickbait lies.',
            '- One core desire per piece (everyday glow, gift that feels personal, quiet Gulf luxury).',
            '- Soft CTA toward shop / DM / WhatsApp — never fake scarcity, countdown, or invented discounts.',
            '- Authentic creator voice: handheld, natural, conversational — not studio hard-sell or celebrity polish.',
            '- Captions: scannable, 1–3 short lines + optional emoji sparingly; hashtags 3–6 brand-safe max.',
            '- Materials truth only when stated: silver with gold plating; 14K/18K gold on request; ~7 day make time.',
            '- Never invent prices, stock, reviews, celebrity endorsements, or medical/wellness claims.',
            '- Human approval is always required before public publish.',
            '- You write text packages only. Do not claim you rendered video or image pixels.',
        ]);
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
        $objective = (string) ($context['objective'] ?? 'conversion');
        $storyboardHint = (string) ($context['storyboard'] ?? '');
        $captionClean = trim(preg_replace('/\s+/', ' ', $caption) ?: '');
        $briefLine = $captionClean !== ''
            ? "Caption / brief: {$captionClean}"
            : 'Caption / brief: (none — invent a truthful sensory brief only).';
        $storyLine = $storyboardHint !== '' ? "Storyboard hint: {$storyboardHint}" : '';

        return trim(<<<TXT
Write a {$seconds}s {$style} video package optimized for high conversion on {$channel}.
Brand: Triada Designs (luxury jewellery, UAE/Gulf aesthetic).
Product: {$product}
Objective: {$objective}
{$briefLine}
{$storyLine}
Respond with JSON only: {"hook":"...","script":"...","storyboard":"...","cta":"...","caption":"...","hashtags":["..."],"platform_notes":"..."}.
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
            'objective' => $context['objective'] ?? 'conversion',
            'product' => $context['product'] ?? $context['product_name'] ?? null,
            'materials' => $context['materials'] ?? null,
            'channel' => $context['channel'] ?? null,
            'image_prompt' => $this->forImage($caption, $context),
            'video_prompt' => $this->forVideo($caption, $context),
            'platforms' => array_keys((array) config('creative.platform_sizes', [])),
            'prompt_version' => self::PROMPT_VERSION,
            'approval_required' => true,
            'note' => 'Draft only — human approval required before publish.',
        ];
    }
}
