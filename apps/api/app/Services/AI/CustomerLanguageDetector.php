<?php

namespace App\Services\AI;

/**
 * Detect customer language from the latest inbound message.
 * Script-first (Arabic / Cyrillic), then Latin stopword scoring. Default English.
 */
class CustomerLanguageDetector
{
    /**
     * @return list<array{code:string,name:string,rtl:bool}>
     */
    public static function supported(): array
    {
        return [
            ['code' => 'ar', 'name' => 'Arabic', 'rtl' => true],
            ['code' => 'ro', 'name' => 'Romanian', 'rtl' => false],
            ['code' => 'de', 'name' => 'German', 'rtl' => false],
            ['code' => 'fr', 'name' => 'French', 'rtl' => false],
            ['code' => 'ru', 'name' => 'Russian', 'rtl' => false],
            ['code' => 'es', 'name' => 'Spanish', 'rtl' => false],
            ['code' => 'pt', 'name' => 'Portuguese', 'rtl' => false],
            ['code' => 'en', 'name' => 'English', 'rtl' => false],
        ];
    }

    public static function normalize(?string $raw): string
    {
        $s = strtolower(trim(str_replace('_', '-', (string) $raw)));
        if ($s === '') {
            return '';
        }
        $base = explode('-', $s)[0];

        return match ($base) {
            'arb', 'ara' => 'ar',
            'ron', 'rum' => 'ro',
            'ger', 'deu' => 'de',
            'fre', 'fra' => 'fr',
            'rus' => 'ru',
            'spa', 'castellano' => 'es',
            'por', 'ptbr' => 'pt',
            'eng' => 'en',
            default => $base,
        };
    }

    /**
     * @param  array{fallback?:string,hint?:string}  $opts
     * @return array{code:string,name:string,confidence:float,rtl:bool,method:string}
     */
    public function detect(string $text, array $opts = []): array
    {
        $raw = trim($text);
        $hint = self::normalize($opts['hint'] ?? null);
        $fallback = self::normalize($opts['fallback'] ?? null) ?: 'en';

        if ($raw === '') {
            $meta = $this->meta($hint ?: $fallback);

            return [
                'code' => $meta['code'],
                'name' => $meta['name'],
                'confidence' => $hint !== '' ? 0.55 : 0.2,
                'rtl' => $meta['rtl'],
                'method' => $hint !== '' ? 'hint_empty_message' : 'default_empty',
            ];
        }

        $arabic = preg_match_all('/[\x{0600}-\x{06FF}\x{0750}-\x{077F}\x{08A0}-\x{08FF}]/u', $raw) ?: 0;
        $cyrillic = preg_match_all('/[\x{0400}-\x{04FF}]/u', $raw) ?: 0;
        $latin = preg_match_all('/[A-Za-zÀ-ÿĂăÂâÎîȘșȚț]/u', $raw) ?: 0;
        $totalScript = max(1, $arabic + $cyrillic + $latin);

        if ($arabic / $totalScript >= 0.35 || ($arabic >= 3 && $arabic >= $latin)) {
            return [
                'code' => 'ar',
                'name' => 'Arabic',
                'confidence' => min(0.99, 0.7 + $arabic / max(mb_strlen($raw), 1)),
                'rtl' => true,
                'method' => 'script_arabic',
            ];
        }

        if ($cyrillic / $totalScript >= 0.35 || ($cyrillic >= 3 && $cyrillic >= $latin)) {
            return [
                'code' => 'ru',
                'name' => 'Russian',
                'confidence' => min(0.99, 0.68 + $cyrillic / max(mb_strlen($raw), 1)),
                'rtl' => false,
                'method' => 'script_cyrillic',
            ];
        }

        $tokens = $this->tokenize($raw);
        $scores = [];
        foreach ($this->stopwords() as $code => $words) {
            $score = 0;
            foreach ($words as $w) {
                if (in_array($this->normalizeToken($w), $tokens, true)) {
                    $score += str_contains($w, ' ') ? 2 : 1;
                }
            }
            if ($code === 'ro' && preg_match('/[ăâîșțĂÂÎȘȚ]/u', $raw)) {
                $score += 3;
            }
            if ($code === 'de' && preg_match('/[äöüßÄÖÜ]/u', $raw)) {
                $score += 2;
            }
            if ($code === 'fr' && preg_match('/[àâçéèêëïîôùûüÿœæ]/iu', $raw)) {
                $score += 2;
            }
            if ($code === 'es' && preg_match('/[ñáéíóúü¿¡]/iu', $raw)) {
                $score += 2;
            }
            if ($code === 'pt' && preg_match('/[ãõáéíóúç]/iu', $raw)) {
                $score += 2;
            }
            if ($code === 'pl' && preg_match('/[ąćęłńóśźż]/iu', $raw)) {
                $score += 2;
            }
            if ($code === 'tr' && preg_match('/[çğıöşü]/iu', $raw)) {
                $score += 2;
            }
            $scores[$code] = $score;
        }

        arsort($scores);
        $bestCode = array_key_first($scores) ?: 'en';
        $bestScore = (int) ($scores[$bestCode] ?? 0);
        $values = array_values($scores);
        $second = (int) ($values[1] ?? 0);

        if ($bestScore <= 0) {
            $meta = $this->meta($hint !== '' ? $hint : $fallback);

            return [
                'code' => $meta['code'],
                'name' => $meta['name'],
                'confidence' => $hint !== '' ? 0.45 : 0.25,
                'rtl' => $meta['rtl'],
                'method' => $hint !== '' ? 'hint_unclear' : 'default_unclear',
            ];
        }

        if ($hint !== '' && ($scores[$hint] ?? 0) >= $bestScore - 1 && ($scores[$hint] ?? 0) > 0) {
            $meta = $this->meta($hint);

            return [
                'code' => $meta['code'],
                'name' => $meta['name'],
                'confidence' => 0.7,
                'rtl' => $meta['rtl'],
                'method' => 'hint_tiebreak',
            ];
        }

        $meta = $this->meta($bestCode);
        $confidence = $bestScore >= $second + 2
            ? min(0.95, 0.55 + $bestScore * 0.08)
            : min(0.75, 0.45 + $bestScore * 0.06);

        return [
            'code' => $meta['code'],
            'name' => $meta['name'],
            'confidence' => $confidence,
            'rtl' => $meta['rtl'],
            'method' => 'stopwords',
        ];
    }

