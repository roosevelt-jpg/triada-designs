<?php

namespace App\Services\JewelleryOps;

use App\Models\CustomPieceRequest;
use App\Models\Task;
use App\Models\Workspace;

class CustomPieceService
{
    public function __construct(protected TelegramAlertService $alerts)
    {
    }

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function collect(Workspace $workspace, array $input): array
    {
        $fields = [
            'piece' => $input['piece'] ?? null,
            'size' => $input['size'] ?? null,
            'metal' => $input['metal'] ?? null,
            'stone_colour' => $input['stone_colour'] ?? $input['stone_color'] ?? null,
            'engraving_text' => $input['engraving_text'] ?? $input['engraving'] ?? null,
            'budget' => $input['budget'] ?? null,
            'deadline' => $input['deadline'] ?? null,
            'consultation_mode' => $input['consultation_mode'] ?? null,
            'consultation_at' => $input['consultation_at'] ?? null,
            'photo_refs' => $input['photo_refs'] ?? [],
            'story_answers' => $input['story_answers'] ?? [],
        ];

        $missing = [];
        foreach (['piece', 'size', 'metal'] as $required) {
            if (empty($fields[$required])) {
                $missing[] = $required;
            }
        }

        $type = (string) ($input['request_type'] ?? 'custom');
        if (! empty($fields['story_answers']) || $type === 'bespoke') {
            $type = 'bespoke';
        }

        $brief = $this->buildBrief($type, $fields, $input);

        $status = $missing ? 'collecting' : 'brief_ready';
        if ($status === 'brief_ready') {
            $status = 'awaiting_quote';
        }

        $request = CustomPieceRequest::query()->create([
            'workspace_id' => $workspace->id,
            'contact_id' => $input['contact_id'] ?? null,
            'conversation_id' => $input['conversation_id'] ?? null,
            'request_type' => $type,
            'status' => $status,
            'piece' => $fields['piece'],
            'size' => $fields['size'],
            'metal' => $fields['metal'],
            'stone_colour' => $fields['stone_colour'],
            'engraving_text' => $fields['engraving_text'],
            'budget' => $fields['budget'],
            'deadline' => $fields['deadline'],
            'consultation_mode' => $fields['consultation_mode'],
            'consultation_at' => $fields['consultation_at'],
            'design_brief' => $brief,
            'story_answers' => $fields['story_answers'],
            'photo_refs' => $fields['photo_refs'],
            'human_approved' => false,
            'metadata' => [
                'pricing_note' => 'Custom quotes require human approval — bot never invents prices.',
            ],
        ]);

        $task = null;
        $alert = null;
        if ($status === 'awaiting_quote') {
            $task = Task::query()->create([
                'workspace_id' => $workspace->id,
                'contact_id' => $input['contact_id'] ?? null,
                'conversation_id' => $input['conversation_id'] ?? null,
                'type' => 'custom_quote',
                'title' => 'Price & approve custom piece request',
                'description' => $brief,
                'due_at' => now()->addDay(),
                'status' => 'open',
            ]);
            $alert = $this->alerts->send($workspace, 'custom', 'Custom / consultation request', $brief, [
                'custom_piece_request_id' => $request->id,
            ]);
        }

        return [
            'ok' => true,
            'request' => $request,
            'missing' => $missing,
            'design_brief' => $brief,
            'booking_offer' => 'Would you like a private consultation — video or in person in Dubai?',
            'task_id' => $task?->id,
            'alert' => $alert,
            'disclosure' => JewelleryKnowledge::AI_DISCLOSURE,
            'note' => 'Request goes to the team to price and approve. No price is invented by the bot.',
        ];
    }

    /**
     * @param  array<string, mixed>  $fields
     * @param  array<string, mixed>  $input
     */
    protected function buildBrief(string $type, array $fields, array $input): string
    {
        $lines = [
            'Design brief ('.$type.')',
            'Piece: '.($fields['piece'] ?: '—'),
            'Size: '.($fields['size'] ?: '—'),
            'Metal: '.($fields['metal'] ?: '—'),
            'Stone colour: '.($fields['stone_colour'] ?: '—'),
            'Engraving: '.($fields['engraving_text'] ?: '—'),
            'Budget (customer stated): '.($fields['budget'] ?: '—'),
            'Deadline: '.($fields['deadline'] ?: '—'),
            'Consultation: '.($fields['consultation_mode'] ?: 'not booked yet'),
        ];

        $story = $fields['story_answers'] ?? [];
        if (is_array($story) && $story) {
            $lines[] = 'Story / personality:';
            foreach ($story as $k => $v) {
                $lines[] = ' - '.$k.': '.(is_scalar($v) ? $v : json_encode($v));
            }
        }

        if (! empty($input['notes'])) {
            $lines[] = 'Notes: '.$input['notes'];
        }

        return implode("\n", $lines);
    }

    /**
     * @return array<string, mixed>
     */
    public function approveQuote(Workspace $workspace, string $requestId, float $price, int $userId): array
    {
        $request = CustomPieceRequest::query()
            ->where('workspace_id', $workspace->id)
            ->where('id', $requestId)
            ->firstOrFail();

        $request->forceFill([
            'quoted_price' => $price,
            'human_approved' => true,
            'status' => 'approved',
            'metadata' => array_merge($request->metadata ?? [], [
                'approved_by' => $userId,
                'approved_at' => now()->toIso8601String(),
            ]),
        ])->save();

        return ['ok' => true, 'request' => $request->fresh()];
    }
}
