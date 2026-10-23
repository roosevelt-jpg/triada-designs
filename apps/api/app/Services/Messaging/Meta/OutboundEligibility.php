<?php

namespace App\Services\Messaging\Meta;

use App\Models\Conversation;
use App\Models\Workspace;
use Carbon\Carbon;

class OutboundEligibility
{
    /**
     * @param  array<string, mixed>  $context
     * @return array{eligible:bool,reason:?string,requires_template:bool,window_open:bool}
     */
    public function check(
        Workspace $workspace,
        ?Conversation $conversation,
        string $channel,
        string $purpose = 'transactional',
        ?string $templateName = null,
        array $context = []
    ): array {
        if ($workspace->outbound_paused) {
            return $this->deny('outbound_paused', false, false);
        }

        if ($conversation && $conversation->automation_mode === 'human' && ($context['sender_type'] ?? 'ai') === 'ai') {
            return $this->deny('human_takeover', false, $this->windowOpen($conversation, $channel));
        }

        if (($context['marketing_opt_out'] ?? false) === true && $purpose === 'marketing') {
            return $this->deny('marketing_opt_out', false, $this->windowOpen($conversation, $channel));
        }

        if (($context['consent'] ?? true) === false) {
            return $this->deny('consent_required', false, false);
        }

        $windowOpen = $this->windowOpen($conversation, $channel);

        if ($channel === 'whatsapp' && ! $windowOpen) {
            if (! filled($templateName)) {
                return $this->deny('whatsapp_template_required', true, false);
            }

            return [
                'eligible' => true,
                'reason' => null,
                'requires_template' => true,
                'window_open' => false,
            ];
        }

        return [
            'eligible' => true,
            'reason' => null,
            'requires_template' => false,
            'window_open' => $windowOpen,
        ];
    }

    protected function windowOpen(?Conversation $conversation, string $channel): bool
    {
        if (! $conversation || ! $conversation->last_inbound_at) {
            return $channel !== 'whatsapp';
        }

        $hours = $channel === 'whatsapp' ? 24 : 24;
        $deadline = Carbon::parse($conversation->last_inbound_at)->addHours($hours);

        return now()->lte($deadline);
    }

    /**
     * @return array{eligible:bool,reason:?string,requires_template:bool,window_open:bool}
     */
    protected function deny(string $reason, bool $requiresTemplate, bool $windowOpen): array
    {
        return [
            'eligible' => false,
            'reason' => $reason,
            'requires_template' => $requiresTemplate,
            'window_open' => $windowOpen,
        ];
    }
}
