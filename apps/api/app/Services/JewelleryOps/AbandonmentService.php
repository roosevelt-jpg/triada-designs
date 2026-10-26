<?php

namespace App\Services\JewelleryOps;

use App\Models\AbandonmentEvent;
use App\Models\Workspace;

class AbandonmentService
{
    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function track(Workspace $workspace, array $input): array
    {
        $type = (string) ($input['event_type'] ?? 'cart');
        $event = AbandonmentEvent::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $input['contact_id'] ?? null,
            'conversation_id' => $input['conversation_id'] ?? null,
            'event_type' => $type,
            'status' => 'open',
            'channel' => $input['channel'] ?? 'webchat',
            'context' => $input['context'] ?? [],
            'quiet_since' => now(),
            'remind_at' => now()->addDay(),
            'whatsapp_opt_in' => (bool) ($input['whatsapp_opt_in'] ?? false),
            'metadata' => [],
        ]);

        return [
            'ok' => true,
            'event' => $event,
            'note' => 'One friendly reminder scheduled after 1 day if still quiet.',
        ];
    }

    /**
     * Process due reminders (1 day).
     *
     * @return array<string, mixed>
     */
    public function processDue(Workspace $workspace): array
    {
        $due = AbandonmentEvent::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', 'open')
            ->where('remind_at', '<=', now())
            ->limit(50)
            ->get();

        $sent = [];
        foreach ($due as $event) {
            $channel = $event->whatsapp_opt_in ? 'whatsapp' : ($event->channel ?: 'email');
            if ($channel === 'whatsapp' && ! $event->whatsapp_opt_in) {
                $channel = 'email';
            }

            $body = $event->event_type === 'sizing'
                ? "Friendly note from Triada Designs — still happy to help with sizing. I'm the AI assistant; a person can join anytime."
                : "Friendly reminder from Triada Designs — your piece is still waiting in the cart. I'm the AI assistant if you have questions.";

            $event->forceFill([
                'status' => 'reminded',
                'reminded_at' => now(),
                'metadata' => [
                    'reminder' => [
                        'channel' => $channel,
                        'body' => $body,
                        'mode' => 'local_sim',
                        'business_only' => $channel === 'whatsapp',
                    ],
                ],
            ])->save();

            $sent[] = $event->fresh();
        }

        return ['ok' => true, 'processed' => count($sent), 'events' => $sent];
    }
}
