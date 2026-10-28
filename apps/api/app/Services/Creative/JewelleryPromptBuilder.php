<?php

namespace App\Services\Creative;

/**
 * Builds jewellery-aware image/video prompts from post caption, objective, and product context.
 * Under the hood: Claude = scripts/storyboards/copy; Gemini = video + image pixels.
 * Do not surface provider dual-path jargon in product UI responses.
 */
class JewelleryPromptBuilder
{
    public const PROMPT_VERSION = 3;

    public const REALISM_MEDIA_DIRECTIVE = 'CRITICAL OUTPUT: photorealistic 3D anamorphic jewellery product media — looks like a real Triada Designs piece on a real surface, not abstract art, blank canvas, logo mark, typography poster, gradient blob, or empty placeholder. Show a tangible wearable: ring, pendant, necklace, bracelet, or earrings with readable metal, plating, stone, clasp, and micro-scratches/reflections. Anamorphic 3D product look: slight perspective foreshortening, soft contact shadow, specular highlights on metal, subsurface glow on stones — studio-product or handheld UGC still that could ship on Shopify. Full-bleed product hero: jewellery fills most of the frame; no large empty negative space, no floating text badges, no watermark spam, no UI chrome.';

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
            ? 'Look: authentic UGC / creator phone still — natural desk or soft window light, jewellery hero filling the frame, lived-in elegance, photoreal product — not glossy catalog hard-sell and never abstract.'
            : 'Look: refined editorial product photography — photoreal 3D jewellery on linen or marble, restrained luxury studio light.';

        $captionLine = $captionClean !== '' ? "Caption alignment: {$captionClean}" : '';

        return trim(implode("\n", array_filter([
            'Photorealistic 3D anamorphic jewellery product image for Triada Designs — must look like a real sellable piece.',
            self::REALISM_MEDIA_DIRECTIVE,
            "Piece/focus: {$product}.",
            "Materials: {$materials}.",
            "Campaign objective: {$objective} (drive saves, DMs, soft shop intent).",
            "Channel: {$channel} (Meta/IG/TikTok/WhatsApp ready crop).",
            "Mood: {$mood}.",
            $ugcLine,
            'Composition: jewellery dominates frame; shallow depth of field; tactile metal/stone micro-detail; warm ivory–champagne neutrals; soft contact shadow under the piece.',
            'Lighting: soft Gulf window or warm key + gentle rim; accurate metal reflections; no neon, no purple glow, no CGI plastic look.',
            'Avoid: blank/empty canvases, abstract shapes, floating logos, fake badges, invented brand marks, watermark spam, text-heavy overlays, medical claims, surreal melting metal, flat 2D icons.',
            $captionLine,
            'Style keywords: photoreal 3D anamorphic jewellery, real product photography, soft Gulf light, quiet luxury, conversion-ready still.',
        ])));
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
        $storyboard = (string) ($context['storyboard'] ?? '0-1s hook close-up of real jewellery; mid authentic light shift on metal; end brand-restrained product hero');
        $hook = trim((string) ($context['hook'] ?? ''));
        $ugcLine = $style === 'ugc'
            ? 'Format: authentic UGC / creator-style vertical 9:16, natural handheld micro-shake, soft Gulf window light, photoreal jewellery hero — scroll-stopping first frame of a real piece, not studio hard-sell or abstract motion graphics.'
            : 'Format: calm premium camera push-in / orbit on a photoreal 3D jewellery product; conversion-ready end frame.';
        $hookLine = $hook !== ''
            ? "Opening hook cue: {$hook}"
            : 'Opening: pattern-interrupt extreme close-up of the real piece in the first second (metal specular + stone catchlight).';

        return trim(implode("\n", [
            "Photorealistic short marketing video of Triada Designs jewellery ({$seconds}s) — real 3D anamorphic product motion, not blank or abstract.",
            self::REALISM_MEDIA_DIRECTIVE,
            "Subject: {$product}.",
            "Style: {$style}. Channel: {$channel} (Reels / TikTok / Stories / WhatsApp Status).",
            $ugcLine,
            $hookLine,
            "Storyboard: {$storyboard}.",
            'Script/caption cue: '.trim($scriptOrCaption),
            'Camera: slow orbit, soft push-in, or gentle tilt that reveals form, thickness, and how light travels across metal.',
            'Pacing: hook → desire → soft CTA. End on a clear product hero frame suitable for commerce.',
            'Avoid: loud effects, fake urgency text overlays, invented claims/logos, neon glows, blank frames, abstract morphs, stock influencer clichés.',
            'Generation keywords: photoreal 3D anamorphic jewellery, real product motion, Gulf light, quiet luxury, Meta/TikTok native.',
        ]));
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
            '- Describe the physical piece clearly (shape, metal, stone, how it sits on skin/surface) so media can render a real product.',
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
Describe the piece as a real wearable so media can render photoreal 3D product footage.
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
