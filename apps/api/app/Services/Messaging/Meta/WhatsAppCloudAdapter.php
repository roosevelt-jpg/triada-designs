<?php

namespace App\Services\Messaging\Meta;

use App\Services\Messaging\Contracts\MessagingChannelInterface;
use App\Services\Messaging\DTOs\ChannelCapabilities;
use App\Services\Messaging\DTOs\MessageSendResult;
use App\Services\Messaging\DTOs\NormalizedMessage;
use App\Services\Messaging\DTOs\OutboundMessage;
use Illuminate\Support\Str;

class WhatsAppCloudAdapter implements MessagingChannelInterface
{
    public function __construct(protected MetaGraphClient $graph)
    {
    }

    public function channelKey(): string
    {
        return 'whatsapp';
    }

    public function verifyWebhook(array $headers, string $rawBody): bool
    {
        return app(FacebookMessengerAdapter::class)->verifyWebhook($headers, $rawBody);
    }

    public function normalizeIncomingEvent(array $payload): array
    {
        $messages = [];
        $entries = $payload['entry'] ?? [];

        foreach ($entries as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                $value = $change['value'] ?? [];
                $phoneNumberId = (string) ($value['metadata']['phone_number_id'] ?? '');

                foreach ($value['messages'] ?? [] as $msg) {
                    $mid = (string) ($msg['id'] ?? Str::ulid());
                    $from = (string) ($msg['from'] ?? '');
                    $text = (string) ($msg['text']['body'] ?? '');
                    $ts = isset($msg['timestamp'])
                        ? date('c', (int) $msg['timestamp'])
                        : now()->toIso8601String();

                    $messages[] = new NormalizedMessage(
                        channel: 'whatsapp',
                        providerEventId: $mid,
                        externalUserId: $from,
                        externalConversationId: $phoneNumberId.':'.$from,
                        pageOrAccountId: $phoneNumberId,
                        messageType: (string) ($msg['type'] ?? 'text'),
                        body: $text !== '' ? $text : null,
                        providerMessageId: $mid,
                        timestamp: $ts,
                        metadata: [
                            'wa_id' => $from,
                            'contact_name' => $value['contacts'][0]['profile']['name'] ?? null,
                        ],
                    );
                }
            }
        }

        return $messages;
    }

    public function sendMessage(OutboundMessage $message): MessageSendResult
    {
        $result = $this->graph->sendWhatsApp(
            $message->recipientExternalId,
            $message->body,
            [
                'template_name' => $message->templateName,
                'language' => $message->metadata['language'] ?? 'en',
            ],
        );

        return new MessageSendResult(
            ok: (bool) $result['ok'],
            mode: (string) $result['mode'],
            providerMessageId: $result['provider_message_id'] ?? null,
            errorCode: $result['error_code'] ?? null,
            errorMessage: $result['error_message'] ?? null,
            raw: $result['raw'] ?? [],
        );
    }

    public function getCapabilities(): ChannelCapabilities
    {
        return new ChannelCapabilities(
            channel: 'whatsapp',
            supportsMessaging: true,
            supportsTemplates: true,
            supportsMedia: true,
            requiresServiceWindow: true,
            features: ['messages.send', 'messages.receive', 'templates', 'webhooks', 'consent'],
        );
    }
}
