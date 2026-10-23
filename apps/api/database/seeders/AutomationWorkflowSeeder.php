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
                'name' => 'Jewellery product inquiry',
                'description' => 'Website / webchat jewellery product inquiry: AI draft reply, notify team, open follow-up. Editable in the visual builder.',
                'trigger_type' => 'incoming_message',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_incoming',
                    'nodes' => [
                        'trigger_incoming' => [
                            'type' => 'trigger',
                            'label' => 'Incoming website chat',
                            'config' => ['trigger_type' => 'incoming_message'],
                            'next' => 'cond_product',
                        ],
                        'cond_product' => [
                            'type' => 'condition',
                            'label' => 'Jewellery inquiry?',
                            'config' => [
                                'field' => 'intent',
                                'operator' => 'equals',
                                'value' => 'product_inquiry',
                            ],
                            'next_true' => 'act_ai_reply',
                            'next_false' => 'act_handoff_task',
                        ],
                        'act_ai_reply' => [
                            'type' => 'action',
                            'label' => 'AI jewellery reply',
                            'config' => [
                                'action_type' => 'ai_reply',
                                'template' => 'Thank you for your interest in Triada Designs jewellery. Share the piece, metal preference, and size — a specialist will confirm availability.',
                            ],
                            'next' => 'act_notify',
                        ],
                        'act_notify' => [
                            'type' => 'action',
                            'label' => 'Notify team',
                            'config' => [
                                'action_type' => 'notify_team',
                                'message' => 'New jewellery product inquiry needs review.',
                            ],
                            'next' => 'act_task',
                        ],
                        'act_task' => [
                            'type' => 'action',
                            'label' => 'Create follow-up task',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'follow_up',
                                'title' => 'Respond to jewellery inquiry',
                                'description' => 'Confirm availability, materials, and sizing for the requested piece.',
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
                            'label' => 'Assign human',
                            'config' => ['reason' => 'Intent is not a jewellery product inquiry'],
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
                'name' => 'Incoming sales inquiry',
                'description' => 'Legacy alias kept for tests — mirrors jewellery product inquiry on webchat.',
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
                'name' => 'Meta incoming message reply',
                'description' => 'When a Facebook, Instagram, or WhatsApp message arrives, draft and send an eligible reply unless human takeover or outbound pause applies.',
                'trigger_type' => 'incoming_meta_message',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_meta',
                    'nodes' => [
                        'trigger_meta' => [
                            'type' => 'trigger',
                            'label' => 'Incoming Meta message',
                            'config' => ['trigger_type' => 'incoming_meta_message'],
                            'next' => 'cond_channel',
                        ],
                        'cond_channel' => [
                            'type' => 'condition',
                            'label' => 'Meta channel?',
                            'config' => [
                                'field' => 'channel',
                                'operator' => 'in',
                                'value' => ['facebook', 'instagram', 'whatsapp'],
                            ],
                            'next_true' => 'act_draft',
                            'next_false' => 'end_ok',
                        ],
                        'act_draft' => [
                            'type' => 'action',
                            'label' => 'Draft Meta reply',
                            'config' => [
                                'action_type' => 'draft_reply',
                                'template' => 'Thank you for messaging Triada Designs. A specialist can help with products, shipping, and consultations.',
                            ],
                            'next' => 'act_send',
                        ],
                        'act_send' => [
                            'type' => 'action',
                            'label' => 'Send eligible Meta reply',
                            'config' => [
                                'action_type' => 'send_eligible_reply',
                                'purpose' => 'transactional',
                            ],
                            'next' => 'act_notify',
                        ],
                        'act_notify' => [
                            'type' => 'action',
                            'label' => 'Notify inbox team',
                            'config' => [
                                'action_type' => 'notify_team',
                                'message' => 'Meta channel message processed.',
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
                'name' => 'WhatsApp template needed',
                'description' => 'When the WhatsApp customer service window is closed, create a task to send an approved template — never force a free-form marketing send.',
                'trigger_type' => 'whatsapp_template_needed',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_wa_template',
                    'nodes' => [
                        'trigger_wa_template' => [
                            'type' => 'trigger',
                            'label' => 'WhatsApp template needed',
                            'config' => ['trigger_type' => 'whatsapp_template_needed'],
                            'next' => 'act_task',
                        ],
                        'act_task' => [
                            'type' => 'action',
                            'label' => 'Create template follow-up',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'follow_up',
                                'title' => 'Send approved WhatsApp template',
                                'description' => 'Customer service window closed. Choose an approved template from Triada; do not send free-form outside the window.',
                            ],
                            'next' => 'act_notify',
                        ],
                        'act_notify' => [
                            'type' => 'action',
                            'label' => 'Notify ops',
                            'config' => [
                                'action_type' => 'notify_team',
                                'message' => 'WhatsApp template required before outbound.',
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
                'description' => 'When a lead is qualified, sync to Zoho (seeded local or live) and open an owner task.',
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
            [
                'name' => 'WhatsApp jewellery follow-up',
                'description' => 'After a delay: opt-out check → window path (template if closed) → send approved Cloud template when eligible (local sim without credentials).',
                'trigger_type' => 'follow_up_due',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_followup',
                    'nodes' => [
                        'trigger_followup' => [
                            'type' => 'trigger',
                            'label' => 'Follow-up due',
                            'config' => ['trigger_type' => 'follow_up_due'],
                            'next' => 'delay_wait',
                        ],
                        'delay_wait' => [
                            'type' => 'delay',
                            'label' => 'Wait 24h',
                            'config' => ['seconds' => 86400],
                            'next' => 'act_optout',
                        ],
                        'act_optout' => [
                            'type' => 'action',
                            'label' => 'Opt-out check',
                            'config' => [
                                'action_type' => 'check_whatsapp_opt_out',
                            ],
                            'next' => 'act_window',
                        ],
                        'act_window' => [
                            'type' => 'action',
                            'label' => 'Window → template path',
                            'config' => [
                                'action_type' => 'whatsapp_window_follow_up',
                                'template_name' => 'jewellery_follow_up',
                                'purpose' => 'marketing',
                            ],
                            'next' => 'act_send_tpl',
                        ],
                        'act_send_tpl' => [
                            'type' => 'action',
                            'label' => 'Send WA template',
                            'config' => [
                                'action_type' => 'send_whatsapp_template',
                                'template_name' => 'jewellery_follow_up',
                                'purpose' => 'marketing',
                            ],
                            'next' => 'act_task',
                        ],
                        'act_task' => [
                            'type' => 'action',
                            'label' => 'Confirm send task',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'follow_up',
                                'title' => 'Confirm WhatsApp jewellery follow-up',
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
                'name' => 'Content creative on create (jewellery)',
                'description' => 'When a content draft is created, ensure post-aligned image + platform variants exist — never auto-publishes.',
                'trigger_type' => 'content_created',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_created',
                    'nodes' => [
                        'trigger_created' => [
                            'type' => 'trigger',
                            'label' => 'Content created',
                            'config' => ['trigger_type' => 'content_created'],
                            'next' => 'act_pack',
                        ],
                        'act_pack' => [
                            'type' => 'action',
                            'label' => 'Ensure creative pack',
                            'config' => [
                                'action_type' => 'ensure_content_creative',
                                'with_video' => false,
                                'with_animation' => false,
                                'product' => 'Triada Designs jewellery',
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
                'name' => 'Content creative draft (jewellery)',
                'description' => 'When content is approved, ensure jewellery-aware image + variants + short video + animation — never auto-publishes.',
                'trigger_type' => 'content_approved',
                'status' => 'active',
                'definition' => [
                    'entry' => 'trigger_approved',
                    'nodes' => [
                        'trigger_approved' => [
                            'type' => 'trigger',
                            'label' => 'Content approved',
                            'config' => ['trigger_type' => 'content_approved'],
                            'next' => 'act_pack',
                        ],
                        'act_pack' => [
                            'type' => 'action',
                            'label' => 'Ensure full creative pack',
                            'config' => [
                                'action_type' => 'ensure_content_creative',
                                'with_video' => true,
                                'with_animation' => true,
                                'product' => 'Triada Designs jewellery',
                            ],
                            'next' => 'act_notify',
                        ],
                        'act_notify' => [
                            'type' => 'action',
                            'label' => 'Notify marketing',
                            'config' => [
                                'action_type' => 'notify_team',
                                'message' => 'Creative pack ready — schedule/publish still requires human action.',
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
                'name' => 'IG/FB comment to DM',
                'description' => 'When a jewellery comment arrives on Instagram or Facebook, draft a DM opener and assign a human if unsure.',
                'trigger_type' => 'comment_to_dm',
                'status' => 'draft',
                'definition' => [
                    'entry' => 'trigger_comment',
                    'nodes' => [
                        'trigger_comment' => [
                            'type' => 'trigger',
                            'label' => 'Comment to DM',
                            'config' => ['trigger_type' => 'comment_to_dm'],
                            'next' => 'cond_channel',
                        ],
                        'cond_channel' => [
                            'type' => 'condition',
                            'label' => 'IG or FB?',
                            'config' => [
                                'field' => 'channel',
                                'operator' => 'in',
                                'value' => ['instagram', 'facebook'],
                            ],
                            'next_true' => 'act_draft',
                            'next_false' => 'end_ok',
                        ],
                        'act_draft' => [
                            'type' => 'action',
                            'label' => 'Draft DM opener',
                            'config' => [
                                'action_type' => 'draft_reply',
                                'template' => 'Thanks for commenting on our jewellery post. We can help with sizing and availability — reply here.',
                            ],
                            'next' => 'act_send',
                        ],
                        'act_send' => [
                            'type' => 'action',
                            'label' => 'Send eligible DM',
                            'config' => [
                                'action_type' => 'send_eligible_reply',
                                'purpose' => 'transactional',
                            ],
                            'next' => 'act_assign',
                        ],
                        'act_assign' => [
                            'type' => 'action',
                            'label' => 'Assign human',
                            'config' => [
                                'action_type' => 'assign_human',
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
                'name' => 'Shopify order notice',
                'description' => 'When a Shopify order is created, sync order context and queue the approved order-notice template for human/ops send.',
                'trigger_type' => 'shopify_order_created',
                'status' => 'draft',
                'definition' => [
                    'entry' => 'trigger_order',
                    'nodes' => [
                        'trigger_order' => [
                            'type' => 'trigger',
                            'label' => 'Shopify order created',
                            'config' => ['trigger_type' => 'shopify_order_created'],
                            'next' => 'act_sync',
                        ],
                        'act_sync' => [
                            'type' => 'action',
                            'label' => 'Sync Shopify order',
                            'config' => [
                                'action_type' => 'sync_shopify',
                                'resource' => 'order',
                            ],
                            'next' => 'act_tpl',
                        ],
                        'act_tpl' => [
                            'type' => 'action',
                            'label' => 'Queue order template',
                            'config' => [
                                'action_type' => 'publish_channel_template',
                                'platform' => 'shopify',
                                'template_slug' => 'shopify-order-notice',
                            ],
                            'next' => 'act_notify',
                        ],
                        'act_notify' => [
                            'type' => 'action',
                            'label' => 'Notify ops',
                            'config' => [
                                'action_type' => 'notify_team',
                                'message' => 'Shopify jewellery order notice prepared.',
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
                'name' => 'TikTok / LinkedIn post draft',
                'description' => 'After content is approved, create a distribution task for TikTok or LinkedIn jewellery posts — never auto-publishes public content.',
                'trigger_type' => 'content_approved',
                'status' => 'draft',
                'definition' => [
                    'entry' => 'trigger_content',
                    'nodes' => [
                        'trigger_content' => [
                            'type' => 'trigger',
                            'label' => 'Content approved',
                            'config' => ['trigger_type' => 'content_approved'],
                            'next' => 'act_draft',
                        ],
                        'act_draft' => [
                            'type' => 'action',
                            'label' => 'Create channel draft',
                            'config' => [
                                'action_type' => 'create_content_draft',
                                'title' => 'Jewellery social variant',
                                'channel' => 'tiktok',
                                'body' => 'Quiet sparkle for everyday rituals. Explore Triada Designs jewellery.',
                            ],
                            'next' => 'act_task',
                        ],
                        'act_task' => [
                            'type' => 'action',
                            'label' => 'Human schedule task',
                            'config' => [
                                'action_type' => 'create_task',
                                'type' => 'content',
                                'title' => 'Schedule TikTok / LinkedIn jewellery post',
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
