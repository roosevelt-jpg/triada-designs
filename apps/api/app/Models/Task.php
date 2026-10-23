<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'contact_id',
        'conversation_id',
        'lead_id',
        'assigned_user_id',
        'type',
        'title',
        'description',
        'due_at',
        'status',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }
}
