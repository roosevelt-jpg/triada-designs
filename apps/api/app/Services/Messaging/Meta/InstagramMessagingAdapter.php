<?php

namespace App\Services\Messaging\Meta;

use App\Services\Messaging\Contracts\MessagingChannelInterface;
use App\Services\Messaging\DTOs\ChannelCapabilities;
use App\Services\Messaging\DTOs\MessageSendResult;
use App\Services\Messaging\DTOs\NormalizedMessage;
use App\Services\Messaging\DTOs\OutboundMessage;
use Illuminate\Support\Str;

class InstagramMessagingAdapter implements MessagingChannelInterface
{
    public function __construct(protected MetaGraphClient $graph)
    {
    }

    public function channelKey(): string
    {
        return 'instagram';
    }

    public function verifyWebhook(array $headers, string $rawBody): bool
    {
        return app(FacebookMessengerAdapter::class)->verifyWebhook($headers, $rawBody);
    }

    public function normalizeIncomingEvent(array $payload): array
    {
        $messages = [];
        $object = (string) ($payload['object'] ?? '');

        // Instagram messaging often arrives under object=instagram with messaging entries,
        // or nested under page entries with message.attachments / text.
        $entries = $payload['entry'] ?? [];

        foreach ($entries as $entry) {
            $accountId = (string) ($entry['id'] ?? '');

            foreach ($entry['messaging'] ?? [] as $event) {
                if (! isset($event['message']) || isset($event['message']['is_echo'])) {
                    continue;
                }

                $mid = (string) ($event['message']['mid'] ?? Str::ulid());
                $sender = (string) ($event['sender']['id'] ?? '');
                $text = (string) ($event['message']['text'] ?? '');
                $ts = isset($event['timestamp'])
                    ? date('c', (int) floor(((int) $event['timestamp']) / 1000))
                    : now()->toIso8601String();

                $messages[] = new NormalizedMessage(
                    channel: 'instagram',
                    providerEventId: $mid,
                    externalUserId: $sender,
                    externalConversationId: $accountId.':'.$sender,
                    pageOrAccountId: $accountId,
                    messageType: 'text',
                    body: $text !== '' ? $text : null,
                    providerMessageId: $mid,
                    timestamp: $ts,
                    metadata: [
                        'object' => $object ?: 'instagram',
                        'recipient_id' => $event['recipient']['id'] ?? null,
                    ],
                );
            }
        }

        return $messages;
    }

    public function sendMessage(OutboundMessage $message): MessageSendResult
    {
        $result = $this->graph->sendInstagram(
            (string) ($message->pageOrAccountId ?: 'seed-ig-triada'),
            $message->recipientExternalId,
            $message->body,
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
            channel: 'instagram',
            supportsMessaging: true,
            supportsTemplates: false,
            supportsMedia: true,
            requiresServiceWindow: false,
            features: ['messages.send', 'messages.receive', 'webhooks', 'ig_professional'],
        );
    }
}
