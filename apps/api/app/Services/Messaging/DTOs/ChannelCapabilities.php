<?php

namespace App\Services\Messaging\DTOs;

class ChannelCapabilities
{
    /**
     * @param  list<string>  $features
     */
    public function __construct(
        public readonly string $channel,
        public readonly bool $supportsMessaging,
        public readonly bool $supportsTemplates,
        public readonly bool $supportsMedia,
        public readonly bool $requiresServiceWindow,
        public readonly array $features = [],
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'channel' => $this->channel,
            'supports_messaging' => $this->supportsMessaging,
            'supports_templates' => $this->supportsTemplates,
            'supports_media' => $this->supportsMedia,
            'requires_service_window' => $this->requiresServiceWindow,
            'features' => $this->features,
        ];
    }
}
