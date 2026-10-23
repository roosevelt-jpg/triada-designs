<?php

namespace App\Services\Automations;

class WorkflowValidator
{
    /**
     * @param  array<string, mixed>  $definition
     * @return array{valid:bool,errors:list<string>,warnings:list<string>}
     */
    public function validate(array $definition): array
    {
        $errors = [];
        $warnings = [];

        $nodes = $definition['nodes'] ?? null;
        $entry = $definition['entry'] ?? null;

        if (! is_array($nodes) || $nodes === []) {
            $errors[] = 'Definition must include at least one node.';

            return ['valid' => false, 'errors' => $errors, 'warnings' => $warnings];
        }

        if (! is_string($entry) || $entry === '' || ! isset($nodes[$entry])) {
            $errors[] = 'Definition entry must reference an existing node.';
        } elseif (($nodes[$entry]['type'] ?? null) !== 'trigger') {
            $errors[] = 'Entry node must be a trigger.';
        }

        $triggerCount = 0;
        $endCount = 0;

        foreach ($nodes as $key => $node) {
            if (! is_array($node)) {
                $errors[] = "Node {$key} must be an object.";
                continue;
            }

            $type = $node['type'] ?? null;
            if (! in_array($type, WorkflowDefinition::NODE_TYPES, true)) {
                $errors[] = "Node {$key} has unsupported type.";
                continue;
            }

            if ($type === 'trigger') {
                $triggerCount++;
                $triggerType = $node['config']['trigger_type'] ?? null;
                if (! in_array($triggerType, WorkflowDefinition::TRIGGER_TYPES, true)) {
                    $errors[] = "Trigger node {$key} requires a supported trigger_type.";
                }
                if (empty($node['next'])) {
                    $errors[] = "Trigger node {$key} must define next.";
                } elseif (! isset($nodes[$node['next']])) {
                    $errors[] = "Trigger node {$key} next target is missing.";
                }
            }

            if ($type === 'condition') {
                if (empty($node['config']['field']) || empty($node['config']['operator'])) {
                    $errors[] = "Condition node {$key} requires field and operator.";
                }
                foreach (['next_true', 'next_false'] as $edge) {
                    if (empty($node[$edge]) || ! isset($nodes[$node[$edge]])) {
                        $errors[] = "Condition node {$key} requires valid {$edge}.";
                    }
                }
            }

            if ($type === 'action') {
                $action = $node['config']['action_type'] ?? null;
                if (! in_array($action, WorkflowDefinition::ACTION_TYPES, true)) {
                    $errors[] = "Action node {$key} requires a supported action_type.";
                }
                if (empty($node['next']) || ! isset($nodes[$node['next']])) {
                    $errors[] = "Action node {$key} must define a valid next.";
                }
                if (in_array($action, ['send_eligible_reply'], true)) {
                    $warnings[] = "Action {$key} enforces consent and outbound pause at runtime.";
                }
            }

            if ($type === 'delay') {
                $seconds = (int) ($node['config']['seconds'] ?? $node['config']['duration_seconds'] ?? 0);
                if ($seconds < 1 || $seconds > 86400 * 30) {
                    $errors[] = "Delay node {$key} seconds must be between 1 and 2592000.";
                }
                if (empty($node['next']) || ! isset($nodes[$node['next']])) {
                    $errors[] = "Delay node {$key} must define a valid next.";
                }
            }

            if ($type === 'ai_task') {
                $task = $node['config']['task'] ?? $node['config']['purpose'] ?? null;
                if (empty($task)) {
                    $errors[] = "AI task node {$key} requires config.task (or purpose).";
                }
                if (empty($node['next']) || ! isset($nodes[$node['next']])) {
                    $errors[] = "AI task node {$key} must define a valid next.";
                }
            }

            if ($type === 'human_handoff') {
                if (empty($node['next']) || ! isset($nodes[$node['next']])) {
                    $errors[] = "Human handoff node {$key} must define a valid next (usually end).";
                }
            }

            if ($type === 'end') {
                $endCount++;
            }
        }

        if ($triggerCount !== 1) {
            $errors[] = 'Workflow must contain exactly one trigger node.';
        }

        if ($endCount < 1) {
            $errors[] = 'Workflow must contain at least one end node.';
        }

        if ($entry && isset($nodes[$entry])) {
            $reachable = $this->reachableKeys($definition);
            foreach (array_keys($nodes) as $key) {
                if (! in_array($key, $reachable, true)) {
                    $warnings[] = "Node {$key} is unreachable from entry.";
                }
            }

            if (! $this->hasTerminatingPath($definition, $entry, [])) {
                $errors[] = 'Every path from entry must reach an end node (no open cycles).';
            }
        }

        return [
            'valid' => $errors === [],
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return list<string>
     */
    protected function reachableKeys(array $definition): array
    {
        $nodes = $definition['nodes'];
        $entry = $definition['entry'];
        $seen = [];
        $queue = [$entry];

        while ($queue) {
            $key = array_shift($queue);
            if (isset($seen[$key]) || ! isset($nodes[$key])) {
                continue;
            }
            $seen[$key] = true;
            $node = $nodes[$key];
            foreach (['next', 'next_true', 'next_false'] as $edge) {
                if (! empty($node[$edge])) {
                    $queue[] = $node[$edge];
                }
            }
        }

        return array_keys($seen);
    }

    /**
     * @param  array<string, mixed>  $definition
     * @param  array<string, bool>  $stack
     */
    protected function hasTerminatingPath(array $definition, string $key, array $stack): bool
    {
        $nodes = $definition['nodes'];
        if (! isset($nodes[$key])) {
            return false;
        }

        if (isset($stack[$key])) {
            return false;
        }

        $node = $nodes[$key];
        if (($node['type'] ?? null) === 'end') {
            return true;
        }

        $stack[$key] = true;
        $edges = [];
        if (($node['type'] ?? null) === 'condition') {
            $edges = array_filter([$node['next_true'] ?? null, $node['next_false'] ?? null]);
        } elseif (! empty($node['next'])) {
            $edges = [$node['next']];
        }

        if ($edges === []) {
            return false;
        }

        foreach ($edges as $edge) {
            if (! $this->hasTerminatingPath($definition, (string) $edge, $stack)) {
                return false;
            }
        }

        return true;
    }
}
