<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasUlids;

    public $timestamps = false;

    protected $fillable = [
        'workspace_id',
        'actor_type',
        'actor_id',
        'action',
        'target_type',
        'target_id',
        'request_id',
        'ip_address',
        'metadata',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }
}
