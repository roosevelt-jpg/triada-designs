<?php

namespace App\Services\JewelleryOps;

use App\Models\CommerceOrder;
use App\Models\ManufacturerMaterial;
use App\Models\ManufacturerOrder;
use App\Models\Workspace;

class ManufacturerService
{
    public function __construct(protected TelegramAlertService $alerts)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function pushOrder(Workspace $workspace, CommerceOrder $order): array
    {
        $item = (array) (($order->line_items[0] ?? []) ?: []);
        $cost = $this->estimateCost($workspace, $item);
        $sell = (float) ($item['price'] ?? $order->total);
        $profit = $sell - $cost;

        $mfr = ManufacturerOrder::query()->create([
            'workspace_id' => $workspace->id,
            'commerce_order_id' => $order->id,
            'external_ref' => 'MFR-'.$order->order_number,
            'status' => 'sent',
            'piece' => $item['title'] ?? $item['name'] ?? 'Jewellery piece',
            'sku' => $item['sku'] ?? null,
            'size' => $item['size'] ?? null,
            'metal' => $item['metal'] ?? 'silver_gold_plate',
            'engraving' => $item['engraving'] ?? null,
            'cost' => $cost,
            'sell_price' => $sell,
            'profit' => $profit,
            'delivery_mode' => 'local_sim',
            'payload' => [
                'order_number' => $order->order_number,
                'line_items' => $order->line_items,
            ],
            'sent_at' => now(),
        ]);

        $order->forceFill([
            'cost_total' => $cost,
            'profit' => $profit,
        ])->save();

        $low = $this->checkLowStock($workspace);

        return [
            'ok' => true,
            'manufacturer_order' => $mfr,
            'cost' => $cost,
            'sell_price' => $sell,
            'profit' => $profit,
            'low_stock' => $low,
            'mode' => 'local_sim',
        ];
    }

    /**
     * @param  array<string, mixed>  $item
     */
    public function estimateCost(Workspace $workspace, array $item): float
    {
        $metalKey = (string) ($item['metal'] ?? 'silver_gold_plate');
        $grams = (float) ($item['grams'] ?? 8);
        $material = ManufacturerMaterial::query()
            ->where('workspace_id', $workspace->id)
            ->where('material_key', $metalKey)
            ->first();

        if (! $material) {
            $material = ManufacturerMaterial::query()
                ->where('workspace_id', $workspace->id)
                ->where('material_key', 'silver_gold_plate')
                ->first();
        }

        if (! $material) {
            return round($grams * 12, 2);
        }

        $metal = (float) $material->metal_price_per_gram * $grams;
        $making = (float) $material->making_charge_per_gram * $grams;

        return round($metal + $making, 2);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function checkLowStock(Workspace $workspace): array
    {
        $low = [];
        $materials = ManufacturerMaterial::query()->where('workspace_id', $workspace->id)->get();
        foreach ($materials as $m) {
            if ($m->stock_grams !== null && $m->low_stock_threshold_grams !== null
                && (float) $m->stock_grams <= (float) $m->low_stock_threshold_grams) {
                $row = [
                    'material_key' => $m->material_key,
                    'display_name' => $m->display_name,
                    'stock_grams' => (float) $m->stock_grams,
                    'threshold' => (float) $m->low_stock_threshold_grams,
                ];
                $low[] = $row;
                $this->alerts->send($workspace, 'low_stock', 'Low stock: '.$m->display_name, json_encode($row));
            }
        }

        return $low;
    }

    /**
     * @return array<string, mixed>
     */
    public function overview(Workspace $workspace): array
    {
        return [
            'materials' => ManufacturerMaterial::query()->where('workspace_id', $workspace->id)->orderBy('display_name')->get(),
            'orders' => ManufacturerOrder::query()->where('workspace_id', $workspace->id)->latest()->limit(50)->get(),
            'low_stock' => $this->checkLowStock($workspace),
        ];
    }
}
