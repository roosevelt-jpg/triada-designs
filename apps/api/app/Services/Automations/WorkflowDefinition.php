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
        'incoming_meta_message',
        'comment_to_dm',
        'whatsapp_template_needed',
        'new_contact',
        'lead_qualified',
        'conversation_escalated',
        'follow_up_due',
        'content_approved',
        'content_created',
        'shopify_order_updated',
        'shopify_order_created',
        'manual',
    ];

    public const ACTION_TYPES = [
        'create_task',
        'update_lead_stage',
        'assign_conversation',
        'assign_human',
        'add_tag',
        'notify_team',
        'draft_reply',
        'ai_reply',
        'ai_classify',
        'ai_qualify',
        'ai_escalate',
        'send_eligible_reply',
        'create_content_draft',
        'sync_zoho_lead',
        'sync_crm',
        'sync_shopify',
        'publish_channel_template',
        'send_whatsapp_template',
        'check_whatsapp_opt_out',
        'whatsapp_window_follow_up',
        'generate_content_image',
        'generate_content_variants',
        'generate_content_video',
        'generate_content_animation',
        'ensure_content_creative',
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
