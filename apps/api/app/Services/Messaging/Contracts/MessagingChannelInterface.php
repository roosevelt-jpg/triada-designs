<?php

namespace App\Services\Messaging\Contracts;

use App\Services\Messaging\DTOs\ChannelCapabilities;
use App\Services\Messaging\DTOs\MessageSendResult;
use App\Services\Messaging\DTOs\NormalizedMessage;
use App\Services\Messaging\DTOs\OutboundMessage;

interface MessagingChannelInterface
{
    public function channelKey(): string;

    /**
     * @param  array<string, string|null>  $headers
     */
    public function verifyWebhook(array $headers, string $rawBody): bool;

    /**
     * @param  array<string, mixed>  $payload
     * @return list<NormalizedMessage>
     */
    public function normalizeIncomingEvent(array $payload): array;

    public function sendMessage(OutboundMessage $message): MessageSendResult;

    public function getCapabilities(): ChannelCapabilities;
}
