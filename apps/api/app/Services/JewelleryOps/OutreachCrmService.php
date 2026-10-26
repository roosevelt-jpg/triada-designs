<?php

namespace App\Services\JewelleryOps;

use App\Models\OutreachMessage;
use App\Models\OutreachProspect;
use App\Models\Workspace;

class OutreachCrmService
{
    public const ALLOWED_CHANNELS = ['email', 'instagram', 'linkedin'];

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function upsertProspect(Workspace $workspace, array $input): array
    {
        $prospect = OutreachProspect::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $input['contact_id'] ?? null,
            'segment' => $input['segment'] ?? 'boutique',
            'company_name' => $input['company_name'] ?? null,
            'contact_name' => $input['contact_name'] ?? null,
            'email' => $input['email'] ?? null,
            'instagram_handle' => $input['instagram_handle'] ?? null,
            'linkedin_url' => $input['linkedin_url'] ?? null,
            'status' => 'prospect',
            'consent_recorded' => (bool) ($input['consent_recorded'] ?? false),
            'consent_at' => ! empty($input['consent_recorded']) ? now() : null,
            'preferred_channel' => in_array($input['preferred_channel'] ?? 'email', self::ALLOWED_CHANNELS, true)
                ? $input['preferred_channel']
                : 'email',
            'metadata' => ['no_bulk_whatsapp' => true],
        ]);

        return ['ok' => true, 'prospect' => $prospect];
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function draftMessage(Workspace $workspace, string $prospectId, array $input): array
    {
        $prospect = OutreachProspect::query()->where('workspace_id', $workspace->id)->where('id', $prospectId)->firstOrFail();
        $channel = (string) ($input['channel'] ?? $prospect->preferred_channel);
        if (! in_array($channel, self::ALLOWED_CHANNELS, true)) {
            return ['ok' => false, 'error' => 'Channel not allowed. Use email, Instagram, or LinkedIn — no bulk WhatsApp.'];
        }
        if ($prospect->status === 'opted_out') {
            return ['ok' => false, 'error' => 'Prospect opted out — do not message.'];
        }

        $body = (string) ($input['body'] ?? $this->defaultTemplate($prospect, $channel));
        $msg = OutreachMessage::query()->create([
            'workspace_id' => $workspace->id,
            'outreach_prospect_id' => $prospect->id,
            'channel' => $channel,
            'template_key' => $input['template_key'] ?? 'first_touch',
            'subject' => $input['subject'] ?? ('Triada Designs × '.($prospect->company_name ?: 'partnership')),
            'body' => $body,
            'status' => 'awaiting_approval',
            'human_approved' => false,
            'delivery_mode' => 'local_sim',
            'metadata' => ['opt_out_footer' => 'Reply STOP to opt out. Consent recorded: '.($prospect->consent_recorded ? 'yes' : 'pending')],
        ]);

        return [
            'ok' => true,
            'message' => $msg,
            'note' => 'Template/message requires human approval before send. No bulk WhatsApp.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function approveAndSend(Workspace $workspace, string $messageId, int $userId): array
    {
        $msg = OutreachMessage::query()->where('workspace_id', $workspace->id)->where('id', $messageId)->firstOrFail();
        if (! in_array($msg->channel, self::ALLOWED_CHANNELS, true)) {
            return ['ok' => false, 'error' => 'Refusing WhatsApp bulk outreach.'];
        }

        $msg->forceFill([
            'human_approved' => true,
            'approved_by' => $userId,
            'approved_at' => now(),
            'status' => 'sent',
            'sent_at' => now(),
            'delivery_mode' => 'local_sim',
        ])->save();

        OutreachProspect::query()->where('id', $msg->outreach_prospect_id)->update(['status' => 'sequenced']);

        return ['ok' => true, 'message' => $msg->fresh()];
    }

    protected function defaultTemplate(OutreachProspect $prospect, string $channel): string
    {
        $name = $prospect->contact_name ?: 'there';
        $company = $prospect->company_name ?: 'your space';

        return "Hi {$name},\n\nI'm reaching out from Triada Designs (Dubai jewellery). We would love to explore placing our collection with {$company}. Happy to share lookbook and wholesale terms.\n\n— Triada Designs\nReply STOP to opt out.";
    }
}
