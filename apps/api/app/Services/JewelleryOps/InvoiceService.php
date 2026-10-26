<?php

namespace App\Services\JewelleryOps;

use App\Models\CommerceOrder;
use App\Models\Invoice;
use App\Models\Workspace;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class InvoiceService
{
    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function createForOrder(Workspace $workspace, CommerceOrder $order, array $options = []): array
    {
        $type = (string) ($options['type'] ?? 'b2c');
        $number = (string) ($options['invoice_number'] ?? ('INV-'.$order->order_number));

        $invoice = Invoice::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'invoice_number' => $number,
            ],
            [
                'commerce_order_id' => $order->id,
                'contact_id' => $order->contact_id,
                'type' => $type,
                'status' => 'issued',
                'currency' => $order->currency,
                'amount' => $order->total,
                'accounting_ref' => 'local-acct-'.Str::lower(Str::random(6)),
                'einvoice_provider' => $type === 'b2b' ? 'uae_einvoice' : null,
                'einvoice_status' => $type === 'b2b' ? 'local_sim' : null,
                'line_items' => $order->line_items,
                'issued_at' => now(),
                'metadata' => [
                    'accounting' => 'local_sim',
                    'note' => $type === 'b2b'
                        ? 'B2B path routed through UAE e-invoicing provider adapter (local_sim until credentials).'
                        : 'B2C invoice recorded in accounting adapter (local_sim) and PDF generated.',
                ],
            ]
        );

        $pdf = $this->renderPdf($workspace, $invoice, $order);
        $invoice->forceFill([
            'pdf_path' => $pdf['path'],
            'pdf_mode' => $pdf['mode'],
            'status' => 'sent',
            'sent_at' => now(),
        ])->save();

        return [
            'ok' => true,
            'invoice' => $invoice->fresh(),
            'pdf' => $pdf,
            'customer_delivery' => [
                'channel' => $order->customer_email ? 'email' : 'local_sim',
                'to' => $order->customer_email,
                'mode' => 'local_sim',
            ],
        ];
    }

    /**
     * @return array{path:string,mode:string,url:?string}
     */
    protected function renderPdf(Workspace $workspace, Invoice $invoice, CommerceOrder $order): array
    {
        $lines = [
            'TRIADA DESIGNS — INVOICE',
            'Invoice: '.$invoice->invoice_number,
            'Order: '.$order->order_number,
            'Type: '.$invoice->type,
            'Amount: '.$invoice->amount.' '.$invoice->currency,
            'Issued: '.now()->toDateString(),
            $invoice->type === 'b2b' ? 'UAE e-invoicing: local_sim pending provider credentials' : 'B2C PDF',
            'Line items: '.json_encode($order->line_items ?? []),
        ];
        $body = implode("\n", $lines);
        $path = 'invoices/'.$workspace->id.'/'.$invoice->invoice_number.'.txt';
        Storage::disk('local')->put($path, $body);

        return [
            'path' => $path,
            'mode' => 'local_sim',
            'url' => null,
            'bytes' => strlen($body),
        ];
    }
}
