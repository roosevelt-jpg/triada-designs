<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\ContentVariant;
use App\Models\MediaAsset;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CreativeMediaApiTest extends TestCase
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
        Storage::fake('local');
    }

    public function test_creative_status_reports_local_sim_without_keys(): void
    {
        $this->withToken($this->token)
            ->getJson('/api/v1/creative/status')
            ->assertOk()
            ->assertJsonPath('image.mode', 'local_sim')
            ->assertJsonPath('video.mode', 'local_sim')
            ->assertJsonStructure(['platforms', 'resize_engine', 'honesty']);
    }

    public function test_generate_image_variants_and_video_local_sim(): void
    {
        $item = ContentItem::query()
            ->where('workspace_id', $this->workspace->id)
            ->where('status', 'in_review')
            ->firstOrFail();

        $image = $this->withToken($this->token)
            ->postJson('/api/v1/content/'.$item->id.'/generate-image', [
                'product' => 'Brushed gold pendant',
                'materials' => '18k gold vermeil',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'local_sim')
            ->json();

        $this->assertNotEmpty($image['asset']['id'] ?? null);
        $this->assertDatabaseHas('media_assets', [
            'id' => $image['asset']['id'],
            'kind' => 'image',
            'mode' => 'local_sim',
        ]);

        $variants = $this->withToken($this->token)
            ->postJson('/api/v1/content/'.$item->id.'/generate-variants', [])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->json();

        $this->assertGreaterThanOrEqual(5, count($variants['variants'] ?? []));
        $this->assertTrue(
            ContentVariant::query()->where('content_item_id', $item->id)->exists()
        );

        $video = $this->withToken($this->token)
            ->postJson('/api/v1/content/'.$item->id.'/generate-video', [
                'storyboard' => 'Slow push-in on pendant',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'local_sim')
            ->json();

        $this->assertSame('video', $video['asset']['kind'] ?? null);
        $this->assertNotEmpty($video['sidecar']['placeholder_mp4'] ?? null);

        $this->withToken($this->token)
            ->getJson('/api/v1/content/'.$item->id.'/media')
            ->assertOk()
            ->assertJsonStructure(['assets', 'variants']);
    }

    public function test_marketing_agent_creative_tool_allowlist(): void
    {
        $this->withToken($this->token)
            ->getJson('/api/v1/agents/creative-tools')
            ->assertOk()
            ->assertJsonStructure(['tools', 'agents']);

        $this->withToken($this->token)
            ->postJson('/api/v1/agents/creative-tools/run', [
                'agent_key' => 'support',
                'tool' => 'generate_image',
                'caption' => 'Should be blocked',
            ])
            ->assertStatus(422);

        $this->withToken($this->token)
            ->postJson('/api/v1/agents/creative-tools/run', [
                'agent_key' => 'marketing',
                'tool' => 'propose_creative_brief',
                'caption' => 'Quiet sparkle for everyday rituals.',
                'product' => 'Pearl studs',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('approval_required', true);

        $run = $this->withToken($this->token)
            ->postJson('/api/v1/agents/creative-tools/run', [
                'agent_key' => 'content',
                'tool' => 'generate_image',
                'caption' => 'Pearl studs in soft morning light.',
                'product' => 'Pearl studs',
                'channel' => 'instagram',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mode', 'local_sim')
            ->json();

        $this->assertNotEmpty($run['content_item_id'] ?? null);
        $this->assertTrue(MediaAsset::query()->where('content_item_id', $run['content_item_id'])->exists());
    }
}
