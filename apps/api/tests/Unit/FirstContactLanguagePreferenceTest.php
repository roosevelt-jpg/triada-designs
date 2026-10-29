<?php

namespace Tests\Unit;

use App\Services\AI\CustomerLanguageDetector;
use App\Services\AI\FirstContactLanguagePreference;
use PHPUnit\Framework\TestCase;

class FirstContactLanguagePreferenceTest extends TestCase
{
    protected FirstContactLanguagePreference $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new FirstContactLanguagePreference(new CustomerLanguageDetector);
    }

    public function test_first_contact_ask_is_english(): void
    {
        $ask = $this->service->draftFirstContactAsk('Alex');

        $this->assertSame('en', $ask['detected_language']);
        $this->assertTrue($ask['first_contact_language_ask']);
        $this->assertStringContainsString('Which language', (string) $ask['text']);
        $this->assertStringContainsString('warm greetings from Triada Designs', strtolower((string) $ask['text']));
        $this->assertStringNotContainsString('Mulțumim', (string) $ask['text']);
    }

    public function test_parse_explicit_language_choices(): void
    {
        $this->assertSame('ar', $this->service->parseExplicitChoice('Arabic')['code'] ?? null);
        $this->assertSame('fr', $this->service->parseExplicitChoice('français')['code'] ?? null);
        $this->assertSame('de', $this->service->parseExplicitChoice('German')['code'] ?? null);
        $this->assertSame('ro', $this->service->parseExplicitChoice('Română')['code'] ?? null);
    }

    public function test_resolve_from_spanish_message(): void
    {
        $resolved = $this->service->resolveFromReply('Hola, ¿tienen anillos de oro?');

        $this->assertSame('es', $resolved['code']);
    }

    public function test_locked_ack_uses_target_language(): void
    {
        $ack = $this->service->draftLockedAck('ar');

        $this->assertSame('ar', $ack['detected_language']);
        $this->assertTrue($ack['language_rtl']);
        $this->assertStringContainsString('العربية', (string) $ack['text']);
    }

    public function test_choice_only_detection(): void
    {
        $this->assertTrue($this->service->isChoiceOnly('Arabic'));
        $this->assertFalse($this->service->isChoiceOnly('Arabic — what sizes?'));
    }
}
