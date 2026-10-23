<?php

namespace App\Services\Messaging\Meta;

use App\Services\Messaging\Contracts\MessagingChannelInterface;
use App\Services\Messaging\DTOs\ChannelCapabilities;
use App\Services\Messaging\DTOs\MessageSendResult;
use App\Services\Messaging\DTOs\NormalizedMessage;
use App\Services\Messaging\DTOs\OutboundMessage;
use Illuminate\Support\Str;

class FacebookMessengerAdapter implements MessagingChannelInterface
{
    public function __construct(protected MetaGraphClient $graph)
    {
    }

    public function channelKey(): string
    {
        return 'facebook';
    }

    public function verifyWebhook(array $headers, string $rawBody): bool
    {
        $secret = (string) (config('integrations.meta.webhook_secret') ?: config('integrations.meta.app_secret') ?: '');
        if ($secret === '') {
            // Local / awaiting credentials: accept unsigned payloads for simulator and local ops.
            return $this->graph->usesLocalFallback();
        }

        $signature = (string) ($headers['x-hub-signature-256'] ?? $headers['X-Hub-Signature-256'] ?? '');
        if (! str_starts_with($signature, 'sha256=')) {
            return false;
        }

        $expected = 'sha256='.hash_hmac('sha256', $rawBody, $secret);

        return hash_equals($expected, $signature);
    }

    public function normalizeIncomingEvent(array $payload): array
    {
        $messages = [];
        $entries = $payload['entry'] ?? [];

        foreach ($entries as $entry) {
            $pageId = (string) ($entry['id'] ?? '');
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
                    channel: 'facebook',
                    providerEventId: $mid,
                    externalUserId: $sender,
                    externalConversationId: $pageId.':'.$sender,
                    pageOrAccountId: $pageId,
                    messageType: 'text',
                    body: $text !== '' ? $text : null,
                    providerMessageId: $mid,
                    timestamp: $ts,
                    metadata: [
                        'recipient_id' => $event['recipient']['id'] ?? null,
                        'raw_type' => 'messaging',
                    ],
                );
            }
        }

        return $messages;
    }

    public function sendMessage(OutboundMessage $message): MessageSendResult
    {
        $result = $this->graph->sendMessenger(
            (string) ($message->pageOrAccountId ?: 'me'),
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
            channel: 'facebook',
            supportsMessaging: true,
            supportsTemplates: false,
            supportsMedia: true,
            requiresServiceWindow: false,
            features: ['messages.send', 'messages.receive', 'webhooks', 'pages'],
        );
    }
}
