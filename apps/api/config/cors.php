<?php

$defaultOrigins = [
    'http://127.0.0.1:43127',
    'http://localhost:43127',
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'https://dashboard.triada-designs.com',
    'https://triada-ops.vercel.app',
];

$fromEnv = array_values(array_filter(array_map(
    static fn (string $origin): string => rtrim(trim($origin), '/'),
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))
)));

$allowedOrigins = $fromEnv !== [] ? $fromEnv : $defaultOrigins;

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Dashboard origins must be listed so browser login from Vercel / custom
    | domain works when the API is on a separate public host.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
