<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IntegrationSecret extends Model
{
    use HasUlids;

    protected $fillable = [
        'integration_id',
        'secret_type',
        'encrypted_value',
        'key_version',
    ];

    protected $hidden = [
        'encrypted_value',
    ];

    public function integration(): BelongsTo
    {
        return $this->belongsTo(Integration::class);
    }

    public function setPlainValue(string $value): void
    {
        $this->encrypted_value = encrypt($value);
    }

    public function getPlainValue(): string
    {
        return decrypt($this->encrypted_value);
    }
}
