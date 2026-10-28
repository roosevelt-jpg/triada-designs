<?php

namespace App\Services\AI;

use App\Services\AI\Contracts\LlmAdapterInterface;

/**
 * Deterministic local adapter used when Anthropic (or other LLM) key is absent.
 * Jewellery-aware FAQs for Triada Designs. Never claims live LLM connectivity.
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
        $lang = $this->detectLangFromRequest($request);

        $text = match (true) {
            str_contains($purpose, 'classif') || str_contains($prompt, 'classify') => $this->classify($prompt, $lang),
            str_contains($purpose, 'qualif') || str_contains($prompt, 'qualify') => $this->qualify($prompt),
            str_contains($purpose, 'escalat') || str_contains($prompt, 'complaint') => $this->escalate($prompt),
            str_contains($purpose, 'gift') => $this->giftFinder($prompt),
            str_contains($purpose, 'ugc') || str_contains($purpose, 'content_ugc') => $this->ugcScriptDraft($prompt),
            str_contains($purpose, 'content') || str_contains($prompt, 'caption') => $this->contentDraft($prompt),
            default => $this->draftReply($prompt, $system, $lang),
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
            'raw' => ['mode' => 'local_sim', 'purpose' => $purpose],
        ];
    }

    protected function classify(string $prompt, string $lang = 'en'): string
    {
        $intent = match (true) {
            str_contains($prompt, 'where is my order') || str_contains($prompt, 'tracking') => 'order_status',
            str_contains($prompt, 'order') || str_contains($prompt, 'shipping') || str_contains($prompt, 'deliver') => 'order_support',
            str_contains($prompt, 'gift') || str_contains($prompt, 'occasion') || str_contains($prompt, 'budget') => 'gift_finder',
            str_contains($prompt, 'custom') || str_contains($prompt, 'bespoke') || str_contains($prompt, 'engrav') || str_contains($prompt, '14k') || str_contains($prompt, '18k') => 'custom_piece',
            str_contains($prompt, 'wholesale') || str_contains($prompt, 'boutique') || str_contains($prompt, 'stylist') || str_contains($prompt, 'corporate') => 'b2b_enquiry',
            str_contains($prompt, 'size') || str_contains($prompt, 'sizing') || str_contains($prompt, 'ring size') => 'sizing',
            str_contains($prompt, 'price') || str_contains($prompt, 'buy') || str_contains($prompt, 'purchase') => 'purchase_intent',
            str_contains($prompt, 'book') || str_contains($prompt, 'appointment') || str_contains($prompt, 'consult') => 'service_request',
            str_contains($prompt, 'complaint') || str_contains($prompt, 'angry') || str_contains($prompt, 'refund') => 'complaint',
            str_contains($prompt, 'spam') => 'spam',
            default => 'general_inquiry',
        };

        return json_encode([
            'intent' => $intent,
            'language' => $lang,
            'confidence' => 0.78,
            'needs_human' => in_array($intent, ['complaint', 'custom_piece', 'b2b_enquiry'], true),
            'provider' => 'local_heuristic',
        ], JSON_THROW_ON_ERROR);
    }

    protected function qualify(string $prompt): string
    {
        $score = 40;
        if (str_contains($prompt, 'buy') || str_contains($prompt, 'price')) {
            $score += 25;
        }
        if (str_contains($prompt, 'consult') || str_contains($prompt, 'book') || str_contains($prompt, 'custom')) {
            $score += 20;
        }
        if (str_contains($prompt, 'wholesale') || str_contains($prompt, 'corporate')) {
            $score += 15;
        }
        if (str_contains($prompt, 'urgent') || str_contains($prompt, 'today')) {
            $score += 10;
        }

        return json_encode([
            'score' => min(100, $score),
            'stage' => $score >= 70 ? 'qualified' : ($score >= 50 ? 'working' : 'new'),
            'summary' => 'Local heuristic qualification from inbound jewellery inquiry signals.',
            'provider' => 'local_heuristic',
        ], JSON_THROW_ON_ERROR);
    }

    protected function escalate(string $prompt): string
    {
        $needs = str_contains($prompt, 'complaint')
            || str_contains($prompt, 'refund')
            || str_contains($prompt, 'lawyer')
            || str_contains($prompt, 'custom quote')
            || str_contains($prompt, 'wholesale');

        return json_encode([
            'escalate' => $needs,
            'reason' => $needs ? 'Sensitive, custom-quote, or B2B language — human handoff required.' : 'No escalation signals.',
            'provider' => 'local_heuristic',
        ], JSON_THROW_ON_ERROR);
    }

    protected function giftFinder(string $prompt): string
    {
        return json_encode([
            'suggestions' => [
                ['sku' => 'TD-RING-AURA-01', 'title' => 'Aura Signet Ring', 'reason' => 'Everyday gold-plated silver for personal gifts'],
                ['sku' => 'TD-PEND-QUIET-02', 'title' => 'Quiet Pendant', 'reason' => 'Calm statement piece for occasions'],
                ['sku' => 'TD-HOOP-SOFT-03', 'title' => 'Soft Hoop Earrings', 'reason' => 'Complete-the-set friendly'],
            ],
            'disclosure' => 'I am Triada’s AI assistant. Prices shown are from our approved list; a specialist confirms availability.',
            'provider' => 'local_heuristic',
        ], JSON_THROW_ON_ERROR);
    }

    protected function contentDraft(string $prompt): string
    {
        return 'Draft (local_sim): Quiet sparkle for Dubai evenings — Triada Designs jewellery. Human approval required before publish. Prompt cues: '.substr($prompt, 0, 160);
    }

    protected function ugcScriptDraft(string $prompt): string
    {
        return json_encode([
            'hook' => 'POV: soft Gulf light on a piece you will actually wear every day.',
            'script' => 'Local_sim UGC script for Triada Designs — calm voiceover, real jewellery close-up, no hard sell. Human approval required before publish. Cues: '.substr($prompt, 0, 120),
            'storyboard' => '0-2s handheld product close-up; 2-6s soft light shift + authentic voiceover; end frame brand restraint.',
            'cta' => 'Shop Triada Designs',
            'provider' => 'local_heuristic',
            'note' => 'Script only — VIDEO_PROVIDER or local animation renders pixels.',
        ], JSON_THROW_ON_ERROR);
    }

    protected function draftReply(string $prompt, string $system, string $lang = 'en'): string
    {
        $localized = $this->localizedDraft($lang, $prompt);
        if ($localized !== null) {
            return $localized;
        }

        $base = "Thanks for reaching out to Triada Designs. I'm the AI assistant — I can help with sizes, materials, care, shipping, and our collection, and I can connect you to a person anytime.";

        if (str_contains($prompt, 'size') || str_contains($prompt, 'sizing') || str_contains($prompt, 'ring size')) {
            return $base.' Ring sizes follow our published size guide on triada-designs.com. Share your usual size (or a measurement) and I will note it for the team — I never guess fit.';
        }

        if (str_contains($prompt, 'material') || str_contains($prompt, 'gold') || str_contains($prompt, 'silver') || str_contains($prompt, '14k') || str_contains($prompt, '18k')) {
            return $base.' Our pieces are silver with gold plating; 14K and 18K gold are available on request for custom or selected pieces. A specialist confirms metal and lead time.';
        }

        if (str_contains($prompt, 'care') || str_contains($prompt, 'clean') || str_contains($prompt, 'polish')) {
            return $base.' Care tip from approved policy: store dry, avoid harsh chemicals and perfume on metal, gently wipe with a soft cloth. Full care notes ship with each order.';
        }

        if (str_contains($prompt, 'shipping') || str_contains($prompt, 'deliver') || str_contains($prompt, 'make') || str_contains($prompt, 'lead time')) {
            return $base.' Each piece takes about 7 days to make. Shipping estimates are confirmed at checkout for supported regions — I will not invent dates.';
        }

        if (str_contains($prompt, 'price') || str_contains($prompt, 'cost') || str_contains($prompt, 'aed')) {
            return $base.' I only share prices from our approved price list. Tell me which piece (or SKU) you mean and I will look it up — custom quotes always need human approval.';
        }

        if (str_contains($prompt, 'where is my order') || str_contains($prompt, 'tracking') || str_contains($prompt, 'order status')) {
            return $base.' Share your order number or the email/phone on the order and I will look up the lifecycle status (confirmed → in production → shipped → delivered).';
        }

        if (str_contains($prompt, 'gift')) {
            return $base.' I can help find a gift — who is it for, what is the occasion, and what budget range works? I will suggest 2–3 pieces with photo and link from the collection.';
        }

        if (str_contains($prompt, 'custom') || str_contains($prompt, 'bespoke') || str_contains($prompt, 'engrav') || str_contains($prompt, 'consult')) {
            return $base.' For custom pieces and consultations I collect piece, size, metal, stone colour, engraving, photos, budget, and deadline, then offer a private consultation booking (video or in person). Pricing is always human-approved.';
        }

        if (str_contains($prompt, 'wholesale') || str_contains($prompt, 'boutique') || str_contains($prompt, 'stylist') || str_contains($prompt, 'corporate')) {
            return $base.' I am noting this as a priority B2B enquiry and alerting the team on Telegram. A specialist will follow up — no bulk WhatsApp outreach.';
        }

        $hint = $system !== '' ? ' (guided by agent policy)' : '';

        return $base.$hint.' Could you share a bit more about the piece, size, or occasion you have in mind?';
    }

    /**
     * @param  array<string, mixed>  $request
     */
    protected function detectLangFromRequest(array $request): string
    {
        $blob = ((string) ($request['prompt'] ?? ''))."\n".((string) ($request['system'] ?? ''));
        if (preg_match('/Reply language:\s*[^(]*\(([a-z]{2})\)/i', $blob, $m)) {
            return strtolower($m[1]);
        }
        if (preg_match('/Detected customer language for this turn:\s*[^(]*\(([a-z]{2})\)/i', $blob, $m)) {
            return strtolower($m[1]);
        }

        return app(CustomerLanguageDetector::class)->detect((string) ($request['prompt'] ?? ''))['code'];
    }

    protected function localizedDraft(string $lang, string $prompt): ?string
    {
        $replies = [
            'ar' => 'تحيات دافئة من Triada Designs. أنا المساعد الذكي — يمكنني المساعدة في المقاسات والمواد والعناية والشحن والمجموعة، وأوصلك بشخص عند الطلب. القطع من الفضة المطلية بالذهب؛ ذهب عيار 14 و18 عند الطلب. مدة التصنيع عادةً حوالي 7 أيام.',
            'ro' => 'Salutări calde de la Triada Designs. Sunt asistentul AI — pot ajuta cu mărimi, materiale, îngrijire, livrare și colecție, și vă pot conecta cu o persoană oricând. Piesele sunt argint cu placare aur; aur 14K/18K la cerere. Timp tipic de execuție ~7 zile.',
            'de' => 'Herzliche Grüße von Triada Designs. Ich bin der KI-Assistent — ich helfe bei Größen, Materialien, Pflege, Versand und der Kollektion und verbinde Sie jederzeit mit einer Person. Stücke: Silber mit Goldplattierung; 14K/18K Gold auf Anfrage. Fertigung ca. 7 Tage.',
            'fr' => 'Chaleureuses salutations de Triada Designs. Je suis l’assistant IA — je peux aider sur les tailles, matières, entretien, livraison et la collection, et vous mettre en relation avec une personne. Pièces en argent plaqué or ; or 14K/18K sur demande. Fabrication typique ~7 jours.',
            'ru' => 'Тёплые приветствия от Triada Designs. Я ИИ-ассистент — помогу с размерами, материалами, уходом, доставкой и коллекцией и соединю с человеком по запросу. Изделия: серебро с золотым покрытием; золото 14K/18K по запросу. Изготовление обычно около 7 дней.',
            'es' => 'Saludos cordiales de Triada Designs. Soy el asistente de IA — puedo ayudar con tallas, materiales, cuidado, envío y la colección, y conectarle con una persona cuando lo desee. Piezas de plata con baño de oro; oro 14K/18K bajo pedido. Fabricación típica ~7 días.',
            'pt' => 'Saudações calorosas da Triada Designs. Sou o assistente de IA — posso ajudar com tamanhos, materiais, cuidados, entrega e a coleção, e ligá-lo a uma pessoa quando quiser. Peças em prata com banho de ouro; ouro 14K/18K sob pedido. Fabrico típico ~7 dias.',
        ];

        if ($lang === 'en' || ! isset($replies[$lang])) {
            return null;
        }

        $extra = '';
        if (str_contains($prompt, 'price') || str_contains($prompt, 'cost') || str_contains($prompt, 'aed') || str_contains($prompt, 'سعر') || str_contains($prompt, 'pret') || str_contains($prompt, 'preis') || str_contains($prompt, 'prix') || str_contains($prompt, 'цена') || str_contains($prompt, 'precio') || str_contains($prompt, 'preço')) {
            $extra = match ($lang) {
                'ar' => ' الأسعار من القائمة المعتمدة فقط — أخبرني بالقطعة أو رمز SKU.',
                'ro' => ' Prețurile vin doar din lista aprobată — spuneți piesa sau SKU-ul.',
                'de' => ' Preise nur aus der freigegebenen Liste — nennen Sie Stück oder SKU.',
                'fr' => ' Prix uniquement depuis la liste approuvée — indiquez la pièce ou le SKU.',
                'ru' => ' Цены только из утверждённого прайса — укажите изделие или SKU.',
                'es' => ' Precios solo de la lista aprobada — indique la pieza o el SKU.',
                'pt' => ' Preços apenas da lista aprovada — indique a peça ou o SKU.',
                default => '',
            };
        }

        return $replies[$lang].$extra;
    }
}
