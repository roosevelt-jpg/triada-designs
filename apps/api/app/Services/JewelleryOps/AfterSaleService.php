<?php

namespace App\Services\JewelleryOps;

use App\Models\AfterSaleJob;
use App\Models\Product;
use App\Models\UgcItem;
use App\Models\Workspace;

class AfterSaleService
{
    /**
     * @return array<string, mixed>
     */
    public function processDue(Workspace $workspace): array
    {
        $jobs = AfterSaleJob::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', 'scheduled')
            ->where('run_at', '<=', now())
            ->limit(50)
            ->get();

        $results = [];
        foreach ($jobs as $job) {
            $payload = $this->buildPayload($workspace, $job);
            $job->forceFill([
                'status' => 'sent',
                'sent_at' => now(),
                'payload' => array_merge($job->payload ?? [], $payload),
            ])->save();

            if ($job->job_type === 'ugc_invite') {
                UgcItem::query()->create([
                    'workspace_id' => $workspace->id,
                    'contact_id' => $job->contact_id,
                    'commerce_order_id' => $job->commerce_order_id,
                    'item_type' => 'invite',
                    'status' => 'new',
                    'reward_offer' => 'Thank-you discount or feature on our page (subject to approval).',
                    'metadata' => ['source' => 'after_sale'],
                ]);
            }

            $results[] = $job->fresh();
        }

        return ['ok' => true, 'processed' => count($results), 'jobs' => $results];
    }

    protected function buildPayload(Workspace $workspace, AfterSaleJob $job): array
    {
        return match ($job->job_type) {
            'care_tips' => [
                'body' => JewelleryKnowledge::AI_DISCLOSURE.' Care tip: store dry, avoid harsh chemicals and perfume on metal, gently wipe with a soft cloth.',
                'mode' => 'local_sim',
            ],
            'review_request' => [
                'body' => JewelleryKnowledge::AI_DISCLOSURE.' If you are happy with your piece, a short review helps other clients — only if you wish.',
                'mode' => 'local_sim',
            ],
            'complete_the_set' => [
                'body' => JewelleryKnowledge::AI_DISCLOSURE.' A gentle complete-the-set idea from our approved collection.',
                'suggestions' => Product::query()->where('workspace_id', $workspace->id)->orderBy('price')->limit(2)->get(['sku', 'title', 'price', 'currency', 'product_url']),
                'mode' => 'local_sim',
            ],
            'ugc_invite' => [
                'body' => JewelleryKnowledge::AI_DISCLOSURE.' We would love a photo or reel tagging Triada Designs — small thank-you (discount or feature) when you share.',
                'mode' => 'local_sim',
            ],
            default => ['body' => 'After-sale follow-up', 'mode' => 'local_sim'],
        };
    }
}
