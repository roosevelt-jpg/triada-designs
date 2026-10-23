<?php

namespace App\Services\Messaging\DTOs;

class OutboundMessage
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public function __construct(
        public readonly string $channel,
        public readonly string $recipientExternalId,
        public readonly string $body,
        public readonly string $messageType = 'text',
        public readonly ?string $pageOrAccountId = null,
        public readonly ?string $templateName = null,
        public readonly string $purpose = 'transactional',
        public readonly array $metadata = [],
    ) {
    }
}
