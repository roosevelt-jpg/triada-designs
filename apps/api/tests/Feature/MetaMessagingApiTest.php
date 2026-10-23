<?php

namespace Tests\Feature;

use App\Models\AutomationWorkflow;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MetaMessagingApiTest extends TestCase
{
    use RefreshDatabase;

    protected string $token;

    protected Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $user = User::query()->where('email', 'admin@triada-designs.com')->firstOrFail();
        $this->token = $user->createToken('test')->plainTextToken;
        $this->workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
    }

    public function test_meta_webhook_verify_challenge(): void
    {
        $this->get('/api/webhooks/meta?'.http_build_query([
            'hub.mode' => 'subscribe',
            'hub.verify_token' => 'triada-local-verify',
            'hub.challenge' => 'challenge-token-123',
        ]))
            ->assertOk()
            ->assertSee('challenge-token-123', false);
    }

    public function test_meta_webhook_verify_rejects_bad_token(): void
    {
        $this->getJson('/api/webhooks/meta?'.http_build_query([
            'hub.mode' => 'subscribe',
            'hub.verify_token' => 'wrong',
            'hub.challenge' => 'x',
        ]))->assertForbidden();
    }

    public function test_inbound_meta_message_is_idempotent(): void
    {
        $payload = [
            'object' => 'page',
            'entry' => [[
                'id' => 'seed-page-triada',
                'messaging' => [[
                    'sender' => ['id' => 'meta-user-1'],
                    'recipient' => ['id' => 'seed-page-triada'],
                    'timestamp' => (int) (microtime(true) * 1000),
                    'message' => [
                        'mid' => 'mid-idempotent-1',
                        'text' => 'Hello Triada from Messenger',
                    ],
                ]],
            ]],
        ];

        $this->postJson('/api/webhooks/meta', $payload)
            ->assertOk()
            ->assertJsonPath('ok', true);

        $countAfterFirst = Message::query()->where('provider_message_id', 'mid-idempotent-1')->count();
        $this->assertSame(1, $countAfterFirst);

        $this->postJson('/api/webhooks/meta', $payload)
            ->assertOk();

        $this->assertSame(1, Message::query()->where('provider_message_id', 'mid-idempotent-1')->count());
        $this->assertDatabaseHas('conversations', [
            'channel' => 'facebook',
            'external_conversation_id' => 'seed-page-triada:meta-user-1',
        ]);
    }

    public function test_local_test_send_succeeds_without_live_credentials(): void
    {
        $this->withToken($this->token)
            ->postJson('/api/v1/integrations/meta/test-send', [
                'channel' => 'facebook',
                'recipient_id' => 'seed-recipient',
                'body' => 'Local simulator outbound',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('result.mode', 'local');

        $status = $this->withToken($this->token)
            ->getJson('/api/v1/integrations/meta/status')
            ->assertOk();

        $this->assertNotSame('healthy', $status->json('channels.facebook.health.status'));
        $this->assertContains($status->json('channels.facebook.health.status'), [
            'awaiting_credentials',
            'local',
        ]);
    }

    public function test_meta_automation_dry_run(): void
    {
        $workflow = AutomationWorkflow::query()
            ->where('name', 'Meta incoming message reply')
            ->firstOrFail();

        $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/dry-run", [
                'context' => [
                    'channel' => 'instagram',
                    'intent' => 'product_inquiry',
                    'automation_mode' => 'ai',
                ],
                'idempotency_key' => 'meta-dry-run-1',
            ])
            ->assertOk()
            ->assertJsonPath('run.mode', 'dry_run')
            ->assertJsonPath('run.status', 'completed');
    }

    public function test_human_takeover_suppresses_auto_reply_on_inbound(): void
    {
        $conversation = Conversation::query()
            ->where('channel', 'instagram')
            ->firstOrFail();

        $conversation->forceFill(['automation_mode' => 'human'])->save();

        $outboundBefore = Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('direction', 'outbound')
            ->count();

        $mid = 'mid-takeover-suppress-1';
        $payload = [
            'object' => 'instagram',
            'entry' => [[
                'id' => 'seed-ig-triada',
                'messaging' => [[
                    'sender' => ['id' => 'seed-ig-user-sofia'],
                    'recipient' => ['id' => 'seed-ig-triada'],
                    'timestamp' => (int) (microtime(true) * 1000),
                    'message' => [
                        'mid' => $mid,
                        'text' => 'Still waiting — human should answer',
                    ],
                ]],
            ]],
        ];

        // Reuse existing conversation id by matching external id pattern.
        $payload['entry'][0]['messaging'][0]['sender']['id'] = 'seed-ig-user-sofia';

        $result = $this->postJson('/api/webhooks/meta', $payload)->assertOk();

        $automations = $result->json('automations') ?? [];
        $this->assertNotEmpty($automations);
        $this->assertTrue(collect($automations)->contains(fn ($row) => ($row['reason'] ?? null) === 'human_takeover'));

        $outboundAfter = Message::query()
            ->where('conversation_id', $conversation->id)
            ->where('direction', 'outbound')
            ->count();

        $this->assertSame($outboundBefore, $outboundAfter);
    }

    public function test_simulate_inbound_from_admin_api(): void
    {
        $this->withToken($this->token)
            ->postJson('/api/v1/integrations/meta/simulate-inbound', [
                'channel' => 'whatsapp',
                'body' => 'WA simulator hello',
                'sender_id' => '15551234567',
                'contact_name' => 'WA Guest',
            ])
            ->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('channel', 'whatsapp');

        $this->assertDatabaseHas('conversations', [
            'channel' => 'whatsapp',
        ]);
    }

    public function test_settings_emergency_pause_flags(): void
    {
        $this->withToken($this->token)
            ->patchJson('/api/v1/settings', [
                'outbound_paused' => true,
                'automations_paused' => true,
            ])
            ->assertOk()
            ->assertJsonPath('workspace.outbound_paused', true)
            ->assertJsonPath('workspace.automations_paused', true);

        $this->withToken($this->token)
            ->postJson('/api/v1/integrations/meta/test-send', [
                'channel' => 'facebook',
                'body' => 'Should block',
            ])
            ->assertStatus(422)
            ->assertJsonPath('eligibility.reason', 'outbound_paused');
    }
}
