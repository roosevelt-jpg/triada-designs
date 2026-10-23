<?php

namespace Database\Seeders;

use App\Models\Contact;
use App\Models\ContentItem;
use App\Models\Conversation;
use App\Models\Integration;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Product;
use App\Models\Role;
use App\Models\ServiceOffering;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMembership;
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
                ]
            );
        }

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
                'body' => 'Soft light, quiet materials, and a ritual that feels personal. Explore the collection at Triada Designs.',
                'channel' => 'instagram',
                'approval_version' => 0,
            ]
        );
    }
}
