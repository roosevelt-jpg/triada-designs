<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('content_items', function (Blueprint $table) {
            if (! Schema::hasColumn('content_items', 'proposed_scheduled_for')) {
                $table->timestamp('proposed_scheduled_for')->nullable()->after('scheduled_for');
            }
        });
    }

    public function down(): void
    {
        Schema::table('content_items', function (Blueprint $table) {
            if (Schema::hasColumn('content_items', 'proposed_scheduled_for')) {
                $table->dropColumn('proposed_scheduled_for');
            }
        });
    }
};
