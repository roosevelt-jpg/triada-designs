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
                'timezone' => 'America/Los_Angeles',
                'default_language' => 'en',
                'settings' => [
                    'brand' => 'Triada Designs',
                    'public_site' => 'https://triada-designs.com',
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

        $user = User::query()->updateOrCreate(
            ['email' => 'admin@triada-designs.com'],
            [
                'name' => 'Triada Admin',
                'password' => Hash::make('triada-local'),
                'email_verified_at' => now(),
            ]
        );

        WorkspaceMembership::query()->updateOrCreate(
            ['workspace_id' => $workspace->id, 'user_id' => $user->id],
            ['role_id' => $ownerRole->id, 'status' => 'active']
        );

        foreach ([
            ['provider' => 'wordpress', 'display_name' => 'WordPress CMS', 'status' => 'seeded', 'capabilities' => ['posts.read', 'posts.draft', 'webhooks']],
            ['provider' => 'zoho', 'display_name' => 'Zoho CRM', 'status' => 'seeded', 'capabilities' => ['contacts.upsert', 'leads.upsert', 'webhooks']],
            ['provider' => 'shopify', 'display_name' => 'Shopify', 'status' => 'disconnected', 'capabilities' => ['products.read', 'orders.read']],
            ['provider' => 'webchat', 'display_name' => 'Website Live Chat', 'status' => 'seeded', 'capabilities' => ['messages.send', 'messages.receive']],
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
                    'metadata' => in_array($row['provider'], ['facebook', 'instagram', 'whatsapp'], true)
                        ? ['webhook_subscribed' => false, 'connected_via' => 'triada_dashboard']
                        : null,
                ]
            );
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
                'email_normalized' => 'amelia@example.com',
            ],
            [
                'name' => 'Amelia Chen',
                'email' => 'amelia@example.com',
                'phone' => '+1 415 555 0142',
                'phone_normalized' => '14155550142',
                'preferred_language' => 'en',
                'lifecycle_status' => 'qualified',
                'source' => 'webchat',
            ]
        );

        $noah = Contact::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'email_normalized' => 'noah@example.com',
            ],
            [
                'name' => 'Noah Patel',
                'email' => 'noah@example.com',
                'phone' => '+1 628 555 0199',
                'phone_normalized' => '16285550199',
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
                'body' => 'Hi — I’m looking for a calm skincare set for sensitive skin. What do you recommend?',
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
                'body' => 'I’m Triada Designs’ virtual assistant. I can help with products, services, and order questions. For sensitive skin, our gentle cleanser and barrier cream are the approved recommendations. Would you like product details or a service consultation?',
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
                'body' => 'Product details please — and do you offer a consultation?',
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
                'score' => 78,
                'score_reasons' => ['purchase_intent', 'service_interest'],
                'assigned_user_id' => $user->id,
                'estimated_value' => 180,
                'currency' => 'USD',
                'qualification_data' => [
                    'interest' => 'sensitive skincare set + consultation',
                    'timing' => 'this_month',
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
                'score' => 42,
                'score_reasons' => ['general_inquiry'],
                'assigned_user_id' => $user->id,
                'currency' => 'USD',
            ]
        );

        Task::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'title' => 'Follow up with Amelia on consultation availability',
            ],
            [
                'contact_id' => $amelia->id,
                'conversation_id' => $conversation->id,
                'assigned_user_id' => $user->id,
                'type' => 'follow_up',
                'description' => 'Confirm whether she prefers product links or a service inquiry form.',
                'due_at' => now()->addDay(),
                'status' => 'open',
            ]
        );

        Product::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'sku' => 'TD-CLEANSE-01',
            ],
            [
                'title' => 'Gentle Daily Cleanser',
                'description' => 'A mild cleanser formulated for sensitive skin. Approved claims only; inventory must be confirmed live before promising availability.',
                'product_url' => 'https://triada-designs.com/products/gentle-daily-cleanser',
                'price' => 38,
                'currency' => 'USD',
                'availability_status' => 'in_stock_snapshot',
                'published_status' => 'published',
                'approved_claims' => ['fragrance-conscious', 'suitable for sensitive skin'],
                'synced_at' => now(),
            ]
        );

        Product::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'sku' => 'TD-BARRIER-02',
            ],
            [
                'title' => 'Barrier Recovery Cream',
                'description' => 'Rich cream for dryness and barrier support. Do not invent medical claims.',
                'product_url' => 'https://triada-designs.com/products/barrier-recovery-cream',
                'price' => 54,
                'currency' => 'USD',
                'availability_status' => 'in_stock_snapshot',
                'published_status' => 'published',
                'approved_claims' => ['rich texture', 'evening ritual'],
                'synced_at' => now(),
            ]
        );

        ServiceOffering::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => 'Personal care consultation',
            ],
            [
                'description' => 'A guided conversation to recommend products and routines based on customer needs. Booking is inquiry-based until a booking provider is connected.',
                'price' => 75,
                'currency' => 'USD',
                'inquiry_url' => 'https://triada-designs.com/services/consultation',
                'status' => 'active',
                'approved_claims' => ['consultative', 'no unverified medical advice'],
            ]
        );

        ContentItem::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'title' => 'Warm neutrals for spring rituals',
            ],
            [
                'content_type' => 'social_post',
                'objective' => 'awareness',
                'status' => 'in_review',
                'created_by' => $user->id,
                'body' => 'Soft light on brushed gold. A quiet pendant for everyday rituals — explore Triada Designs jewellery.',
                'channel' => 'instagram',
                'scheduled_for' => now()->addDays(3),
                'campaign_key' => 'spring-rituals',
                'approval_version' => 0,
                'product_context' => [
                    'name' => 'Brushed gold pendant',
                    'materials' => '18k gold vermeil, fine chain',
                ],
            ]
        );

        ContentItem::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'title' => 'Evening stack — refined metals',
            ],
            [
                'content_type' => 'campaign',
                'objective' => 'conversion',
                'status' => 'approved',
                'created_by' => $user->id,
                'approved_by' => $user->id,
                'approved_at' => now()->subDay(),
                'body' => 'An evening stack of refined metals. Human-approved caption ready for scheduled publish.',
                'channel' => 'facebook',
                'scheduled_for' => now()->addDays(5),
                'campaign_key' => 'spring-rituals',
                'approval_version' => 1,
                'product_context' => [
                    'name' => 'Mixed-metal ring stack',
                    'materials' => 'sterling silver, rose gold plate',
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
                'email_normalized' => 'sofia.meta@example.com',
            ],
            [
                'name' => 'Sofia Reyes',
                'email' => 'sofia.meta@example.com',
                'preferred_language' => 'en',
                'lifecycle_status' => 'lead',
                'source' => 'instagram',
            ]
        );

        $igConversation = Conversation::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'external_conversation_id' => 'seed-ig-triada:seed-ig-user-sofia',
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
                'body' => 'Do you ship the barrier cream internationally?',
                'detected_language' => 'en',
                'delivery_status' => 'received',
                'provider_timestamp' => now()->subMinutes(25),
            ]);
        }

        foreach ([
            [
                'key' => 'support',
                'name' => 'Support agent',
                'role' => 'support',
                'description' => 'Answers product, order, and policy questions from approved knowledge.',
                'status' => 'active',
                'config' => [
                    'channels' => ['webchat', 'facebook', 'instagram', 'whatsapp', 'telegram', 'email'],
                    'escalation' => true,
                    'system_prompt' => 'Be calm, factual, and escalate complaints. Never invent stock or policies.',
                ],
            ],
            [
                'key' => 'sales',
                'name' => 'Sales agent',
                'role' => 'sales',
                'description' => 'Recommends verified products/services and guides purchase or consultation intent.',
                'status' => 'active',
                'config' => [
                    'channels' => ['webchat', 'facebook', 'instagram', 'whatsapp', 'telegram'],
                    'create_leads' => true,
                    'system_prompt' => 'Consultative, not pushy. Recommend only catalog-backed options.',
                ],
            ],
            [
                'key' => 'marketing',
                'name' => 'Marketing agent',
                'role' => 'marketing',
                'description' => 'Drafts campaign concepts, creative briefs, and channel-ready copy for human approval.',
                'status' => 'active',
                'config' => [
                    'channels' => ['content_studio'],
                    'system_prompt' => 'Editorial brand voice. No fake urgency or fabricated social proof. Propose creative briefs; generate post-aligned images for every draft; never auto-publish.',
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
                'key' => 'content',
                'name' => 'Content agent',
                'role' => 'content',
                'description' => 'Produces captions, jewellery creative briefs, and Content Studio media drafts.',
                'status' => 'active',
                'config' => [
                    'channels' => ['content_studio', 'meta_page', 'wordpress'],
                    'system_prompt' => 'One core message per draft. Every post gets an aligned creative image. Public posts require human approval. Use jewellery-aware image/video/animation tools only via allowlist.',
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
                'key' => 'lead_qualification',
                'name' => 'Lead qualification agent',
                'role' => 'lead_qualification',
                'description' => 'Scores inbound intent and updates CRM lead stage.',
                'status' => 'active',
                'config' => [
                    'channels' => ['webchat', 'facebook', 'instagram', 'whatsapp', 'telegram', 'email'],
                    'create_leads' => true,
                    'system_prompt' => 'Score from explicit purchase/service signals only.',
                ],
            ],
            [
                'key' => 'sales_ops',
                'name' => 'Sales ops agent',
                'role' => 'sales_ops',
                'description' => 'Creates follow-up tasks, flags SLA risks, and prepares handoffs.',
                'status' => 'active',
                'config' => [
                    'channels' => ['internal'],
                    'system_prompt' => 'Prefer clear next actions and owners. Do not invent revenue.',
                ],
            ],
            [
                'key' => 'meta_messaging',
                'name' => 'Meta messaging agent',
                'role' => 'channel',
                'description' => 'Handles Facebook, Instagram, and WhatsApp replies with eligibility checks.',
                'status' => 'paused',
                'config' => ['channels' => ['facebook', 'instagram', 'whatsapp'], 'respect_takeover' => true],
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
                        'email' => 'Email',
                        'linkedin' => 'LinkedIn',
                        default => ucfirst($provider),
                    },
                    'status' => 'awaiting_credentials',
                    'capabilities' => match ($provider) {
                        'tiktok' => ['posts.publish', 'templates', 'webhooks'],
                        'linkedin' => ['posts.publish', 'templates', 'messaging'],
                        'email' => ['messages.send', 'messages.receive', 'templates'],
                        default => ['messages.send', 'messages.receive'],
                    },
                    'metadata' => ['seeded' => true, 'vertical' => 'jewellery'],
                ]
            );
        }

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
                'title' => 'Sensitive skin recommendations',
                'source_type' => 'faq',
                'body' => 'Approved recommendations: Gentle Daily Cleanser and Barrier Recovery Cream. No medical claims.',
                'tags' => ['skincare', 'faq'],
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
                'name' => 'Amelia — consultation + barrier set',
            ],
            [
                'contact_id' => $amelia->id,
                'name' => 'Amelia — consultation + barrier set',
                'stage' => 'proposal',
                'amount' => 180,
                'currency' => 'USD',
                'source_channel' => 'webchat',
                'owner_user_id' => $user->id,
                'expected_close_at' => now()->addDays(10),
            ]
        );
    }
}
