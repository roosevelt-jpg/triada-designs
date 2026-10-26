<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PlatformGapsApiTest extends TestCase
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
    }

    public function test_meta_webhook_verify_challenge(): void
    {
        $challenge = 'triada-challenge-123';

        $this->get('/api/webhooks/meta?'.http_build_query([
            'hub.mode' => 'subscribe',
            'hub.verify_token' => 'triada-local-verify',
            'hub.challenge' => $challenge,
        ]))->assertOk()->assertSee($challenge, false);
    }

    public function test_meta_webhook_rejects_bad_signature_when_secret_configured(): void
    {
        config(['integrations.meta.webhook_secret' => 'test-secret', 'integrations.mode' => 'live']);
        config(['integrations.meta.app_id' => 'x', 'integrations.meta.app_secret' => 'y', 'integrations.meta.page_access_token' => 'z']);

        $this->call(
            'POST',
            '/api/webhooks/meta',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_HUB_SIGNATURE_256' => 'sha256=deadbeef',
            ],
            json_encode(['object' => 'page', 'entry' => []])
        )->assertStatus(401);
    }

    public function test_shopify_local_sync_upserts_products(): void
    {
        $this->postJson('/api/v1/integrations/shopify/connect', [
            'shop_domain' => 'triada-local.myshopify.com',
        ])->assertOk()->assertJsonPath('status', 'awaiting_credentials');

        $response = $this->postJson('/api/v1/integrations/shopify/sync', [
            'sync_type' => 'products',
        ])->assertOk();

        $response->assertJsonPath('ok', true)
            ->assertJsonPath('run.mode', 'local')
            ->assertJsonPath('run.status', 'completed');

        $this->assertGreaterThan(0, $response->json('run.records_upserted'));
    }

    public function test_ai_local_draft_and_activity(): void
    {
        config([
            'integrations.llm.provider' => 'anthropic',
            'integrations.llm.anthropic.api_key' => null,
            'integrations.llm.api_key' => null,
            'integrations.llm.gemini.api_key' => null,
        ]);

        $this->getJson('/api/v1/agents/llm/status')
            ->assertOk()
            ->assertJsonPath('live', false)
            ->assertJsonPath('configured_provider', 'anthropic')
            ->assertJsonPath('status', 'awaiting_credentials')
            ->assertJsonPath('provider', 'local_heuristic');

        $this->postJson('/api/v1/agents/test-run', [
            'agent_key' => 'support',
            'purpose' => 'draft_reply',
            'message' => 'What is your shipping policy for jewellery?',
            'dry_run' => true,
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('provider', 'local_heuristic');

        $this->getJson('/api/v1/agents/activity')
            ->assertOk()
            ->assertJsonStructure(['data', 'metrics' => ['total_runs']]);
    }

    public function test_system_time_returns_utc_and_workspace_timezone(): void
    {
        $this->workspace->forceFill(['timezone' => 'America/Los_Angeles'])->save();

        $this->getJson('/api/v1/system/time')
            ->assertOk()
            ->assertJsonPath('timezone', 'America/Los_Angeles')
            ->assertJsonStructure([
                'utc',
                'workspace_local',
                'timezone',
                'unix_ms',
                'offset_minutes',
            ]);
    }

    public function test_publish_requires_human_approval_and_version_gate(): void
    {
        $item = ContentItem::query()->create([
            'workspace_id' => $this->workspace->id,
            'title' => 'Unapproved draft',
            'content_type' => 'social_post',
            'status' => 'draft',
            'body' => 'Not approved yet',
            'channel' => 'instagram',
            'created_by' => $this->user->id,
        ]);

        $this->postJson("/api/v1/content/{$item->id}/publish", [
            'adapter' => 'meta_page',
            'approval_version' => 1,
        ])->assertStatus(422)
            ->assertJsonPath('gate', 'approval_required');

        $this->postJson("/api/v1/content/{$item->id}/approve")->assertOk();
        $item->refresh();

        $this->postJson("/api/v1/content/{$item->id}/publish", [
            'adapter' => 'meta_page',
            'approval_version' => ((int) $item->approval_version) + 5,
        ])->assertStatus(422)
            ->assertJsonPath('gate', 'approval_version_mismatch');

        $this->postJson("/api/v1/content/{$item->id}/publish", [
            'adapter' => 'wordpress',
            'approval_version' => (int) $item->approval_version,
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('publication.status', 'published');
    }

    public function test_telegram_and_email_simulators(): void
    {
        $this->postJson('/api/v1/integrations/channels/simulate-inbound', [
            'channel' => 'telegram',
            'body' => 'Hi from Telegram simulator about pricing',
        ])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('channel', 'telegram');

        $this->post('/api/webhooks/email', [
            'from' => 'guest@example.com',
            'subject' => 'Consultation',
            'body' => 'I would like to book a consult',
        ])->assertOk()->assertJsonPath('ok', true);

        $this->postJson('/api/webhooks/telegram', [
            'update_id' => 991001,
            'message' => [
                'message_id' => 44,
                'text' => 'Do you ship internationally?',
                'from' => ['id' => 555, 'first_name' => 'Alex'],
                'chat' => ['id' => 555],
            ],
        ])->assertOk()->assertJsonPath('channel', 'telegram');
    }

    public function test_webchat_widget_public_endpoint_rate_stub(): void
    {
        $this->postJson('/api/v1/integrations/channels/webchat-token')->assertOk();

        $token = $this->getJson('/api/v1/integrations/channels/status')
            ->json('webchat_widget.public_token');

        $this->assertNotEmpty($token);

        $this->postJson('/api/v1/webchat/messages', [
            'token' => $token,
            'body' => 'Hello from the embeddable widget',
            'visitor_id' => 'visitor-test-1',
        ])->assertOk()->assertJsonPath('ok', true);
    }
}
