<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiRun extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'agent_key',
        'purpose',
        'provider',
        'model',
        'status',
        'conversation_id',
        'contact_id',
        'prompt_tokens',
        'completion_tokens',
        'estimated_cost',
        'input',
        'output',
        'error_message',
        'latency_ms',
    ];

    protected function casts(): array
    {
        return [
            'input' => 'array',
            'output' => 'array',
            'estimated_cost' => 'decimal:6',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
