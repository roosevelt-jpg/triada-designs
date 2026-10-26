<?php

namespace App\Services\JewelleryOps;

use App\Models\VipDropList;
use App\Models\WaitlistEntry;
use App\Models\Workspace;

class WaitlistService
{
    public function __construct(protected TelegramAlertService $alerts)
    {
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function join(Workspace $workspace, array $input): array
    {
        $entry = WaitlistEntry::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $input['contact_id'] ?? null,
            'product_id' => $input['product_id'] ?? null,
            'sku' => $input['sku'] ?? null,
            'size' => $input['size'] ?? null,
            'colour' => $input['colour'] ?? $input['color'] ?? null,
            'channel' => $input['channel'] ?? null,
            'notify_via' => $input['notify_via'] ?? 'email',
            'status' => 'waiting',
            'vip' => (bool) ($input['vip'] ?? false),
            'metadata' => [],
        ]);

        return [
            'ok' => true,
            'entry' => $entry,
            'message' => 'You are on the notify list for this sold-out size/colour. We will message when it returns.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function notifyRestock(Workspace $workspace, string $sku, ?string $size = null): array
    {
        $q = WaitlistEntry::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', 'waiting')
            ->where('sku', $sku);
        if ($size) {
            $q->where(function ($inner) use ($size) {
                $inner->whereNull('size')->orWhere('size', $size);
            });
        }
        $entries = $q->get();
        foreach ($entries as $entry) {
            $entry->forceFill([
                'status' => 'notified',
                'notified_at' => now(),
                'metadata' => ['notify_mode' => 'local_sim'],
            ])->save();
        }

        return ['ok' => true, 'notified' => $entries->count(), 'entries' => $entries];
    }

    /**
     * @param  array<string, mixed>  $drop
     * @return array<string, mixed>
     */
    public function announceVipDrop(Workspace $workspace, array $drop): array
    {
        $vips = VipDropList::query()->where('workspace_id', $workspace->id)->where('status', 'active')->get();
        $alert = $this->alerts->send(
            $workspace,
            'drop',
            'VIP new drop: '.($drop['title'] ?? 'New pieces'),
            $drop['body'] ?? 'First access for Telegram VIP list.',
            ['vip_count' => $vips->count(), 'drop' => $drop]
        );

        return [
            'ok' => true,
            'vip_count' => $vips->count(),
            'alert' => $alert,
            'delivery' => 'telegram_vip_local_sim',
        ];
    }
}
