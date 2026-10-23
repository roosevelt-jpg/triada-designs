<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media_assets', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
            $table->string('kind')->default('image'); // image | video | animation
            $table->string('provider')->default('local_sim');
            $table->string('status')->default('ready'); // pending | ready | failed
            $table->string('mode')->default('local_sim'); // local_sim | live | awaiting_credentials
            $table->string('mime_type')->nullable();
            $table->string('disk')->default('local');
            $table->string('path')->nullable();
            $table->string('url')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('aspect_ratio')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('prompt')->nullable();
            $table->json('metadata')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'content_item_id']);
            $table->index(['workspace_id', 'kind']);
        });

        Schema::create('content_variants', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
            $table->foreignUlid('source_media_asset_id')->nullable()->constrained('media_assets')->nullOnDelete();
            $table->foreignUlid('media_asset_id')->nullable()->constrained('media_assets')->nullOnDelete();
            $table->string('platform_target'); // instagram_feed, facebook_post, ...
            $table->unsignedInteger('width');
            $table->unsignedInteger('height');
            $table->string('aspect_ratio')->nullable();
            $table->string('status')->default('ready');
            $table->string('mode')->default('local_sim');
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'content_item_id']);
            $table->index(['workspace_id', 'platform_target']);
        });

        Schema::table('content_items', function (Blueprint $table) {
            if (! Schema::hasColumn('content_items', 'creative_brief')) {
                $table->json('creative_brief')->nullable()->after('publish_metadata');
            }
            if (! Schema::hasColumn('content_items', 'product_context')) {
                $table->json('product_context')->nullable()->after('creative_brief');
            }
        });
    }

    public function down(): void
    {
        Schema::table('content_items', function (Blueprint $table) {
            if (Schema::hasColumn('content_items', 'product_context')) {
                $table->dropColumn('product_context');
            }
            if (Schema::hasColumn('content_items', 'creative_brief')) {
                $table->dropColumn('creative_brief');
            }
        });

        Schema::dropIfExists('content_variants');
        Schema::dropIfExists('media_assets');
    }
};
