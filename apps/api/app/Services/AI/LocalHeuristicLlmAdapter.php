<?php

namespace App\Services\AI;

use App\Services\AI\Contracts\LlmAdapterInterface;

/**
 * Deterministic local adapter used when LLM_API_KEY is absent.
 * Never claims live LLM connectivity.
 */
class LocalHeuristicLlmAdapter implements LlmAdapterInterface
{
    public function providerKey(): string
    {
        return 'local_heuristic';
    }

    public function model(): string
    {
        return (string) (config('integrations.llm.model') ?: 'triada-local-heuristic');
    }

    public function isLive(): bool
    {
        return false;
    }

    public function complete(array $request): array
    {
        $prompt = strtolower((string) ($request['prompt'] ?? ''));
        $system = (string) ($request['system'] ?? '');
        $purpose = strtolower((string) ($request['purpose'] ?? 'draft'));

        $text = match (true) {
            str_contains($purpose, 'classif') || str_contains($prompt, 'classify') => $this->classify($prompt),
            str_contains($purpose, 'qualif') || str_contains($prompt, 'qualify') => $this->qualify($prompt),
            str_contains($purpose, 'escalat') || str_contains($prompt, 'complaint') => $this->escalate($prompt),
            str_contains($purpose, 'content') || str_contains($prompt, 'caption') => $this->contentDraft($prompt),
            default => $this->draftReply($prompt, $system),
        };

        $promptTokens = max(1, (int) ceil(strlen($prompt) / 4));
        $completionTokens = max(1, (int) ceil(strlen($text) / 4));

        return [
            'ok' => true,
            'text' => $text,
            'provider' => $this->providerKey(),
            'model' => $this->model(),
            'prompt_tokens' => $promptTokens,
            'completion_tokens' => $completionTokens,
            'raw' => ['mode' => 'local', 'purpose' => $purpose],
        ];
    }

    protected function classify(string $prompt): string
    {
        $intent = match (true) {
            str_contains($prompt, 'order') || str_contains($prompt, 'shipping') || str_contains($prompt, 'return') => 'order_support',
            str_contains($prompt, 'price') || str_contains($prompt, 'buy') || str_contains($prompt, 'purchase') => 'purchase_intent',
            str_contains($prompt, 'book') || str_contains($prompt, 'appointment') || str_contains($prompt, 'consult') => 'service_request',
            str_contains($prompt, 'complaint') || str_contains($prompt, 'angry') || str_contains($prompt, 'refund') => 'complaint',
            str_contains($prompt, 'spam') => 'spam',
            default => 'general_inquiry',
        };

        return json_encode([
            'intent' => $intent,
            'confidence' => 'en',
            'confidence' => 0.72,
            'needs_human' => in_array($intent, ['complaint'], true),
            'provider' => 'local_heuristic',
        ], JSON_THROW_ON_ERROR);
    }

    protected function qualify(string $prompt): string
    {
        $score = 40;
        if (str_contains($prompt, 'buy') || str_contains($prompt, 'price')) {
            $score += 25;
        }
        if (str_contains($prompt, 'consult') || str_contains($prompt, 'book')) {
            $score += 20;
        }
        if (str_contains($prompt, 'urgent') || str_contains($prompt, 'today')) {
            $score += 10;
        }

        return json_encode([
            'score' => min(100, $score),
            'stage' => $score >= 70 ? 'qualified' : ($score >= 50 ? 'working' : 'new'),
            'summary' => 'Local heuristic qualification from inbound message signals.',
            'provider' => 'local_heuristic',
        ], JSON_THROW_ON_ERROR);
    }

    protected function escalate(string $prompt): string
    {
        $needs = str_contains($prompt, 'complaint')
            || str_contains($prompt, 'refund')
            || str_contains($prompt, 'lawyer')
            || str_contains($prompt, 'unsafe');

        return json_encode([
            'escalate' => $needs,
            'reason' => $needs ? 'Sensitive or complaint language detected by local heuristic.' : 'No escalation signals.',
            'provider' => 'local_heuristic',
        ], JSON_THROW_ON_ERROR);
    }

    protected function contentDraft(string $prompt): string
    {
        return "Draft (local): Share a calm, product-led note about Triada Designs. Focus on verified materials and process—never invent reviews or stock. Prompt cues: ".substr($prompt, 0, 160);
    }

    protected function draftReply(string $prompt, string $system): string
    {
        $base = "Thanks for reaching out to Triada Designs. I'm the virtual assistant and can help with products, services, and order questions.";

        if (str_contains($prompt, 'shipping') || str_contains($prompt, 'deliver')) {
            return $base.' Shipping estimates are confirmed at checkout for supported regions. If you share your destination, I can note it for a specialist.';
        }

        if (str_contains($prompt, 'return')) {
            return $base.' Unopened products may be returned within the window published on triada-designs.com. I can escalate if you need a human review.';
        }

        if (str_contains($prompt, 'barrier') || str_contains($prompt, 'cream') || str_contains($prompt, 'cleanser')) {
            return $base.' From approved knowledge: Gentle Daily Cleanser and Barrier Recovery Cream are common recommendations for sensitive skin routines—no medical claims.';
        }

        if (str_contains($prompt, 'consult') || str_contains($prompt, 'book')) {
            return $base.' I can capture your consultation interest and create a follow-up task for the team. What day works best?';
        }

        $hint = $system !== '' ? ' (guided by agent policy)' : '';

        return $base.$hint.' Could you share a bit more about what you are looking for?';
    }
}
