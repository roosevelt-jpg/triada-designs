<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AbandonmentEvent;
use App\Models\AfterSaleJob;
use App\Models\CommerceOrder;
use App\Models\CustomPieceRequest;
use App\Models\GiftSession;
use App\Models\Invoice;
use App\Models\OutreachMessage;
use App\Models\OutreachProspect;
use App\Models\PopupApplication;
use App\Models\PopupMarket;
use App\Models\TelegramAlert;
use App\Models\User;
use App\Models\UgcItem;
use App\Models\WaitlistEntry;
use App\Models\Workspace;
use App\Services\JewelleryOps\AbandonmentService;
use App\Services\JewelleryOps\AfterSaleService;
use App\Services\JewelleryOps\AnswerBotService;
use App\Services\JewelleryOps\ContentScheduleService;
use App\Services\JewelleryOps\CustomPieceService;
use App\Services\JewelleryOps\GiftFinderService;
use App\Services\JewelleryOps\JewelleryKnowledge;
use App\Services\JewelleryOps\ManufacturerService;
use App\Services\JewelleryOps\OrderLifecycleService;
use App\Services\JewelleryOps\OutreachCrmService;
use App\Services\JewelleryOps\PopupMarketService;
use App\Services\JewelleryOps\TelegramAlertService;
use App\Services\JewelleryOps\UgcService;
use App\Services\JewelleryOps\WaitlistService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JewelleryOpsController extends Controller
{
    protected function workspaceId(Request $request): string
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');
        abort_unless($workspaceId, 403, 'No workspace membership.');

        return (string) $workspaceId;
    }

    protected function workspace(Request $request): Workspace
    {
        return Workspace::query()->findOrFail($this->workspaceId($request));
    }

    public function overview(Request $request): JsonResponse
    {
        $ws = $this->workspace($request);

        return response()->json([
            'ok' => true,
            'automations' => [
                'one_inbox' => 'channels: instagram, facebook, tiktok, whatsapp, telegram → /inbox',
                'answer_bot' => true,
                'gift_finder' => true,
                'custom_pieces' => true,
                'order_lifecycle_whatsapp' => true,
                'automatic_invoice' => true,
                'telegram_alerts' => true,
                'abandonment_followup' => true,
                'waitlist_vip_drops' => true,
                'after_sale' => true,
                'ugc' => true,
                'outreach_crm' => true,
                'popup_markets' => true,
                'manufacturer' => true,
                'content_schedule' => true,
            ],
            'counts' => [
                'orders' => CommerceOrder::query()->where('workspace_id', $ws->id)->count(),
                'invoices' => Invoice::query()->where('workspace_id', $ws->id)->count(),
                'gift_sessions' => GiftSession::query()->where('workspace_id', $ws->id)->count(),
                'custom_requests' => CustomPieceRequest::query()->where('workspace_id', $ws->id)->count(),
                'waitlist' => WaitlistEntry::query()->where('workspace_id', $ws->id)->count(),
                'abandonment' => AbandonmentEvent::query()->where('workspace_id', $ws->id)->count(),
                'telegram_alerts' => TelegramAlert::query()->where('workspace_id', $ws->id)->count(),
                'after_sale_jobs' => AfterSaleJob::query()->where('workspace_id', $ws->id)->count(),
                'ugc' => UgcItem::query()->where('workspace_id', $ws->id)->count(),
                'outreach_prospects' => OutreachProspect::query()->where('workspace_id', $ws->id)->count(),
                'popup_markets' => PopupMarket::query()->where('workspace_id', $ws->id)->count(),
            ],
            'policies' => app(JewelleryKnowledge::class)->policies(),
        ]);
    }

    public function policies(JewelleryKnowledge $knowledge): JsonResponse
    {
        return response()->json(['data' => $knowledge->policies()]);
    }

    public function answerBot(Request $request, AnswerBotService $bot): JsonResponse
    {
        $data = $request->validate([
            'message' => ['required', 'string', 'max:4000'],
            'conversation_id' => ['nullable', 'string'],
            'contact_id' => ['nullable', 'string'],
            'dry_run' => ['nullable', 'boolean'],
        ]);

        return response()->json($bot->handle($this->workspace($request), $data['message'], $data));
    }

    public function giftFinder(Request $request, GiftFinderService $gifts): JsonResponse
    {
        return response()->json($gifts->suggest($this->workspace($request), $request->all()));
    }

    public function giftSessions(Request $request): JsonResponse
    {
        $rows = GiftSession::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(50)->get();

        return response()->json(['data' => $rows]);
    }

    public function customPiece(Request $request, CustomPieceService $svc): JsonResponse
    {
        return response()->json($svc->collect($this->workspace($request), $request->all()), 201);
    }

    public function approveCustomQuote(Request $request, CustomPieceService $svc): JsonResponse
    {
        $data = $request->validate([
            'price' => ['required', 'numeric', 'min:0'],
        ]);

        return response()->json($svc->approveQuote(
            $this->workspace($request),
            (string) $request->route('requestId'),
            (float) $data['price'],
            (int) $request->user()->id
        ));
    }

    public function customRequests(Request $request): JsonResponse
    {
        return response()->json([
            'data' => CustomPieceRequest::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function upsertOrder(Request $request, OrderLifecycleService $orders): JsonResponse
    {
        return response()->json($orders->createOrUpdate($this->workspace($request), $request->all()), 201);
    }

    public function orders(Request $request): JsonResponse
    {
        return response()->json([
            'data' => CommerceOrder::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function whereIsMyOrder(Request $request, OrderLifecycleService $orders): JsonResponse
    {
        $data = $request->validate(['query' => ['required', 'string', 'max:200']]);

        return response()->json($orders->whereIsMyOrder($this->workspace($request), $data['query']));
    }

    public function invoices(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Invoice::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function telegramAlerts(Request $request): JsonResponse
    {
        return response()->json([
            'data' => TelegramAlert::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function sendTelegramAlert(Request $request, TelegramAlertService $alerts): JsonResponse
    {
        $data = $request->validate([
            'alert_type' => ['required', 'string'],
            'title' => ['required', 'string', 'max:200'],
            'body' => ['nullable', 'string'],
        ]);

        return response()->json($alerts->send(
            $this->workspace($request),
            $data['alert_type'],
            $data['title'],
            $data['body'] ?? null,
            $request->input('payload', [])
        ), 201);
    }

    public function trackAbandonment(Request $request, AbandonmentService $svc): JsonResponse
    {
        return response()->json($svc->track($this->workspace($request), $request->all()), 201);
    }

    public function processAbandonment(Request $request, AbandonmentService $svc): JsonResponse
    {
        return response()->json($svc->processDue($this->workspace($request)));
    }

    public function abandonment(Request $request): JsonResponse
    {
        return response()->json([
            'data' => AbandonmentEvent::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function joinWaitlist(Request $request, WaitlistService $svc): JsonResponse
    {
        return response()->json($svc->join($this->workspace($request), $request->all()), 201);
    }

    public function waitlist(Request $request): JsonResponse
    {
        return response()->json([
            'data' => WaitlistEntry::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function notifyWaitlist(Request $request, WaitlistService $svc): JsonResponse
    {
        $data = $request->validate([
            'sku' => ['required', 'string'],
            'size' => ['nullable', 'string'],
        ]);

        return response()->json($svc->notifyRestock($this->workspace($request), $data['sku'], $data['size'] ?? null));
    }

    public function vipDrop(Request $request, WaitlistService $svc): JsonResponse
    {
        return response()->json($svc->announceVipDrop($this->workspace($request), $request->all()));
    }

    public function processAfterSale(Request $request, AfterSaleService $svc): JsonResponse
    {
        return response()->json($svc->processDue($this->workspace($request)));
    }

    public function afterSaleJobs(Request $request): JsonResponse
    {
        return response()->json([
            'data' => AfterSaleJob::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function recordUgcTag(Request $request, UgcService $svc): JsonResponse
    {
        return response()->json($svc->recordTag($this->workspace($request), $request->all()), 201);
    }

    public function ugcRepostQueue(Request $request, UgcService $svc): JsonResponse
    {
        return response()->json($svc->listRepostQueue($this->workspace($request)));
    }

    public function requestUgcPermission(Request $request, UgcService $svc): JsonResponse
    {
        return response()->json($svc->requestRepostPermission($this->workspace($request), (string) $request->route('itemId')));
    }

    public function ugcItems(Request $request): JsonResponse
    {
        return response()->json([
            'data' => UgcItem::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function createProspect(Request $request, OutreachCrmService $svc): JsonResponse
    {
        return response()->json($svc->upsertProspect($this->workspace($request), $request->all()), 201);
    }

    public function prospects(Request $request): JsonResponse
    {
        return response()->json([
            'data' => OutreachProspect::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function draftOutreach(Request $request, OutreachCrmService $svc): JsonResponse
    {
        $result = $svc->draftMessage($this->workspace($request), (string) $request->route('prospectId'), $request->all());
        $code = ($result['ok'] ?? false) ? 201 : 200;

        return response()->json($result, $code);
    }

    public function approveOutreach(Request $request, OutreachCrmService $svc): JsonResponse
    {
        return response()->json($svc->approveAndSend(
            $this->workspace($request),
            (string) $request->route('messageId'),
            (int) $request->user()->id
        ));
    }

    public function outreachMessages(Request $request): JsonResponse
    {
        return response()->json([
            'data' => OutreachMessage::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function upsertPopup(Request $request, PopupMarketService $svc): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:200']]);

        return response()->json($svc->upsertMarket($this->workspace($request), array_merge($request->all(), $data)), 201);
    }

    public function popups(Request $request): JsonResponse
    {
        return response()->json([
            'data' => PopupMarket::query()->where('workspace_id', $this->workspaceId($request))->orderBy('application_deadline')->get(),
        ]);
    }

    public function scanPopupAlerts(Request $request, PopupMarketService $svc): JsonResponse
    {
        return response()->json($svc->scanAlerts($this->workspace($request)));
    }

    public function draftPopupApplication(Request $request, PopupMarketService $svc): JsonResponse
    {
        return response()->json($svc->draftApplication($this->workspace($request), (string) $request->route('marketId')), 201);
    }

    public function approvePopupApplication(Request $request, PopupMarketService $svc): JsonResponse
    {
        return response()->json($svc->approveApplication(
            $this->workspace($request),
            (string) $request->route('applicationId'),
            (int) $request->user()->id
        ));
    }

    public function popupApplications(Request $request): JsonResponse
    {
        return response()->json([
            'data' => PopupApplication::query()->where('workspace_id', $this->workspaceId($request))->latest()->limit(100)->get(),
        ]);
    }

    public function manufacturer(Request $request, ManufacturerService $svc): JsonResponse
    {
        return response()->json($svc->overview($this->workspace($request)));
    }

    public function scheduleCrossPost(Request $request, ContentScheduleService $svc): JsonResponse
    {
        $data = $request->validate([
            'content_id' => ['required', 'string'],
            'channels' => ['nullable', 'array'],
            'scheduled_for' => ['nullable', 'string'],
        ]);

        return response()->json($svc->scheduleCrossPost(
            $this->workspace($request),
            $data['content_id'],
            $data['channels'] ?? [],
            $data['scheduled_for'] ?? null
        ));
    }

    public function weeklyContentSummary(Request $request, ContentScheduleService $svc): JsonResponse
    {
        return response()->json($svc->weeklyPerformanceSummary($this->workspace($request)));
    }
}
