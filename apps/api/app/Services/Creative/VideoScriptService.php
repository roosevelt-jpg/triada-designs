<?php

namespace App\Services\Creative;

use App\Models\ContentItem;
use App\Services\AI\Contracts\LlmAdapterInterface;

/**
 * Dual-path step 1: Anthropic (or local heuristic) writes UGC scripts / storyboards.
 * Claude cannot render video pixels — those go through VideoGenerationService + VIDEO_PROVIDER.
 */
class VideoScriptService
{
    public function __construct(
        protected LlmAdapterInterface $llm,
        protected JewelleryPromptBuilder $prompts,
    ) {
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{
     *   ok:bool,
     *   style:string,
     *   script:string,
     *   storyboard:string,
     *   hook:string,
     *   cta:string,
     *   provider:string,
     *   model:string,
     *   mode:string,
     *   video_prompt:string
     * }
     */
    public function compose(ContentItem $item, array $context = []): array
    {
        $style = strtolower((string) ($context['style'] ?? 'ugc'));
        $product = (string) (
            $context['product']
            ?? data_get($item->product_context, 'name')
            ?? 'Triada Designs jewellery'
        );
        $caption = (string) ($context['caption'] ?? $item->body ?? $item->title ?? '');
        $channel = (string) ($context['channel'] ?? $item->channel ?? 'instagram');
        $durationMs = (int) ($context['duration_ms'] ?? config('creative.video.default_duration_ms', 4000));
        $seconds = max(2, (int) round($durationMs / 1000));

        $system = $this->prompts->ugcScriptSystemPrompt();
        $userPrompt = $this->prompts->ugcScriptUserPrompt($caption, [
            'style' => $style,
            'product' => $product,
            'channel' => $channel,
            'duration_ms' => $durationMs,
            'seconds' => $seconds,
            'storyboard' => $context['storyboard'] ?? null,
        ]);

        $completion = $this->llm->complete([
            'system' => $system,
            'prompt' => $userPrompt,
            'purpose' => 'content_ugc_script',
            'max_tokens' => 900,
        ]);

        $parsed = $this->parseScriptText((string) ($completion['text'] ?? ''), $product, $caption, $seconds, $style);
        $videoPrompt = $this->prompts->forVideo($parsed['script'], [
            'product' => $product,
            'storyboard' => $parsed['storyboard'],
            'duration_ms' => $durationMs,
            'style' => $style,
            'channel' => $channel,
        ]);

        $live = (bool) ($completion['ok'] ?? false) && $this->llm->isLive();

        return [
            'ok' => true,
            'style' => $style,
            'script' => $parsed['script'],
            'storyboard' => $parsed['storyboard'],
            'hook' => $parsed['hook'],
            'cta' => $parsed['cta'],
            'provider' => (string) ($completion['provider'] ?? $this->llm->providerKey()),
            'model' => (string) ($completion['model'] ?? $this->llm->model()),
            'mode' => $live ? 'live' : 'local_sim',
            'video_prompt' => $videoPrompt,
            'note' => 'Script/storyboard draft ready for media generation and human approval.',
            'prompt_version' => JewelleryPromptBuilder::PROMPT_VERSION,
        ];
    }

    /**
     * @return array{script:string,storyboard:string,hook:string,cta:string}
     */
    protected function parseScriptText(string $text, string $product, string $caption, int $seconds, string $style): array
    {
        $trimmed = trim($text);
        $json = null;
        if ($trimmed !== '' && ($trimmed[0] === '{' || str_contains($trimmed, '"script"'))) {
            $start = strpos($trimmed, '{');
            $end = strrpos($trimmed, '}');
            if ($start !== false && $end !== false && $end > $start) {
                try {
                    $decoded = json_decode(substr($trimmed, $start, $end - $start + 1), true, 512, JSON_THROW_ON_ERROR);
                    if (is_array($decoded)) {
                        $json = $decoded;
                    }
                } catch (\Throwable) {
                    $json = null;
                }
            }
        }

        if (is_array($json)) {
            return [
                'script' => trim((string) ($json['script'] ?? $json['voiceover'] ?? $trimmed)),
                'storyboard' => trim((string) ($json['storyboard'] ?? $json['shots'] ?? '')),
                'hook' => trim((string) ($json['hook'] ?? '')),
                'cta' => trim((string) ($json['cta'] ?? 'Shop Triada Designs')),
            ];
        }

        // Local heuristic / free-text fallback shaped as high-converting UGC.
        $hook = $style === 'ugc'
            ? 'POV: soft Gulf light on the piece you’ll actually wear every day.'
            : 'Quiet luxury for Gulf light.';
        $script = $trimmed !== ''
            ? $trimmed
            : "{$hook} This {$product} — {$caption} Soft natural light, no hard sell. Soft CTA to shop Triada Designs.";
        $storyboard = "0-1s jewellery close-up hook of {$product}; 1-{$seconds}s handheld soft light + authentic voiceover; end frame brand restraint + soft CTA, no fake badges.";

        return [
            'script' => $script,
            'storyboard' => $storyboard,
            'hook' => $hook,
            'cta' => 'Shop Triada Designs',
        ];
    }
}
