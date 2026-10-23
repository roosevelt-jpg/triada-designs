<?php

namespace App\Services\Messaging\DTOs;

class MessageSendResult
{
    /**
     * @param  array<string, mixed>  $raw
     */
    public function __construct(
        public readonly bool $ok,
        public readonly string $mode,
        public readonly ?string $providerMessageId = null,
        public readonly ?string $errorCode = null,
        public readonly ?string $errorMessage = null,
        public readonly array $raw = [],
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'ok' => $this->ok,
            'mode' => $this->mode,
            'provider_message_id' => $this->providerMessageId,
            'error_code' => $this->errorCode,
            'error_message' => $this->errorMessage,
            'raw' => $this->raw,
        ];
    }
}
