<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AutomationRun extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'workflow_id',
        'workflow_version',
        'trigger_type',
        'trigger_reference',
        'mode',
        'status',
        'context',
        'error_code',
        'error_message',
        'idempotency_key',
        'started_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'context' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function workflow(): BelongsTo
    {
        return $this->belongsTo(AutomationWorkflow::class, 'workflow_id');
    }

    public function steps(): HasMany
    {
        return $this->hasMany(AutomationStepRun::class, 'automation_run_id');
    }
}
