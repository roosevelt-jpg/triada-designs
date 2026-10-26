<?php

namespace App\Services\JewelleryOps;

/**
 * Approved Triada jewellery policies — bots must never invent beyond this list.
 */
class JewelleryKnowledge
{
    public const AI_DISCLOSURE = "I'm Triada Designs' AI assistant. I can help with the collection and policies, and I can connect you to a person anytime.";

    /**
     * @return array<string, mixed>
     */
    public function policies(): array
    {
        return [
            'materials' => 'Silver with gold plating; 14K and 18K gold available on request.',
            'make_time_days' => 7,
            'make_time_copy' => 'About 7 days to make each piece. Shipping estimates confirmed at checkout.',
            'care' => 'Store dry, avoid harsh chemicals and perfume on metal, gently wipe with a soft cloth.',
            'size_guide_url' => 'https://triada-designs.com/size-guide',
            'shipping' => 'Shipping estimates are confirmed at checkout for supported regions. Do not invent dates.',
            'pricing_rule' => 'Never invent prices — use the approved product price list only. Custom quotes require human approval.',
            'whatsapp_rule' => 'WhatsApp: business messages only (orders, products, support) to opted-in customers.',
            'approval_rule' => 'A person approves posts, broadcasts, and custom quotes before they go out.',
            'outreach_rule' => 'No bulk unsolicited WhatsApp. Use email, LinkedIn, or Instagram with consent and opt-out.',
            'ai_disclosure' => self::AI_DISCLOSURE,
        ];
    }

    public function answerFaq(string $message): ?string
    {
        $q = strtolower($message);
        $p = $this->policies();

        if (str_contains($q, 'size') || str_contains($q, 'sizing')) {
            return $p['ai_disclosure'].' Ring sizes follow our published size guide ('.$p['size_guide_url'].'). Share your usual size and we will note it — we never guess fit.';
        }
        if (str_contains($q, 'material') || str_contains($q, 'gold') || str_contains($q, 'silver') || str_contains($q, '14k') || str_contains($q, '18k')) {
            return $p['ai_disclosure'].' '.$p['materials'].' A specialist confirms metal and lead time for gold-on-request pieces.';
        }
        if (str_contains($q, 'care') || str_contains($q, 'clean')) {
            return $p['ai_disclosure'].' Care: '.$p['care'];
        }
        if (str_contains($q, 'ship') || str_contains($q, 'deliver') || str_contains($q, 'make') || str_contains($q, 'lead')) {
            return $p['ai_disclosure'].' '.$p['make_time_copy'];
        }
        if (str_contains($q, 'price') || str_contains($q, 'cost') || str_contains($q, 'aed')) {
            return $p['ai_disclosure'].' '.$p['pricing_rule'].' Tell me which piece (or SKU) you mean.';
        }

        return null;
    }
}
