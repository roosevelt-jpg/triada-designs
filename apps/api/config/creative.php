<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Image generation
    |--------------------------------------------------------------------------
    |
    | IMAGE_PROVIDER=anthropic|gemini|local
    | IMAGE_API_KEY falls back to ANTHROPIC_API_KEY (primary) then GEMINI_API_KEY.
    | Creative intelligence (prompts / agent tools) goes through Anthropic.
    | Without a key the stack uses the local jewellery SVG simulator and reports
    | mode local_sim / awaiting_credentials — never fake live-healthy image APIs.
    |
    */
    'image' => [
        'provider' => env('IMAGE_PROVIDER', env('LLM_PROVIDER', 'anthropic')),
        'api_key' => env('IMAGE_API_KEY', env('ANTHROPIC_API_KEY', env('GEMINI_API_KEY'))),
        'model' => env('IMAGE_MODEL', 'claude-sonnet-4-20250514'),
        'base_url' => env(
            'IMAGE_BASE_URL',
            env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
        ),
        'timeout' => (int) env('IMAGE_TIMEOUT', 60),
        'default_width' => 1080,
        'default_height' => 1080,
    ],

    /*
    |--------------------------------------------------------------------------
    | Video / short animation generation
    |--------------------------------------------------------------------------
    */
    'video' => [
        'provider' => env('VIDEO_PROVIDER', 'local'),
        'api_key' => env('VIDEO_API_KEY'),
        'model' => env('VIDEO_MODEL', 'veo-2.0-generate-001'),
        'base_url' => env('VIDEO_BASE_URL', ''),
        'timeout' => (int) env('VIDEO_TIMEOUT', 120),
        'default_duration_ms' => 4000,
        'default_width' => 1080,
        'default_height' => 1920,
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
