<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Integration mode
    |--------------------------------------------------------------------------
    |
    | "local" (default): WordPress and Zoho adapters return seeded fixture data
    | and never call external APIs. "mock" is accepted as an alias for local.
    | Set INTEGRATION_MODE=live after credentials are configured.
    |
    */
    'mode' => env('INTEGRATION_MODE', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Cron secret (Vercel Cron Jobs → Next API → Laravel process workers)
    |--------------------------------------------------------------------------
    |
    | Same value on apps/web (Vercel CRON_SECRET) and apps/api. Vercel Cron
    | sends Authorization: Bearer <CRON_SECRET> to scheduled paths.
    |
    */
    'cron_secret' => env('CRON_SECRET'),

    'wordpress' => [
        'base_url' => rtrim((string) env('WORDPRESS_BASE_URL', ''), '/'),
        'username' => env('WORDPRESS_USERNAME'),
        'application_password' => env('WORDPRESS_APPLICATION_PASSWORD'),
        'webhook_secret' => env('WORDPRESS_WEBHOOK_SECRET'),
        'timeout' => (int) env('WORDPRESS_TIMEOUT', 15),
    ],

    'zoho' => [
        'client_id' => env('ZOHO_CLIENT_ID'),
        'client_secret' => env('ZOHO_CLIENT_SECRET'),
        'refresh_token' => env('ZOHO_REFRESH_TOKEN'),
        'access_token' => env('ZOHO_ACCESS_TOKEN'),
        // Zoho Books organization ID — required for invoice PDF / UAE e-invoice path
        'organization_id' => env('ZOHO_ORGANIZATION_ID'),
        'api_domain' => rtrim((string) env('ZOHO_API_DOMAIN', 'https://www.zohoapis.com'), '/'),
        'accounts_url' => rtrim((string) env('ZOHO_ACCOUNTS_URL', 'https://accounts.zoho.com'), '/'),
        'module_leads' => env('ZOHO_MODULE_LEADS', 'Leads'),
        'module_contacts' => env('ZOHO_MODULE_CONTACTS', 'Contacts'),
        'webhook_secret' => env('ZOHO_WEBHOOK_SECRET'),
        'timeout' => (int) env('ZOHO_TIMEOUT', 15),
    ],

    'shopify' => [
        'client_id' => env('SHOPIFY_CLIENT_ID'),
        'client_secret' => env('SHOPIFY_CLIENT_SECRET'),
        'redirect_uri' => env('SHOPIFY_REDIRECT_URI'),
        'api_version' => env('SHOPIFY_API_VERSION', '2025-01'),
        // Triada store: jwtjzw-nu.myshopify.com (Admin API token still awaiting)
        'shop_domain' => env('SHOPIFY_SHOP_DOMAIN', 'jwtjzw-nu.myshopify.com'),
        'access_token' => env('SHOPIFY_ACCESS_TOKEN'),
        'webhook_secret' => env('SHOPIFY_WEBHOOK_SECRET'),
        'scopes' => env('SHOPIFY_SCOPES', 'read_products,write_products,read_orders,read_inventory'),
        'timeout' => (int) env('SHOPIFY_TIMEOUT', 20),
    ],

    'telegram' => [
        'bot_token' => env('TELEGRAM_BOT_TOKEN'),
        'webhook_secret' => env('TELEGRAM_WEBHOOK_SECRET'),
    ],

    'tiktok' => [
        'access_token' => env('TIKTOK_ACCESS_TOKEN'),
        'webhook_secret' => env('TIKTOK_WEBHOOK_SECRET'),
    ],

    'email' => [
        'provider' => env('EMAIL_CHANNEL_PROVIDER', 'log'),
        'api_key' => env('EMAIL_CHANNEL_API_KEY'),
        'from_address' => env('EMAIL_CHANNEL_FROM', env('MAIL_FROM_ADDRESS')),
        'webhook_secret' => env('EMAIL_CHANNEL_WEBHOOK_SECRET'),
    ],

    /*
    |--------------------------------------------------------------------------
    | LLM providers
    |--------------------------------------------------------------------------
    |
    | Primary: Anthropic (Claude). LLM_PROVIDER=anthropic|local|gemini|openai_compatible
    | Anthropic uses ANTHROPIC_API_KEY + ANTHROPIC_MODEL, or a key pasted on the
    | Integrations page (stored encrypted). Without a key the stack stays on
    | LocalHeuristicLlmAdapter with status awaiting_credentials — never report
    | live Anthropic success without credentials.
    |
    */
    'llm' => [
        'provider' => env('LLM_PROVIDER', 'anthropic'),
        'api_key' => env('LLM_API_KEY'),
        'model' => env('LLM_MODEL', 'claude-sonnet-4-20250514'),
        'base_url' => env('LLM_BASE_URL', 'https://api.anthropic.com'),
        'timeout' => (int) env('LLM_TIMEOUT', 45),
        'anthropic' => [
            'api_key' => env('ANTHROPIC_API_KEY'),
            'model' => env('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514'),
            'base_url' => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
            'version' => env('ANTHROPIC_VERSION', '2023-06-01'),
        ],
        'gemini' => [
            'api_key' => env('GEMINI_API_KEY'),
            'model' => env('GEMINI_MODEL', 'gemini-2.0-flash'),
            'base_url' => env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
        ],
    ],


    /*
    |--------------------------------------------------------------------------
    | Meta (Facebook Messenger, Instagram Messaging, WhatsApp Cloud API)
    |--------------------------------------------------------------------------
    |
    | Leave empty for local simulator mode. INTEGRATION_MODE=live plus tokens
    | are required before health can report "healthy". Never fake live health.
    |
    */
    'meta' => [
        'app_id' => env('META_APP_ID'),
        'app_secret' => env('META_APP_SECRET'),
        'verify_token' => env('META_VERIFY_TOKEN', 'triada-local-verify'),
        'webhook_secret' => env('META_WEBHOOK_SECRET'),
        'page_access_token' => env('META_PAGE_ACCESS_TOKEN'),
        'graph_version' => env('META_GRAPH_VERSION', 'v21.0'),
        'graph_base' => env('META_GRAPH_BASE', 'https://graph.facebook.com'),
        // Prefer META_WA_* aliases; WHATSAPP_* kept for compatibility.
        'whatsapp_phone_number_id' => env('META_WA_PHONE_NUMBER_ID') ?: env('WHATSAPP_PHONE_NUMBER_ID'),
        'whatsapp_business_account_id' => env('META_WA_BUSINESS_ACCOUNT_ID') ?: env('WHATSAPP_BUSINESS_ACCOUNT_ID'),
        'whatsapp_access_token' => env('META_WA_ACCESS_TOKEN') ?: env('WHATSAPP_ACCESS_TOKEN'),
        'timeout' => (int) env('META_TIMEOUT', 15),
    ],
];
