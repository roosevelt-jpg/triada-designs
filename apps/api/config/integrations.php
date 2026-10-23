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
    ],
];
