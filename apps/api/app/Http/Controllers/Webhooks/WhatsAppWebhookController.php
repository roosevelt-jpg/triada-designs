<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Services\Messaging\Meta\MetaControlPlane;
use App\Services\Messaging\Meta\MetaInboundProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * WhatsApp Cloud API can use the shared Meta webhook or this dedicated path.
 * Behavior mirrors MetaWebhookController for day-to-day Triada ops.
 */
class WhatsAppWebhookController extends Controller
{
    public function __construct(protected MetaWebhookController $meta)
    {
    }

    public function verify(Request $request, MetaControlPlane $controlPlane): Response|JsonResponse
    {
        return $this->meta->verify($request, $controlPlane);
    }

    public function ingest(
        Request $request,
        MetaInboundProcessor $processor,
        \App\Services\Messaging\Meta\FacebookMessengerAdapter $facebook,
    ): JsonResponse {
        return $this->meta->ingest($request, $processor, $facebook);
    }
}
