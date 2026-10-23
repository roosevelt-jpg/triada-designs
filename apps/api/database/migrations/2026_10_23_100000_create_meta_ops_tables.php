<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agent_configs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('key');
            $table->string('name');
            $table->string('role')->default('support');
            $table->text('description')->nullable();
            $table->string('status')->default('active'); // active|paused|draft
            $table->json('config')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'key']);
        });

        Schema::create('knowledge_sources', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('source_type')->default('faq'); // faq|policy|wordpress|manual
            $table->string('status')->default('published');
            $table->text('body')->nullable();
            $table->string('language', 16)->default('en');
            $table->json('tags')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'source_type']);
        });

        Schema::create('opportunities', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('stage')->default('discovery');
            $table->decimal('amount', 12, 2)->nullable();
            $table->string('currency', 8)->nullable();
            $table->string('source_channel')->nullable();
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expected_close_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'stage']);
        });

        Schema::table('content_items', function (Blueprint $table) {
            $table->timestamp('scheduled_for')->nullable()->after('channel');
            $table->string('campaign_key')->nullable()->after('scheduled_for');
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->unique(['workspace_id', 'provider_message_id'], 'messages_workspace_provider_message_unique');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropUnique('messages_workspace_provider_message_unique');
        });

        Schema::table('content_items', function (Blueprint $table) {
            $table->dropColumn(['scheduled_for', 'campaign_key']);
        });

        Schema::dropIfExists('opportunities');
        Schema::dropIfExists('knowledge_sources');
        Schema::dropIfExists('agent_configs');
    }
};
