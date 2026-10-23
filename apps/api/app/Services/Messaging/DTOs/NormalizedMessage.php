<?php

namespace App\Services\Messaging\DTOs;

class NormalizedMessage
{
    /**
     * @param  array<string, mixed>  $metadata
     */
    public function __construct(
        public readonly string $channel,
        public readonly string $providerEventId,
        public readonly string $externalUserId,
        public readonly ?string $externalConversationId,
        public readonly ?string $pageOrAccountId,
        public readonly string $messageType,
        public readonly ?string $body,
        public readonly ?string $providerMessageId,
        public readonly ?string $timestamp,
        public readonly array $metadata = [],
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'channel' => $this->channel,
            'provider_event_id' => $this->providerEventId,
            'external_user_id' => $this->externalUserId,
            'external_conversation_id' => $this->externalConversationId,
            'page_or_account_id' => $this->pageOrAccountId,
            'message_type' => $this->messageType,
            'body' => $this->body,
            'provider_message_id' => $this->providerMessageId,
            'timestamp' => $this->timestamp,
            'metadata' => $this->metadata,
        ];
    }
}