    /**
     * @return array{code:string,name:string,rtl:bool}
     */
    public function meta(string $code): array
    {
        $c = self::normalize($code) ?: 'en';
        foreach (self::supported() as $row) {
            if ($row['code'] === $c) {
                return $row;
            }
        }

        $extra = [
            'it' => ['code' => 'it', 'name' => 'Italian', 'rtl' => false],
            'tr' => ['code' => 'tr', 'name' => 'Turkish', 'rtl' => false],
            'nl' => ['code' => 'nl', 'name' => 'Dutch', 'rtl' => false],
            'pl' => ['code' => 'pl', 'name' => 'Polish', 'rtl' => false],
        ];

        return $extra[$c] ?? [
            'code' => $c,
            'name' => strtoupper($c),
            'rtl' => in_array($c, ['ar', 'he', 'fa', 'ur'], true),
        ];
    }

    /**
     * @return list<string>
     */
    protected function tokenize(string $text): array
    {
        $parts = preg_split('/[^\p{L}\p{N}\']+/u', mb_strtolower($text)) ?: [];

        return array_values(array_filter(array_map(fn ($t) => $this->normalizeToken($t), $parts), fn ($t) => mb_strlen($t) >= 2));
    }

    protected function normalizeToken(string $t): string
    {
        return mb_strtolower(trim($t));
    }

    /**
     * @return array<string, list<string>>
     */
    protected function stopwords(): array
    {
        return [
            'ar' => ['مرحبا', 'السلام', 'أريد', 'شكرا', 'هل', 'ما', 'كيف', 'سعر', 'طلب', 'شحن', 'ذهب', 'فضة', 'خاتم'],
            'ru' => ['привет', 'здравствуйте', 'пожалуйста', 'спасибо', 'хочу', 'сколько', 'цена', 'заказ', 'доставка', 'кольцо', 'золото', 'серебро'],
            'ro' => ['buna', 'bună', 'salut', 'rog', 'multumesc', 'mulțumesc', 'cat', 'cât', 'costa', 'costă', 'pret', 'preț', 'comanda', 'comandă', 'livrare', 'inel', 'aur', 'argint'],
            'de' => ['hallo', 'guten', 'bitte', 'danke', 'wie', 'viel', 'kostet', 'preis', 'bestellung', 'lieferung', 'ring', 'gold', 'silber', 'ich', 'möchte'],
            'fr' => ['bonjour', 'bonsoir', 'merci', 'combien', 'prix', 'commande', 'livraison', 'bague', 'voudrais', 'pour', 'une'],
            'es' => ['hola', 'gracias', 'favor', 'cuanto', 'cuánto', 'cuesta', 'precio', 'pedido', 'envio', 'envío', 'anillo', 'oro', 'plata', 'quiero'],
            'pt' => ['ola', 'olá', 'obrigado', 'obrigada', 'favor', 'quanto', 'custa', 'preco', 'preço', 'pedido', 'entrega', 'anel', 'ouro', 'prata', 'quero'],
            'en' => ['hello', 'hi', 'please', 'thanks', 'thank', 'how', 'much', 'price', 'order', 'shipping', 'delivery', 'ring', 'gold', 'silver', 'want', 'need', 'the', 'and'],
            'it' => ['ciao', 'buongiorno', 'grazie', 'quanto', 'costa', 'prezzo', 'ordine', 'anello', 'oro', 'argento'],
            'tr' => ['merhaba', 'selam', 'lütfen', 'fiyat', 'sipariş', 'yüzük', 'altın', 'gümüş'],
            'nl' => ['hallo', 'dank', 'hoeveel', 'prijs', 'bestelling', 'levering', 'goud', 'zilver'],
            'pl' => ['cześć', 'proszę', 'dziękuję', 'ile', 'kosztuje', 'cena', 'zamówienie', 'dostawa', 'złoto'],
        ];
    }
}
