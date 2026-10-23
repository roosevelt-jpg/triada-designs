<?php

namespace Database\Seeders;

use App\Models\AutomationWorkflow;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;

class AutomationWorkflowSeeder extends Seeder
{
    public function run(): void
    {
        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return;
        }

        $user = User::query()->where('email', 'admin@triada-designs.com')->first();

        $workflows = [
            [
                'name' => 'Incoming sales inquiry',
                'description' => 'When a webchat product inquiry arrives, draft a reply, notify the team, and open a follow-up task.',
                'trigger_type' => 'incoming_message',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_incoming',
                    'nodes' => [
                        'trigger_incoming' => [
                            'type' => 'trigger',
                            'label' => 'Incoming message',
                            'config' => ['trigger_type' => 'incoming_message'],
                            'next' => 'cond_product',
                        ],
                        'cond_product' => [
                            'type' => 'condition',
                            'label' => 'Product inquiry?',
                            'config' => [
                                'field' => 'intent',
                                'operator' => 'equals',
                                'value' => 'product_inquiry',
                            ],
                            'next_true' => 'act_draft',
                            'next_false' => 'act_handoff_task',
                        ],
                        'act_draft' => [
                            'type' => 'action',
                            'label' => 'Draft reply',
                            'config' => [
                                'action_type' => 'draft_reply',
                                'template' => 'Thank you for your interest in Triada Designs. A specialist will share product guidance shortly.',
                            ],
                            'next' => 'act_notify',
                        ],
                        'act_notify' => [
                            'type' => 'action',
                            'label' => 'Notify team',
                            'config' => [
                                'action_type' => 'notify_team',
                                'message' => 'New product inquiry needs review.',
                            ],
                            'next' => 'act_task',
                        ],
                        'act_task' => [
                            'type' => 'action',
                            'label' => 'Create follow-up task',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'follow_up',
                                'title' => 'Respond to product inquiry',
                                'description' => 'Confirm availability and recommend next products.',
                            ],
                            'next' => 'end_ok',
                        ],
                        'act_handoff_task' => [
                            'type' => 'action',
                            'label' => 'Queue general follow-up',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'follow_up',
                                'title' => 'Review non-product inquiry',
                            ],
                            'next' => 'handoff',
                        ],
                        'handoff' => [
                            'type' => 'human_handoff',
                            'label' => 'Human handoff',
                            'config' => ['reason' => 'Intent is not a product inquiry'],
                            'next' => 'end_ok',
                        ],
                        'end_ok' => [
                            'type' => 'end',
                            'label' => 'Done',
                            'config' => [],
                        ],
                    ],
                ],
            ],
            [
                'name' => 'Content-approved follow-up',
                'description' => 'After content is approved, notify marketing and create a distribution task. Never publishes automatically.',
                'trigger_type' => 'content_approved',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_content',
                    'nodes' => [
                        'trigger_content' => [
                            'type' => 'trigger',
                            'label' => 'Content approved',
                            'config' => ['trigger_type' => 'content_approved'],
                            'next' => 'act_notify',
                        ],
                        'act_notify' => [
                            'type' => 'action',
                            'label' => 'Notify marketing',
                            'config' => [
                                'action_type' => 'notify_team',
                                'message' => 'Approved content is ready for scheduled publication review.',
                            ],
                            'next' => 'act_task',
                        ],
                        'act_task' => [
                            'type' => 'action',
                            'label' => 'Create distribution task',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'content',
                                'title' => 'Schedule approved content',
                                'description' => 'Human must schedule or publish — automation never posts publicly.',
                            ],
                            'next' => 'end_ok',
                        ],
                        'end_ok' => [
                            'type' => 'end',
                            'label' => 'Done',
                            'config' => [],
                        ],
                    ],
                ],
            ],
            [
                'name' => 'Lead qualified → Zoho sync',
                'description' => 'When a lead is qualified, sync to Zoho (mock or live) and open an owner task.',
                'trigger_type' => 'lead_qualified',
                'status' => 'draft',
                'definition' => [
                    'entry' => 'trigger_lead',
                    'nodes' => [
                        'trigger_lead' => [
                            'type' => 'trigger',
                            'label' => 'Lead qualified',
                            'config' => ['trigger_type' => 'lead_qualified'],
                            'next' => 'cond_score',
                        ],
                        'cond_score' => [
                            'type' => 'condition',
                            'label' => 'Score ≥ 70?',
                            'config' => [
                                'field' => 'lead_score',
                                'operator' => 'gte',
                                'value' => 70,
                            ],
                            'next_true' => 'act_zoho',
                            'next_false' => 'act_nurture',
                        ],
                        'act_zoho' => [
                            'type' => 'action',
                            'label' => 'Sync Zoho lead',
                            'config' => ['action_type' => 'sync_zoho_lead'],
                            'next' => 'act_task',
                        ],
                        'act_nurture' => [
                            'type' => 'action',
                            'label' => 'Tag for nurture',
                            'config' => [
                                'action_type' => 'add_tag',
                                'tag' => 'nurture',
                            ],
                            'next' => 'end_ok',
                        ],
                        'act_task' => [
                            'type' => 'action',
                            'label' => 'Owner follow-up',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'sales',
                                'title' => 'Call qualified lead',
                            ],
                            'next' => 'end_ok',
                        ],
                        'end_ok' => [
                            'type' => 'end',
                            'label' => 'Done',
                            'config' => [],
                        ],
                    ],
                ],
            ],
        ];

        foreach ($workflows as $row) {
            $existing = AutomationWorkflow::query()
                ->where('workspace_id', $workspace->id)
                ->where('name', $row['name'])
                ->first();

            $payload = [
                'description' => $row['description'],
                'trigger_type' => $row['trigger_type'],
                'definition' => $row['definition'],
                'version' => $existing?->version ?? 1,
                'status' => $row['status'],
                'created_by' => $user?->id,
                'activated_at' => $row['status'] === 'active' ? now() : null,
            ];

            if ($existing) {
                $existing->forceFill($payload)->save();
            } else {
                AutomationWorkflow::query()->create(array_merge($payload, [
                    'workspace_id' => $workspace->id,
                    'name' => $row['name'],
                    'run_count' => 0,
                ]));
            }
        }
    }
}
