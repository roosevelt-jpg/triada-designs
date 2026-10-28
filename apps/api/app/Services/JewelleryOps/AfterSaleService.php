<?php

namespace App\Services\JewelleryOps;

use App\Models\AfterSaleJob;
use App\Models\Contact;
use App\Models\Product;
use App\Models\UgcItem;
use App\Models\Workspace;
use App\Services\AI\CustomerLanguageDetector;

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
        $lang = $this->resolveLanguage($job);
        $bodies = $this->localizedBodies($lang);

        return match ($job->job_type) {
            'care_tips' => [
                'body' => $bodies['care_tips'],
                'language' => $lang,
                'mode' => 'local_sim',
            ],
            'review_request' => [
                'body' => $bodies['review_request'],
                'language' => $lang,
                'mode' => 'local_sim',
            ],
            'complete_the_set' => [
                'body' => $bodies['complete_the_set'],
                'language' => $lang,
                'suggestions' => Product::query()->where('workspace_id', $workspace->id)->orderBy('price')->limit(2)->get(['sku', 'title', 'price', 'currency', 'product_url']),
                'mode' => 'local_sim',
            ],
            'ugc_invite' => [
                'body' => $bodies['ugc_invite'],
                'language' => $lang,
                'mode' => 'local_sim',
            ],
            default => ['body' => $bodies['default'], 'language' => $lang, 'mode' => 'local_sim'],
        };
    }

    protected function resolveLanguage(AfterSaleJob $job): string
    {
        $hint = (string) data_get($job->payload, 'language', '');
        if ($hint === '' && $job->contact_id) {
            $contact = Contact::query()->find($job->contact_id);
            $hint = (string) ($contact?->preferred_language ?? '');
        }

        return CustomerLanguageDetector::normalize($hint) ?: 'en';
    }

    /**
     * @return array{care_tips:string,review_request:string,complete_the_set:string,ugc_invite:string,default:string}
     */
    protected function localizedBodies(string $lang): array
    {
        $tables = [
            'en' => [
                'care_tips' => JewelleryKnowledge::AI_DISCLOSURE.' Care tip: store dry, avoid harsh chemicals and perfume on metal, gently wipe with a soft cloth.',
                'review_request' => JewelleryKnowledge::AI_DISCLOSURE.' If you are happy with your piece, a short review helps other clients — only if you wish.',
                'complete_the_set' => JewelleryKnowledge::AI_DISCLOSURE.' A gentle complete-the-set idea from our approved collection.',
                'ugc_invite' => JewelleryKnowledge::AI_DISCLOSURE.' We would love a photo or reel tagging Triada Designs — small thank-you (discount or feature) when you share.',
                'default' => JewelleryKnowledge::AI_DISCLOSURE.' After-sale follow-up from Triada Designs.',
            ],
            'ar' => [
                'care_tips' => 'أنا مساعد Triada Designs الذكي. نصيحة عناية: احفظ القطعة جافة، تجنب المواد الكيميائية والعطر على المعدن، وامسح برفق بقطعة قماش ناعمة.',
                'review_request' => 'أنا مساعد Triada Designs الذكي. إذا أعجبتك قطعتك، مراجعة قصيرة تساعد عملاء آخرين — فقط إن رغبت.',
                'complete_the_set' => 'أنا مساعد Triada Designs الذكي. فكرة لطيفة لإكمال المجموعة من مجموعتنا المعتمدة.',
                'ugc_invite' => 'أنا مساعد Triada Designs الذكي. يسعدنا صورة أو ريل مع إشارة Triada Designs — شكر بسيط (خصم أو إبراز) عند المشاركة.',
                'default' => 'أنا مساعد Triada Designs الذكي. متابعة ما بعد البيع من Triada Designs.',
            ],
            'ro' => [
                'care_tips' => 'Sunt asistentul AI Triada Designs. Îngrijire: păstrați uscat, evitați chimicalele și parfumul pe metal, ștergeți ușor cu o cârpă moale.',
                'review_request' => 'Sunt asistentul AI Triada Designs. Dacă sunteți mulțumit de piesă, o scurtă recenzie ajută alți clienți — doar dacă doriți.',
                'complete_the_set' => 'Sunt asistentul AI Triada Designs. O idee blândă de completare a setului din colecția aprobată.',
                'ugc_invite' => 'Sunt asistentul AI Triada Designs. Ne-ar plăcea o foto sau un reel cu tag Triada Designs — un mic mulțumesc (discount sau evidențiere) când partajați.',
                'default' => 'Sunt asistentul AI Triada Designs. Follow-up after-sale de la Triada Designs.',
            ],
            'de' => [
                'care_tips' => 'Ich bin der KI-Assistent von Triada Designs. Pflegetipp: trocken lagern, Chemikalien und Parfüm vom Metall fernhalten, sanft mit einem weichen Tuch abwischen.',
                'review_request' => 'Ich bin der KI-Assistent von Triada Designs. Wenn Sie mit Ihrem Stück zufrieden sind, hilft eine kurze Bewertung anderen Kunden — nur wenn Sie möchten.',
                'complete_the_set' => 'Ich bin der KI-Assistent von Triada Designs. Eine sanfte Idee zum Set-Vervollständigen aus unserer freigegebenen Kollektion.',
                'ugc_invite' => 'Ich bin der KI-Assistent von Triada Designs. Wir freuen uns über Foto oder Reel mit Tag Triada Designs — kleines Dankeschön (Rabatt oder Feature) beim Teilen.',
                'default' => 'Ich bin der KI-Assistent von Triada Designs. After-Sale Follow-up von Triada Designs.',
            ],
            'fr' => [
                'care_tips' => 'Je suis l’assistant IA Triada Designs. Entretien : conservez au sec, évitez les produits chimiques et le parfum sur le métal, essuyez doucement avec un chiffon doux.',
                'review_request' => 'Je suis l’assistant IA Triada Designs. Si votre pièce vous plaît, un court avis aide d’autres clients — seulement si vous le souhaitez.',
                'complete_the_set' => 'Je suis l’assistant IA Triada Designs. Une idée douce pour compléter le set depuis notre collection approuvée.',
                'ugc_invite' => 'Je suis l’assistant IA Triada Designs. Nous aimerions une photo ou un reel avec tag Triada Designs — petit merci (remise ou mise en avant) quand vous partagez.',
                'default' => 'Je suis l’assistant IA Triada Designs. Suivi après-vente de Triada Designs.',
            ],
            'ru' => [
                'care_tips' => 'Я ИИ-ассистент Triada Designs. Уход: храните в сухом месте, избегайте химии и духов на металле, мягко протирайте мягкой тканью.',
                'review_request' => 'Я ИИ-ассистент Triada Designs. Если изделие вам нравится, короткий отзыв поможет другим клиентам — только если хотите.',
                'complete_the_set' => 'Я ИИ-ассистент Triada Designs. Мягкая идея дополнить комплект из утверждённой коллекции.',
                'ugc_invite' => 'Я ИИ-ассистент Triada Designs. Будем рады фото или рилсу с тегом Triada Designs — небольшая благодарность (скидка или публикация) при публикации.',
                'default' => 'Я ИИ-ассистент Triada Designs. Послепродажное сообщение от Triada Designs.',
            ],
            'es' => [
                'care_tips' => 'Soy el asistente de IA de Triada Designs. Cuidado: guarde en seco, evite químicos y perfume sobre el metal, limpie suavemente con un paño suave.',
                'review_request' => 'Soy el asistente de IA de Triada Designs. Si está contento con su pieza, una breve reseña ayuda a otros clientes — solo si lo desea.',
                'complete_the_set' => 'Soy el asistente de IA de Triada Designs. Una idea suave para completar el set de nuestra colección aprobada.',
                'ugc_invite' => 'Soy el asistente de IA de Triada Designs. Nos encantaría una foto o reel etiquetando Triada Designs — un pequeño agradecimiento (descuento o destacada) al compartir.',
                'default' => 'Soy el asistente de IA de Triada Designs. Seguimiento postventa de Triada Designs.',
            ],
            'pt' => [
                'care_tips' => 'Sou o assistente de IA da Triada Designs. Cuidado: guarde seco, evite químicos e perfume no metal, limpe suavemente com um pano macio.',
                'review_request' => 'Sou o assistente de IA da Triada Designs. Se gostar da peça, uma breve avaliação ajuda outros clientes — só se quiser.',
                'complete_the_set' => 'Sou o assistente de IA da Triada Designs. Uma ideia suave para completar o conjunto da nossa coleção aprovada.',
                'ugc_invite' => 'Sou o assistente de IA da Triada Designs. Adoraríamos uma foto ou reel com tag Triada Designs — um pequeno agradecimento (desconto ou destaque) ao partilhar.',
                'default' => 'Sou o assistente de IA da Triada Designs. Follow-up pós-venda da Triada Designs.',
            ],
        ];

        return $tables[$lang] ?? $tables['en'];
    }
}
