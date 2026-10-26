<?php

namespace App\Services\JewelleryOps;

use App\Models\TelegramAlert;
use App\Models\Workspace;
use Illuminate\Support\Facades\Http;

class TelegramAlertService
{
    public const PRIORITY_TYPES = [
        'wholesale',
        'boutique',
        'stylist',
        'interior',
        'corporate',
        'custom',
        'big_order',
        'tag',
        'drop',
        'popup',
        'low_stock',
        'ugc',
    ];

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function send(Workspace $workspace, string $alertType, string $title, ?string $body = null, array $payload = []): array
    {
        $token = (string) config('integrations.telegram.bot_token', '');
        $chatId = (string) ($payload['chat_id'] ?? data_get($workspace->settings ?? [], 'telegram_alert_chat_id', ''));
        $mode = filled($token) && filled($chatId) && config('integrations.mode') === 'live'
            ? 'live'
            : 'local_sim';

        $alert = TelegramAlert::query()->create([
            'workspace_id' => $workspace->id,
            'alert_type' => $alertType,
            'priority' => in_array($alertType, ['wholesale', 'boutique', 'stylist', 'interior', 'corporate', 'custom', 'big_order'], true) ? 'high' : 'normal',
            'title' => $title,
            'body' => $body,
            'status' => 'queued',
            'delivery_mode' => $mode,
            'payload' => $payload,
        ]);

        if ($mode === 'live') {
            try {
                $text = "Triada alert [{$alertType}]\n{$title}\n".($body ?? '');
                $response = Http::timeout(15)->post("https://api.telegram.org/bot{$token}/sendMessage", [
                    'chat_id' => $chatId,
                    'text' => $text,
                ]);
                if ($response->successful()) {
                    $alert->forceFill([
                        'status' => 'sent',
                        'sent_at' => now(),
                        'external_message_id' => (string) data_get($response->json(), 'result.message_id'),
                    ])->save();
                } else {
                    $alert->forceFill(['status' => 'failed', 'payload' => array_merge($payload, ['error' => $response->body()])])->save();
                }
            } catch (\Throwable $e) {
                $alert->forceFill(['status' => 'failed', 'payload' => array_merge($payload, ['error' => $e->getMessage()])])->save();
            }
        } else {
            $alert->forceFill([
                'status' => 'local_sim',
                'sent_at' => now(),
                'delivery_mode' => 'local_sim',
            ])->save();
        }

        return [
            'ok' => true,
            'alert' => $alert->fresh(),
            'mode' => $alert->delivery_mode,
        ];
    }

    /**
     * Detect B2B / priority enquiry language for Telegram alert routing.
     */
    public function detectAlertType(string $message): ?string
    {
        $q = strtolower($message);

        return match (true) {
            str_contains($q, 'wholesale') => 'wholesale',
            str_contains($q, 'boutique') => 'boutique',
            str_contains($q, 'stylist') => 'stylist',
            str_contains($q, 'interior') => 'interior',
            str_contains($q, 'corporate') || str_contains($q, 'gifting') => 'corporate',
            str_contains($q, 'custom') || str_contains($q, 'bespoke') || str_contains($q, 'engrav') => 'custom',
            str_contains($q, 'big order') || preg_match('/\b(20|50|100)\+?\s*(pieces|units)\b/', $q) === 1 => 'big_order',
            default => null,
        };
    }
}
