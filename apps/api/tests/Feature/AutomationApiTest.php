<?php

namespace Tests\Feature;

use App\Models\AutomationWorkflow;
use App\Models\Lead;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutomationApiTest extends TestCase
{
    use RefreshDatabase;

    protected string $token;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        $user = User::query()->where('email', 'admin@triada-designs.com')->firstOrFail();
        $this->token = $user->createToken('test')->plainTextToken;
    }

    public function test_lists_seeded_workflows(): void
    {
        $response = $this->withToken($this->token)
            ->getJson('/api/v1/automations')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'name', 'status', 'trigger_type', 'run_count', 'node_summary']],
                'meta' => ['node_types', 'trigger_types', 'action_types'],
            ]);

        $this->assertGreaterThanOrEqual(3, count($response->json('data')));
    }

    public function test_validate_rejects_invalid_definition(): void
    {
        $this->withToken($this->token)
            ->postJson('/api/v1/automations/validate', [
                'definition' => [
                    'entry' => 'missing',
                    'nodes' => [],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('validation.valid', false);
    }

    public function test_validate_accepts_seeded_incoming_inquiry(): void
    {
        $workflow = AutomationWorkflow::query()
            ->where('name', 'Incoming sales inquiry')
            ->firstOrFail();

        $this->withToken($this->token)
            ->postJson('/api/v1/automations/validate', [
                'definition' => $workflow->definition,
            ])
            ->assertOk()
            ->assertJsonPath('validation.valid', true);
    }

    public function test_activate_and_deactivate(): void
    {
        $workflow = AutomationWorkflow::query()
            ->where('name', 'Lead qualified → Zoho sync')
            ->firstOrFail();

        $this->assertSame('draft', $workflow->status);

        $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/activate")
            ->assertOk()
            ->assertJsonPath('workflow.status', 'active');

        $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('workflow.status', 'disabled');
    }

    public function test_dry_run_executes_steps_without_side_effects(): void
    {
        $workflow = AutomationWorkflow::query()
            ->where('name', 'Incoming sales inquiry')
            ->firstOrFail();

        $tasksBefore = \App\Models\Task::query()->count();

        $response = $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/dry-run", [
                'context' => [
                    'intent' => 'product_inquiry',
                    'channel' => 'webchat',
                    'contact_id' => null,
                ],
                'idempotency_key' => 'dry-run-test-1',
            ])
            ->assertOk()
            ->assertJsonPath('run.mode', 'dry_run')
            ->assertJsonPath('run.status', 'completed');

        $this->assertGreaterThanOrEqual(3, count($response->json('run.steps')));
        $this->assertSame($tasksBefore, \App\Models\Task::query()->count());

        // Idempotent replay returns same run.
        $again = $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/dry-run", [
                'context' => ['intent' => 'product_inquiry'],
                'idempotency_key' => 'dry-run-test-1',
            ])
            ->assertOk()
            ->assertJsonPath('idempotent_replay', true);

        $this->assertSame($response->json('run.id'), $again->json('run.id'));
    }

    public function test_live_run_creates_task_and_respects_emergency_pause(): void
    {
        $workflow = AutomationWorkflow::query()
            ->where('name', 'Content-approved follow-up')
            ->firstOrFail();

        $this->assertTrue($workflow->isActive());

        $response = $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/run", [
                'context' => [
                    'content_item_id' => 'seed',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('run.mode', 'live')
            ->assertJsonPath('run.status', 'completed');

        $this->assertDatabaseHas('tasks', [
            'title' => 'Schedule approved content',
        ]);

        $workflow->refresh();
        $this->assertGreaterThanOrEqual(1, $workflow->run_count);

        $workspace = Workspace::query()->where('slug', 'triada-designs')->firstOrFail();
        $workspace->forceFill(['automations_paused' => true])->save();

        $paused = $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/run", [
                'context' => [],
            ])
            ->assertStatus(422);

        $this->assertStringContainsString('paused', (string) $paused->json('message'));
    }

    public function test_condition_branch_on_lead_score(): void
    {
        $workflow = AutomationWorkflow::query()
            ->where('name', 'Lead qualified → Zoho sync')
            ->firstOrFail();

        $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/activate")
            ->assertOk();

        $lead = Lead::query()->first();
        $this->assertNotNull($lead);

        $low = $this->withToken($this->token)
            ->postJson("/api/v1/automations/{$workflow->id}/dry-run", [
                'context' => [
                    'lead_id' => $lead->id,
                    'lead_score' => 40,
                ],
            ])
            ->assertOk();

        $stepKeys = collect($low->json('run.steps'))->pluck('step_key')->all();
        $this->assertContains('act_nurture', $stepKeys);
        $this->assertNotContains('act_zoho', $stepKeys);
    }
}
