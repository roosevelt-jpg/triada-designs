<?php

namespace App\Services\AI;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Message;

/**
 * First-contact English greeting + language preference ask/lock for inbound AI Support.
 */
class FirstContactLanguagePreference
{
    public const ASK_EN = 'Which language do you prefer to chat in? Reply with English, Arabic, Romanian, German, French, Russian, Spanish, Portuguese — or simply write in your preferred language.';

    /** @var array<string, string> */
    protected array $nameToCode = [
        'english' => 'en',
        'en' => 'en',
        'eng' => 'en',
        'arabic' => 'ar',
        'ar' => 'ar',
        'arab' => 'ar',
        'العربية' => 'ar',
        'عربي' => 'ar',
        'romanian' => 'ro',
        'romana' => 'ro',
        'română' => 'ro',
        'ro' => 'ro',
        'german' => 'de',
        'deutsch' => 'de',
        'de' => 'de',
        'french' => 'fr',
        'français' => 'fr',
        'francais' => 'fr',
        'fr' => 'fr',
        'russian' => 'ru',
        'русский' => 'ru',
        'ru' => 'ru',
        'spanish' => 'es',
        'español' => 'es',
        'espanol' => 'es',
        'es' => 'es',
        'portuguese' => 'pt',
        'português' => 'pt',
        'portugues' => 'pt',
        'pt' => 'pt',
    ];

    /** @var array<string, string> */
    protected array $lockedAck = [
        'en' => 'Perfect — we will continue in English. How can we help with Salt & Spirit or a custom piece today?',
        'ar' => 'حسناً — سنكمل بالعربية. كيف يمكننا مساعدتك بخصوص Salt & Spirit أو قطعة مخصّصة اليوم؟',
        'ro' => 'Perfect — continuăm în română. Cum vă putem ajuta cu Salt & Spirit sau o piesă personalizată azi?',
        'de' => 'Perfekt — wir machen auf Deutsch weiter. Wie können wir Ihnen heute mit Salt & Spirit oder einem Einzelstück helfen?',
        'fr' => 'Parfait — nous continuons en français. Comment pouvons-nous vous aider aujourd’hui pour Salt & Spirit ou une pièce sur mesure ?',
        'ru' => 'Отлично — продолжим на русском. Чем помочь сегодня по Salt & Spirit или индивидуальному изделию?',
        'es' => 'Perfecto — seguimos en español. ¿Cómo podemos ayudarte hoy con Salt & Spirit o una pieza a medida?',
        'pt' => 'Perfeito — seguimos em português. Como podemos ajudar hoje com Salt & Spirit ou uma peça personalizada?',
    ];

