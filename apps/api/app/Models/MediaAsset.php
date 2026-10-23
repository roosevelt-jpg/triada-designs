<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MediaAsset extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'content_item_id',
        'kind',
        'provider',
        'status',
        'mode',
        'mime_type',
        'disk',
        'path',
        'url',
        'width',
        'height',
        'aspect_ratio',
        'duration_ms',
        'prompt',
        'metadata',
        'error_message',
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

    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ContentVariant::class, 'source_media_asset_id');
    }
}
