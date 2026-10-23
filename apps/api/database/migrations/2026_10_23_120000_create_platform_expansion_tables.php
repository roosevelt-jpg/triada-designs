<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_runs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('agent_key')->nullable();
            $table->string('purpose');
            $table->string('provider')->default('local_heuristic');
            $table->string('model')->nullable();
            $table->string('status')->default('completed');
            $table->string('conversation_id')->nullable();
            $table->string('contact_id')->nullable();
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('completion_tokens')->default(0);
            $table->decimal('estimated_cost', 10, 6)->nullable();
            $table->json('input')->nullable();
            $table->json('output')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'created_at']);
            $table->index(['workspace_id', 'agent_key']);
        });

        Schema::create('publications', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('content_item_id')->constrained('content_items')->cascadeOnDelete();
            $table->string('adapter')->default('local');
            $table->string('channel')->nullable();
            $table->string('status')->default('pending');
            $table->unsignedInteger('approval_version_checked')->nullable();
            $table->string('external_id')->nullable();
            $table->string('external_url')->nullable();
            $table->text('error_message')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'status']);
        });

        Schema::create('shopify_sync_runs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('integration_id')->nullable()->constrained()->nullOnDelete();
            $table->string('sync_type')->default('products');
            $table->string('mode')->default('local');
            $table->string('status')->default('completed');
            $table->unsignedInteger('records_upserted')->default(0);
            $table->unsignedInteger('records_failed')->default(0);
            $table->json('summary')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('webchat_widget_tokens', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name')->default('Website widget');
            $table->string('public_token', 64)->unique();
            $table->string('status')->default('active');
            $table->unsignedInteger('rate_limit_per_minute')->default(30);
            $table->json('allowed_origins')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        Schema::table('content_items', function (Blueprint $table) {
            if (! Schema::hasColumn('content_items', 'published_at')) {
                $table->timestamp('published_at')->nullable()->after('scheduled_for');
            }
            if (! Schema::hasColumn('content_items', 'publish_metadata')) {
                $table->json('publish_metadata')->nullable()->after('published_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('content_items', function (Blueprint $table) {
            if (Schema::hasColumn('content_items', 'publish_metadata')) {
                $table->dropColumn('publish_metadata');
            }
            if (Schema::hasColumn('content_items', 'published_at')) {
                $table->dropColumn('published_at');
            }
        });

        Schema::dropIfExists('webchat_widget_tokens');
        Schema::dropIfExists('shopify_sync_runs');
        Schema::dropIfExists('publications');
        Schema::dropIfExists('ai_runs');
    }
};
