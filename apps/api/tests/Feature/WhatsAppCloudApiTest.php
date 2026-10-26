<?php

namespace Tests\Feature;

use App\Models\ChannelTemplate;
use App\Models\User;
use App\Models\Workspace;
use App\Services\Automations\ActionExecutor;
use App\Services\Messaging\Meta\MetaGraphClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsAppCloudApiTest extends TestCase
{
    use RefreshDatabase;

    protected string $token;

    protected Workspace $workspace;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $user = User::query()->where('email', 'info@triada-designs.com')->firstOrFail();
        $this->token = $user->createToken('test')->plainTextToken;
        $this->workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
    }

    public function test_whatsapp_status_is_local_sim_without_tokens(): void
    {
        $this->withToken($this->token)
            ->getJson('/api/v1/integrations/whatsapp/status')
            ->assertOk()
            ->assertJsonPath('mode', 'local_sim')
            ->assertJsonPath('status', 'awaiting_credentials');
    }

    public function test_list_and_sync_local_jewellery_templates(): void
    {
        $graph = app(MetaGraphClient::class);
        $remote = $graph->listWhatsAppMessageTemplates();
        $this->assertGreaterThanOrEqual(3, count($remote));
        $this->assertSame('seeded', $remote[0]['source'] ?? null);

        $this->withToken($this->token)
            ->postJson('/api/v1/integrations/whatsapp/templates/sync')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'local_sim');

        $this->assertTrue(
            ChannelTemplate::query()
                ->where('workspace_id', $this->workspace->id)
                ->where('platform', 'whatsapp')
                ->where('slug', 'jewellery-follow-up')
                ->exists()
        );

        $this->withToken($this->token)
            ->getJson('/api/v1/integrations/whatsapp/templates')
            ->assertOk()
            ->assertJsonStructure(['status', 'remote', 'data']);
    }

    public function test_create_and_send_template_local_sim(): void
    {
        $created = $this->withToken($this->token)
            ->postJson('/api/v1/integrations/whatsapp/templates', [
                'name' => 'jewellery_piece_ready',
                'body' => 'Hi {{1}}, your Triada Designs piece is ready. Reply INTERESTED.',
                'category' => 'MARKETING',
            ])
            ->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'local_sim')
            ->json();

        $this->assertNotEmpty($created['template']['external_template_id'] ?? null);

        $this->withToken($this->token)
            ->postJson('/api/v1/integrations/whatsapp/send-template', [
                'to' => '15550102345',
                'template_name' => 'jewellery_follow_up',
                'purpose' => 'marketing',
                'consent' => true,
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'local');

        $updated = $this->withToken($this->token)
            ->patchJson('/api/v1/integrations/whatsapp/templates/'.$created['template']['id'], [
                'body' => 'Hi {{1}}, your Triada Designs piece is ready for viewing. Reply INTERESTED.',
                'category' => 'MARKETING',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'local_sim')
            ->json();

        $this->assertStringContainsString('viewing', $updated['template']['body'] ?? '');
    }

    public function test_opt_out_blocks_marketing_send(): void
    {
        $this->withToken($this->token)
            ->postJson('/api/v1/integrations/whatsapp/send-template', [
                'to' => '15550102345',
                'template_name' => 'jewellery_follow_up',
                'purpose' => 'marketing',
                'marketing_opt_out' => true,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'marketing_opt_out');
    }

    public function test_automation_whatsapp_actions_dry_run(): void
    {
        $executor = app(ActionExecutor::class);
        $context = [
            'channel' => 'whatsapp',
            'external_user_id' => '15550109999',
            'message_body' => 'Please STOP messaging me',
            'consent' => true,
        ];

        $opt = $executor->execute($this->workspace, 'check_whatsapp_opt_out', [], $context, true);
        $this->assertTrue($opt['ok']);
        $this->assertTrue($context['marketing_opt_out']);

        $context['marketing_opt_out'] = false;
        $window = $executor->execute(
            $this->workspace,
            'whatsapp_window_follow_up',
            ['template_name' => 'jewellery_follow_up'],
            $context,
            true
        );
        $this->assertTrue($window['ok']);
        $this->assertSame('template', $window['result']['path'] ?? null);

        $send = $executor->execute(
            $this->workspace,
            'send_whatsapp_template',
            ['template_name' => 'jewellery_follow_up', 'to' => '15550109999'],
            $context,
            true
        );
        $this->assertTrue($send['ok']);
        $this->assertTrue($send['dry_run'] ?? false);
    }
}
