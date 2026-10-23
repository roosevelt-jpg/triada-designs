<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ChannelTemplate extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'platform',
        'name',
        'slug',
        'category',
        'language',
        'status',
        'body',
        'variables',
        'metadata',
        'external_template_id',
        'created_by',
        'approved_by',
        'approved_at',
        'published_at',
        'publish_mode',
        'last_publish_error',
    ];

    protected function casts(): array
    {
        return [
            'variables' => 'array',
            'metadata' => 'array',
            'approved_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