    public function __construct(
        protected CustomerLanguageDetector $detector,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function contactMeta(Contact $contact): array
    {
        $meta = $contact->metadata;

        return is_array($meta) ? $meta : [];
    }

    public function isLocked(Contact $contact): bool
    {
        $meta = $this->contactMeta($contact);

        return ($meta['language_preference_locked'] ?? false) === true
            || ($meta['language_preference_confirmed'] ?? false) === true;
    }

    public function isAsked(Contact $contact): bool
    {
        $meta = $this->contactMeta($contact);

        return ($meta['language_preference_asked'] ?? false) === true;
    }

    public function hasPriorOutbound(Conversation $conversation): bool
    {
        return Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('direction', 'outbound')
            ->exists();
    }

    public function needsFirstContactAsk(Contact $contact, Conversation $conversation): bool
    {
        if ($this->isLocked($contact)) {
            return false;
        }
        if ($this->isAsked($contact)) {
            return false;
        }

        return ! $this->hasPriorOutbound($conversation);
    }

    public function isPreferencePending(Contact $contact): bool
    {
        return $this->isAsked($contact) && ! $this->isLocked($contact);
    }

    /**
     * @return array{code: string, name: string, rtl: bool, method: string}|null
     */
    public function parseExplicitChoice(string $text): ?array
    {
        $raw = trim($text);
        if ($raw === '') {
            return null;
        }

        $compact = mb_strtolower(preg_replace('/[.!?,;:]+$/u', '', $raw) ?? $raw);
        $compact = trim($compact);

        if (isset($this->nameToCode[$compact])) {
            $code = $this->nameToCode[$compact];
            $meta = $this->detector->meta($code);

            return [
                'code' => $meta['code'],
                'name' => $meta['name'],
                'rtl' => (bool) $meta['rtl'],
                'method' => 'explicit_name',
            ];
        }

        if (mb_strlen($raw) <= 64) {
            $tokens = preg_split('/[^\p{L}\p{N}]+/u', $compact) ?: [];
            foreach ($tokens as $token) {
                if ($token !== '' && isset($this->nameToCode[$token])) {
                    $code = $this->nameToCode[$token];
                    $meta = $this->detector->meta($code);

                    return [
                        'code' => $meta['code'],
                        'name' => $meta['name'],
                        'rtl' => (bool) $meta['rtl'],
                        'method' => 'explicit_token',
                    ];
                }
            }
        }

        return null;
    }

    /**
     * @return array{code: string, name: string, rtl: bool, method: string, confidence?: float}
     */
    public function resolveFromReply(string $message, string $hint = 'en'): array
    {
        $explicit = $this->parseExplicitChoice($message);
        if ($explicit) {
            return $explicit;
        }

        $detected = $this->detector->detect($message, [
            'hint' => $hint,
            'fallback' => $hint ?: 'en',
        ]);

        return [
            'code' => (string) ($detected['code'] ?? 'en'),
            'name' => (string) ($detected['name'] ?? 'English'),
            'rtl' => (bool) ($detected['rtl'] ?? false),
            'method' => (string) ($detected['method'] ?? 'detected'),
            'confidence' => (float) ($detected['confidence'] ?? 0.5),
        ];
    }

    public function markAsked(Contact $contact): void
    {
        $meta = $this->contactMeta($contact);
        $meta['language_preference_asked'] = true;
        $meta['language_preference_locked'] = false;
        $contact->forceFill([
            'preferred_language' => $contact->preferred_language ?: 'en',
            'metadata' => $meta,
        ])->save();
    }

    public function markLocked(Contact $contact, string $code): void
    {
        $meta = $this->contactMeta($contact);
        $meta['language_preference_asked'] = true;
        $meta['language_preference_locked'] = true;
        $meta['language_preference_confirmed'] = true;
        $contact->forceFill([
            'preferred_language' => $code,
            'metadata' => $meta,
        ])->save();
    }

    /**
     * @return array<string, mixed>
     */
    public function draftFirstContactAsk(?string $customerName = null): array
    {
        $greeting = 'Hello, and warm greetings from Triada Designs'.($customerName ? ', '.$customerName : '').',';
        $body = implode("\n\n", [
            $greeting,
            'Thanks for writing Triada Designs. How can we help with Salt & Spirit or a custom piece today?',
            self::ASK_EN,
            "I'm Triada's AI Support — say if you'd like a person instead.",
        ]);

        return [
            'ok' => true,
            'text' => $body,
            'suggested_reply' => $body,
            'mode' => 'fast_path',
            'provider' => 'fast_path',
            'detected_language' => 'en',
            'detected_language_name' => 'English',
            'language_rtl' => false,
            'first_contact_language_ask' => true,
            'language_preference_phase' => 'ask',
            'fast_path' => true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function draftLockedAck(string $code, ?string $customerName = null): array
    {
        $ack = $this->lockedAck[$code] ?? $this->lockedAck['en'];
        $greeting = 'Warm greetings from Triada Designs'.($customerName ? ', '.$customerName : '').',';
        $body = implode("\n\n", [
            $greeting,
            $ack,
            "I'm Triada's AI Support — say if you'd like a person instead.",
        ]);

        $meta = $this->detector->meta($code);

        return [
            'ok' => true,
            'text' => $body,
            'suggested_reply' => $body,
            'mode' => 'fast_path',
            'provider' => 'fast_path',
            'detected_language' => $meta['code'],
            'detected_language_name' => $meta['name'],
            'language_rtl' => (bool) $meta['rtl'],
            'language_preference_phase' => 'locked',
            'fast_path' => true,
        ];
    }

    public function isChoiceOnly(string $text): bool
    {
        $raw = trim($text);
        if ($raw === '') {
            return false;
        }
        if ($this->parseExplicitChoice($raw) && mb_strlen($raw) <= 48 && ! str_contains($raw, '?')) {
            return true;
        }

        return false;
    }
}
