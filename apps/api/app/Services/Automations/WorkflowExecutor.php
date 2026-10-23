<?php

namespace App\Services\Automations;

use App\Models\AutomationRun;
use App\Models\AutomationStepRun;
use App\Models\AutomationWorkflow;
use App\Models\Workspace;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class WorkflowExecutor
{
    public function __construct(
        protected WorkflowValidator $validator,
        protected ActionExecutor $actions,
    ) {
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array{run:AutomationRun,steps:list<AutomationStepRun>,validation?:array{valid:bool,errors:list<string>,warnings:list<string>}}
     */
    public function execute(
        AutomationWorkflow $workflow,
        array $context = [],
        string $mode = 'live',
        ?string $triggerReference = null,
        ?string $idempotencyKey = null,
    ): array {
        $mode = $mode === 'dry_run' ? 'dry_run' : 'live';
        $dryRun = $mode === 'dry_run';

        $workspace = Workspace::query()->findOrFail($workflow->workspace_id);

        $validation = $this->validator->validate($workflow->definition ?? []);
        if (! $validation['valid']) {
            throw new RuntimeException(
                'Workflow definition is invalid: '.implode(' ', $validation['errors'])
            );
        }

        if ($workspace->automations_paused && ! $dryRun) {
            throw new RuntimeException('Automations are paused for this workspace (emergency stop).');
        }

        if ($mode === 'live' && ! $workflow->isActive()) {
            throw new RuntimeException('Only active workflows can run in live mode. Activate the workflow or use dry-run.');
        }

        if ($idempotencyKey) {
            $existing = AutomationRun::query()
                ->where('workspace_id', $workflow->workspace_id)
                ->where('idempotency_key', $idempotencyKey)
                ->with('steps')
                ->first();

            if ($existing) {
                return [
                    'run' => $existing,
                    'steps' => $existing->steps->all(),
                    'idempotent_replay' => true,
                    'validation' => $validation,
                ];
            }
        }

        // Persist run/step audit even on failure (do not wrap in a rolling-back transaction).
        $run = AutomationRun::query()->create([
            'workspace_id' => $workflow->workspace_id,
            'workflow_id' => $workflow->id,
            'workflow_version' => (int) $workflow->version,
            'trigger_type' => $workflow->trigger_type,
            'trigger_reference' => $triggerReference,
            'mode' => $mode,
            'status' => 'running',
            'context' => $context,
            'idempotency_key' => $idempotencyKey,
            'started_at' => now(),
        ]);

        $steps = [];
        $workingContext = $context;

        try {
            $definition = $workflow->definition;
            $nodes = $definition['nodes'];
            $currentKey = (string) $definition['entry'];
            $visited = [];
            $maxSteps = 100;

            while ($currentKey !== '' && count($steps) < $maxSteps) {
                if (isset($visited[$currentKey])) {
                    throw new RuntimeException("Cycle detected at node {$currentKey}.");
                }
                $visited[$currentKey] = true;

                if (! isset($nodes[$currentKey])) {
                    throw new RuntimeException("Missing node {$currentKey}.");
                }

                $node = $nodes[$currentKey];
                $type = (string) ($node['type'] ?? 'unknown');
                $step = AutomationStepRun::query()->create([
                    'automation_run_id' => $run->id,
                    'step_key' => $currentKey,
                    'node_type' => $type,
                    'status' => 'running',
                    'input_summary' => [
                        'label' => $node['label'] ?? $currentKey,
                        'config' => $node['config'] ?? [],
                    ],
                    'started_at' => now(),
                ]);

                try {
                    $outcome = $this->executeNode(
                        $workspace,
                        $type,
                        $node,
                        $workingContext,
                        $dryRun,
                    );

                    $step->forceFill([
                        'status' => ($outcome['skipped'] ?? false) ? 'skipped' : 'completed',
                        'output_summary' => $outcome['result'] ?? [],
                        'completed_at' => now(),
                    ])->save();

                    $steps[] = $step->fresh();

                    if ($type === 'end') {
                        break;
                    }

                    $currentKey = $this->nextKey($type, $node, $outcome);
                } catch (Throwable $e) {
                    $step->forceFill([
                        'status' => 'failed',
                        'error_code' => 'step_failed',
                        'error_message' => $e->getMessage(),
                        'completed_at' => now(),
                    ])->save();
                    $steps[] = $step->fresh();
                    throw $e;
                }
            }

            $run->forceFill([
                'status' => 'completed',
                'context' => $workingContext,
                'completed_at' => now(),
            ])->save();

            if (! $dryRun) {
                $workflow->forceFill([
                    'last_run_at' => now(),
                    'run_count' => ((int) $workflow->run_count) + 1,
                ])->save();
            }

            return [
                'run' => $run->fresh('steps'),
                'steps' => $steps,
                'validation' => $validation,
            ];
        } catch (Throwable $e) {
            $run->forceFill([
                'status' => 'failed',
                'context' => $workingContext,
                'error_code' => 'execution_failed',
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ])->save();

            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $node
     * @param  array<string, mixed>  $context
     * @return array{result?:array<string,mixed>,skipped?:bool,branch?:bool}
     */
    protected function executeNode(
        Workspace $workspace,
        string $type,
        array $node,
        array &$context,
        bool $dryRun,
    ): array {
        $config = is_array($node['config'] ?? null) ? $node['config'] : [];

        return match ($type) {
            'trigger' => [
                'result' => [
                    'trigger_type' => $config['trigger_type'] ?? null,
                    'accepted' => true,
                    'dry_run' => $dryRun,
                ],
            ],
            'condition' => $this->evaluateCondition($config, $context),
            'action' => $this->runAction($workspace, $config, $context, $dryRun),
            'delay' => [
                'result' => [
                    'seconds' => (int) ($config['seconds'] ?? $config['duration_seconds'] ?? 0),
                    'note' => $dryRun ? 'Would wait (dry-run skipped wait)' : 'Wait recorded synchronously',
                    'dry_run' => $dryRun,
                ],
            ],
            'ai_task' => [
                'result' => [
                    'task' => $config['task'] ?? $config['purpose'] ?? null,
                    'status' => $dryRun ? 'would_queue' : 'queued_local',
                    'note' => 'AI task routed through local orchestrator / LLM adapter when configured.',
                ],
            ],
            'human_handoff' => $this->humanHandoff($config, $context, $dryRun),
            'end' => [
                'result' => ['finished' => true],
            ],
            default => throw new RuntimeException("Unsupported node type: {$type}"),
        };
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{result:array<string,mixed>,branch:bool}
     */
    protected function evaluateCondition(array $config, array $context): array
    {
        $field = (string) ($config['field'] ?? '');
        $operator = (string) ($config['operator'] ?? 'equals');
        $expected = $config['value'] ?? null;
        $actual = data_get($context, $field);

        $passed = match ($operator) {
            'equals' => $actual == $expected,
            'not_equals' => $actual != $expected,
            'gt' => is_numeric($actual) && (float) $actual > (float) $expected,
            'gte' => is_numeric($actual) && (float) $actual >= (float) $expected,
            'lt' => is_numeric($actual) && (float) $actual < (float) $expected,
            'lte' => is_numeric($actual) && (float) $actual <= (float) $expected,
            'in' => is_array($expected) && in_array($actual, $expected, true),
            'exists' => $actual !== null && $actual !== '',
            'truthy' => (bool) $actual,
            'falsy' => ! $actual,
            default => throw new RuntimeException("Unsupported condition operator: {$operator}"),
        };

        return [
            'branch' => (bool) $passed,
            'result' => [
                'field' => $field,
                'operator' => $operator,
                'expected' => $expected,
                'actual' => $actual,
                'passed' => (bool) $passed,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{ok?:bool,result?:array<string,mixed>,skipped?:bool,error?:string}
     */
    protected function runAction(Workspace $workspace, array $config, array &$context, bool $dryRun): array
    {
        $actionType = (string) ($config['action_type'] ?? '');
        $result = $this->actions->execute($workspace, $actionType, $config, $context, $dryRun);

        if (! ($result['ok'] ?? false)) {
            throw new RuntimeException($result['error'] ?? 'Action failed');
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $context
     * @return array{result:array<string,mixed>}
     */
    protected function humanHandoff(array $config, array &$context, bool $dryRun): array
    {
        $reason = (string) ($config['reason'] ?? 'Automation requested human review');

        if ($dryRun) {
            return [
                'result' => [
                    'would_set_automation_mode' => 'human',
                    'reason' => $reason,
                ],
            ];
        }

        $context['automation_mode'] = 'human';
        $context['handoff_reason'] = $reason;
        $context['handoff_at'] = now()->toIso8601String();

        return [
            'result' => [
                'automation_mode' => 'human',
                'reason' => $reason,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $node
     * @param  array<string, mixed>  $outcome
     */
    protected function nextKey(string $type, array $node, array $outcome): string
    {
        if ($type === 'condition') {
            $branch = (bool) ($outcome['branch'] ?? false);

            return (string) ($branch ? ($node['next_true'] ?? '') : ($node['next_false'] ?? ''));
        }

        return (string) ($node['next'] ?? '');
    }

    public function makeIdempotencyKey(?string $provided = null): string
    {
        return $provided ?: (string) Str::ulid();
    }
}
