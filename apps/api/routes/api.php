<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\AutomationController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\IntegrationController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Webhooks\WordPressWebhookController;
use App\Http\Controllers\Webhooks\ZohoWebhookController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'ok' => true,
        'service' => 'triada-api',
        'integration_mode' => config('integrations.mode'),
        'time' => now()->toIso8601String(),
    ]);
});

Route::prefix('webhooks')->group(function () {
    Route::post('/wordpress', WordPressWebhookController::class);
    Route::post('/zoho', ZohoWebhookController::class);
});

Route::prefix('v1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        Route::get('/dashboard', DashboardController::class);

        Route::get('/contacts', [ContactController::class, 'index']);
        Route::post('/contacts', [ContactController::class, 'store']);
        Route::get('/contacts/{contactId}', [ContactController::class, 'show']);

        Route::get('/conversations', [ConversationController::class, 'index']);
        Route::get('/conversations/{conversationId}', [ConversationController::class, 'show']);
        Route::post('/conversations/{conversationId}/takeover', [ConversationController::class, 'takeover']);
        Route::post('/conversations/{conversationId}/resume-ai', [ConversationController::class, 'resumeAi']);
        Route::post('/conversations/{conversationId}/messages', [ConversationController::class, 'reply']);

        Route::get('/leads', [LeadController::class, 'index']);
        Route::post('/leads/{leadId}/sync-zoho', [LeadController::class, 'syncZoho']);

        Route::get('/products', [CatalogController::class, 'products']);
        Route::get('/services', [CatalogController::class, 'services']);
        Route::get('/content', [CatalogController::class, 'content']);
        Route::post('/content/{contentId}/approve', [CatalogController::class, 'approveContent']);

        Route::get('/integrations', [IntegrationController::class, 'index']);
        Route::get('/integrations/health', [IntegrationController::class, 'health']);
        Route::get('/integrations/wordpress/posts', [IntegrationController::class, 'wordpressPosts']);
        Route::post('/integrations/wordpress/drafts', [IntegrationController::class, 'createWordpressDraft']);

        Route::get('/automations', [AutomationController::class, 'index']);
        Route::post('/automations', [AutomationController::class, 'store']);
        Route::post('/automations/validate', [AutomationController::class, 'validateDefinition']);
        Route::get('/automations/{workflowId}', [AutomationController::class, 'show']);
        Route::put('/automations/{workflowId}', [AutomationController::class, 'update']);
        Route::patch('/automations/{workflowId}', [AutomationController::class, 'update']);
        Route::delete('/automations/{workflowId}', [AutomationController::class, 'destroy']);
        Route::post('/automations/{workflowId}/activate', [AutomationController::class, 'activate']);
        Route::post('/automations/{workflowId}/deactivate', [AutomationController::class, 'deactivate']);
        Route::post('/automations/{workflowId}/dry-run', [AutomationController::class, 'dryRun']);
        Route::post('/automations/{workflowId}/run', [AutomationController::class, 'run']);
        Route::get('/automations/{workflowId}/runs', [AutomationController::class, 'runs']);
        Route::get('/automations/{workflowId}/runs/{runId}', [AutomationController::class, 'showRun']);
    });
});
