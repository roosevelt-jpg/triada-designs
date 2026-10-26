<?php

namespace App\Services\JewelleryOps;

use App\Models\AfterSaleJob;
use App\Models\CommerceOrder;
use App\Models\Workspace;
use Illuminate\Support\Str;

class OrderLifecycleService
{
    public function __construct(
        protected InvoiceService $invoices,
        protected ManufacturerService $manufacturer,
        protected TelegramAlertService $alerts,
    ) {
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function createOrUpdate(Workspace $workspace, array $input): array
    {
        $orderNumber = (string) ($input['order_number'] ?? ('TD-'.strtoupper(Str::random(8))));
        $status = (string) ($input['lifecycle_status'] ?? 'confirmed');
        $total = (float) ($input['total'] ?? 0);

        $order = CommerceOrder::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'order_number' => $orderNumber,
            ],
            [
                'contact_id' => $input['contact_id'] ?? null,
                'external_order_id' => $input['external_order_id'] ?? null,
                'channel' => $input['channel'] ?? 'shopify',
                'lifecycle_status' => $status,
                'currency' => $input['currency'] ?? 'AED',
                'subtotal' => $input['subtotal'] ?? $total,
                'total' => $total,
                'tracking_number' => $input['tracking_number'] ?? null,
                'tracking_url' => $input['tracking_url'] ?? null,
                'whatsapp_opt_in' => (bool) ($input['whatsapp_opt_in'] ?? false),
                'customer_phone' => $input['customer_phone'] ?? null,
                'customer_email' => $input['customer_email'] ?? null,
                'line_items' => $input['line_items'] ?? [],
                'metadata' => $input['metadata'] ?? [],
            ]
        );

        $this->stampStatus($order, $status);

        $messages = [];
        if ($order->whatsapp_opt_in) {
            $messages[] = $this->lifecycleWhatsAppCopy($order);
        }

        $invoice = null;
        if (in_array($status, ['confirmed', 'paid'], true) || ! empty($input['paid'])) {
            $invoice = $this->invoices->createForOrder($workspace, $order, [
                'type' => ($input['b2b'] ?? false) ? 'b2b' : 'b2c',
            ]);
        }

        $mfr = $this->manufacturer->pushOrder($workspace, $order);

        if ($total >= (float) ($input['big_order_threshold'] ?? 5000)) {
            $this->alerts->send($workspace, 'big_order', 'Big order '.$order->order_number, 'Total '.$order->total.' '.$order->currency, [
                'order_id' => $order->id,
            ]);
        }

        if ($status === 'delivered') {
            $this->scheduleAfterSale($workspace, $order);
        }

        return [
            'ok' => true,
            'order' => $order->fresh(),
            'whatsapp_messages' => $messages,
            'invoice' => $invoice,
            'manufacturer_order' => $mfr,
            'note' => $order->whatsapp_opt_in
                ? 'Lifecycle WhatsApp messages queued for opted-in customer (business only).'
                : 'No WhatsApp send — customer not opted in.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function whereIsMyOrder(Workspace $workspace, string $query): array
    {
        $order = CommerceOrder::query()
            ->where('workspace_id', $workspace->id)
            ->where(function ($q) use ($query) {
                $q->where('order_number', $query)
                    ->orWhere('external_order_id', $query)
                    ->orWhere('customer_email', $query)
                    ->orWhere('customer_phone', $query)
                    ->orWhere('tracking_number', $query);
            })
            ->orderByDesc('created_at')
            ->first();

        if (! $order) {
            return [
                'ok' => false,
                'found' => false,
                'reply' => JewelleryKnowledge::AI_DISCLOSURE.' I could not find that order. Share the order number or the email/phone used at checkout and I will look again — or I can connect you to a person.',
            ];
        }

        $reply = JewelleryKnowledge::AI_DISCLOSURE.' Order '.$order->order_number.' is currently **'.$order->lifecycle_status.'**.';
        if ($order->tracking_number) {
            $reply .= ' Tracking: '.$order->tracking_number.($order->tracking_url ? ' ('.$order->tracking_url.')' : '');
        }
        $reply = str_replace('**', '', $reply);

        return [
            'ok' => true,
            'found' => true,
            'order' => $order,
            'reply' => $reply,
        ];
    }

    protected function stampStatus(CommerceOrder $order, string $status): void
    {
        $map = [
            'confirmed' => 'confirmed_at',
            'in_production' => 'in_production_at',
            'shipped' => 'shipped_at',
            'delivered' => 'delivered_at',
        ];
        if (isset($map[$status]) && empty($order->{$map[$status]})) {
            $order->forceFill([$map[$status] => now(), 'lifecycle_status' => $status])->save();
        } else {
            $order->forceFill(['lifecycle_status' => $status])->save();
        }
    }

    protected function lifecycleWhatsAppCopy(CommerceOrder $order): array
    {
        $status = $order->lifecycle_status;
        $body = match ($status) {
            'confirmed' => "Order {$order->order_number} confirmed. We will start production shortly (~7 days to make).",
            'in_production' => "Order {$order->order_number} is in production.",
            'shipped' => "Order {$order->order_number} shipped".($order->tracking_number ? " — tracking {$order->tracking_number}" : '').'.',
            'delivered' => "Order {$order->order_number} marked delivered. Care tips follow shortly.",
            default => "Order {$order->order_number} update: {$status}.",
        };

        return [
            'channel' => 'whatsapp',
            'opt_in' => true,
            'body' => $body,
            'mode' => 'local_sim',
            'business_only' => true,
        ];
    }

    protected function scheduleAfterSale(Workspace $workspace, CommerceOrder $order): void
    {
        $jobs = [
            ['job_type' => 'care_tips', 'run_at' => now()->addHours(2)],
            ['job_type' => 'review_request', 'run_at' => now()->addDays(3)],
            ['job_type' => 'complete_the_set', 'run_at' => now()->addDays(5)],
            ['job_type' => 'ugc_invite', 'run_at' => now()->addDays(4)],
        ];

        foreach ($jobs as $job) {
            AfterSaleJob::query()->firstOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'commerce_order_id' => $order->id,
                    'job_type' => $job['job_type'],
                ],
                [
                    'contact_id' => $order->contact_id,
                    'status' => 'scheduled',
                    'run_at' => $job['run_at'],
                    'channel' => $order->whatsapp_opt_in ? 'whatsapp' : 'email',
                    'payload' => ['order_number' => $order->order_number],
                ]
            );
        }
    }
}
