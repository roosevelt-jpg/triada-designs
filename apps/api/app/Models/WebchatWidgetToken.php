<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebchatWidgetToken extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'name',
        'public_token',
        'status',
        'rate_limit_per_minute',
        'allowed_origins',
        'metadata',
        'last_used_at',
    ];

    protected function casts(): array
    {
        return [
            'allowed_origins' => 'array',
            'metadata' => 'array',
            'last_used_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
