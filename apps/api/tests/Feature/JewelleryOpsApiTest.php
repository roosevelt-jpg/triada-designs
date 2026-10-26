<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class JewelleryOpsApiTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->user = User::query()->where('email', 'admin@triada-designs.com')->firstOrFail();
        $this->workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
        Sanctum::actingAs($this->user);
        config([
            'integrations.llm.provider' => 'anthropic',
            'integrations.llm.anthropic.api_key' => null,
            'integrations.llm.api_key' => null,
        ]);
    }

    public function test_overview_lists_automations(): void
    {
        $this->getJson('/api/v1/jewellery-ops/overview')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('automations.answer_bot', true)
            ->assertJsonPath('automations.manufacturer', true);
    }

    public function test_anthropic_credentials_via_integrations(): void
    {
        $this->getJson('/api/v1/integrations/anthropic/status')
            ->assertOk()
            ->assertJsonPath('provider', 'anthropic')
            ->assertJsonPath('has_credentials', false);

        $this->postJson('/api/v1/integrations/anthropic', [
            'api_key' => 'sk-ant-test-local-only',
            'model' => 'claude-sonnet-4-20250514',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('anthropic.has_credentials', true);

        $this->getJson('/api/v1/integrations/health')
            ->assertOk()
            ->assertJsonPath('anthropic.has_credentials', true);

        $this->postJson('/api/v1/integrations/anthropic/clear')
            ->assertOk()
            ->assertJsonPath('anthropic.has_credentials', false);
    }

    public function test_answer_bot_and_gift_finder(): void
    {
        $this->postJson('/api/v1/jewellery-ops/answer-bot', [
            'message' => 'What materials do you use and how long to make?',
            'dry_run' => true,
        ])->assertOk()
            ->assertJsonPath('ok', true);

        $this->postJson('/api/v1/jewellery-ops/gift-finder', [
            'who' => 'sister',
            'occasion' => 'birthday',
            'budget' => '400-900',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonStructure(['suggestions']);
    }

    public function test_order_invoice_manufacturer_path(): void
    {
        $response = $this->postJson('/api/v1/jewellery-ops/orders', [
            'lifecycle_status' => 'confirmed',
            'total' => 890,
            'currency' => 'AED',
            'whatsapp_opt_in' => true,
            'customer_email' => 'client@example.com',
            'paid' => true,
            'line_items' => [[
                'sku' => 'TD-RING-AURA-01',
                'title' => 'Aura Signet Ring',
                'size' => '54',
                'metal' => 'silver_gold_plate',
                'price' => 890,
                'grams' => 8,
            ]],
        ])->assertCreated()
            ->assertJsonPath('ok', true);

        $orderNumber = $response->json('order.order_number');
        $this->assertNotEmpty($orderNumber);
        $this->assertNotEmpty($response->json('invoice.invoice.invoice_number'));
        $this->assertNotEmpty($response->json('manufacturer_order.manufacturer_order.id'));

        $this->postJson('/api/v1/jewellery-ops/orders/where-is-my-order', [
            'query' => $orderNumber,
        ])->assertOk()
            ->assertJsonPath('found', true);
    }

    public function test_outreach_requires_human_approve_no_whatsapp(): void
    {
        $created = $this->postJson('/api/v1/jewellery-ops/outreach/prospects', [
            'segment' => 'boutique',
            'company_name' => 'Test Boutique',
            'contact_name' => 'Amina',
            'email' => 'amina@example.com',
            'preferred_channel' => 'email',
            'consent_recorded' => true,
        ])->assertCreated();

        $prospectId = $created->json('prospect.id');
        $draft = $this->postJson("/api/v1/jewellery-ops/outreach/prospects/{$prospectId}/draft", [
            'channel' => 'whatsapp',
        ])->assertOk();
        $this->assertFalse((bool) $draft->json('ok'));

        $emailDraft = $this->postJson("/api/v1/jewellery-ops/outreach/prospects/{$prospectId}/draft", [
            'channel' => 'email',
        ])->assertCreated()
            ->assertJsonPath('message.status', 'awaiting_approval');

        $messageId = $emailDraft->json('message.id');
        $this->postJson("/api/v1/jewellery-ops/outreach/messages/{$messageId}/approve")
            ->assertOk()
            ->assertJsonPath('message.human_approved', true)
            ->assertJsonPath('message.status', 'sent');
    }

    public function test_popup_and_ugc_flows(): void
    {
        $market = $this->postJson('/api/v1/jewellery-ops/popups', [
            'name' => 'Test Market Dubai',
            'venue' => 'Al Quoz',
            'application_deadline' => now()->addDays(7)->toDateString(),
            'fee_aed' => 1000,
            'contact_email' => 'm@example.com',
        ])->assertCreated();

        $marketId = $market->json('market.id');
        $app = $this->postJson("/api/v1/jewellery-ops/popups/{$marketId}/draft-application")
            ->assertCreated()
            ->assertJsonPath('application.status', 'awaiting_approval');

        $this->postJson('/api/v1/jewellery-ops/popup-applications/'.$app->json('application.id').'/approve')
            ->assertOk()
            ->assertJsonPath('application.human_approved', true);

        $this->postJson('/api/v1/jewellery-ops/ugc/tags', [
            'platform' => 'instagram',
            'external_post_url' => 'https://instagram.com/p/test',
        ])->assertCreated()
            ->assertJsonPath('ok', true);
    }
}
