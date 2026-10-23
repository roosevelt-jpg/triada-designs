<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class ContentItem extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'title',
        'content_type',
        'objective',
        'status',
        'created_by',
        'approved_by',
        'approved_at',
        'approval_version',
        'body',
        'channel',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
        ];
    }
}
