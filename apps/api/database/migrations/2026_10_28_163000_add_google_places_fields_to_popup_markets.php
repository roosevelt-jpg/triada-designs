<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('popup_markets', function (Blueprint $table) {
            $table->string('country')->nullable()->after('venue');
            $table->string('town')->nullable()->after('city');
            $table->string('place_id')->nullable()->after('notes');
            $table->string('formatted_address')->nullable()->after('place_id');
            $table->decimal('lat', 10, 7)->nullable()->after('formatted_address');
            $table->decimal('lng', 10, 7)->nullable()->after('lat');
        });
    }

    public function down(): void
    {
        Schema::table('popup_markets', function (Blueprint $table) {
            $table->dropColumn([
                'country',
                'town',
                'place_id',
                'formatted_address',
                'lat',
                'lng',
            ]);
        });
    }
};
