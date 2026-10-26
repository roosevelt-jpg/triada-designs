<?php

namespace Database\Seeders;

use App\Models\Integration;
use App\Models\ManufacturerMaterial;
use App\Models\PopupMarket;
use App\Models\Product;
use App\Models\KnowledgeSource;
use App\Models\ServiceOffering;
use App\Models\VipDropList;
use App\Models\Workspace;
use Illuminate\Database\Seeder;

class JewelleryOpsSeeder extends Seeder
{
    public function run(): void
    {
        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return;
        }

        Integration::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'provider' => 'anthropic',
                'external_account_id' => null,
            ],
            [
                'display_name' => 'Anthropic (Claude)',
                'status' => 'awaiting_credentials',
                'capabilities' => ['llm.chat', 'agents', 'creative_prompts'],
                'metadata' => [
                    'has_api_key' => false,
                    'model' => config('integrations.llm.anthropic.model'),
                    'ui_hint' => 'Paste API key on Integrations',
                ],
            ]
        );

        $products = [
            [
                'sku' => 'TD-RING-AURA-01',
                'title' => 'Aura Signet Ring',
                'description' => 'Gold-plated silver signet. Size confirmed against published guide. ~7 days to make.',
                'product_url' => 'https://triada-designs.com/products/aura-signet-ring',
                'price' => 890,
                'approved_claims' => ['silver with gold plating', 'made to order ~7 days'],
                'metadata' => ['photo_url' => 'https://triada-designs.com/products/aura-signet-ring?view=image', 'category' => 'ring'],
            ],
            [
                'sku' => 'TD-PEND-QUIET-02',
                'title' => 'Quiet Pendant',
                'description' => 'Calm everyday pendant on fine chain. 14K/18K gold on request.',
                'product_url' => 'https://triada-designs.com/products/quiet-pendant',
                'price' => 720,
                'approved_claims' => ['silver with gold plating', 'gold on request'],
                'metadata' => ['photo_url' => 'https://triada-designs.com/products/quiet-pendant?view=image', 'category' => 'pendant'],
            ],
            [
                'sku' => 'TD-HOOP-SOFT-03',
                'title' => 'Soft Hoop Earrings',
                'description' => 'Lightweight hoops for everyday. Completes ring and pendant sets.',
                'product_url' => 'https://triada-designs.com/products/soft-hoop-earrings',
                'price' => 540,
                'approved_claims' => ['silver with gold plating'],
                'metadata' => ['photo_url' => 'https://triada-designs.com/products/soft-hoop-earrings?view=image', 'category' => 'earrings'],
            ],
            [
                'sku' => 'TD-BAND-DUSK-04',
                'title' => 'Dusk Stack Band',
                'description' => 'Slim stack band. Engraving available on custom request (human quote).',
                'product_url' => 'https://triada-designs.com/products/dusk-stack-band',
                'price' => 480,
                'approved_claims' => ['silver with gold plating', 'engraving on request'],
                'metadata' => ['photo_url' => 'https://triada-designs.com/products/dusk-stack-band?view=image', 'category' => 'ring'],
            ],
        ];

        foreach ($products as $row) {
            Product::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'sku' => $row['sku'],
                ],
                [
                    'title' => $row['title'],
                    'description' => $row['description'],
                    'product_url' => $row['product_url'],
                    'price' => $row['price'],
                    'currency' => 'AED',
                    'availability_status' => 'in_stock_snapshot',
                    'published_status' => 'published',
                    'approved_claims' => $row['approved_claims'],
                    'metadata' => $row['metadata'],
                    'synced_at' => now(),
                ]
            );
        }

        ServiceOffering::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => 'Private jewellery consultation',
            ],
            [
                'description' => 'Video or in-person consultation in Dubai for custom, engraving, or 14K/18K gold pieces. Quotes are human-approved.',
                'price' => 0,
                'currency' => 'AED',
                'inquiry_url' => 'https://triada-designs.com/services/consultation',
                'status' => 'active',
                'approved_claims' => ['consultation', 'custom quotes require human approval'],
            ]
        );

        $materials = [
            ['material_key' => 'silver_gold_plate', 'display_name' => 'Silver with gold plating', 'metal_price_per_gram' => 4.5, 'making_charge_per_gram' => 8.0, 'stock_grams' => 420, 'low_stock_threshold_grams' => 80],
            ['material_key' => '14k', 'display_name' => '14K gold', 'metal_price_per_gram' => 185, 'making_charge_per_gram' => 25, 'stock_grams' => 35, 'low_stock_threshold_grams' => 40],
            ['material_key' => '18k', 'display_name' => '18K gold', 'metal_price_per_gram' => 240, 'making_charge_per_gram' => 30, 'stock_grams' => 22, 'low_stock_threshold_grams' => 25],
        ];

        foreach ($materials as $m) {
            ManufacturerMaterial::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'material_key' => $m['material_key'],
                ],
                array_merge($m, [
                    'unit' => 'g',
                    'currency' => 'AED',
                    'price_as_of' => now(),
                ])
            );
        }

        PopupMarket::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'name' => 'Dubai Design District Market',
            ],
            [
                'venue' => 'd3',
                'city' => 'Dubai',
                'emirate' => 'Dubai',
                'market_type' => 'market',
                'starts_on' => now()->addMonths(2)->toDateString(),
                'ends_on' => now()->addMonths(2)->addDays(3)->toDateString(),
                'application_deadline' => now()->addDays(14)->toDateString(),
                'fee_aed' => 3200,
                'contact_email' => 'markets@example.com',
                'contact_name' => 'Market desk',
                'status' => 'watching',
                'notes' => 'Good fit for quiet jewellery placement.',
            ]
        );

        VipDropList::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'telegram_chat_id' => 'local-vip-1',
            ],
            [
                'status' => 'active',
                'metadata' => ['note' => 'Seed VIP Telegram list — live send needs bot token'],
            ]
        );

        $faqs = [
            [
                'title' => 'Ring sizes & size guide',
                'body' => 'Use the published size guide on triada-designs.com/size-guide. Never invent fit. Hand off if unsure.',
                'tags' => ['sizing', 'faq', 'jewellery'],
            ],
            [
                'title' => 'Materials',
                'body' => 'Silver with gold plating; 14K and 18K gold on request. Confirm metal and lead time with a specialist for gold-on-request.',
                'tags' => ['materials', 'faq', 'jewellery'],
            ],
            [
                'title' => 'Care',
                'body' => 'Store dry, avoid harsh chemicals and perfume on metal, gently wipe with a soft cloth.',
                'tags' => ['care', 'faq', 'jewellery'],
            ],
            [
                'title' => 'Make time & shipping',
                'body' => 'About 7 days to make each piece. Shipping estimates confirmed at checkout — never invent dates.',
                'tags' => ['shipping', 'faq', 'jewellery'],
            ],
            [
                'title' => 'Pricing policy',
                'body' => 'Bot never invents prices. Use approved product price list only. Custom quotes require human approval before sending.',
                'tags' => ['pricing', 'policy', 'jewellery'],
            ],
            [
                'title' => 'AI disclosure & WhatsApp',
                'body' => 'Customers are told they chat with an AI assistant and can reach a person. WhatsApp: business messages only to opted-in customers. No bulk unsolicited WhatsApp for outreach.',
                'tags' => ['policy', 'whatsapp', 'ai'],
            ],
        ];

        foreach ($faqs as $faq) {
            KnowledgeSource::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'title' => $faq['title'],
                ],
                [
                    'source_type' => 'faq',
                    'status' => 'published',
                    'body' => $faq['body'],
                    'language' => 'en',
                    'tags' => $faq['tags'],
                    'metadata' => ['seeded' => true, 'vertical' => 'jewellery'],
                ]
            );
        }
    }
}
