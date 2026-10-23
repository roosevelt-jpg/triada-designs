<?php

namespace App\Http\Controllers\Webhooks;

use App\Http\Controllers\Controller;
use App\Models\Workspace;
use App\Services\Messaging\Channels\ChannelControlPlane;
use App\Services\Messaging\Channels\ChannelInboundProcessor;
use App\Services\Messaging\DTOs\NormalizedMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ChannelWebhookController extends Controller
{
    public function telegram(
        Request $request,
        ChannelInboundProcessor $processor
    ): JsonResponse {
        return $this->ingestGeneric($request, $processor, 'telegram', function (array $payload) {
            $message = $payload['message'] ?? $payload['edited_message'] ?? null;
            if (! $message) {
                return null;
            }

            $from = (string) ($message['from']['id'] ?? 'unknown');
            $text = (string) ($message['text'] ?? '');
            $updateId = (string) ($payload['update_id'] ?? Str::ulid());

            return new NormalizedMessage(
                channel: 'telegram',
                providerEventId: $updateId,
                externalUserId: $from,
                externalConversationId: 'telegram:'.($message['chat']['id'] ?? $from),
                pageOrAccountId: null,
                messageType: 'text',
                body: $text,
                providerMessageId: (string) ($message['message_id'] ?? $updateId),
                timestamp: now()->toIso8601String(),
                metadata: [
                    'contact_name' => trim(($message['from']['first_name'] ?? '').' '.($message['from']['last_name'] ?? '')),
                    'username' => $message['from']['username'] ?? null,
                ],
            );
        });
    }

    public function tiktok(
        Request $request,
        ChannelInboundProcessor $processor
    ): JsonResponse {
        return $this->ingestGeneric($request, $processor, 'tiktok', function (array $payload) {
            $eventId = (string) ($payload['event_id'] ?? $payload['id'] ?? Str::ulid());
            $userId = (string) ($payload['from_user_id'] ?? $payload['sender']['id'] ?? 'tiktok-user');
            $text = (string) ($payload['text'] ?? $payload['message']['text'] ?? '');

            if ($text === '' && empty($payload['simulated'])) {
                return null;
            }

            return new NormalizedMessage(
                channel: 'tiktok',
                providerEventId: $eventId,
                externalUserId: $userId,
                externalConversationId: 'tiktok:'.$userId,
                pageOrAccountId: null,
                messageType: 'text',
                body: $text !== '' ? $text : 'TikTok inbound event',
                providerMessageId: (string) ($payload['message_id'] ?? $eventId),
                timestamp: now()->toIso8601String(),
                metadata: ['raw_keys' => array_keys($payload)],
            );
        });
    }

    public function email(
        Request $request,
        ChannelControlPlane $channels
    ): JsonResponse {
        // Local/provider-agnostic inbound email webhook shape.
        $data = $request->validate([
            'from' => ['required', 'email'],
            'subject' => ['nullable', 'string'],
            'body' => ['required', 'string'],
            'message_id' => ['nullable', 'string'],
        ]);

        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return response()->json(['message' => 'Workspace not found.'], 404);
        }

        $secret = (string) config('integrations.email.webhook_secret', '');
        if ($secret !== '') {
            $provided = (string) $request->header('X-Email-Webhook-Secret', '');
            if (! hash_equals($secret, $provided)) {
                return response()->json(['message' => 'Invalid email webhook secret.'], 401);
            }
        }

        $result = $channels->simulateInbound($workspace, 'email', [
            'body' => trim(($data['subject'] ?? '')."\n\n".$data['body']),
            'external_user_id' => $data['from'],
            'contact_name' => $data['from'],
            'email' => $data['from'],
            'provider_event_id' => $data['message_id'] ?? null,
        ]);

        return response()->json($result);
    }

    /**
     * @param  callable(array<string,mixed>):(?NormalizedMessage)  $normalizer
     */
    protected function ingestGeneric(
        Request $request,
        ChannelInboundProcessor $processor,
        string $channel,
        callable $normalizer
    ): JsonResponse {
        $workspace = Workspace::query()->where('slug', 'triada-designs')->first();
        if (! $workspace) {
            return response()->json(['message' => 'Workspace not found.'], 404);
        }

        $cfgSecret = (string) config('integrations.'.$channel.'.webhook_secret', '');
        if ($cfgSecret !== '') {
            $provided = (string) ($request->header('X-Telegram-Bot-Api-Secret-Token')
                ?: $request->header('X-Channel-Webhook-Secret')
                ?: '');
            if (! hash_equals($cfgSecret, $provided)) {
                return response()->json(['message' => 'Invalid webhook secret.'], 401);
            }
        }

        $payload = $request->all();
        $item = $normalizer($payload);
        if (! $item) {
            return response()->json(['ok' => true, 'ignored' => true]);
        }

        $result = $processor->ingestNormalized($workspace, $channel, $item, $request->getContent());

        return response()->json($result);
    }
}
