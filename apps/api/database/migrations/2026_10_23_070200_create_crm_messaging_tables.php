<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('email_normalized')->nullable();
            $table->string('phone_normalized')->nullable();
            $table->string('preferred_language', 16)->nullable();
            $table->string('customer_type')->nullable();
            $table->string('lifecycle_status')->default('lead');
            $table->string('source')->nullable();
            $table->string('external_crm_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'email_normalized']);
            $table->index(['workspace_id', 'phone_normalized']);
        });

        Schema::create('contact_identities', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('external_identity_id');
            $table->string('identity_type')->default('user');
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'provider', 'external_identity_id'], 'contact_identities_unique');
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('integration_id')->nullable()->constrained()->nullOnDelete();
            $table->string('channel');
            $table->string('external_conversation_id')->nullable();
            $table->string('status')->default('open');
            $table->string('priority')->default('normal');
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('automation_mode')->default('ai');
            $table->string('detected_language', 16)->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamp('last_inbound_at')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'status', 'last_message_at']);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('conversation_id')->constrained()->cascadeOnDelete();
            $table->string('provider_message_id')->nullable();
            $table->string('direction');
            $table->string('sender_type');
            $table->string('sender_id')->nullable();
            $table->string('message_type')->default('text');
            $table->text('body')->nullable();
            $table->string('detected_language', 16)->nullable();
            $table->string('delivery_status')->default('received');
            $table->timestamp('provider_timestamp')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['conversation_id', 'created_at']);
        });

        Schema::create('leads', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $table->string('source_channel')->nullable();
            $table->string('stage')->default('new_lead');
            $table->unsignedInteger('score')->default(0);
            $table->json('score_reasons')->nullable();
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('estimated_value', 12, 2)->nullable();
            $table->string('currency', 8)->nullable();
            $table->json('qualification_data')->nullable();
            $table->string('external_crm_id')->nullable();
            $table->timestamps();
            $table->index(['workspace_id', 'stage']);
        });

        Schema::create('tasks', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('conversation_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignUlid('lead_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('assigned_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type')->default('follow_up');
            $table->string('title');
            $table->text('description')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->string('status')->default('open');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('integration_id')->nullable()->constrained()->nullOnDelete();
            $table->string('external_product_id')->nullable();
            $table->string('sku')->nullable();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('product_url')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->string('currency', 8)->nullable();
            $table->string('availability_status')->default('unknown');
            $table->string('published_status')->default('draft');
            $table->json('approved_claims')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });

        Schema::create('services', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->string('currency', 8)->nullable();
            $table->string('inquiry_url')->nullable();
            $table->string('booking_provider')->nullable();
            $table->json('availability_metadata')->nullable();
            $table->json('approved_claims')->nullable();
            $table->string('status')->default('active');
            $table->timestamps();
        });

        Schema::create('content_items', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('content_type')->default('social_post');
            $table->string('objective')->nullable();
            $table->string('status')->default('draft');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->unsignedInteger('approval_version')->nullable();
            $table->text('body')->nullable();
            $table->string('channel')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_items');
        Schema::dropIfExists('services');
        Schema::dropIfExists('products');
        Schema::dropIfExists('tasks');
        Schema::dropIfExists('leads');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
        Schema::dropIfExists('contact_identities');
        Schema::dropIfExists('contacts');
    }
};
