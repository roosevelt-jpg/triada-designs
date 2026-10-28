<?php

use App\Http\Controllers\Api\V1\AgentOrchestrationController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\AutomationController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\ChannelIntegrationController;
use App\Http\Controllers\Api\V1\ChannelTemplateController;
use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\ContentPublishController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\CreativeMediaController;
use App\Http\Controllers\Api\V1\CronWorkerController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\IntegrationController;
use App\Http\Controllers\Api\V1\JewelleryOpsController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\MetaIntegrationController;
use App\Http\Controllers\Api\V1\OpsDataController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Controllers\Api\V1\ShopifyIntegrationController;
use App\Http\Controllers\Api\V1\SystemTimeController;
use App\Http\Controllers\Api\V1\WebchatPublicController;
use App\Http\Controllers\Api\V1\WhatsAppIntegrationController;
use App\Http\Controllers\Webhooks\ChannelWebhookController;
use App\Http\Controllers\Webhooks\MetaWebhookController;
use App\Http\Controllers\Webhooks\ShopifyWebhookController;
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
    Route::post('/shopify', [ShopifyWebhookController::class, 'ingest']);

    Route::get('/meta', [MetaWebhookController::class, 'verify']);
    Route::post('/meta', [MetaWebhookController::class, 'ingest']);
    Route::get('/whatsapp', [WhatsAppWebhookController::class, 'verify']);
    Route::post('/whatsapp', [WhatsAppWebhookController::class, 'ingest']);

    Route::post('/telegram', [ChannelWebhookController::class, 'telegram']);
    Route::post('/tiktok', [ChannelWebhookController::class, 'tiktok']);
    Route::post('/email', [ChannelWebhookController::class, 'email']);
});

