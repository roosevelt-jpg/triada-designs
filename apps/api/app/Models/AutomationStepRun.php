<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AutomationStepRun extends Model
{
    use HasUlids;

    protected $fillable = [
        'automation_run_id',
        'step_key',
        'node_type',
        'status',
        'input_summary',
        'output_summary',
        'error_code',
        'error_message',
        'attempt',
        'started_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'input_summary' => 'array',
            'output_summary' => 'array',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(AutomationRun::class, 'automation_run_id');
    }
}
