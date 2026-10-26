<?php

namespace App\Services\CRM\Zoho;

use App\Models\CommerceOrder;
use App\Models\Invoice;
use App\Models\Workspace;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Zoho Books (preferred) / Invoice path for accounting PDFs and UAE e-invoicing.
 * CRM alone cannot issue compliant invoices — Books holds the invoice + PDF APIs.
 * local_sim until OAuth + organization_id + INTEGRATION_MODE=live.
 */
class ZohoBooksClient
{
    public function __construct(protected ZohoCredentialStore $credentials)
    {
    }

    public function provider(): string
    {
        return 'zoho_books';
    }

    public function mode(): string
    {
        $mode = (string) config('integrations.mode', 'local');

        return $mode === 'mock' ? 'local' : $mode;
    }

    public function usesLocalFallback(?Workspace $workspace = null): bool
    {
        return $this->mode() !== 'live' || ! $this->credentials->isBooksConfigured($workspace);
    }

    /**
     * @return array<string, mixed>
     */
    public function healthCheck(?Workspace $workspace = null): array
    {
        if ($this->usesLocalFallback($workspace)) {
            $awaiting = ! $this->credentials->isBooksConfigured($workspace);

            return [
                'status' => $awaiting ? 'awaiting_credentials' : 'seeded',
                'mode' => 'local',
                'configured' => $this->credentials->isBooksConfigured($workspace),
                'oauth_present' => $this->credentials->isConfigured($workspace),
                'organization_id_present' => $this->credentials->organizationId($workspace) !== '',
                'message' => $awaiting
                    ? 'Zoho Books awaiting OAuth + organization ID. Invoice PDF / UAE e-invoice stay on local_sim.'
                    : 'Zoho Books credentials present but INTEGRATION_MODE is not live — local_sim only.',
            ];
        }

        try {
            $org = $this->credentials->organizationId($workspace);
            $response = $this->api($workspace)->get('/books/v3/organizations/'.$org);

            if (! $response->successful()) {
                // Some accounts only allow list endpoint
                $response = $this->api($workspace)->get('/books/v3/organizations', [
                    'organization_id' => $org,
                ]);
            }

            if (! $response->successful()) {
                return [
                    'status' => 'error',
                    'mode' => 'live',
                    'configured' => true,
                    'message' => 'Zoho Books health failed: HTTP '.$response->status(),
                ];
            }

            return [
                'status' => 'healthy',
                'mode' => 'live',
                'configured' => true,
                'message' => 'Zoho Books reachable for org '.$org,
            ];
        } catch (\Throwable $e) {
            Log::warning('zoho_books.health_failed', ['error' => $e->getMessage()]);

            return [
                'status' => 'error',
                'mode' => 'live',
                'configured' => true,
                'message' => 'Zoho Books health exception: '.$e->getMessage(),
            ];
        }
    }

    /**
     * Create/update invoice in Zoho Books (or local_sim), attach PDF path, and
     * for B2B mark UAE e-invoice adapter status.
     *
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function issueInvoice(Workspace $workspace, Invoice $invoice, CommerceOrder $order, array $options = []): array
    {
        if ($this->usesLocalFallback($workspace)) {
            return $this->localSimIssue($workspace, $invoice, $order);
        }

        try {
            $org = $this->credentials->organizationId($workspace);
            $lineItems = collect($order->line_items ?? [])->map(function ($line) {
                $row = is_array($line) ? $line : (array) $line;

                return [
                    'name' => (string) ($row['title'] ?? $row['sku'] ?? 'Item'),
                    'rate' => (float) ($row['price'] ?? $row['rate'] ?? 0),
                    'quantity' => (float) ($row['quantity'] ?? 1),
                ];
            })->values()->all();

            if ($lineItems === []) {
                $lineItems = [[
                    'name' => 'Triada Designs order '.$order->order_number,
                    'rate' => (float) $order->total,
                    'quantity' => 1,
                ]];
            }

            $payload = [
                'customer_name' => (string) ($order->customer_name ?? $order->customer_email ?? 'Customer'),
                'reference_number' => (string) $order->order_number,
                'invoice_number' => (string) $invoice->invoice_number,
                'date' => now()->toDateString(),
                'line_items' => $lineItems,
                'notes' => $invoice->type === 'b2b'
                    ? 'UAE B2B e-invoice path via Zoho Books'
                    : 'B2C invoice via Zoho Books',
            ];

            $response = $this->api($workspace)->post('/books/v3/invoices', $payload + [
                'organization_id' => $org,
            ]);

            if (! $response->successful()) {
                throw new RuntimeException('Zoho Books create invoice failed: HTTP '.$response->status());
            }

            $remoteId = (string) ($response->json('invoice.invoice_id') ?? $response->json('invoice_id') ?? '');
            $pdf = $this->fetchPdf($workspace, $remoteId, $invoice);

            $einvoice = null;
            if ($invoice->type === 'b2b') {
                $einvoice = $this->submitUaeEinvoice($workspace, $remoteId);
            }

            return [
                'ok' => true,
                'mode' => 'live',
                'provider' => 'zoho_books',
                'accounting_ref' => $remoteId !== '' ? 'zoho-books-'.$remoteId : 'zoho-books-pending',
                'einvoice_provider' => $invoice->type === 'b2b' ? 'zoho_books_uae' : null,
                'einvoice_status' => $einvoice['status'] ?? ($invoice->type === 'b2b' ? 'queued' : null),
                'pdf' => $pdf,
                'raw' => $response->json(),
            ];
        } catch (\Throwable $e) {
            Log::warning('zoho_books.issue_failed', ['error' => $e->getMessage()]);

            $local = $this->localSimIssue($workspace, $invoice, $order);
            $local['error'] = $e->getMessage();
            $local['fallback'] = 'local_sim_after_live_error';

            return $local;
        }
    }

    /**
     * @return array{path:string,mode:string,url:?string,bytes?:int}
     */
    protected function fetchPdf(Workspace $workspace, string $remoteInvoiceId, Invoice $invoice): array
    {
        if ($remoteInvoiceId === '') {
            return $this->writeLocalPdf($workspace, $invoice, 'live_pending_id');
        }

        $org = $this->credentials->organizationId($workspace);
        $response = $this->api($workspace)
            ->accept('application/pdf')
            ->get('/books/v3/invoices/'.$remoteInvoiceId, [
                'organization_id' => $org,
                'accept' => 'pdf',
            ]);

        if (! $response->successful()) {
            return $this->writeLocalPdf($workspace, $invoice, 'pdf_fetch_failed_'.$response->status());
        }

        $path = 'invoices/'.$workspace->id.'/'.$invoice->invoice_number.'.pdf';
        Storage::disk('local')->put($path, $response->body());

        return [
            'path' => $path,
            'mode' => 'live',
            'url' => null,
            'bytes' => strlen($response->body()),
            'provider' => 'zoho_books',
        ];
    }

