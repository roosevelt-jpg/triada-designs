<?php

namespace App\Services\JewelleryOps;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\Product;
use App\Models\Task;
use App\Models\Workspace;
use App\Services\AI\AiOrchestrator;
use App\Services\AI\CustomerLanguageDetector;

class AnswerBotService
{
    public function __construct(
        protected JewelleryKnowledge $knowledge,
        protected AiOrchestrator $ai,
        protected TelegramAlertService $alerts,
    ) {
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function handle(Workspace $workspace, string $message, array $context = []): array
    {
        $detected = app(CustomerLanguageDetector::class)->detect($message, [
            'hint' => (string) ($context['detected_language'] ?? $context['preferred_language'] ?? ''),
            'fallback' => 'en',
        ]);
        $langContext = array_merge($context, [
            'detected_language' => $detected['code'],
            'preferred_language' => $detected['code'],
        ]);

        // English FAQ snippets only — for other languages prefer AI/local draft matching the customer.
        $faq = $detected['code'] === 'en' ? $this->knowledge->answerFaq($message) : null;
        $classified = $this->ai->runAgent($workspace, 'support', 'classify', array_merge($langContext, [
            'message' => $message,
            'dry_run' => true,
        ]));
        $intent = (string) data_get($classified, 'parsed.intent', 'general_inquiry');

        $handoff = in_array($intent, ['complaint', 'custom_piece', 'b2b_enquiry'], true)
            || data_get($classified, 'parsed.needs_human') === true
            || $faq === null && ! $this->looksLikeCatalogQuestion($message);

        $reply = $faq;
        if ($reply === null) {
            $draft = $this->ai->runAgent($workspace, 'support', 'draft_reply', array_merge($langContext, [
                'message' => $message,
                'intent' => $intent,
                'dry_run' => ! empty($context['dry_run']),
            ]));
            $reply = (string) ($draft['text'] ?? JewelleryKnowledge::AI_DISCLOSURE.' Could you share a bit more?');
        }

        // English catalog price snippets only — non-EN keeps the language-locked AI/local draft.
        $asksPrice = (bool) preg_match(
            '/\b(price|aed|cost|how much|سعر|pret|preț|preis|prix|цена|precio|preço|custa|cuesta)\b/iu',
            $message
        );
        if ($asksPrice && $detected['code'] === 'en') {
            $skuHint = $this->extractSkuHint($message);
            if ($skuHint) {
                $product = Product::query()
                    ->where('workspace_id', $workspace->id)
                    ->where('sku', $skuHint)
                    ->first();
                if ($product) {
                    $reply = JewelleryKnowledge::AI_DISCLOSURE.sprintf(
                        ' From our approved price list: %s is %s %s (%s). Availability is a snapshot until confirmed live.',
                        $product->title,
                        $product->price,
                        $product->currency,
                        $product->sku
                    );
                } else {
                    $reply = JewelleryKnowledge::AI_DISCLOSURE.' I only share approved list prices. I could not match that SKU — a specialist can confirm.';
                    $handoff = true;
                }
            }
        }

        $result = [
            'ok' => true,
            'intent' => $intent,
            'reply' => $reply,
            'disclosure' => JewelleryKnowledge::AI_DISCLOSURE,
            'needs_human' => $handoff,
            'detected_language' => $detected['code'],
            'detected_language_name' => $detected['name'],
            'language_rtl' => $detected['rtl'],
            'policies' => $this->knowledge->policies(),
            'mode' => 'answer_bot',
        ];

        if ($handoff && empty($context['dry_run'])) {
            $task = Task::query()->create([
                'workspace_id' => $workspace->id,
                'contact_id' => $context['contact_id'] ?? null,
                'conversation_id' => $context['conversation_id'] ?? null,
                'type' => 'human_handoff',
                'title' => 'Answer-bot handoff: '.$intent,
                'description' => substr($message, 0, 500),
                'due_at' => now()->addHours(4),
                'status' => 'open',
            ]);
            $result['task_id'] = $task->id;

            if (in_array($intent, ['b2b_enquiry', 'custom_piece'], true)) {
                $alertType = $intent === 'b2b_enquiry' ? 'wholesale' : 'custom';
                $this->alerts->send($workspace, $alertType, 'Priority enquiry', $message, [
                    'intent' => $intent,
                    'conversation_id' => $context['conversation_id'] ?? null,
                ]);
            }

            if (! empty($context['conversation_id'])) {
                Conversation::query()
                    ->where('id', $context['conversation_id'])
                    ->where('workspace_id', $workspace->id)
                    ->update(['automation_mode' => 'human']);
            }
        }

        if (empty($context['dry_run']) && ! empty($context['conversation_id']) && ! $handoff) {
            Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $context['conversation_id'],
                'direction' => 'outbound',
                'sender_type' => 'ai',
                'message_type' => 'text',
                'body' => $reply,
                'delivery_status' => 'local_sim',
                'metadata' => ['source' => 'answer_bot', 'intent' => $intent],
            ]);
        }

        return $result;
    }

    protected function looksLikeCatalogQuestion(string $message): bool
    {
        $q = strtolower($message);

        return str_contains($q, 'ring')
            || str_contains($q, 'pendant')
            || str_contains($q, 'earring')
            || str_contains($q, 'necklace')
            || str_contains($q, 'bracelet')
            || str_contains($q, 'collection')
            || str_contains($q, 'piece');
    }

    protected function extractSkuHint(string $message): ?string
    {
        if (preg_match('/\b(TD-[A-Z0-9-]+)\b/i', $message, $m)) {
            return strtoupper($m[1]);
        }

        return null;
    }
}
