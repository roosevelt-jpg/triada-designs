<?php

namespace App\Services\Creative;

use App\Models\ContentItem;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Notify admin when creative content enters pending review.
 */
class ContentReviewNotifier
{
    public function notify(ContentItem $item, string $kind = 'creative'): array
    {
        if (! in_array($item->status, ['in_review', 'draft'], true)) {
            return ['ok' => false, 'skipped' => true, 'reason' => 'not_pending'];
        }

        $meta = $item->publish_metadata ?? [];
        if (! empty($meta['review_notified_at']) && empty($meta['force_review_notify'])) {
            return [
                'ok' => true,
                'skipped' => true,
                'reason' => 'already_notified',
                'notified_at' => $meta['review_notified_at'],
            ];
        }

        $to = (string) (config('mail.admin_notify')
            ?: env('ADMIN_NOTIFY_EMAIL')
            ?: env('MAIL_FROM_ADDRESS')
            ?: 'info@triada-designs.com');

        $appUrl = $this->publicOpsAppUrl();
        $reviewUrl = $appUrl.'/content/review?highlight='.urlencode((string) $item->id);
        $title = (string) ($item->title ?: 'Untitled creative');
        $channel = (string) ($item->channel ?: 'channel');
        $subject = 'Pending review: '.$title;

        $html = $this->brandedHtml($title, $kind, $channel, $reviewUrl);
        $text = "A new {$kind} draft is ready for preview and approval.\n\n{$title}\n{$channel} · pending review\n\nPreview & review: {$reviewUrl}";

        $apiKey = (string) (env('RESEND_API_KEY') ?: env('EMAIL_CHANNEL_API_KEY') ?: '');
        $sent = ['ok' => false, 'mode' => 'none'];

        if ($apiKey !== '') {
            $from = (string) (env('RESEND_FROM_EMAIL') ?: env('MAIL_FROM_ADDRESS') ?: 'ops@triada-designs.com');
            $fromName = (string) (env('RESEND_FROM_NAME') ?: 'Triada Designs');
            try {
                $response = Http::withToken($apiKey)
                    ->acceptJson()
                    ->post('https://api.resend.com/emails', [
                        'from' => $fromName.' <'.$from.'>',
                        'to' => [$to],
                        'subject' => $subject,
                        'html' => $html,
                        'text' => $text,
                        'tags' => [
                            ['name' => 'category', 'value' => 'content_review'],
                        ],
                    ]);
                $sent = [
                    'ok' => $response->successful(),
                    'mode' => 'resend',
                    'status' => $response->status(),
                    'id' => $response->json('id'),
                    'error' => $response->successful() ? null : $response->body(),
                ];
            } catch (\Throwable $e) {
                Log::warning('content_review_notify_failed', ['error' => $e->getMessage()]);
                $sent = ['ok' => false, 'mode' => 'resend', 'error' => $e->getMessage()];
            }
        } else {
            Log::info('content_review_notify_local', [
                'to' => $to,
                'subject' => $subject,
                'content_id' => $item->id,
            ]);
            $sent = ['ok' => true, 'mode' => 'local_fallback', 'id' => 'local-mail-'.now()->timestamp];
        }

        if ($sent['ok'] ?? false) {
            $notifiedAt = now()->toIso8601String();
            $item->forceFill([
                'publish_metadata' => array_merge($meta, [
                    'review_notified_at' => $notifiedAt,
                    'review_notify_mode' => $sent['mode'] ?? null,
                ]),
            ])->save();
            $sent['notified_at'] = $notifiedAt;
        }

        return array_merge($sent, [
            'to' => $to,
            'content_id' => $item->id,
            'review_url' => $reviewUrl,
        ]);
    }

