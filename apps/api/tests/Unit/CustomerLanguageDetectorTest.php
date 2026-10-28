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
}
