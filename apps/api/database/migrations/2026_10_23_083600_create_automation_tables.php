<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('automation_workflows', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('description')->nullable();
            $table->string('trigger_type');
            $table->json('definition');
            $table->unsignedInteger('version')->default(1);
            $table->string('status')->default('draft'); // draft|active|disabled
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->unsignedInteger('run_count')->default(0);
            $table->timestamps();
            $table->index(['workspace_id', 'status']);
            $table->index(['workspace_id', 'trigger_type']);
        });

        Schema::create('automation_runs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUlid('workflow_id')->constrained('automation_workflows')->cascadeOnDelete();
            $table->unsignedInteger('workflow_version');
            $table->string('trigger_type');
            $table->string('trigger_reference')->nullable();
            $table->string('mode')->default('live'); // live|dry_run
            $table->string('status')->default('pending'); // pending|running|completed|failed|cancelled
            $table->json('context')->nullable();
            $table->string('error_code')->nullable();
            $table->text('error_message')->nullable();
            $table->string('idempotency_key')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->unique(['workspace_id', 'idempotency_key']);
            $table->index(['workflow_id', 'created_at']);
        });

        Schema::create('automation_step_runs', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('automation_run_id')->constrained('automation_runs')->cascadeOnDelete();
            $table->string('step_key');
            $table->string('node_type');
            $table->string('status')->default('pending'); // pending|running|completed|failed|skipped
            $table->json('input_summary')->nullable();
            $table->json('output_summary')->nullable();
            $table->string('error_code')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedInteger('attempt')->default(1);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->index(['automation_run_id', 'step_key']);
        });

        Schema::table('workspaces', function (Blueprint $table) {
            $table->boolean('automations_paused')->default(false)->after('settings');
            $table->boolean('outbound_paused')->default(false)->after('automations_paused');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            $table->dropColumn(['automations_paused', 'outbound_paused']);
        });
        Schema::dropIfExists('automation_step_runs');
        Schema::dropIfExists('automation_runs');
        Schema::dropIfExists('automation_workflows');
    }
};
