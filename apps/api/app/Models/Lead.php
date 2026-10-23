<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Lead extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'contact_id',
        'source_channel',
        'stage',
        'score',
        'score_reasons',
        'assigned_user_id',
        'estimated_value',
        'currency',
        'qualification_data',
        'external_crm_id',
    ];

    protected function casts(): array
    {
        return [
            'score_reasons' => 'array',
            'qualification_data' => 'array',
            'estimated_value' => 'decimal:2',
        ];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }
}
