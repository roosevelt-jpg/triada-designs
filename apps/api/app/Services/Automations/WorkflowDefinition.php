<?php

namespace App\Services\Automations;

/**
 * Canonical automation definition helpers.
 *
 * Definition shape:
 * {
 *   "entry": "trigger_1",
 *   "nodes": {
 *     "trigger_1": { "type": "trigger", "config": {...}, "next": "cond_1" },
 *     "cond_1": { "type": "condition", "config": {...}, "next_true": "act_1", "next_false": "end_1" },
 *     ...
 *   }
 * }
 */
class WorkflowDefinition
{
    public const NODE_TYPES = [
        'trigger',
        'condition',
        'action',
        'delay',
        'ai_task',
        'human_handoff',
        'end',
    ];

    public const TRIGGER_TYPES = [
        'incoming_message',
        'new_contact',
        'lead_qualified',
        'conversation_escalated',
        'follow_up_due',
        'content_approved',
        'shopify_order_updated',
        'manual',
    ];

    public const ACTION_TYPES = [
        'create_task',
        'update_lead_stage',
        'assign_conversation',
        'add_tag',
        'notify_team',
        'draft_reply',
        'send_eligible_reply',
        'create_content_draft',
        'sync_zoho_lead',
    ];

    /**
     * @param  array<string, mixed>  $definition
     * @return list<array{key:string,type:string,label:string}>
     */
    public static function summarizeNodes(array $definition): array
    {
        $nodes = $definition['nodes'] ?? [];
        $summary = [];

        foreach ($nodes as $key => $node) {
            $summary[] = [
                'key' => (string) $key,
                'type' => (string) ($node['type'] ?? 'unknown'),
                'label' => (string) ($node['label'] ?? $key),
            ];
        }

        return $summary;
    }
}