    /**
     * Public ops dashboard origin for Resend CTAs.
     * Rejects *.trycloudflare.com, *.vercel.app, localhost, and the API host.
     */
    protected function publicOpsAppUrl(): string
    {
        $canonical = 'https://dashboard.triada-designs.com';
        foreach ([
            env('OPS_APP_URL'),
            env('FRONTEND_URL'),
            env('NEXT_PUBLIC_APP_URL'),
            env('APP_URL'),
        ] as $candidate) {
            $origin = $this->normalizePublicOrigin((string) $candidate);
            if ($origin !== null) {
                return $origin;
            }
        }

        return $canonical;
    }

    protected function normalizePublicOrigin(string $value): ?string
    {
        $raw = trim($value);
        if ($raw === '') {
            return null;
        }
        if (! preg_match('#^https?://#i', $raw)) {
            $raw = 'https://'.$raw;
        }
        $parts = parse_url($raw);
        $host = strtolower((string) ($parts['host'] ?? ''));
        if ($host === '' || $this->isEphemeralOrDisallowedHost($host)) {
            return null;
        }
        $scheme = strtolower((string) ($parts['scheme'] ?? 'https'));
        if (! in_array($scheme, ['http', 'https'], true)) {
            $scheme = 'https';
        }

        return rtrim($scheme.'://'.$host, '/');
    }

    protected function isEphemeralOrDisallowedHost(string $host): bool
    {
        $host = strtolower(trim($host));
        if ($host === '' || $host === 'localhost' || $host === '127.0.0.1' || $host === '0.0.0.0' || $host === '::1') {
            return true;
        }
        if ($host === 'trycloudflare.com' || str_ends_with($host, '.trycloudflare.com')) {
            return true;
        }
        if (str_ends_with($host, '.loca.lt') || str_ends_with($host, '.ngrok.io') || str_ends_with($host, '.ngrok-free.app')) {
            return true;
        }
        if (str_ends_with($host, '.vercel.app') || str_ends_with($host, '.now.sh')) {
            return true;
        }
        if ($host === 'api.triada-designs.com') {
            return true;
        }

        return ! $this->isAllowedProductionAppHost($host);
    }

    protected function isAllowedProductionAppHost(string $host): bool
    {
        if ($host === 'dashboard.triada-designs.com' || $host === 'ops.triada-designs.com') {
            return true;
        }

        return str_ends_with($host, '.triada-designs.com') && ! str_starts_with($host, 'api.');
    }

    protected function brandedHtml(string $title, string $kind, string $channel, string $url): string
    {
        $safeTitle = e($title);
        $safeKind = e($kind);
        $safeChannel = e($channel);
        $safeUrl = e($url);
        $logo = 'https://triada-designs.com/wp-content/uploads/2025/07/TM_Schriftzug_vulcano.svg';

        return <<<HTML
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Pending review</title></head>
<body style="margin:0;padding:0;background:#f7f3ee;font-family:Georgia,'Times New Roman',serif;color:#303031;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ee;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e6ddd2;">
        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #e6ddd2;">
          <img src="{$logo}" alt="Triada Designs" width="180" style="display:block;height:auto;max-width:180px;border:0;" />
        </td></tr>
        <tr><td style="padding:28px 32px;font-size:15px;line-height:1.55;">
          <p style="margin:0 0 16px;">Warm greetings from Triada Designs,</p>
          <p style="margin:0 0 14px;">A new <strong>{$safeKind}</strong> draft is ready for preview and approval.</p>
          <p style="margin:0 0 8px;"><strong>{$safeTitle}</strong></p>
          <p style="margin:0 0 18px;color:#9a7958;">{$safeChannel} · pending review</p>
          <p style="margin:0 0 8px;">
            <a href="{$safeUrl}" style="display:inline-block;padding:12px 22px;background:#000000;color:#c4a882;text-decoration:none;font-weight:600;border-radius:4px;">Preview &amp; review</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #e6ddd2;font-size:12px;line-height:1.5;color:#9a7958;">
          <strong style="color:#303031;">Triada Designs</strong><br/>
          Strada Horia Creanga 22-24, Timisoara 300254, Romania<br/>
          info@triada-designs.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
HTML;
    }
}
