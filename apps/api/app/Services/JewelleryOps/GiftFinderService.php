<?php

namespace App\Services\JewelleryOps;

use App\Models\GiftSession;
use App\Models\Product;
use App\Models\Workspace;

class GiftFinderService
{
    public function __construct(protected JewelleryKnowledge $knowledge)
    {
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function suggest(Workspace $workspace, array $input): array
    {
        $recipient = trim((string) ($input['recipient'] ?? $input['who'] ?? ''));
        $occasion = trim((string) ($input['occasion'] ?? ''));
        $budgetBand = trim((string) ($input['budget'] ?? $input['budget_band'] ?? ''));
        [$min, $max] = $this->parseBudget($budgetBand, $input);

        $products = Product::query()
            ->where('workspace_id', $workspace->id)
            ->where('published_status', 'published')
            ->orderBy('price')
            ->get();

        $filtered = $products->filter(function (Product $p) use ($min, $max) {
            if ($min !== null && (float) $p->price < $min) {
                return false;
            }
            if ($max !== null && (float) $p->price > $max) {
                return false;
            }

            return true;
        });

        if ($filtered->isEmpty()) {
            $filtered = $products->take(3);
        }

        $suggestions = $filtered->take(3)->map(function (Product $p) use ($recipient, $occasion) {
            return [
                'sku' => $p->sku,
                'title' => $p->title,
                'price' => (float) $p->price,
                'currency' => $p->currency,
                'product_url' => $p->product_url,
                'photo_url' => data_get($p->metadata, 'photo_url') ?: ($p->product_url.'?view=image'),
                'reason' => trim(($recipient !== '' ? "For {$recipient}" : 'Gift pick').($occasion !== '' ? " · {$occasion}" : '')),
            ];
        })->values()->all();

        $session = GiftSession::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $input['contact_id'] ?? null,
            'conversation_id' => $input['conversation_id'] ?? null,
            'status' => count($suggestions) ? 'suggested' : 'collecting',
            'recipient' => $recipient ?: null,
            'occasion' => $occasion ?: null,
            'budget_band' => $budgetBand ?: null,
            'budget_min' => $min,
            'budget_max' => $max,
            'suggestions' => $suggestions,
            'metadata' => ['disclosure' => JewelleryKnowledge::AI_DISCLOSURE],
        ]);

        $missing = [];
        if ($recipient === '') {
            $missing[] = 'who';
        }
        if ($occasion === '') {
            $missing[] = 'occasion';
        }
        if ($budgetBand === '' && $min === null && $max === null) {
            $missing[] = 'budget';
        }

        return [
            'ok' => true,
            'session' => $session,
            'suggestions' => $suggestions,
            'ask_next' => $missing,
            'prompt' => $missing
                ? 'To find the right gift I need: '.implode(', ', $missing).'.'
                : JewelleryKnowledge::AI_DISCLOSURE.' Here are 2–3 pieces from our approved collection with photo and link.',
            'disclosure' => JewelleryKnowledge::AI_DISCLOSURE,
        ];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array{0:?float,1:?float}
     */
    protected function parseBudget(string $band, array $input): array
    {
        if (isset($input['budget_min']) || isset($input['budget_max'])) {
            return [
                isset($input['budget_min']) ? (float) $input['budget_min'] : null,
                isset($input['budget_max']) ? (float) $input['budget_max'] : null,
            ];
        }

        $b = strtolower($band);
        if ($b === '' && preg_match('/(\d+)\s*[-–to]+\s*(\d+)/', $band, $m)) {
            return [(float) $m[1], (float) $m[2]];
        }
        if (str_contains($b, 'under') || str_contains($b, '<')) {
            if (preg_match('/(\d+)/', $b, $m)) {
                return [null, (float) $m[1]];
            }
        }
        if (preg_match('/(\d+)\s*[-–]\s*(\d+)/', $b, $m)) {
            return [(float) $m[1], (float) $m[2]];
        }
        if (preg_match('/(\d+)/', $b, $m)) {
            $v = (float) $m[1];

            return [max(0, $v * 0.7), $v * 1.3];
        }

        return [null, null];
    }
}
