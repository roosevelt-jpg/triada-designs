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
            ->assertJsonStructure(['data', 'pending_approval', 'flow', 'cron', 'admin_controls']);
    }

    public function test_admin_can_cancel_scheduled_content_before_cron(): void
    {
        $workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
        $admin = User::query()->where('email', 'info@triada-designs.com')->firstOrFail();
        $token = $admin->createToken('test')->plainTextToken;

        $item = ContentItem::query()->create([
            'workspace_id' => $workspace->id,
            'title' => 'Cancelable scheduled post',
            'body' => 'Admin will cancel before go-live',
            'status' => 'scheduled',
            'channel' => 'instagram',
            'content_type' => 'social_post',
            'objective' => 'awareness',
            'approval_version' => 1,
            'approved_by' => $admin->id,
            'approved_at' => now()->subDay(),
            'scheduled_for' => now()->addHours(6),
        ]);

        $this->withToken($token)
            ->postJson('/api/v1/content/'.$item->id.'/cancel-schedule')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('content.status', 'approved');

        $fresh = $item->fresh();
        $this->assertSame('approved', $fresh->status);
        $this->assertNull($fresh->scheduled_for);

        $this->withHeader('Authorization', 'Bearer test-cron-secret')
            ->postJson('/api/v1/cron/content-publish/process')
            ->assertOk();

        $this->assertSame('approved', $item->fresh()->status);
    }

    public function test_admin_can_reschedule_and_override_ai_proposal(): void
    {
        $workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
        $admin = User::query()->where('email', 'info@triada-designs.com')->firstOrFail();
        $token = $admin->createToken('test')->plainTextToken;

        $item = ContentItem::query()->create([
            'workspace_id' => $workspace->id,
            'title' => 'Override AI slot',
            'body' => 'Proposal then human date',
            'status' => 'approved',
            'channel' => 'instagram',
            'content_type' => 'social_post',
            'objective' => 'awareness',
            'approval_version' => 1,
            'approved_by' => $admin->id,
            'approved_at' => now()->subHour(),
            'proposed_scheduled_for' => now()->addDays(2),
        ]);

        $humanWhen = now()->addDays(5)->toIso8601String();

        $this->withToken($token)
            ->postJson('/api/v1/content/'.$item->id.'/schedule', [
                'scheduled_for' => $humanWhen,
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('content.status', 'scheduled');

        $fresh = $item->fresh();
        $this->assertSame('scheduled', $fresh->status);
        $this->assertNull($fresh->proposed_scheduled_for);
        $this->assertSame('human', data_get($fresh->publish_metadata, 'schedule_source'));
    }
}
