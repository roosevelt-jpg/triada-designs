<?php

namespace Database\Seeders;

use App\Models\ChannelTemplate;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class ChannelTemplateSeeder extends Seeder
{
    public function run(): void
    {
        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return;
        }

        $user = User::query()->where('email', 'info@triada-designs.com')->first();

        $templates = [
            [
                'platform' => 'webchat',
                'name' => 'Jewellery product inquiry',
                'slug' => 'jewellery-product-inquiry',
                'category' => 'product_inquiry',
                'status' => 'approved',
                'body' => 'Thank you for your interest in Triada Designs jewellery. Tell us the piece, metal preference, and size — a specialist will confirm availability and next steps.',
            ],
            [
                'platform' => 'whatsapp',
                'name' => 'WhatsApp jewellery follow-up',
                'slug' => 'wa-jewellery-follow-up',
                'category' => 'follow_up',
                'status' => 'approved',
                'body' => 'Hi {{name}}, following up on your Triada Designs jewellery inquiry. Reply YES to continue, or visit triada-designs.com to browse the collection.',
                'variables' => ['name'],
            ],
            [
                'platform' => 'whatsapp',
                'name' => 'WhatsApp order update',
                'slug' => 'wa-jewellery-order-update',
                'category' => 'utility',
                'status' => 'approved',
                'body' => 'Your Triada Designs order {{order_number}} update: {{status}}. Reply STOP to opt out of marketing messages.',
                'variables' => ['order_number', 'status'],
            ],
            [
                'platform' => 'whatsapp',
                'name' => 'WhatsApp consultation invite',
                'slug' => 'wa-jewellery-consultation',
                'category' => 'marketing',
                'status' => 'pending_approval',
                'body' => 'Triada Designs can arrange a personal jewellery consultation. Reply BOOK to request a time — a specialist will confirm.',
                'variables' => [],
            ],
            [
                'platform' => 'whatsapp',
                'name' => 'WhatsApp new piece preview',
                'slug' => 'wa-new-piece-preview',
                'category' => 'marketing',
                'status' => 'approved',
                'body' => '{{name}}, a new Triada Designs piece is ready to view. Reply INTERESTED and we will continue in-session.',
                'variables' => ['name'],
            ],
            [
                'platform' => 'instagram',
                'name' => 'IG comment to DM opener',
                'slug' => 'ig-comment-to-dm',
                'category' => 'comment_dm',
                'status' => 'approved',
                'body' => 'Thanks for commenting on our jewellery post. We sent you a DM with details — reply there and we will help you choose the right piece.',
            ],
            [
                'platform' => 'facebook',
                'name' => 'FB comment to Messenger',
                'slug' => 'fb-comment-to-dm',
                'category' => 'comment_dm',
                'status' => 'approved',
                'body' => 'Thanks for your comment on Triada Designs. We messaged you with jewellery details — continue in Messenger for sizing and availability.',
            ],
            [
                'platform' => 'shopify',
                'name' => 'Shopify order notice',
                'slug' => 'shopify-order-notice',
                'category' => 'order',
                'status' => 'approved',
                'body' => 'Your Triada Designs order {{order_number}} is confirmed. We will share tracking once the piece ships. Questions? Reply here or use website chat.',
                'variables' => ['order_number'],
            ],
            [
                'platform' => 'tiktok',
                'name' => 'TikTok jewellery showcase',
                'slug' => 'tiktok-jewellery-post',
                'category' => 'social_post',
                'status' => 'draft',
                'body' => 'Quiet sparkle for everyday rituals. Explore Triada Designs jewellery — link in bio. Human approval required before publish.',
            ],
            [
                'platform' => 'linkedin',
                'name' => 'LinkedIn collection feature',
                'slug' => 'linkedin-collection-post',
                'category' => 'social_post',
                'status' => 'draft',
                'body' => 'Triada Designs curates jewellery for considered moments. New pieces and private consultations — visit triada-designs.com. (Requires human approval before posting.)',
            ],
            [
                'platform' => 'email',
                'name' => 'Email jewellery inquiry reply',
                'slug' => 'email-jewellery-inquiry',
                'category' => 'product_inquiry',
                'status' => 'approved',
                'body' => "Hello,\n\nThank you for writing to Triada Designs about our jewellery. A specialist will reply with availability, materials, and care guidance shortly.\n\n— Triada Designs",
            ],
            [
                'platform' => 'telegram',
                'name' => 'Telegram welcome',
                'slug' => 'telegram-welcome',
                'category' => 'general',
                'status' => 'approved',
                'body' => 'Welcome to Triada Designs on Telegram. Ask about jewellery pieces, sizing, or consultations — we reply in your language when possible.',
            ],
        ];

        foreach ($templates as $row) {
            $existing = ChannelTemplate::query()
                ->where('workspace_id', $workspace->id)
                ->where('platform', $row['platform'])
                ->where('slug', $row['slug'])
                ->first();

            $payload = [
                'name' => $row['name'],
                'category' => $row['category'],
                'language' => 'en',
                'status' => $row['status'],
                'body' => $row['body'],
                'variables' => $row['variables'] ?? [],
                'metadata' => ['seeded' => true, 'vertical' => 'jewellery'],
                'created_by' => $user?->id,
                'approved_by' => $row['status'] === 'approved' ? $user?->id : null,
                'approved_at' => $row['status'] === 'approved' ? now() : null,
            ];

            if ($existing) {
                $existing->forceFill($payload)->save();
            } else {
                ChannelTemplate::query()->create(array_merge($payload, [
                    'workspace_id' => $workspace->id,
                    'platform' => $row['platform'],
                    'slug' => $row['slug'],
                    'external_template_id' => null,
                ]));
            }
        }
    }
}
