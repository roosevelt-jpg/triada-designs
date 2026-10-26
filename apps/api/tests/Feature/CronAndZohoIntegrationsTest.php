<?php

namespace Tests\Feature;

use App\Models\AbandonmentEvent;
use App\Models\AfterSaleJob;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CronAndZohoIntegrationsTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->user = User::query()->where('email', 'info@triada-designs.com')->firstOrFail();
        $this->workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
        config(['integrations.cron_secret' => 'test-cron-secret']);
    }

    public function test_shopify_seed_wires_triada_shop_domain(): void
    {
        Sanctum::actingAs($this->user);

        $this->getJson('/api/v1/integrations/shopify/status')
            ->assertOk()
            ->assertJsonPath('shop_domain', 'jwtjzw-nu.myshopify.com')
            ->assertJsonPath('status', 'awaiting_credentials');
    }

    public function test_cron_abandonment_and_after_sale_require_secret(): void
    {
        $this->postJson('/api/v1/cron/abandonment/process')
            ->assertStatus(401);

        AbandonmentEvent::query()->create([
            'workspace_id' => $this->workspace->id,
            'event_type' => 'cart',
            'status' => 'open',
            'channel' => 'email',
            'quiet_since' => now()->subDays(2),
            'remind_at' => now()->subHour(),
            'whatsapp_opt_in' => false,
            'context' => [],
            'metadata' => [],
        ]);

        $this->postJson('/api/v1/cron/abandonment/process', [], [
            'Authorization' => 'Bearer test-cron-secret',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('worker', 'abandonment');

        AfterSaleJob::query()->create([
            'workspace_id' => $this->workspace->id,
            'job_type' => 'care_tips',
            'status' => 'scheduled',
            'run_at' => now()->subMinute(),
            'payload' => [],
        ]);

        $this->postJson('/api/v1/cron/after-sale/process', [], [
            'Authorization' => 'Bearer test-cron-secret',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('worker', 'after_sale');
    }

    public function test_zoho_credentials_via_integrations_ui(): void
    {
        Sanctum::actingAs($this->user);

        $this->getJson('/api/v1/integrations/zoho/status')
            ->assertOk()
            ->assertJsonPath('zoho.has_credentials', false);

        $this->postJson('/api/v1/integrations/zoho', [
            'client_id' => 'zoho-client-test',
            'client_secret' => 'zoho-secret-test',
            'refresh_token' => 'zoho-refresh-test',
            'organization_id' => '60001234567',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('zoho.has_credentials', true)
            ->assertJsonPath('zoho.has_books_org', true);

        $this->getJson('/api/v1/integrations/health')
            ->assertOk()
            ->assertJsonPath('zoho.credentials.has_credentials', true)
            ->assertJsonStructure(['zoho_books']);

        $this->postJson('/api/v1/integrations/zoho/clear')
            ->assertOk()
            ->assertJsonPath('zoho.has_credentials', false);
    }
}