    /**
     * Stub for UAE e-invoicing submission through Zoho Books compliance APIs.
     * Exact FTA / Peppol path depends on Zoho org region settings — live call is best-effort.
     *
     * @return array<string, mixed>
     */
    protected function submitUaeEinvoice(Workspace $workspace, string $remoteInvoiceId): array
    {
        $org = $this->credentials->organizationId($workspace);

        try {
            // Best-effort: Zoho Books e-invoice / push endpoints vary by region.
            $response = $this->api($workspace)->post('/books/v3/invoices/'.$remoteInvoiceId.'/status/sent', [
                'organization_id' => $org,
            ]);

            return [
                'status' => $response->successful() ? 'submitted' : 'queued',
                'http' => $response->status(),
                'provider' => 'zoho_books_uae',
                'note' => 'UAE e-invoice marked via Zoho Books; confirm FTA/e-invoicing enablement in Zoho org settings.',
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'queued',
                'provider' => 'zoho_books_uae',
                'error' => $e->getMessage(),
            ];
        }
    }

    /**
     * @return array<string, mixed>
     */
    protected function localSimIssue(Workspace $workspace, Invoice $invoice, CommerceOrder $order): array
    {
        $pdf = $this->writeLocalPdf($workspace, $invoice, $invoice->type === 'b2b'
            ? 'UAE e-invoicing: local_sim pending Zoho Books credentials'
            : 'B2C PDF local_sim via Zoho Books adapter');

        return [
            'ok' => true,
            'mode' => 'local_sim',
            'provider' => 'zoho_books',
            'accounting_ref' => 'local-acct-'.Str::lower(Str::random(6)),
            'einvoice_provider' => $invoice->type === 'b2b' ? 'uae_einvoice' : null,
            'einvoice_status' => $invoice->type === 'b2b' ? 'local_sim' : null,
            'pdf' => $pdf,
            'note' => $invoice->type === 'b2b'
                ? 'B2B path routed through Zoho Books UAE e-invoicing adapter (local_sim until credentials).'
                : 'B2C invoice recorded in Zoho Books adapter (local_sim) and PDF generated.',
        ];
    }

    /**
     * @return array{path:string,mode:string,url:?string,bytes:int,provider:string}
     */
    protected function writeLocalPdf(Workspace $workspace, Invoice $invoice, string $extraLine): array
    {
        $lines = [
            'TRIADA DESIGNS — INVOICE (Zoho Books adapter)',
            'Invoice: '.$invoice->invoice_number,
            'Type: '.$invoice->type,
            'Amount: '.$invoice->amount.' '.$invoice->currency,
            'Issued: '.now()->toDateString(),
            $extraLine,
        ];
        $body = implode("\n", $lines);
        $path = 'invoices/'.$workspace->id.'/'.$invoice->invoice_number.'.txt';
        Storage::disk('local')->put($path, $body);

        return [
            'path' => $path,
            'mode' => 'local_sim',
            'url' => null,
            'bytes' => strlen($body),
            'provider' => 'zoho_books',
        ];
    }

    protected function api(?Workspace $workspace = null)
    {
        return Http::baseUrl(rtrim((string) config('integrations.zoho.api_domain'), '/'))
            ->timeout((int) config('integrations.zoho.timeout', 15))
            ->withToken($this->accessToken($workspace))
            ->acceptJson();
    }

    protected function accessToken(?Workspace $workspace = null): string
    {
        $configured = $this->credentials->accessToken($workspace);
        if ($configured !== '') {
            return $configured;
        }

        $response = Http::asForm()
            ->timeout((int) config('integrations.zoho.timeout', 15))
            ->post(rtrim((string) config('integrations.zoho.accounts_url'), '/').'/oauth/v2/token', [
                'refresh_token' => $this->credentials->refreshToken($workspace),
                'client_id' => $this->credentials->clientId($workspace),
                'client_secret' => $this->credentials->clientSecret($workspace),
                'grant_type' => 'refresh_token',
            ]);

        if (! $response->successful() || blank($response->json('access_token'))) {
            throw new RuntimeException('Unable to refresh Zoho access token for Books.');
        }

        return (string) $response->json('access_token');
    }
}
