<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\AutomationController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\IntegrationController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\MetaIntegrationController;
use App\Http\Controllers\Api\V1\OpsDataController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Controllers\Webhooks\MetaWebhookController;
use App\Http\Controllers\Webhooks\WhatsAppWebhookController;
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

    Route::get('/meta', [MetaWebhookController::class, 'verify']);
    Route::post('/meta', [MetaWebhookController::class, 'ingest']);
    Route::get('/whatsapp', [WhatsAppWebhookController::class, 'verify']);
    Route::post('/whatsapp', [WhatsAppWebhookController::class, 'ingest']);
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

        Route::get('/integrations/meta/status', [MetaIntegrationController::class, 'status']);
        Route::post('/integrations/meta/connect', [MetaIntegrationController::class, 'connect']);
        Route::post('/integrations/meta/disconnect', [MetaIntegrationController::class, 'disconnect']);
        Route::get('/integrations/meta/accounts', [MetaIntegrationController::class, 'accounts']);
        Route::get('/integrations/meta/webhook', [MetaIntegrationController::class, 'webhook']);
        Route::post('/integrations/meta/webhook/subscribe', [MetaIntegrationController::class, 'subscribeWebhook']);
        Route::post('/integrations/meta/verify-token/rotate', [MetaIntegrationController::class, 'rotateVerifyToken']);
        Route::post('/integrations/meta/test-send', [MetaIntegrationController::class, 'testSend']);
        Route::post('/integrations/meta/simulate-inbound', [MetaIntegrationController::class, 'simulateInbound']);

        Route::get('/settings', [SettingsController::class, 'show']);
        Route::patch('/settings', [SettingsController::class, 'update']);

        Route::get('/agents', [OpsDataController::class, 'agents']);
        Route::patch('/agents/{agentId}', [OpsDataController::class, 'updateAgent']);
        Route::get('/knowledge', [OpsDataController::class, 'knowledge']);
        Route::get('/calendar', [OpsDataController::class, 'calendar']);
        Route::get('/campaigns', [OpsDataController::class, 'campaigns']);
        Route::get('/analytics', [OpsDataController::class, 'analytics']);
        Route::get('/team', [OpsDataController::class, 'team']);
        Route::get('/audit-logs', [OpsDataController::class, 'auditLogs']);
        Route::get('/opportunities', [OpsDataController::class, 'opportunities']);

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
