<?php

namespace Tests\Feature;

use App\Models\ChannelTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChannelTemplateApiTest extends TestCase
{
    use RefreshDatabase;

    protected string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $user = User::query()->where('email', 'info@triada-designs.com')->firstOrFail();
        $this->token = $user->createToken('test')->plainTextToken;
    }

    public function test_lists_seeded_jewellery_templates(): void
    {
        $response = $this->withToken($this->token)
            ->getJson('/api/v1/channel-templates')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'platform', 'name', 'status', 'body']],
                'meta' => ['platforms', 'statuses'],
            ]);

        $this->assertGreaterThanOrEqual(5, count($response->json('data')));
        $platforms = collect($response->json('data'))->pluck('platform')->unique()->all();
        $this->assertContains('whatsapp', $platforms);
        $this->assertContains('linkedin', $platforms);
    }

    public function test_create_approve_publish_uses_local_sim_without_live_creds(): void
    {
        $created = $this->withToken($this->token)
            ->postJson('/api/v1/channel-templates', [
                'platform' => 'tiktok',
                'name' => 'Test jewellery reel caption',
                'body' => 'Quiet sparkle — Triada Designs.',
                'category' => 'social_post',
            ])
            ->assertCreated()
            ->json('template');

        $this->assertSame('draft', $created['status']);

        $this->withToken($this->token)
            ->postJson("/api/v1/channel-templates/{$created['id']}/publish")
            ->assertStatus(422);

        $this->withToken($this->token)
            ->postJson("/api/v1/channel-templates/{$created['id']}/approve")
            ->assertOk()
            ->assertJsonPath('template.status', 'approved');

        $published = $this->withToken($this->token)
            ->postJson("/api/v1/channel-templates/{$created['id']}/publish")
            ->assertOk()
            ->assertJsonPath('mode', 'local_sim')
            ->assertJsonPath('template.status', 'published')
            ->json();

        $this->assertNotEmpty($published['external_template_id']);
        $this->assertStringStartsWith('sim-', $published['external_template_id']);
    }

    public function test_channels_status_includes_linkedin(): void
    {
        $response = $this->withToken($this->token)
            ->getJson('/api/v1/integrations/channels/status')
            ->assertOk();

        $channels = $response->json('channels');
        $this->assertArrayHasKey('linkedin', $channels);
        $this->assertArrayHasKey('webchat', $channels);
        $this->assertArrayHasKey('shopify', $channels);
        $this->assertNotSame('healthy', $channels['linkedin']['status']);
    }

    public function test_jewellery_workflows_are_seeded_and_editable(): void
    {
        $list = $this->withToken($this->token)
            ->getJson('/api/v1/automations')
            ->assertOk()
            ->json('data');

        $names = collect($list)->pluck('name')->all();
        $this->assertContains('Jewellery product inquiry', $names);
        $this->assertContains('WhatsApp jewellery follow-up', $names);
        $this->assertContains('IG/FB comment to DM', $names);
        $this->assertContains('Shopify order notice', $names);

        $workflow = ChannelTemplate::query()->where('slug', 'wa-jewellery-follow-up')->first();
        $this->assertNotNull($workflow);
        $this->assertSame('approved', $workflow->status);
    }
}
