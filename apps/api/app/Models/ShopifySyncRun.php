<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShopifySyncRun extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'integration_id',
        'sync_type',
        'mode',
        'status',
        'records_upserted',
        'records_failed',
        'summary',
        'error_message',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'summary' => 'array',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function integration(): BelongsTo
    {
        return $this->belongsTo(Integration::class);
    }
}
