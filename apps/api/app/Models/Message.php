<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'conversation_id',
        'provider_message_id',
        'direction',
        'sender_type',
        'sender_id',
        'message_type',
        'body',
        'detected_language',
        'delivery_status',
        'provider_timestamp',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'provider_timestamp' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }
}
