<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class ServiceOffering extends Model
{
    use HasUlids;

    protected $table = 'services';

    protected $fillable = [
        'workspace_id',
        'name',
        'description',
        'price',
        'currency',
        'inquiry_url',
        'booking_provider',
        'availability_metadata',
        'approved_claims',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'availability_metadata' => 'array',
            'approved_claims' => 'array',
            'price' => 'decimal:2',
        ];
    }
}
