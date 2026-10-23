<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('channel_templates', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('platform'); // facebook, instagram, whatsapp, tiktok, linkedin, email, webchat, telegram, shopify
            $table->string('name');
            $table->string('slug');
            $table->string('category')->default('general'); // product_inquiry, follow_up, order, social_post, comment_dm
            $table->string('language')->default('en');
            $table->string('status')->default('draft'); // draft, pending_approval, approved, published, rejected
            $table->text('body');
            $table->json('variables')->nullable();
            $table->json('metadata')->nullable();
            $table->string('external_template_id')->nullable();
            $table->foreignUlid('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUlid('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->string('publish_mode')->nullable(); // local_sim | live
            $table->text('last_publish_error')->nullable();
            $table->timestamps();

            $table->unique(['workspace_id', 'platform', 'slug']);
            $table->index(['workspace_id', 'platform', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('channel_templates');
    }
};
