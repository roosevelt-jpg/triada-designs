<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Contact extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'name',
        'email',
        'phone',
        'email_normalized',
        'phone_normalized',
        'preferred_language',
        'customer_type',
        'lifecycle_status',
        'source',
        'external_crm_id',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function identities(): HasMany
    {
        return $this->hasMany(ContactIdentity::class);
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
