<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AutomationRun;
use App\Models\AutomationWorkflow;
use App\Models\User;
use App\Services\Automations\WorkflowDefinition;
use App\Services\Automations\WorkflowExecutor;
use App\Services\Automations\WorkflowValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Throwable;

class AutomationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);

        $workflows = AutomationWorkflow::query()
            ->where('workspace_id', $workspaceId)
            ->orderByDesc('updated_at')
            ->get()
            ->map(fn (AutomationWorkflow $wf) => $this->serializeWorkflow($wf));

        return response()->json([
            'data' => $workflows,
            'meta' => [
                'node_types' => WorkflowDefinition::NODE_TYPES,
                'trigger_types' => WorkflowDefinition::TRIGGER_TYPES,
                'action_types' => WorkflowDefinition::ACTION_TYPES,
            ],
        ]);
    }

    public function store(Request $request, WorkflowValidator $validator): JsonResponse
    {
        $workspaceId = $this->workspaceId($request);
        $data = $this->validatedWorkflowPayload($request);

        $validation = $validator->validate($data['definition']);
        if (! $validation['valid'] && $request->boolean('require_valid', false)) {
            return response()->json([
                'message' => 'Definition is invalid.',
                'validation' => $validation,
            ], 422);
        }

        $triggerType = $this->resolveTriggerType($data['definition'], $data['trigger_type'] ?? null);

        $workflow = AutomationWorkflow::query()->create([
            'workspace_id' => $workspaceId,
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'trigger_type' => $triggerType,
            'definition' => $data['definition'],
            'version' => 1,
            'status' => 'draft',
            'created_by' => $request->user()->id,
        ]);

        return response()->json([
            'workflow' => $this->serializeWorkflow($workflow->fresh()),
            'validation' => $validation,
        ], 201);
    }

    public function show(Request $request, string $workflowId): JsonResponse
    {
        $workflow = $this->findWorkflow($request, $workflowId);

        return response()->json([
            'workflow' => $this->serializeWorkflow($workflow, true),
            'meta' => [
                'node_types' => WorkflowDefinition::NODE_TYPES,
                'trigger_types' => WorkflowDefinition::TRIGGER_TYPES,
                'action_types' => WorkflowDefinition::ACTION_TYPES,
            ],
        ]);
    }

    public function update(Request $request, string $workflowId, WorkflowValidator $validator): JsonResponse
    {
        $workflow = $this->findWorkflow($request, $workflowId);
        $data = $this->validatedWorkflowPayload($request, partial: true);

        if (isset($data['definition'])) {
            $validation = $validator->validate($data['definition']);
            if (! $validation['valid'] && $request->boolean('require_valid', false)) {
                return response()->json([
                    'message' => 'Definition is invalid.',
                    'validation' => $validation,
                ], 422);
            }

            $workflow->definition = $data['definition'];
            $workflow->trigger_type = $this->resolveTriggerType(
                $data['definition'],
                $data['trigger_type'] ?? $workflow->trigger_type
            );
            $workflow->version = ((int) $workflow->version) + 1;

            if ($workflow->status === 'active') {
                $workflow->status = 'draft';
                $workflow->activated_at = null;
            }
        } else {
            $validation = $validator->validate($workflow->definition ?? []);
        }

        if (array_key_exists('name', $data)) {
            $workflow->name = $data['name'];
        }
        if (array_key_exists('description', $data)) {
            $workflow->description = $data['description'];
        }

        $workflow->save();

        return response()->json([
            'workflow' => $this->serializeWorkflow($workflow->fresh()),
            'validation' => $validation,
        ]);
    }

    public function destroy(Request $request, string $workflowId): JsonResponse
    {
        $workflow = $this->findWorkflow($request, $workflowId);
        $workflow->delete();

        return response()->json(['ok' => true]);
    }

    public function validateDefinition(Request $request, WorkflowValidator $validator): JsonResponse
    {
        $definition = $request->input('definition');
        if (! is_array($definition)) {
            return response()->json([
                'message' => 'definition must be an object.',
            ], 422);
        }

        return response()->json([
            'validation' => $validator->validate($definition),
            'nodes' => WorkflowDefinition::summarizeNodes($definition),
        ]);
    }

    public function activate(Request $request, string $workflowId, WorkflowValidator $validator): JsonResponse
    {
        $workflow = $this->findWorkflow($request, $workflowId);
        $validation = $validator->validate($workflow->definition ?? []);

        if (! $validation['valid']) {
            return response()->json([
                'message' => 'Cannot activate invalid workflow.',
                'validation' => $validation,
            ], 422);
        }

        $workflow->forceFill([
            'status' => 'active',
            'activated_at' => now(),
        ])->save();

        return response()->json([
            'workflow' => $this->serializeWorkflow($workflow->fresh()),
            'validation' => $validation,
        ]);
    }

    public function deactivate(Request $request, string $workflowId): JsonResponse
    {
        $workflow = $this->findWorkflow($request, $workflowId);
        $workflow->forceFill([
            'status' => 'disabled',
            'activated_at' => null,
        ])->save();

        return response()->json([
            'workflow' => $this->serializeWorkflow($workflow->fresh()),
        ]);
    }

    public function dryRun(
        Request $request,
        string $workflowId,
        WorkflowExecutor $executor,
    ): JsonResponse {
        return $this->runWorkflow($request, $workflowId, $executor, 'dry_run');
    }

    public function run(
        Request $request,
        string $workflowId,
        WorkflowExecutor $executor,
    ): JsonResponse {
        return $this->runWorkflow($request, $workflowId, $executor, 'live');
    }

    public function runs(Request $request, string $workflowId): JsonResponse
    {
        $workflow = $this->findWorkflow($request, $workflowId);

        $runs = AutomationRun::query()
            ->where('workflow_id', $workflow->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (AutomationRun $run) => $this->serializeRun($run));

        return response()->json(['data' => $runs]);
    }

    public function showRun(Request $request, string $workflowId, string $runId): JsonResponse
    {
        $workflow = $this->findWorkflow($request, $workflowId);

        $run = AutomationRun::query()
            ->where('workflow_id', $workflow->id)
            ->where('id', $runId)
            ->with('steps')
            ->firstOrFail();

        return response()->json([
            'run' => $this->serializeRun($run, true),
        ]);
    }

    protected function runWorkflow(
        Request $request,
        string $workflowId,
        WorkflowExecutor $executor,
        string $mode,
    ): JsonResponse {
        $workflow = $this->findWorkflow($request, $workflowId);
        $context = $request->input('context', []);
        if (! is_array($context)) {
            return response()->json(['message' => 'context must be an object.'], 422);
        }

        $idempotencyKey = $request->input('idempotency_key');
        if ($idempotencyKey !== null && ! is_string($idempotencyKey)) {
            return response()->json(['message' => 'idempotency_key must be a string.'], 422);
        }

        try {
            $result = $executor->execute(
                $workflow,
                $context,
                $mode,
                $request->input('trigger_reference'),
                $idempotencyKey,
            );
        } catch (RuntimeException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        } catch (Throwable $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'run' => $this->serializeRun($result['run']->loadMissing('steps'), true),
            'validation' => $result['validation'] ?? null,
            'idempotent_replay' => $result['idempotent_replay'] ?? false,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function validatedWorkflowPayload(Request $request, bool $partial = false): array
    {
        $rules = [
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:500'],
            'trigger_type' => ['nullable', 'string', 'max:80'],
            'definition' => [$partial ? 'sometimes' : 'required', 'array'],
            'definition.entry' => ['required_with:definition', 'string'],
            'definition.nodes' => ['required_with:definition', 'array'],
        ];

        return $request->validate($rules);
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    protected function resolveTriggerType(array $definition, ?string $fallback): string
    {
        $entry = $definition['entry'] ?? null;
        $nodes = $definition['nodes'] ?? [];
        if (is_string($entry) && isset($nodes[$entry]['config']['trigger_type'])) {
            return (string) $nodes[$entry]['config']['trigger_type'];
        }

        return $fallback ?: 'manual';
    }

    protected function findWorkflow(Request $request, string $workflowId): AutomationWorkflow
    {
        $workspaceId = $this->workspaceId($request);

        return AutomationWorkflow::query()
            ->where('workspace_id', $workspaceId)
            ->where('id', $workflowId)
            ->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    protected function serializeWorkflow(AutomationWorkflow $workflow, bool $includeDefinition = false): array
    {
        $payload = [
            'id' => $workflow->id,
            'name' => $workflow->name,
            'description' => $workflow->description,
            'trigger_type' => $workflow->trigger_type,
            'version' => $workflow->version,
            'status' => $workflow->status,
            'activated_at' => optional($workflow->activated_at)?->toIso8601String(),
            'last_run_at' => optional($workflow->last_run_at)?->toIso8601String(),
            'run_count' => (int) $workflow->run_count,
            'created_by' => $workflow->created_by,
            'updated_at' => optional($workflow->updated_at)?->toIso8601String(),
            'node_summary' => WorkflowDefinition::summarizeNodes($workflow->definition ?? []),
        ];

        if ($includeDefinition) {
            $payload['definition'] = $workflow->definition;
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    protected function serializeRun(AutomationRun $run, bool $includeSteps = false): array
    {
        $payload = [
            'id' => $run->id,
            'workflow_id' => $run->workflow_id,
            'workflow_version' => $run->workflow_version,
            'trigger_type' => $run->trigger_type,
            'trigger_reference' => $run->trigger_reference,
            'mode' => $run->mode,
            'status' => $run->status,
            'error_code' => $run->error_code,
            'error_message' => $run->error_message,
            'idempotency_key' => $run->idempotency_key,
            'started_at' => optional($run->started_at)?->toIso8601String(),
            'completed_at' => optional($run->completed_at)?->toIso8601String(),
            'created_at' => optional($run->created_at)?->toIso8601String(),
        ];

        if ($includeSteps) {
            $payload['context'] = $run->context;
            $payload['steps'] = $run->steps
                ->sortBy('created_at')
                ->values()
                ->map(fn ($step) => [
                    'id' => $step->id,
                    'step_key' => $step->step_key,
                    'node_type' => $step->node_type,
                    'status' => $step->status,
                    'input_summary' => $step->input_summary,
                    'output_summary' => $step->output_summary,
                    'error_code' => $step->error_code,
                    'error_message' => $step->error_message,
                    'attempt' => $step->attempt,
                    'started_at' => optional($step->started_at)?->toIso8601String(),
                    'completed_at' => optional($step->completed_at)?->toIso8601String(),
                ])
                ->all();
        }

        return $payload;
    }

    protected function workspaceId(Request $request): string
    {
        /** @var User $user */
        $user = $request->user();
        $workspaceId = $user->memberships()->value('workspace_id');
        abort_unless($workspaceId, 403, 'No workspace membership.');

        return (string) $workspaceId;
    }
}
