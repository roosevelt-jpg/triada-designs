<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'integration_id',
        'external_product_id',
        'sku',
        'title',
        'description',
        'product_url',
        'price',
        'currency',
        'availability_status',
        'published_status',
        'approved_claims',
        'metadata',
        'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'approved_claims' => 'array',
            'metadata' => 'array',
            'price' => 'decimal:2',
            'synced_at' => 'datetime',
        ];
    }
}
