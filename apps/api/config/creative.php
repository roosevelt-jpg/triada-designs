<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Image generation
    |--------------------------------------------------------------------------
    |
    | IMAGE_PROVIDER=gemini|imagen|local (default gemini)
    | IMAGE_API_KEY falls back to GEMINI_API_KEY.
    | Creative intelligence (prompts / agent tools / scripts) goes through Anthropic.
    | Gemini pixels are live whenever GEMINI_API_KEY is present — INTEGRATION_MODE
    | is not required for the Gemini image path.
    | Without a key the stack uses the local jewellery SVG simulator.
    |
    */
    'image' => [
        // Pixels: Gemini when keyed. Claude remains the copy/script path via VideoScriptService.
        'provider' => env('IMAGE_PROVIDER', 'gemini'),
        'api_key' => env('IMAGE_API_KEY', env('GEMINI_API_KEY', env('GOOGLE_GEMINI_API_KEY'))),
        'model' => env('IMAGE_MODEL', env('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image')),
        'fallback_models' => array_values(array_filter(array_map('trim', explode(',', (string) env(
            'IMAGE_FALLBACK_MODELS',
            'gemini-nano-banana-2.1,gemini-3.1-flash-image,gemini-2.5-flash-image,imagen-4.0-generate-001,imagen-3.0-generate-002'
        ))))),
        'base_url' => env(
            'IMAGE_BASE_URL',
            env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
        ),
        'timeout' => (int) env('IMAGE_TIMEOUT', 90),
        'default_width' => 1080,
        'default_height' => 1080,
    ],

    /*
    |--------------------------------------------------------------------------
    | Video / short animation generation
    |--------------------------------------------------------------------------
    |
    | Anthropic/Claude writes scripts & storyboards only — it cannot render
    | video pixels. Pixel path needs a dedicated provider:
    |   VIDEO_PROVIDER=local|animation|http|gemini|veo|omni|runway|luma
    | Keys:
    |   VIDEO_API_KEY / VIDEO_MODEL / VIDEO_BASE_URL / VIDEO_TIMEOUT
    |   GEMINI_API_KEY is used as fallback when VIDEO_PROVIDER=gemini|veo|omni
    |   Gemini Omni is live whenever keyed — INTEGRATION_MODE not required
    | Without keys, creative generate-video/animation uses local SVG + mp4 stub.
    |
    */
    'video' => [
        // Default Gemini Omni for jewellery video pixels when keyed.
        'provider' => env('VIDEO_PROVIDER', 'gemini'),
        'api_key' => env('VIDEO_API_KEY', env('GEMINI_API_KEY', env('GOOGLE_GEMINI_API_KEY'))),
        'model' => env('VIDEO_MODEL', 'gemini-omni-1.1-flash'),
        'fallback_models' => array_values(array_filter(array_map('trim', explode(',', (string) env(
            'VIDEO_FALLBACK_MODELS',
            'gemini-omni-1.1-flash'
        ))))),
        'base_url' => env('VIDEO_BASE_URL', ''),
        'timeout' => (int) env('VIDEO_TIMEOUT', 180),
        'default_duration_ms' => 8000,
        'default_width' => 1080,
        'default_height' => 1920,
        'runway_base_url' => env('RUNWAY_BASE_URL', 'https://api.dev.runwayml.com'),
        'luma_base_url' => env('LUMA_BASE_URL', 'https://api.lumalabs.ai'),
        'gemini_base_url' => env(
            'VIDEO_GEMINI_BASE_URL',
            env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
        ),
    ],

    /*
    |--------------------------------------------------------------------------
    | Platform output sizes (jewellery marketing)
    |--------------------------------------------------------------------------
    */
    'platform_sizes' => [
        'instagram_feed' => ['label' => 'Instagram feed', 'width' => 1080, 'height' => 1080, 'aspect' => '1:1'],
        'instagram_story' => ['label' => 'Instagram story', 'width' => 1080, 'height' => 1920, 'aspect' => '9:16'],
        'instagram_reel_cover' => ['label' => 'Instagram reel cover', 'width' => 1080, 'height' => 1920, 'aspect' => '9:16'],
        'facebook_post' => ['label' => 'Facebook post', 'width' => 1200, 'height' => 630, 'aspect' => '1.91:1'],
        'facebook_story' => ['label' => 'Facebook story', 'width' => 1080, 'height' => 1920, 'aspect' => '9:16'],
        'tiktok' => ['label' => 'TikTok', 'width' => 1080, 'height' => 1920, 'aspect' => '9:16'],
        'linkedin' => ['label' => 'LinkedIn', 'width' => 1200, 'height' => 627, 'aspect' => '1.91:1'],
        'whatsapp_status' => ['label' => 'WhatsApp status', 'width' => 1080, 'height' => 1920, 'aspect' => '9:16'],
    ],

    // Use the public disk so /storage/{path} is served via the public/storage symlink.
    'storage_disk' => env('CREATIVE_DISK', 'public'),
    'public_path_prefix' => 'creative',
];
