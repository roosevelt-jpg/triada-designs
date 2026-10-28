<?php

namespace App\Services\JewelleryOps;

use App\Models\PopupApplication;
use App\Models\PopupMarket;
use App\Models\Workspace;

class PopupMarketService
{
    public function __construct(protected TelegramAlertService $alerts)
    {
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function upsertMarket(Workspace $workspace, array $input): array
    {
        $market = PopupMarket::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => $input['name'],
            ],
            [
                'venue' => $input['venue'] ?? null,
                'country' => $input['country'] ?? null,
                'city' => $input['city'] ?? 'Dubai',
                'town' => $input['town'] ?? null,
                'emirate' => $input['emirate'] ?? ($input['city'] ?? 'Dubai'),
                'market_type' => $input['market_type'] ?? 'popup',
                'starts_on' => $input['starts_on'] ?? null,
                'ends_on' => $input['ends_on'] ?? null,
                'application_deadline' => $input['application_deadline'] ?? null,
                'fee_aed' => $input['fee_aed'] ?? null,
                'contact_email' => $input['contact_email'] ?? null,
                'contact_name' => $input['contact_name'] ?? null,
                'status' => $input['status'] ?? 'watching',
                'notes' => $input['notes'] ?? null,
                'place_id' => $input['place_id'] ?? null,
                'formatted_address' => $input['formatted_address'] ?? null,
                'lat' => $input['lat'] ?? $input['latitude'] ?? null,
                'lng' => $input['lng'] ?? $input['longitude'] ?? null,
                'metadata' => array_merge(
                    is_array($input['metadata'] ?? null) ? $input['metadata'] : [],
                    array_filter([
                        'location_source' => 'google_places',
                        'place_id' => $input['place_id'] ?? null,
                        'country' => $input['country'] ?? null,
                        'town' => $input['town'] ?? null,
                        'lat' => $input['lat'] ?? $input['latitude'] ?? null,
                        'lng' => $input['lng'] ?? $input['longitude'] ?? null,
                    ], static fn ($v) => $v !== null && $v !== '')
                ),
            ]
        );

        return ['ok' => true, 'market' => $market];
    }

    /**
     * Alert when a good market opens / deadline approaches.
     *
     * @return array<string, mixed>
     */
    public function scanAlerts(Workspace $workspace): array
    {
        $markets = PopupMarket::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('status', ['watching', 'alerted'])
            ->where(function ($q) {
                $q->whereNull('application_deadline')
                    ->orWhere('application_deadline', '>=', now()->toDateString())
                    ->where('application_deadline', '<=', now()->addDays(21)->toDateString());
            })
            ->get();

        $alerts = [];
        foreach ($markets as $market) {
            $alert = $this->alerts->send(
                $workspace,
                'popup',
                'Pop-up / market opportunity: '.$market->name,
                trim(implode(' · ', array_filter([
                    $market->venue,
                    $market->town,
                    $market->city,
                    $market->country,
                    $market->lat !== null && $market->lng !== null
                        ? $market->lat.','.$market->lng
                        : null,
                    'deadline '.$market->application_deadline,
                ]))),
                ['popup_market_id' => $market->id]
            );
            $market->forceFill(['status' => 'alerted'])->save();
            $alerts[] = $alert;
        }

        return ['ok' => true, 'alerted' => count($alerts), 'alerts' => $alerts];
    }

    /**
     * @return array<string, mixed>
     */
    public function draftApplication(Workspace $workspace, string $marketId): array
    {
        $market = PopupMarket::query()->where('workspace_id', $workspace->id)->where('id', $marketId)->firstOrFail();
        $subject = 'Application — Triada Designs jewellery · '.$market->name;
        $body = "Dear ".($market->contact_name ?: 'Organiser').",\n\n".
            "We are Triada Designs, a Dubai jewellery brand (silver with gold plating; 14K/18K on request). ".
            "We would like to apply for a stall / placement at {$market->name}".
            ($market->venue ? " ({$market->venue})" : '').".\n\n".
            "Please find our interest for dates ".($market->starts_on ?: 'TBC')." – ".($market->ends_on ?: 'TBC').". ".
            "Happy to share lookbook, insurance, and fee confirmation.\n\nKind regards,\nTriada Designs\n";

        $app = PopupApplication::query()->create([
            'workspace_id' => $workspace->id,
            'popup_market_id' => $market->id,
            'status' => 'awaiting_approval',
            'subject' => $subject,
            'body' => $body,
            'human_approved' => false,
            'metadata' => [],
        ]);

        $market->forceFill(['status' => 'applying'])->save();

        return [
            'ok' => true,
            'application' => $app,
            'note' => 'Draft application email ready — human must approve before send.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function approveApplication(Workspace $workspace, string $applicationId, int $userId): array
    {
        $app = PopupApplication::query()->where('workspace_id', $workspace->id)->where('id', $applicationId)->firstOrFail();
        $app->forceFill([
            'human_approved' => true,
            'approved_by' => $userId,
            'approved_at' => now(),
            'status' => 'sent',
            'sent_at' => now(),
            'metadata' => array_merge($app->metadata ?? [], ['delivery_mode' => 'local_sim']),
        ])->save();

        PopupMarket::query()->where('id', $app->popup_market_id)->update(['status' => 'applied']);

        return ['ok' => true, 'application' => $app->fresh()];
    }
}
