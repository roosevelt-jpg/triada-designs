<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AutomationWorkflow extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'name',
        'description',
        'trigger_type',
        'definition',
        'version',
        'status',
        'created_by',
        'activated_at',
        'last_run_at',
        'run_count',
    ];

    protected function casts(): array
    {
        return [
            'definition' => 'array',
            'activated_at' => 'datetime',
            'last_run_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function runs(): HasMany
    {
        return $this->hasMany(AutomationRun::class, 'workflow_id');
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
