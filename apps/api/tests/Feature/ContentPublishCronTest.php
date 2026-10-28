<?php

namespace Tests\Feature;

use App\Models\ContentItem;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ContentPublishCronTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        config(['integrations.cron_secret' => 'test-cron-secret']);
    }

    public function test_content_publish_cron_publishes_due_scheduled_items(): void
    {
        $workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
        $admin = User::query()->where('email', 'info@triada-designs.com')->firstOrFail();

        $item = ContentItem::query()->create([
            'workspace_id' => $workspace->id,
            'title' => 'Due UGC post',
            'body' => 'Scheduled jewellery UGC',
            'status' => 'scheduled',
            'channel' => 'instagram',
            'content_type' => 'social_post',
            'objective' => 'awareness',
            'approval_version' => 1,
            'approved_by' => $admin->id,
            'approved_at' => now()->subDay(),
            'scheduled_for' => now()->subHour(),
        ]);

        $response = $this->withHeader('Authorization', 'Bearer test-cron-secret')
            ->postJson('/api/v1/cron/content-publish/process')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('worker', 'content_publish')
            ->json();

        $this->assertGreaterThanOrEqual(1, collect($response['results'] ?? [])->sum('processed'));
        $this->assertSame('published', $item->fresh()->status);
    }

    public function test_calendar_includes_pending_approval_queue(): void
    {
        $user = User::query()->where('email', 'info@triada-designs.com')->firstOrFail();
        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/calendar')
            ->assertOk()
            ->assertJsonStructure(['data', 'pending_approval', 'flow', 'cron']);
    }
}
