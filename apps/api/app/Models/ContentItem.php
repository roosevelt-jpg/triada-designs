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
        'scheduled_for',
        'campaign_key',
        'published_at',
        'publish_metadata',
        'creative_brief',
        'product_context',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
            'scheduled_for' => 'datetime',
            'published_at' => 'datetime',
            'publish_metadata' => 'array',
            'creative_brief' => 'array',
            'product_context' => 'array',
        ];
    }

    public function mediaAssets()
    {
        return $this->hasMany(MediaAsset::class);
    }

    public function contentVariants()
    {
        return $this->hasMany(ContentVariant::class);
    }
}
