<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Integration extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'provider',
        'external_account_id',
        'display_name',
        'status',
        'granted_scopes',
        'capabilities',
        'token_expires_at',
        'last_sync_at',
        'last_health_check_at',
        'last_error_code',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'granted_scopes' => 'array',
            'capabilities' => 'array',
            'metadata' => 'array',
            'token_expires_at' => 'datetime',
            'last_sync_at' => 'datetime',
            'last_health_check_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function secrets(): HasMany
    {
        return $this->hasMany(IntegrationSecret::class);
    }
}