Route::prefix('v1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/webchat/messages', [WebchatPublicController::class, 'send']);

    // Vercel Cron Jobs → Next /api/cron/* → these process-on-demand workers
    Route::middleware('cron.secret')->prefix('cron')->group(function () {
        Route::match(['get', 'post'], '/abandonment/process', [CronWorkerController::class, 'processAbandonment']);
        Route::match(['get', 'post'], '/after-sale/process', [CronWorkerController::class, 'processAfterSale']);
        Route::match(['get', 'post'], '/content-publish/process', [CronWorkerController::class, 'processContentPublish']);
    });

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
        Route::post('/content/{contentId}/schedule', [ContentPublishController::class, 'schedule']);
        Route::post('/content/{contentId}/publish', [ContentPublishController::class, 'publish']);
        Route::get('/publications', [ContentPublishController::class, 'publications']);

        Route::get('/creative/status', [CreativeMediaController::class, 'status']);
        Route::get('/content/{contentId}/media', [CreativeMediaController::class, 'media']);
        Route::post('/content/{contentId}/generate-image', [CreativeMediaController::class, 'generateImage']);
        Route::post('/content/{contentId}/generate-variants', [CreativeMediaController::class, 'generateVariants']);
        Route::post('/content/{contentId}/generate-video', [CreativeMediaController::class, 'generateVideo']);
        Route::post('/content/{contentId}/generate-ugc-video', [CreativeMediaController::class, 'generateUgcVideo']);
        Route::post('/content/{contentId}/generate-animation', [CreativeMediaController::class, 'generateAnimation']);
        Route::post('/content/{contentId}/ensure-creative', [CreativeMediaController::class, 'ensureCreative']);

        Route::get('/integrations', [IntegrationController::class, 'index']);
        Route::get('/integrations/health', [IntegrationController::class, 'health']);
        Route::get('/integrations/wordpress/posts', [IntegrationController::class, 'wordpressPosts']);
        Route::post('/integrations/wordpress/drafts', [IntegrationController::class, 'createWordpressDraft']);
        Route::get('/integrations/anthropic/status', [IntegrationController::class, 'anthropicStatus']);
        Route::post('/integrations/anthropic', [IntegrationController::class, 'saveAnthropic']);
        Route::post('/integrations/anthropic/clear', [IntegrationController::class, 'clearAnthropic']);
        Route::get('/integrations/zoho/status', [IntegrationController::class, 'zohoStatus']);
        Route::post('/integrations/zoho', [IntegrationController::class, 'saveZoho']);
        Route::post('/integrations/zoho/clear', [IntegrationController::class, 'clearZoho']);

        Route::get('/integrations/meta/status', [MetaIntegrationController::class, 'status']);
        Route::post('/integrations/meta/connect', [MetaIntegrationController::class, 'connect']);
        Route::post('/integrations/meta/disconnect', [MetaIntegrationController::class, 'disconnect']);
        Route::get('/integrations/meta/accounts', [MetaIntegrationController::class, 'accounts']);
        Route::get('/integrations/meta/webhook', [MetaIntegrationController::class, 'webhook']);
        Route::post('/integrations/meta/webhook/subscribe', [MetaIntegrationController::class, 'subscribeWebhook']);
        Route::post('/integrations/meta/verify-token/rotate', [MetaIntegrationController::class, 'rotateVerifyToken']);
        Route::post('/integrations/meta/test-send', [MetaIntegrationController::class, 'testSend']);
        Route::post('/integrations/meta/simulate-inbound', [MetaIntegrationController::class, 'simulateInbound']);

        Route::get('/integrations/whatsapp/status', [WhatsAppIntegrationController::class, 'status']);
        Route::get('/integrations/whatsapp/templates', [WhatsAppIntegrationController::class, 'templates']);
        Route::post('/integrations/whatsapp/templates/sync', [WhatsAppIntegrationController::class, 'syncTemplates']);
        Route::post('/integrations/whatsapp/templates', [WhatsAppIntegrationController::class, 'createTemplate']);
        Route::put('/integrations/whatsapp/templates/{templateId}', [WhatsAppIntegrationController::class, 'updateTemplate']);
        Route::patch('/integrations/whatsapp/templates/{templateId}', [WhatsAppIntegrationController::class, 'updateTemplate']);
        Route::post('/integrations/whatsapp/send-template', [WhatsAppIntegrationController::class, 'sendTemplate']);
        Route::post('/integrations/whatsapp/upload-media', [WhatsAppIntegrationController::class, 'uploadMedia']);
        Route::post('/integrations/whatsapp/send-media', [WhatsAppIntegrationController::class, 'sendMedia']);

        Route::get('/integrations/shopify/status', [ShopifyIntegrationController::class, 'status']);
        Route::post('/integrations/shopify/connect', [ShopifyIntegrationController::class, 'connect']);
        Route::post('/integrations/shopify/disconnect', [ShopifyIntegrationController::class, 'disconnect']);
        Route::post('/integrations/shopify/sync', [ShopifyIntegrationController::class, 'sync']);

        Route::get('/integrations/channels/status', [ChannelIntegrationController::class, 'status']);
        Route::post('/integrations/channels/connect', [ChannelIntegrationController::class, 'connect']);
        Route::post('/integrations/channels/disconnect', [ChannelIntegrationController::class, 'disconnect']);
        Route::post('/integrations/channels/simulate-inbound', [ChannelIntegrationController::class, 'simulateInbound']);
        Route::post('/integrations/channels/webchat-token', [ChannelIntegrationController::class, 'ensureWebchatToken']);

        Route::get('/channel-templates', [ChannelTemplateController::class, 'index']);
        Route::post('/channel-templates', [ChannelTemplateController::class, 'store']);
        Route::get('/channel-templates/{templateId}', [ChannelTemplateController::class, 'show']);
        Route::put('/channel-templates/{templateId}', [ChannelTemplateController::class, 'update']);
        Route::patch('/channel-templates/{templateId}', [ChannelTemplateController::class, 'update']);
        Route::post('/channel-templates/{templateId}/submit-review', [ChannelTemplateController::class, 'submitReview']);
        Route::post('/channel-templates/{templateId}/approve', [ChannelTemplateController::class, 'approve']);
        Route::post('/channel-templates/{templateId}/reject', [ChannelTemplateController::class, 'reject']);
        Route::post('/channel-templates/{templateId}/publish', [ChannelTemplateController::class, 'publish']);

        Route::get('/settings', [SettingsController::class, 'show']);
        Route::patch('/settings', [SettingsController::class, 'update']);

        Route::get('/system/time', [SystemTimeController::class, 'show']);

        Route::get('/agents/llm/status', [AgentOrchestrationController::class, 'llmStatus']);
        Route::get('/agents/activity', [AgentOrchestrationController::class, 'activity']);
        Route::post('/agents/test-run', [AgentOrchestrationController::class, 'testRun']);
        Route::post('/agents/process-inbound', [AgentOrchestrationController::class, 'processInbound']);
        Route::get('/agents/creative-tools', [AgentOrchestrationController::class, 'creativeTools']);
        Route::post('/agents/creative-tools/run', [AgentOrchestrationController::class, 'runCreativeTool']);
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

        // Jewellery ops automations (answer-bot → content schedule)
        Route::get('/jewellery-ops/overview', [JewelleryOpsController::class, 'overview']);
        Route::get('/jewellery-ops/policies', [JewelleryOpsController::class, 'policies']);
        Route::post('/jewellery-ops/answer-bot', [JewelleryOpsController::class, 'answerBot']);
        Route::post('/jewellery-ops/gift-finder', [JewelleryOpsController::class, 'giftFinder']);
        Route::get('/jewellery-ops/gift-sessions', [JewelleryOpsController::class, 'giftSessions']);
        Route::post('/jewellery-ops/custom-pieces', [JewelleryOpsController::class, 'customPiece']);
        Route::get('/jewellery-ops/custom-pieces', [JewelleryOpsController::class, 'customRequests']);
        Route::post('/jewellery-ops/custom-pieces/{requestId}/approve-quote', [JewelleryOpsController::class, 'approveCustomQuote']);
        Route::post('/jewellery-ops/orders', [JewelleryOpsController::class, 'upsertOrder']);
        Route::get('/jewellery-ops/orders', [JewelleryOpsController::class, 'orders']);
        Route::post('/jewellery-ops/orders/where-is-my-order', [JewelleryOpsController::class, 'whereIsMyOrder']);
        Route::get('/jewellery-ops/invoices', [JewelleryOpsController::class, 'invoices']);
        Route::get('/jewellery-ops/telegram-alerts', [JewelleryOpsController::class, 'telegramAlerts']);
        Route::post('/jewellery-ops/telegram-alerts', [JewelleryOpsController::class, 'sendTelegramAlert']);
        Route::post('/jewellery-ops/abandonment', [JewelleryOpsController::class, 'trackAbandonment']);
        Route::post('/jewellery-ops/abandonment/process', [JewelleryOpsController::class, 'processAbandonment']);
        Route::get('/jewellery-ops/abandonment', [JewelleryOpsController::class, 'abandonment']);
        Route::post('/jewellery-ops/waitlist', [JewelleryOpsController::class, 'joinWaitlist']);
        Route::get('/jewellery-ops/waitlist', [JewelleryOpsController::class, 'waitlist']);
        Route::post('/jewellery-ops/waitlist/notify', [JewelleryOpsController::class, 'notifyWaitlist']);
        Route::post('/jewellery-ops/vip-drop', [JewelleryOpsController::class, 'vipDrop']);
        Route::post('/jewellery-ops/after-sale/process', [JewelleryOpsController::class, 'processAfterSale']);
        Route::get('/jewellery-ops/after-sale', [JewelleryOpsController::class, 'afterSaleJobs']);
        Route::post('/jewellery-ops/ugc/tags', [JewelleryOpsController::class, 'recordUgcTag']);
        Route::get('/jewellery-ops/ugc', [JewelleryOpsController::class, 'ugcItems']);
        Route::get('/jewellery-ops/ugc/repost-queue', [JewelleryOpsController::class, 'ugcRepostQueue']);
        Route::post('/jewellery-ops/ugc/{itemId}/request-permission', [JewelleryOpsController::class, 'requestUgcPermission']);
        Route::post('/jewellery-ops/outreach/prospects', [JewelleryOpsController::class, 'createProspect']);
        Route::get('/jewellery-ops/outreach/prospects', [JewelleryOpsController::class, 'prospects']);
        Route::post('/jewellery-ops/outreach/prospects/{prospectId}/draft', [JewelleryOpsController::class, 'draftOutreach']);
        Route::post('/jewellery-ops/outreach/messages/{messageId}/approve', [JewelleryOpsController::class, 'approveOutreach']);
        Route::get('/jewellery-ops/outreach/messages', [JewelleryOpsController::class, 'outreachMessages']);
        Route::post('/jewellery-ops/popups', [JewelleryOpsController::class, 'upsertPopup']);
        Route::get('/jewellery-ops/popups', [JewelleryOpsController::class, 'popups']);
        Route::post('/jewellery-ops/popups/scan-alerts', [JewelleryOpsController::class, 'scanPopupAlerts']);
        Route::post('/jewellery-ops/popups/{marketId}/draft-application', [JewelleryOpsController::class, 'draftPopupApplication']);
        Route::get('/jewellery-ops/popup-applications', [JewelleryOpsController::class, 'popupApplications']);
        Route::post('/jewellery-ops/popup-applications/{applicationId}/approve', [JewelleryOpsController::class, 'approvePopupApplication']);
        Route::get('/jewellery-ops/manufacturer', [JewelleryOpsController::class, 'manufacturer']);
        Route::post('/jewellery-ops/content/cross-post', [JewelleryOpsController::class, 'scheduleCrossPost']);
        Route::post('/jewellery-ops/content/weekly-summary', [JewelleryOpsController::class, 'weeklyContentSummary']);
    });
});
