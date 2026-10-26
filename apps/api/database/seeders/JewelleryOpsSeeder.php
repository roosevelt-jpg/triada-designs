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
                'status' => filled(config('integrations.llm.anthropic.api_key'))
                    ? (strtolower((string) config('integrations.mode', 'local')) === 'live' ? 'connected' : 'local')
                    : 'awaiting_credentials',
                'capabilities' => ['llm.chat', 'agents', 'creative_prompts'],
                'metadata' => [
                    'has_api_key' => filled(config('integrations.llm.anthropic.api_key')),
                    'model' => config('integrations.llm.anthropic.model'),
                    'ui_hint' => 'Paste API key on Integrations — primary LLM when keyed; Gemini active if LLM_PROVIDER=gemini',
                ],
            ]
        );

        // Catalog aligned to live Salt & Spirit pieces on triada-designs.com (+ official GLB/photo assets).
        $products = [
            [
                'sku' => 'TD-RING-PRIEST-01',
                'title' => 'The Priest Ring',
                'description' => 'Sculptural Salt & Spirit ring. Silver with gold plating; 14K/18K on request. ~7 days to make.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 1450,
                'approved_claims' => ['silver with gold plating', 'made to order ~7 days', 'Salt & Spirit'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/priest-ring.jpg',
                    'model_url' => '/brand/models/priest-ring-v2.glb',
                    'category' => 'ring',
                    'collection' => 'Salt & Spirit',
                ],
            ],
            [
                'sku' => 'TD-RING-IMAGO-02',
                'title' => 'Imago Dei Ring',
                'description' => 'Statement ring from the Salt & Spirit collection. Confirm size against published guide.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 1680,
                'approved_claims' => ['silver with gold plating', 'made to order ~7 days'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/imago-dei-ring.jpg',
                    'model_url' => '/brand/models/imago-dei-ring-v1.glb',
                    'category' => 'ring',
                    'collection' => 'Salt & Spirit',
                ],
            ],
            [
                'sku' => 'TD-RING-WAVES-03',
                'title' => 'Open Waves',
                'description' => 'Sculptural open band ring — spiral design. Everyday Salt & Spirit piece.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 980,
                'approved_claims' => ['silver with gold plating', 'made to order ~7 days'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/open-waves.png',
                    'category' => 'ring',
                    'collection' => 'Salt & Spirit',
                ],
            ],
            [
                'sku' => 'TD-EAR-TIDES-04',
                'title' => 'Tides Treasure',
                'description' => 'Irregular gold stud earrings with flat freshwater pearls.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 720,
                'approved_claims' => ['silver with gold plating', 'freshwater pearl'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/tides-treasure.jpg',
                    'category' => 'earrings',
                    'collection' => 'Salt & Spirit',
                ],
            ],
            [
                'sku' => 'TD-PEND-FOOT-05',
                'title' => 'Footprints in the Sand',
                'description' => 'Sculptural tricolor pendant — rose, white & yellow gold — on a delicate gold-plated silver chain.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 1250,
                'approved_claims' => ['gold-plated silver', 'tricolor', 'made to order ~7 days'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/footprints-sand.jpg',
                    'category' => 'pendant',
                    'collection' => 'Salt & Spirit',
                ],
            ],
            [
                'sku' => 'TD-RING-SHELL-06',
                'title' => 'Shell Signet',
                'description' => 'Signet ring with mother of pearl. Completes Salt & Spirit sets.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 890,
                'approved_claims' => ['silver with gold plating', 'mother of pearl'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/shell-signet.png',
                    'category' => 'ring',
                    'collection' => 'Salt & Spirit',
                ],
            ],
            [
                'sku' => 'TD-NECK-TRIADA-07',
                'title' => 'The Triada Necklace',
                'description' => 'Signature Triada necklace. 14K/18K gold on request; human quote for custom.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 2100,
                'approved_claims' => ['silver with gold plating', 'gold on request'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/triada-necklace.jpg',
                    'model_url' => '/brand/models/triada-necklace-v1.glb',
                    'category' => 'necklace',
                    'collection' => 'Salt & Spirit',
                ],
            ],
            [
                'sku' => 'TD-EAR-CONV-08',
                'title' => 'Convertible Earrings',
                'description' => 'Convertible stone-pendant earrings — worn multiple ways.',
                'product_url' => 'https://triada-designs.com/',
                'price' => 1180,
                'approved_claims' => ['silver with gold plating', 'convertible'],
                'metadata' => [
                    'photo_url' => '/brand/jewellery/convertible-earrings.jpg',
                    'model_url' => '/brand/models/stone-pendant-earrings-v1.glb',
                    'category' => 'earrings',
                    'collection' => 'Salt & Spirit',
                ],
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
                'contact_email' => 'info@triada-designs.com',
                'contact_name' => 'Triada markets',
                'status' => 'watching',
                'notes' => 'd3 placement for Salt & Spirit sculptural jewellery.',
            ]
        );

        $telegramReady = filled(config('integrations.telegram.bot_token'));
        VipDropList::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'telegram_chat_id' => 'triada-vip-dubai-1',
            ],
            [
                'status' => 'active',
                'metadata' => [
                    'note' => $telegramReady
                        ? 'VIP Telegram list — bot token present; live send needs chat ID + INTEGRATION_MODE=live'
                        : 'VIP Telegram list — awaiting TELEGRAM_BOT_TOKEN',
                    'region' => 'Dubai',
                ],
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
