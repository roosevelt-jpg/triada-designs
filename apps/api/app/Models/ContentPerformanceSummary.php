<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentPerformanceSummary extends Model
{
    use HasUlids;

    protected $table = 'content_performance_summaries';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'payload' => 'array',
            'line_items' => 'array',
            'suggestions' => 'array',
            'story_answers' => 'array',
            'photo_refs' => 'array',
            'context' => 'array',
            'top_posts' => 'array',
            'metrics' => 'array',
            'whatsapp_opt_in' => 'boolean',
            'human_approved' => 'boolean',
            'vip' => 'boolean',
            'permission_to_repost' => 'boolean',
            'consent_recorded' => 'boolean',
            'subtotal' => 'decimal:2',
            'total' => 'decimal:2',
            'cost_total' => 'decimal:2',
            'profit' => 'decimal:2',
            'amount' => 'decimal:2',
            'budget_min' => 'decimal:2',
            'budget_max' => 'decimal:2',
            'budget' => 'decimal:2',
            'quoted_price' => 'decimal:2',
            'fee_aed' => 'decimal:2',
            'metal_price_per_gram' => 'decimal:4',
            'making_charge_per_gram' => 'decimal:4',
            'stock_grams' => 'decimal:3',
            'low_stock_threshold_grams' => 'decimal:3',
            'cost' => 'decimal:2',
            'sell_price' => 'decimal:2',
            'confirmed_at' => 'datetime',
            'in_production_at' => 'datetime',
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
            'issued_at' => 'datetime',
            'sent_at' => 'datetime',
            'consultation_at' => 'datetime',
            'deadline' => 'date',
            'quiet_since' => 'datetime',
            'remind_at' => 'datetime',
            'reminded_at' => 'datetime',
            'notified_at' => 'datetime',
            'run_at' => 'datetime',
            'consent_at' => 'datetime',
            'approved_at' => 'datetime',
            'starts_on' => 'date',
            'ends_on' => 'date',
            'application_deadline' => 'date',
            'price_as_of' => 'datetime',
            'week_starting' => 'date',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
