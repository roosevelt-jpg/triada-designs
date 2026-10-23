<?php

namespace App\Services\AI;

/**
 * Tools Content Creator / Marketing agents may propose via orchestration.
 * Execution still goes through CreativeMediaService; public publish remains approval-gated.
 */
class CreativeToolAllowlist
{
    public const TOOLS = [
        'propose_creative_brief',
        'generate_image',
        'generate_platform_variants',
        'generate_short_video',
    ];

    public const AGENT_KEYS = [
        'marketing',
        'content',
        'content_creator',
    ];

    public static function allows(string $agentKey, string $tool): bool
    {
        if (! in_array($agentKey, self::AGENT_KEYS, true) && $agentKey !== 'content') {
            return false;
        }

        return in_array($tool, self::TOOLS, true);
    }

    /**
     * @return list<array{name:string,description:string}>
     */
    public static function catalog(): array
    {
        return [
            [
                'name' => 'propose_creative_brief',
                'description' => 'Propose a jewellery-aware creative brief (caption, image prompt, video prompt). Does not publish.',
            ],
            [
                'name' => 'generate_image',
                'description' => 'Generate a post image aligned to caption/objective/product. Local sim without IMAGE/GEMINI keys.',
            ],
            [
                'name' => 'generate_platform_variants',
                'description' => 'Auto-resize to IG/FB/TikTok/LinkedIn/WhatsApp status sizes and persist variants.',
            ],
            [
                'name' => 'generate_short_video',
                'description' => 'Generate a short marketing video/animation. Local stub without VIDEO_API_KEY.',
            ],
        ];
    }
}
