<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Workspace extends Model
{
    use HasUlids;

    protected $fillable = [
        'name',
        'slug',
        'timezone',
        'default_language',
        'settings',
        'automations_paused',
        'outbound_paused',
    ];

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'automations_paused' => 'boolean',
            'outbound_paused' => 'boolean',
        ];
    }

    public function automationWorkflows(): HasMany
    {
        return $this->hasMany(AutomationWorkflow::class);
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(WorkspaceMembership::class);
    }

    public function integrations(): HasMany
    {
        return $this->hasMany(Integration::class);
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class);
    }
}
