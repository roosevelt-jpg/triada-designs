<?php

namespace App\Services\JewelleryOps;

use App\Models\CommerceOrder;
use App\Models\Invoice;
use App\Models\Workspace;
use App\Services\CRM\Zoho\ZohoBooksClient;

class InvoiceService
{
    public function __construct(protected ZohoBooksClient $books)
    {
    }

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
                'accounting_ref' => null,
                'einvoice_provider' => $type === 'b2b' ? 'uae_einvoice' : null,
                'einvoice_status' => $type === 'b2b' ? 'local_sim' : null,
                'line_items' => $order->line_items,
                'issued_at' => now(),
                'metadata' => [
                    'accounting' => 'zoho_books',
                    'note' => 'Routing through Zoho Books adapter (local_sim until OAuth + organization_id + live mode).',
                ],
            ]
        );

        $issued = $this->books->issueInvoice($workspace, $invoice, $order, $options);

        $invoice->forceFill([
            'accounting_ref' => $issued['accounting_ref'] ?? $invoice->accounting_ref,
            'einvoice_provider' => $issued['einvoice_provider'] ?? $invoice->einvoice_provider,
            'einvoice_status' => $issued['einvoice_status'] ?? $invoice->einvoice_status,
            'pdf_path' => $issued['pdf']['path'] ?? $invoice->pdf_path,
            'pdf_mode' => $issued['pdf']['mode'] ?? 'local_sim',
            'status' => 'sent',
            'sent_at' => now(),
            'metadata' => array_merge($invoice->metadata ?? [], [
                'accounting' => $issued['provider'] ?? 'zoho_books',
                'accounting_mode' => $issued['mode'] ?? 'local_sim',
                'note' => $issued['note'] ?? ($invoice->metadata['note'] ?? null),
                'books_error' => $issued['error'] ?? null,
            ]),
        ])->save();

        return [
            'ok' => true,
            'invoice' => $invoice->fresh(),
            'pdf' => $issued['pdf'] ?? null,
            'books' => [
                'mode' => $issued['mode'] ?? 'local_sim',
                'provider' => $issued['provider'] ?? 'zoho_books',
                'accounting_ref' => $issued['accounting_ref'] ?? null,
            ],
            'customer_delivery' => [
                'channel' => $order->customer_email ? 'email' : 'local_sim',
                'to' => $order->customer_email,
                'mode' => 'local_sim',
            ],
        ];
    }
}
