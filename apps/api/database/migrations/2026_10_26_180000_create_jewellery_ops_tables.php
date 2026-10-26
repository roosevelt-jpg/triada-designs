<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('commerce_orders', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('order_number')->index();
            $table->string('external_order_id')->nullable();
            $table->string('channel')->default('shopify');
            $table->string('lifecycle_status')->default('confirmed'); // confirmed|in_production|shipped|delivered|cancelled
            $table->string('currency', 8)->default('AED');
            $table->decimal('subtotal', 12, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);
            $table->decimal('cost_total', 12, 2)->nullable();
            $table->decimal('profit', 12, 2)->nullable();
            $table->string('tracking_number')->nullable();
            $table->string('tracking_url')->nullable();
            $table->boolean('whatsapp_opt_in')->default(false);
            $table->string('customer_phone')->nullable();
            $table->string('customer_email')->nullable();
            $table->json('line_items')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('in_production_at')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'order_number']);
        });

        Schema::create('invoices', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('commerce_order_id')->nullable()->constrained('commerce_orders')->nullOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('invoice_number');
            $table->string('type')->default('b2c'); // b2c|b2b
            $table->string('status')->default('draft'); // draft|issued|sent|void
            $table->string('currency', 8)->default('AED');
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('accounting_ref')->nullable();
            $table->string('einvoice_provider')->nullable(); // uae_einvoice path
            $table->string('einvoice_status')->nullable(); // local_sim|queued|submitted|accepted
            $table->string('pdf_path')->nullable();
            $table->string('pdf_mode')->default('local_sim');
            $table->json('line_items')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'invoice_number']);
        });

        Schema::create('gift_sessions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('conversation_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status')->default('collecting'); // collecting|suggested|handed_off|closed
            $table->string('recipient')->nullable();
            $table->string('occasion')->nullable();
            $table->string('budget_band')->nullable();
            $table->decimal('budget_min', 12, 2)->nullable();
            $table->decimal('budget_max', 12, 2)->nullable();
            $table->json('suggestions')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('custom_piece_requests', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('conversation_id')->nullable()->constrained()->nullOnDelete();
            $table->string('request_type')->default('custom'); // custom|bespoke|consultation
            $table->string('status')->default('collecting'); // collecting|brief_ready|awaiting_quote|quoted|approved|declined
            $table->string('piece')->nullable();
            $table->string('size')->nullable();
            $table->string('metal')->nullable();
            $table->string('stone_colour')->nullable();
            $table->string('engraving_text')->nullable();
            $table->decimal('budget', 12, 2)->nullable();
            $table->date('deadline')->nullable();
            $table->string('consultation_mode')->nullable(); // video|in_person
            $table->timestamp('consultation_at')->nullable();
            $table->text('design_brief')->nullable();
            $table->json('story_answers')->nullable();
            $table->json('photo_refs')->nullable();
            $table->decimal('quoted_price', 12, 2)->nullable();
            $table->boolean('human_approved')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('waitlist_entries', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('sku')->nullable();
            $table->string('size')->nullable();
            $table->string('colour')->nullable();
            $table->string('channel')->nullable();
            $table->string('notify_via')->default('email'); // email|whatsapp|telegram|sms
            $table->string('status')->default('waiting'); // waiting|notified|fulfilled|cancelled
            $table->boolean('vip')->default(false);
            $table->timestamp('notified_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'status']);
        });

        Schema::create('abandonment_events', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('conversation_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event_type'); // cart|sizing
            $table->string('status')->default('open'); // open|reminded|recovered|closed
            $table->string('channel')->nullable();
            $table->json('context')->nullable();
            $table->timestamp('quiet_since')->nullable();
            $table->timestamp('remind_at')->nullable();
            $table->timestamp('reminded_at')->nullable();
            $table->boolean('whatsapp_opt_in')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'status', 'remind_at']);
        });

        Schema::create('telegram_alerts', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('alert_type'); // wholesale|boutique|stylist|interior|corporate|custom|big_order|tag|drop|popup|low_stock
            $table->string('priority')->default('high');
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('status')->default('queued'); // queued|sent|local_sim|failed
            $table->string('delivery_mode')->default('local_sim');
            $table->string('external_message_id')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'created_at']);
        });

        Schema::create('after_sale_jobs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('commerce_order_id')->nullable()->constrained('commerce_orders')->nullOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('job_type'); // care_tips|review_request|complete_the_set|ugc_invite
            $table->string('status')->default('scheduled'); // scheduled|sent|skipped|failed
            $table->timestamp('run_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->string('channel')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'status', 'run_at']);
        });

        Schema::create('ugc_items', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('commerce_order_id')->nullable()->constrained('commerce_orders')->nullOnDelete();
            $table->string('item_type')->default('tag_alert'); // invite|tag_alert|repost_candidate
            $table->string('platform')->nullable(); // instagram|tiktok|facebook
            $table->string('external_post_url')->nullable();
            $table->string('external_post_id')->nullable();
            $table->string('status')->default('new'); // new|permission_requested|approved|declined|reposted
            $table->boolean('permission_to_repost')->default(false);
            $table->string('reward_offer')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('outreach_prospects', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('segment'); // boutique|stylist|interior|corporate|gifting|past_enquiry
            $table->string('company_name')->nullable();
            $table->string('contact_name')->nullable();
            $table->string('email')->nullable();
            $table->string('instagram_handle')->nullable();
            $table->string('linkedin_url')->nullable();
            $table->string('status')->default('prospect'); // prospect|sequenced|replied|interested|closed|opted_out
            $table->boolean('consent_recorded')->default(false);
            $table->timestamp('consent_at')->nullable();
            $table->string('preferred_channel')->default('email'); // email|instagram|linkedin — never bulk WA
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'segment', 'status']);
        });

        Schema::create('outreach_messages', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('outreach_prospect_id')->constrained('outreach_prospects')->cascadeOnDelete();
            $table->string('channel'); // email|instagram|linkedin
            $table->string('template_key')->nullable();
            $table->string('subject')->nullable();
            $table->text('body');
            $table->string('status')->default('draft'); // draft|awaiting_approval|approved|sent|replied|failed
            $table->boolean('human_approved')->default(false);
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->string('delivery_mode')->default('local_sim');
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('popup_markets', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('venue')->nullable();
            $table->string('city')->default('Dubai');
            $table->string('emirate')->default('Dubai');
            $table->string('market_type')->nullable(); // popup|designer_space|festival|market
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->date('application_deadline')->nullable();
            $table->decimal('fee_aed', 12, 2)->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_name')->nullable();
            $table->string('status')->default('watching'); // watching|alerted|applying|applied|accepted|declined|passed
            $table->text('notes')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('popup_applications', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('popup_market_id')->constrained('popup_markets')->cascadeOnDelete();
            $table->string('status')->default('draft'); // draft|awaiting_approval|approved|sent|accepted|declined
            $table->string('subject')->nullable();
            $table->text('body')->nullable();
            $table->boolean('human_approved')->default(false);
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->string('result')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('manufacturer_materials', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('material_key'); // silver|gold_plate|14k|18k|stone_etc
            $table->string('display_name');
            $table->string('unit')->default('g');
            $table->decimal('metal_price_per_gram', 12, 4)->nullable();
            $table->decimal('making_charge_per_gram', 12, 4)->nullable();
            $table->decimal('stock_grams', 12, 3)->nullable();
            $table->decimal('low_stock_threshold_grams', 12, 3)->nullable();
            $table->string('currency', 8)->default('AED');
            $table->timestamp('price_as_of')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'material_key']);
        });

        Schema::create('manufacturer_orders', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('commerce_order_id')->nullable()->constrained('commerce_orders')->nullOnDelete();
            $table->string('external_ref')->nullable();
            $table->string('status')->default('queued'); // queued|sent|accepted|in_production|ready|shipped|cancelled
            $table->string('piece')->nullable();
            $table->string('sku')->nullable();
            $table->string('size')->nullable();
            $table->string('metal')->nullable();
            $table->string('engraving')->nullable();
            $table->decimal('cost', 12, 2)->nullable();
            $table->decimal('sell_price', 12, 2)->nullable();
            $table->decimal('profit', 12, 2)->nullable();
            $table->string('delivery_mode')->default('local_sim');
            $table->json('payload')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });

        Schema::create('content_performance_summaries', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->date('week_starting');
            $table->string('status')->default('draft'); // draft|ready|sent
            $table->json('top_posts')->nullable();
            $table->json('metrics')->nullable();
            $table->text('summary_text')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'week_starting']);
        });

        Schema::create('vip_drop_lists', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('telegram_chat_id')->nullable();
            $table->string('status')->default('active');
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vip_drop_lists');
        Schema::dropIfExists('content_performance_summaries');
        Schema::dropIfExists('manufacturer_orders');
        Schema::dropIfExists('manufacturer_materials');
        Schema::dropIfExists('popup_applications');
        Schema::dropIfExists('popup_markets');
        Schema::dropIfExists('outreach_messages');
        Schema::dropIfExists('outreach_prospects');
        Schema::dropIfExists('ugc_items');
        Schema::dropIfExists('after_sale_jobs');
        Schema::dropIfExists('telegram_alerts');
        Schema::dropIfExists('abandonment_events');
        Schema::dropIfExists('waitlist_entries');
        Schema::dropIfExists('custom_piece_requests');
        Schema::dropIfExists('gift_sessions');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('commerce_orders');
    }
};
