<?php

namespace Tests\Unit;

use App\Services\AI\CustomerLanguageDetector;
use PHPUnit\Framework\TestCase;

class CustomerLanguageDetectorTest extends TestCase
{
    public function test_detects_core_customer_languages(): void
    {
        $detector = new CustomerLanguageDetector;

        $cases = [
            ['مرحبا، كم سعر الخاتم؟', 'ar'],
            ['Bună, cât costă inelul?', 'ro'],
            ['Hallo, was kostet der Ring bitte?', 'de'],
            ['Bonjour, quel est le prix de la bague ?', 'fr'],
            ['Здравствуйте, сколько стоит кольцо?', 'ru'],
            ['Hola, ¿cuánto cuesta el anillo?', 'es'],
            ['Olá, quanto custa o anel?', 'pt'],
            ['Hello, how much is the ring please?', 'en'],
            ['', 'en'],
        ];

        foreach ($cases as [$text, $expected]) {
            $detected = $detector->detect($text);
            $this->assertSame($expected, $detected['code'], 'Failed for: '.$text);
        }
    }

    public function test_arabic_is_rtl(): void
    {
        $detected = (new CustomerLanguageDetector)->detect('السلام عليكم، أريد خاتم ذهب');
        $this->assertSame('ar', $detected['code']);
        $this->assertTrue($detected['rtl']);
    }

    public function test_latest_message_wins_over_preferred_language_hint(): void
    {
        $detector = new CustomerLanguageDetector;
        $detected = $detector->detect('Bonjour, quel est le prix de la bague ?', [
            'hint' => 'en',
        ]);
        $this->assertSame('fr', $detected['code']);
    }

    public function test_hint_only_fills_when_message_unclear(): void
    {
        $detector = new CustomerLanguageDetector;
        $detected = $detector->detect('12345 !!!', [
            'hint' => 'ar',
        ]);
        $this->assertSame('ar', $detected['code']);
    }
}
