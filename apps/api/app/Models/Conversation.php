<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'contact_id',
        'integration_id',
        'channel',
        'external_conversation_id',
        'status',
        'priority',
        'assigned_user_id',
        'automation_mode',
        'detected_language',
        'last_message_at',
        'last_inbound_at',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
            'last_inbound_at' => 'datetime',
        ];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }
}
