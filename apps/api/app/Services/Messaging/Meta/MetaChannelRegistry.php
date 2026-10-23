<?php

namespace App\Services\Messaging\Meta;

use App\Services\Messaging\Contracts\MessagingChannelInterface;
use InvalidArgumentException;

class MetaChannelRegistry
{
    public function __construct(
        protected FacebookMessengerAdapter $facebook,
        protected InstagramMessagingAdapter $instagram,
        protected WhatsAppCloudAdapter $whatsapp,
    ) {
    }

    public function get(string $channel): MessagingChannelInterface
    {
        return match ($channel) {
            'facebook', 'messenger' => $this->facebook,
            'instagram' => $this->instagram,
            'whatsapp' => $this->whatsapp,
            default => throw new InvalidArgumentException("Unsupported Meta channel: {$channel}"),
        };
    }

    /**
     * @return list<MessagingChannelInterface>
     */
    public function all(): array
    {
        return [$this->facebook, $this->instagram, $this->whatsapp];
    }

    public function resolveFromPayload(array $payload): ?MessagingChannelInterface
    {
        $object = (string) ($payload['object'] ?? '');

        if ($object === 'page' || $object === 'facebook') {
            return $this->facebook;
        }

        if ($object === 'instagram') {
            return $this->instagram;
        }

        if ($object === 'whatsapp_business_account') {
            return $this->whatsapp;
        }

        // Heuristic for local simulator payloads that omit object.
        if (isset($payload['entry'][0]['changes'])) {
            return $this->whatsapp;
        }

        if (isset($payload['entry'][0]['messaging'])) {
            $channelHint = $payload['channel'] ?? null;
            if ($channelHint === 'instagram') {
                return $this->instagram;
            }

            return $this->facebook;
        }

        return null;
    }
}
