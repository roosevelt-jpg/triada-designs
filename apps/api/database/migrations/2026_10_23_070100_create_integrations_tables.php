<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('integrations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('external_account_id')->nullable();
            $table->string('display_name');
            $table->string('status')->default('disconnected');
            $table->json('granted_scopes')->nullable();
            $table->json('capabilities')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('last_sync_at')->nullable();
            $table->timestamp('last_health_check_at')->nullable();
            $table->string('last_error_code')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'provider', 'external_account_id']);
        });

        Schema::create('integration_secrets', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('integration_id')->constrained()->cascadeOnDelete();
            $table->string('secret_type');
            $table->text('encrypted_value');
            $table->string('key_version')->default('v1');
            $table->timestamps();
        });

        Schema::create('webhook_events', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('integration_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider_event_id')->nullable();
            $table->string('event_type');
            $table->string('payload_hash')->nullable();
            $table->string('processing_status')->default('received');
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('received_at')->useCurrent();
            $table->timestamp('processed_at')->nullable();
            $table->string('last_error_code')->nullable();
            $table->unique(['integration_id', 'provider_event_id']);
        });

        Schema::create('sync_cursors', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('integration_id')->constrained()->cascadeOnDelete();
            $table->string('resource_type');
            $table->text('cursor')->nullable();
            $table->timestamp('last_success_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_cursors');
        Schema::dropIfExists('webhook_events');
        Schema::dropIfExists('integration_secrets');
        Schema::dropIfExists('integrations');
    }
};
