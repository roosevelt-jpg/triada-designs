<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentVariant extends Model
{
    use HasUlids;

    protected $fillable = [
        'workspace_id',
        'content_item_id',
        'source_media_asset_id',
        'media_asset_id',
        'platform_target',
        'width',
        'height',
        'aspect_ratio',
        'status',
        'mode',
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

    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class);
    }

    public function sourceMediaAsset(): BelongsTo
    {
        return $this->belongsTo(MediaAsset::class, 'source_media_asset_id');
    }

    public function mediaAsset(): BelongsTo
    {
        return $this->belongsTo(MediaAsset::class, 'media_asset_id');
    }
}
