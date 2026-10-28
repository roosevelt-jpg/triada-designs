<?php

namespace Database\Seeders;

use App\Models\AgentConfig;
use App\Models\Contact;
use App\Models\ContentItem;
use App\Models\Conversation;
use App\Models\Integration;
use App\Models\KnowledgeSource;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Opportunity;
use App\Models\Product;
use App\Models\Role;
use App\Models\ServiceOffering;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
use App\Services\Creative\CreativeMediaService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * Production-style local seed for the Triada Designs workspace.
 * Runs without live WordPress/Zoho/Shopify credentials.
 */
class TriadaWorkspaceSeeder extends Seeder
{
    public function run(): void
    {
        $workspace = Workspace::query()->updateOrCreate(
            ['slug' => 'triada-designs'],
            [
                'name' => 'Triada Designs',
                'timezone' => 'Asia/Dubai',
                'default_language' => 'en',
                'settings' => [
                    'brand' => 'Triada Designs',
                    'public_site' => 'https://triada-designs.com',
                    'ops_region' => 'Dubai / UAE',
                ],
            ]
        );

        $ownerRole = Role::query()->updateOrCreate(
            ['workspace_id' => $workspace->id, 'name' => 'Owner'],
            [
                'permissions' => [
                    'workspace.manage',
                    'inbox.manage',
                    'crm.manage',
                    'content.approve',
                    'integrations.manage',
                    'team.manage',
                ],
            ]
        );

        // Migrate legacy local admin email → primary ops contact.
        $legacyAdmin = User::query()->where('email', 'admin@triada-designs.com')->first();
        $existingInfo = User::query()->where('email', 'info@triada-designs.com')->first();

        if ($legacyAdmin && ! $existingInfo) {
            $legacyAdmin->forceFill([
                'email' => 'info@triada-designs.com',
                'name' => 'Triada Admin',
                'password' => Hash::make('triada-local'),
                'email_verified_at' => now(),
            ])->save();
            $user = $legacyAdmin->fresh();
        } elseif ($legacyAdmin && $existingInfo && $legacyAdmin->id !== $existingInfo->id) {
            WorkspaceMembership::query()
                ->where('user_id', $legacyAdmin->id)
                ->update(['user_id' => $existingInfo->id]);
            $legacyAdmin->delete();
            $user = $existingInfo;
            $user->forceFill([
                'name' => 'Triada Admin',
                'password' => Hash::make('triada-local'),
                'email_verified_at' => now(),
            ])->save();
        } else {
            $user = User::query()->updateOrCreate(
                ['email' => 'info@triada-designs.com'],
                [
                    'name' => 'Triada Admin',
                    'password' => Hash::make('triada-local'),
                    'email_verified_at' => now(),
                ]
            );
        }

        WorkspaceMembership::query()->updateOrCreate(
            ['workspace_id' => $workspace->id, 'user_id' => $user->id],
            ['role_id' => $ownerRole->id, 'status' => 'active']
        );

        $telegramToken = filled(config('integrations.telegram.bot_token'));
        $emailKey = filled(config('integrations.email.api_key'));
        $geminiKey = filled(config('integrations.llm.gemini.api_key'));
        $resendKey = filled(config('services.resend.key'));
        $integrationMode = strtolower((string) config('integrations.mode', 'local'));

        foreach ([
            ['provider' => 'wordpress', 'display_name' => 'WordPress CMS', 'status' => 'seeded', 'capabilities' => ['posts.read', 'posts.draft', 'webhooks']],
            [
                'provider' => 'zoho',
                'display_name' => 'Zoho CRM + Books',
                'status' => 'awaiting_credentials',
                'capabilities' => ['contacts.upsert', 'leads.upsert', 'invoices.create', 'einvoice.uae', 'webhooks'],
                'metadata' => [
                    'products' => [
                        'crm' => 'Zoho CRM — contacts/leads',
                        'books' => 'Zoho Books — invoice PDF / UAE e-invoice',
                    ],
                ],
            ],
            ['provider' => 'webchat', 'display_name' => 'Website Live Chat', 'status' => 'local', 'capabilities' => ['messages.send', 'messages.receive']],
            ['provider' => 'facebook', 'display_name' => 'Facebook Messenger', 'status' => 'awaiting_credentials', 'capabilities' => ['messages.send', 'messages.receive', 'webhooks', 'pages']],
            ['provider' => 'instagram', 'display_name' => 'Instagram Messaging', 'status' => 'awaiting_credentials', 'capabilities' => ['messages.send', 'messages.receive', 'webhooks']],
            ['provider' => 'whatsapp', 'display_name' => 'WhatsApp Cloud API', 'status' => 'awaiting_credentials', 'capabilities' => ['messages.send', 'messages.receive', 'templates', 'webhooks']],
        ] as $row) {
            Integration::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'provider' => $row['provider'],
                    'external_account_id' => $row['provider'].'-primary',
                ],
                [
                    'display_name' => $row['display_name'],
                    'status' => $row['status'],
                    'capabilities' => $row['capabilities'],
                    'granted_scopes' => [],
                    'last_health_check_at' => now(),
                    'metadata' => $row['metadata'] ?? (in_array($row['provider'], ['facebook', 'instagram', 'whatsapp'], true)
                        ? ['webhook_subscribed' => false, 'connected_via' => 'triada_dashboard']
                        : null),
                ]
            );
        }

        // Shopify: wire Triada store domain; Admin API token remains awaiting (local_sim).
        $shopify = Integration::query()
            ->where('workspace_id', $workspace->id)
            ->where('provider', 'shopify')
            ->first();

        if ($shopify) {
            $shopify->forceFill([
                'external_account_id' => 'jwtjzw-nu.myshopify.com',
                'display_name' => 'Shopify',
                'status' => 'awaiting_credentials',
                'capabilities' => ['products.read', 'orders.read', 'webhooks'],
                'granted_scopes' => [],
                'last_health_check_at' => now(),
                'metadata' => [
                    'shop_domain' => 'jwtjzw-nu.myshopify.com',
                    'shop_url' => 'https://jwtjzw-nu.myshopify.com/',
                    'token_status' => 'awaiting',
                    'mode_hint' => 'Shop domain wired; local_sim until Admin API access token + INTEGRATION_MODE=live.',
                ],
            ])->save();
        } else {
            Integration::query()->create([
                'workspace_id' => $workspace->id,
                'provider' => 'shopify',
                'external_account_id' => 'jwtjzw-nu.myshopify.com',
                'display_name' => 'Shopify',
                'status' => 'awaiting_credentials',
                'capabilities' => ['products.read', 'orders.read', 'webhooks'],
                'granted_scopes' => [],
                'last_health_check_at' => now(),
                'metadata' => [
                    'shop_domain' => 'jwtjzw-nu.myshopify.com',
                    'shop_url' => 'https://jwtjzw-nu.myshopify.com/',
                    'token_status' => 'awaiting',
                    'mode_hint' => 'Shop domain wired; local_sim until Admin API access token + INTEGRATION_MODE=live.',
                ],
            ]);
        }

        $workspace->forceFill([
            'settings' => array_merge($workspace->settings ?? [], [
                'meta_verify_token' => 'triada-local-verify',
                'brand' => 'Triada Designs',
                'public_site' => 'https://triada-designs.com',
            ]),
        ])->save();

        $amelia = Contact::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'email_normalized' => 'layla.almansoori@example.com',
            ],
            [
                'name' => 'Layla Al Mansoori',
                'email' => 'layla.almansoori@example.com',
                'phone' => '+971 50 555 0142',
                'phone_normalized' => '971505550142',
                'preferred_language' => 'en',
                'lifecycle_status' => 'qualified',
                'source' => 'webchat',
            ]
        );

        $noah = Contact::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'email_normalized' => 'omar.hassan@example.com',
            ],
            [
                'name' => 'Omar Hassan',
                'email' => 'omar.hassan@example.com',
                'phone' => '+971 55 555 0199',
                'phone_normalized' => '971555550199',
                'preferred_language' => 'en',
                'lifecycle_status' => 'lead',
                'source' => 'email',
            ]
        );

        $conversation = Conversation::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'external_conversation_id' => 'seed-webchat-amelia',
            ],
            [
                'contact_id' => $amelia->id,
                'channel' => 'webchat',
                'status' => 'open',
                'priority' => 'normal',
                'automation_mode' => 'ai',
                'detected_language' => 'en',
                'last_message_at' => now()->subMinutes(12),
                'last_inbound_at' => now()->subMinutes(12),
            ]
        );

        if ($conversation->messages()->count() === 0) {
            Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $conversation->id,
                'direction' => 'inbound',
                'sender_type' => 'contact',
                'sender_id' => $amelia->id,
                'message_type' => 'text',
                'body' => 'Hi — I’m looking for a sculptural ring for everyday wear in Dubai. Do you have the Priest Ring or something similar in gold plate?',
                'detected_language' => 'en',
                'delivery_status' => 'received',
                'provider_timestamp' => now()->subMinutes(14),
            ]);
            Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $conversation->id,
                'direction' => 'outbound',
                'sender_type' => 'ai',
                'message_type' => 'text',
                'body' => 'I’m Triada Designs’ virtual assistant. I can help with jewellery, custom pieces, and order questions. The Priest Ring is in our Salt & Spirit line (silver with gold plating; 14K/18K on request, ~7 days to make). Would you like sizing guidance or a private consultation in Dubai?',
                'detected_language' => 'en',
                'delivery_status' => 'sent',
                'provider_timestamp' => now()->subMinutes(13),
            ]);
            Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $conversation->id,
                'direction' => 'inbound',
                'sender_type' => 'contact',
                'sender_id' => $amelia->id,
                'message_type' => 'text',
                'body' => 'Sizing please — and yes, I’d like a consultation if you offer video or in-person.',
                'detected_language' => 'en',
                'delivery_status' => 'received',
                'provider_timestamp' => now()->subMinutes(12),
            ]);
        }

        Lead::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'contact_id' => $amelia->id,
            ],
            [
                'source_channel' => 'webchat',
                'stage' => 'qualified',
                'score' => 82,
                'score_reasons' => ['purchase_intent', 'consultation_interest', 'dubai_ops'],
                'assigned_user_id' => $user->id,
                'estimated_value' => 1450,
                'currency' => 'AED',
                'qualification_data' => [
                    'interest' => 'Priest Ring + private jewellery consultation',
                    'timing' => 'this_month',
                    'region' => 'Dubai',
                ],
            ]
        );

        Lead::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'contact_id' => $noah->id,
            ],
            [
                'source_channel' => 'email',
                'stage' => 'contacted',
                'score' => 48,
                'score_reasons' => ['gift_inquiry'],
                'assigned_user_id' => $user->id,
                'currency' => 'AED',
                'qualification_data' => [
                    'interest' => 'Gift finder — pearl earrings anniversary',
                    'region' => 'Abu Dhabi',
                ],
            ]
        );

        Task::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'title' => 'Follow up with Layla on ring size + Dubai consultation',
            ],
            [
                'contact_id' => $amelia->id,
                'conversation_id' => $conversation->id,
                'assigned_user_id' => $user->id,
                'type' => 'follow_up',
                'description' => 'Send size-guide link and confirm video vs in-person consultation slot.',
                'due_at' => now()->addDay(),
                'status' => 'open',
            ]
        );

        // Core catalogue pieces also expanded in JewelleryOpsSeeder.
        Product::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'sku' => 'TD-RING-PRIEST-01',
            ],
            [
                'title' => 'The Priest Ring',
                'description' => 'Sculptural Salt & Spirit ring. Silver with gold plating; 14K/18K gold on request. ~7 days to make.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 1450,
                'currency' => 'AED',
                'availability_status' => 'in_stock_snapshot',
                'published_status' => 'published',
                'approved_claims' => ['silver with gold plating', 'made to order ~7 days', 'Salt & Spirit'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/priest-ring.jpg',
                    'model_url' => '/brand/models/priest-ring-v2.glb',
                    'category' => 'ring',
                    'collection' => 'Salt & Spirit',
                ],
                'synced_at' => now(),
            ]
        );

        ServiceOffering::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => 'Private jewellery consultation',
            ],
            [
                'description' => 'Video or in-person consultation in Dubai for custom, engraving, or 14K/18K gold pieces. Quotes are human-approved.',
                'price' => 0,
                'currency' => 'AED',
                'inquiry_url' => 'https://triada-designs.com/',
                'status' => 'active',
                'approved_claims' => ['consultation', 'custom quotes require human approval'],
            ]
        );

        ContentItem::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'title' => 'Salt & Spirit — Priest Ring detail',
            ],
            [
                'content_type' => 'social_post',
                'objective' => 'awareness',
                'status' => 'in_review',
                'created_by' => $user->id,
                'body' => 'Soft Gulf light on sculptural gold. The Priest Ring — a quiet everyday piece from Salt & Spirit. Explore Triada Designs.',
                'channel' => 'instagram',
                'scheduled_for' => now()->addDays(3),
                'campaign_key' => 'salt-spirit-dubai',
                'approval_version' => 0,
                'product_context' => [
                    'name' => 'The Priest Ring',
                    'materials' => 'silver with gold plating; gold on request',
                    'collection' => 'Salt & Spirit',
                ],
            ]
        );

        ContentItem::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'title' => 'Tides Treasure — pearl studs',
            ],
            [
                'content_type' => 'campaign',
                'objective' => 'conversion',
                'status' => 'approved',
                'created_by' => $user->id,
                'approved_by' => $user->id,
                'approved_at' => now()->subDay(),
                'body' => 'Irregular gold studs with flat freshwater pearls. Human-approved caption ready for scheduled publish.',
                'channel' => 'facebook',
                'scheduled_for' => now()->addDays(5),
                'campaign_key' => 'salt-spirit-dubai',
                'approval_version' => 1,
                'product_context' => [
                    'name' => 'Tides Treasure',
                    'materials' => 'gold-plated silver, freshwater pearl',
                    'collection' => 'Salt & Spirit',
                ],
            ]
        );

        // Every seeded post gets post-aligned creative (image + platform variants + video + animation).
        $creative = app(CreativeMediaService::class);
        ContentItem::query()
            ->where('workspace_id', $workspace->id)
            ->orderBy('created_at')
            ->get()
            ->each(function (ContentItem $item) use ($workspace, $creative) {
                $creative->ensureCreativePack($workspace, $item, [
                    'with_video' => true,
                    'with_animation' => true,
                ]);
            });

        $sofia = Contact::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'email_normalized' => 'mira.ksa@example.com',
            ],
            [
                'name' => 'Mira Al Saud',
                'email' => 'mira.ksa@example.com',
                'preferred_language' => 'en',
                'lifecycle_status' => 'lead',
                'source' => 'instagram',
            ]
        );

        $igConversation = Conversation::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'external_conversation_id' => 'seed-ig-triada:seed-ig-user-mira',
            ],
            [
                'contact_id' => $sofia->id,
                'channel' => 'instagram',
                'status' => 'open',
                'priority' => 'normal',
                'automation_mode' => 'ai',
                'detected_language' => 'en',
                'last_message_at' => now()->subMinutes(25),
                'last_inbound_at' => now()->subMinutes(25),
            ]
        );

        if ($igConversation->messages()->count() === 0) {
            Message::query()->create([
                'workspace_id' => $workspace->id,
                'conversation_id' => $igConversation->id,
                'provider_message_id' => 'seed-ig-msg-1',
                'direction' => 'inbound',
                'sender_type' => 'contact',
                'sender_id' => $sofia->id,
                'message_type' => 'text',
                'body' => 'Do you ship Footprints in the Sand to Riyadh? Looking at the tricolor pendant.',
                'detected_language' => 'en',
                'delivery_status' => 'received',
                'provider_timestamp' => now()->subMinutes(25),
            ]);
        }

        // Align with Next.js TEAM_ROSTER (apps/web/src/lib/agents/team-roster.js) prompt_version 3.
        foreach ([
            [
                'key' => 'ai_support',
                'name' => 'AI Support',
                'role' => 'support',
                'description' => 'Answers product, order, sizing, materials, and care questions from approved knowledge. Hands off when unsure.',
                'status' => 'active',
                'config' => [
                    'channels' => ['instagram', 'whatsapp', 'facebook', 'webchat', 'email'],
                    'escalation' => true,
                    'collaborates_with' => ['escalation_officer', 'quality_control', 'compliance', 'leads_qualification', 'follow_up'],
                    'prompt_version' => 3,
                    'system_prompt' => 'You are AI Support for Triada Designs. Retrieve training docs for tone, timing, and open/close. Never invent prices, stock, or policies. Warm Triada tone. Hand off complaints, custom quotes, and wholesale to Escalation. Write shared memory notes for Follow up and Leads.',
                ],
            ],
            [
                'key' => 'support',
                'name' => 'Support agent',
                'role' => 'support',
                'description' => 'Legacy alias for AI Support.',
                'status' => 'active',
                'config' => [
                    'channels' => ['webchat', 'facebook', 'instagram', 'whatsapp', 'telegram', 'email'],
                    'escalation' => true,
                    'prompt_version' => 3,
                    'system_prompt' => 'You are AI Support for Triada Designs. Retrieve training docs when unsure. Never invent prices or policies. Escalate complaints and custom quotes.',
                ],
            ],
            [
                'key' => 'content_creator',
                'name' => 'Content creator / Creative',
                'role' => 'creative',
                'description' => 'Drafts viral UGC scripts, high-converting captions, and creative briefs. Human approval before publish.',
                'status' => 'active',
                'config' => [
                    'channels' => ['content_studio', 'instagram', 'tiktok', 'facebook', 'whatsapp', 'linkedin'],
                    'collaborates_with' => ['marketing', 'quality_control', 'compliance'],
                    'prompt_version' => 3,
                    'system_prompt' => 'You are Content creator / Creative for Triada Designs. Draft viral high-converting UGC for Meta/IG/TikTok/WhatsApp. Hook first, soft CTA, no fake scarcity. Ground materials in training docs. Human approval before publish. Never mention internal media pipelines.',
                    'allowed_tools' => [
                        'propose_creative_brief',
                        'generate_image',
                        'generate_platform_variants',
                        'generate_short_video',
                        'generate_ugc_video',
                        'generate_animation',
                        'ensure_creative_pack',
                    ],
                ],
            ],
            [
                'key' => 'content',
                'name' => 'Content agent',
                'role' => 'content',
                'description' => 'Legacy alias for Content creator / Creative.',
                'status' => 'active',
                'config' => [
                    'channels' => ['content_studio', 'meta_page', 'wordpress'],
                    'prompt_version' => 3,
                    'system_prompt' => 'One core message per draft. Viral UGC jewellery creative. Soft CTA. Public posts require human approval.',
                    'allowed_tools' => [
                        'propose_creative_brief',
                        'generate_image',
                        'generate_platform_variants',
                        'generate_short_video',
                        'generate_animation',
                        'ensure_creative_pack',
                    ],
                ],
            ],
            [
                'key' => 'follow_up',
                'name' => 'Follow up',
                'role' => 'follow_up',
                'description' => 'Friendly cart/sizing abandonment reminders and after-sale care. Opt-in only.',
                'status' => 'active',
                'config' => [
                    'channels' => ['whatsapp', 'email', 'instagram'],
                    'collaborates_with' => ['ai_support', 'marketing', 'leads_qualification', 'compliance'],
                    'prompt_version' => 3,
                    'system_prompt' => 'One friendly reminder after a quiet day. Warm Triada tone. Never spam. Opt-in WhatsApp only. Read Support/Leads shared context. No invented discounts.',
                ],
            ],
            [
                'key' => 'marketing',
                'name' => 'Marketing',
                'role' => 'marketing',
                'description' => 'Campaign concepts, channel-ready copy, and calendar proposals for human approval.',
                'status' => 'active',
                'config' => [
                    'channels' => ['content_studio', 'campaigns', 'calendar'],
                    'collaborates_with' => ['content_creator', 'quality_control', 'compliance'],
                    'prompt_version' => 3,
                    'system_prompt' => 'Campaign concepts for Meta/IG/TikTok/WhatsApp jewellery marketing. Prefer viral UGC angles — hooks first, soft CTAs, no fake urgency. Human approval before live. Collaborate with Creative and QC via shared memory.',
                    'allowed_tools' => [
                        'propose_creative_brief',
                        'generate_image',
                        'generate_platform_variants',
                        'generate_short_video',
                        'generate_animation',
                        'ensure_creative_pack',
                    ],
                ],
            ],
            [
                'key' => 'quality_control',
                'name' => 'Quality Control',
                'role' => 'quality_control',
                'description' => 'Reviews drafts for accuracy, brand voice, catalog facts, and policy alignment.',
                'status' => 'active',
                'config' => [
                    'channels' => ['internal'],
                    'collaborates_with' => ['ai_support', 'content_creator', 'marketing', 'compliance'],
                    'prompt_version' => 3,
                    'system_prompt' => 'Return PASS / NEEDS FIXES / BLOCK. Flag invented prices, stock, fake scarcity, off-brand tone, and missing disclosures. Write QC notes into shared memory.',
                ],
            ],
            [
                'key' => 'compliance',
                'name' => 'Compliance',
                'role' => 'compliance',
                'description' => 'Checks WhatsApp opt-in, consent, outreach rules, and disclosures.',
                'status' => 'active',
                'config' => [
                    'channels' => ['internal', 'whatsapp', 'email', 'linkedin'],
                    'collaborates_with' => ['ai_support', 'follow_up', 'marketing', 'escalation_officer'],
                    'prompt_version' => 3,
                    'system_prompt' => 'WhatsApp: business messages only to opted-in customers. No bulk unsolicited WhatsApp. ALLOW / HOLD / BLOCK with reason in shared memory. Broadcasts need human approval.',
                ],
            ],
            [
                'key' => 'leads_qualification',
                'name' => 'Leads Qualification',
                'role' => 'lead_qualification',
                'description' => 'Scores inbound intent and routes hot leads to humans or Escalation.',
                'status' => 'active',
                'config' => [
                    'channels' => ['webchat', 'facebook', 'instagram', 'whatsapp', 'telegram', 'email'],
                    'create_leads' => true,
                    'collaborates_with' => ['ai_support', 'follow_up', 'escalation_officer'],
                    'prompt_version' => 3,
                    'system_prompt' => 'Score from explicit purchase/service signals only. Share lead context in shared memory. Route hot / wholesale / custom to Escalation.',
                ],
            ],
            [
                'key' => 'lead_qualification',
                'name' => 'Lead qualification agent',
                'role' => 'lead_qualification',
                'description' => 'Legacy alias for Leads Qualification.',
                'status' => 'active',
                'config' => [
                    'channels' => ['webchat', 'facebook', 'instagram', 'whatsapp', 'telegram', 'email'],
                    'create_leads' => true,
                    'prompt_version' => 3,
                    'system_prompt' => 'Score from explicit purchase/service signals only. Never invent intent.',
                ],
            ],
            [
                'key' => 'sales',
                'name' => 'Sales agent',
                'role' => 'sales',
                'description' => 'Legacy sales alias — consultative catalog recommendations.',
                'status' => 'active',
                'config' => [
                    'channels' => ['webchat', 'facebook', 'instagram', 'whatsapp', 'telegram'],
                    'create_leads' => true,
                    'prompt_version' => 3,
                    'system_prompt' => 'Consultative, not pushy. Recommend only catalog-backed options. Score explicit signals only.',
                ],
            ],
            [
                'key' => 'escalation_officer',
                'name' => 'Escalation officer',
                'role' => 'escalation',
                'description' => 'Handles complaints, custom quotes, wholesale/B2B. Prepares human handoff.',
                'status' => 'active',
                'config' => [
                    'channels' => ['internal', 'telegram', 'email', 'whatsapp'],
                    'collaborates_with' => ['ai_support', 'compliance', 'leads_qualification'],
                    'prompt_version' => 3,
                    'system_prompt' => 'Prefer clear next actions and owners. Escalate wholesale, boutique, stylist, corporate gifting, custom quotes, and complaints. Never invent revenue or promises. Write handoff into shared memory.',
                ],
            ],
            [
                'key' => 'sales_ops',
                'name' => 'Sales ops agent',
                'role' => 'sales_ops',
                'description' => 'Legacy alias — follow-up tasks and handoffs.',
                'status' => 'active',
                'config' => [
                    'channels' => ['internal'],
                    'prompt_version' => 3,
                    'system_prompt' => 'Prefer clear next actions and owners. Do not invent revenue. One soft follow-up after quiet time; never spam.',
                ],
            ],
            [
                'key' => 'meta_messaging',
                'name' => 'Meta messaging agent',
                'role' => 'channel',
                'description' => 'Handles Facebook, Instagram, and WhatsApp replies with eligibility checks.',
                'status' => 'paused',
                'config' => [
                    'channels' => ['facebook', 'instagram', 'whatsapp'],
                    'respect_takeover' => true,
                    'prompt_version' => 3,
                    'system_prompt' => 'Channel eligibility only. Defer content to AI Support. Never invent policies.',
                ],
            ],
        ] as $agent) {
            AgentConfig::query()->updateOrCreate(
                ['workspace_id' => $workspace->id, 'key' => $agent['key']],
                $agent
            );
        }

        \App\Models\WebchatWidgetToken::query()->firstOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => 'Website widget',
            ],
            [
                'public_token' => 'wc_triada_local_widget',
                'status' => 'active',
                'rate_limit_per_minute' => 30,
                'allowed_origins' => ['*'],
                'metadata' => ['seeded' => true],
            ]
        );

        foreach (['telegram', 'tiktok', 'email', 'linkedin'] as $provider) {
            $hasCred = match ($provider) {
                'telegram' => $telegramToken,
                'email' => $emailKey || $resendKey,
                default => false,
            };
            // Honest status: credentials present stay local until INTEGRATION_MODE=live.
            $status = $hasCred
                ? ($integrationMode === 'live' ? 'connected' : 'local')
                : 'awaiting_credentials';

            \App\Models\Integration::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'provider' => $provider,
                    'external_account_id' => $provider.'-primary',
                ],
                [
                    'display_name' => match ($provider) {
                        'telegram' => 'Telegram Bot',
                        'tiktok' => 'TikTok',
                        'email' => 'Email (Resend)',
                        'linkedin' => 'LinkedIn',
                        default => ucfirst($provider),
                    },
                    'status' => $status,
                    'capabilities' => match ($provider) {
                        'tiktok' => ['posts.publish', 'templates', 'webhooks'],
                        'linkedin' => ['posts.publish', 'templates', 'messaging'],
                        'email' => ['messages.send', 'messages.receive', 'templates'],
                        default => ['messages.send', 'messages.receive'],
                    },
                    'metadata' => [
                        'seeded' => true,
                        'vertical' => 'jewellery',
                        'has_env_credentials' => $hasCred,
                        'mode_hint' => $hasCred
                            ? ($integrationMode === 'live'
                                ? 'Credentials present; INTEGRATION_MODE=live'
                                : 'Credentials present in env; running local_sim until INTEGRATION_MODE=live')
                            : 'Awaiting provider credentials',
                    ],
                ]
            );
        }

        Integration::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => 'gemini',
                'external_account_id' => 'gemini-primary',
            ],
            [
                'display_name' => 'Google Gemini',
                'status' => $geminiKey
                    ? ($integrationMode === 'live' ? 'connected' : 'local')
                    : 'awaiting_credentials',
                'capabilities' => ['llm.chat', 'agents', 'creative_prompts'],
                'metadata' => [
                    'has_api_key' => $geminiKey,
                    'model' => config('integrations.llm.gemini.model'),
                    'ui_hint' => $geminiKey
                        ? 'GEMINI_API_KEY present — active when LLM_PROVIDER=gemini'
                        : 'Set GEMINI_API_KEY or switch to Anthropic on Integrations',
                ],
            ]
        );

        foreach ([
            [
                'title' => 'Shipping and delivery',
                'source_type' => 'faq',
                'body' => 'Triada Designs ships to supported regions listed on the public site. Delivery estimates are confirmed at checkout once Shopify is connected.',
                'tags' => ['shipping', 'faq'],
            ],
            [
                'title' => 'Returns policy',
                'source_type' => 'policy',
                'body' => 'Unopened products may be returned within the window published on triada-designs.com. Do not invent extended warranties.',
                'tags' => ['returns', 'policy'],
            ],
            [
                'title' => 'Materials & make time',
                'source_type' => 'faq',
                'body' => 'Silver with gold plating; 14K and 18K gold on request. About 7 days to make each piece. Never invent prices or delivery dates.',
                'tags' => ['materials', 'jewellery', 'faq'],
            ],
        ] as $source) {
            KnowledgeSource::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'title' => $source['title'],
                ],
                [
                    'source_type' => $source['source_type'],
                    'status' => 'published',
                    'body' => $source['body'],
                    'language' => 'en',
                    'tags' => $source['tags'],
                ]
            );
        }

        Opportunity::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => 'Layla — Priest Ring + Dubai consultation',
            ],
            [
                'contact_id' => $amelia->id,
                'name' => 'Layla — Priest Ring + Dubai consultation',
                'stage' => 'proposal',
                'amount' => 1450,
                'currency' => 'AED',
                'source_channel' => 'webchat',
                'owner_user_id' => $user->id,
                'expected_close_at' => now()->addDays(10),
            ]
        );
    }
}
