<?php

namespace App\Services\AI;

use App\Models\AgentConfig;
use App\Models\AiRun;
use App\Models\KnowledgeSource;
use App\Models\Lead;
use App\Models\Product;
use App\Models\ServiceOffering;
use App\Models\Task;
use App\Models\Workspace;
use App\Services\AI\Contracts\LlmAdapterInterface;
use Illuminate\Support\Str;

class AiOrchestrator
{
    public function __construct(protected LlmAdapterInterface $llm)
    {
    }

    public function llmStatus(): array
    {
        return [
            'provider' => $this->llm->providerKey(),
            'model' => $this->llm->model(),
            'live' => $this->llm->isLive(),
            'honesty' => $this->llm->isLive()
                ? 'Live LLM calls enabled.'
                : 'Using local heuristic adapter until LLM_API_KEY and INTEGRATION_MODE=live.',
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function runAgent(Workspace $workspace, string $agentKey, string $purpose, array $context = []): array
    {
        $started = microtime(true);
        $agent = AgentConfig::query()
            ->where('workspace_id', $workspace->id)
            ->where('key', $agentKey)
            ->first();

        if ($agent && $agent->status === 'paused') {
            return [
                'ok' => false,
                'error' => 'Agent is paused.',
                'agent_key' => $agentKey,
            ];
        }

        $message = (string) ($context['message'] ?? $context['body'] ?? '');
        $knowledge = $this->retrieveKnowledge($workspace, $message);
        $catalog = $this->catalogHints($workspace);

        $system = $this->systemPrompt($agent, $purpose, $knowledge, $catalog);
        $prompt = $this->userPrompt($purpose, $message, $context);

        $completion = $this->llm->complete([
            'system' => $system,
            'prompt' => $prompt,
            'purpose' => $purpose,
            'temperature' => 0.2,
        ]);

        $parsed = $this->parseOutput($purpose, $completion['text'] ?? '');
        $sideEffects = [];

        if (($completion['ok'] ?? false) && empty($context['dry_run'])) {
            $sideEffects = $this->applySideEffects($workspace, $agentKey, $purpose, $parsed, $context);
        }

        $latency = (int) round((microtime(true) - $started) * 1000);

        $run = AiRun::query()->create([
            'workspace_id' => $workspace->id,
            'agent_key' => $agentKey,
            'purpose' => $purpose,
            'provider' => $completion['provider'] ?? $this->llm->providerKey(),
            'model' => $completion['model'] ?? $this->llm->model(),
            'status' => ($completion['ok'] ?? false) ? 'completed' : 'failed',
            'conversation_id' => $context['conversation_id'] ?? null,
            'contact_id' => $context['contact_id'] ?? null,
            'prompt_tokens' => (int) ($completion['prompt_tokens'] ?? 0),
            'completion_tokens' => (int) ($completion['completion_tokens'] ?? 0),
            'estimated_cost' => null,
            'input' => [
                'message' => $message,
                'purpose' => $purpose,
                'knowledge_ids' => array_column($knowledge, 'id'),
            ],
            'output' => [
                'text' => $completion['text'] ?? null,
                'parsed' => $parsed,
                'side_effects' => $sideEffects,
            ],
            'error_message' => $completion['error'] ?? null,
            'latency_ms' => $latency,
        ]);

        return [
            'ok' => (bool) ($completion['ok'] ?? false),
            'ai_run_id' => $run->id,
            'agent_key' => $agentKey,
            'purpose' => $purpose,
            'provider' => $run->provider,
            'model' => $run->model,
            'live' => $this->llm->isLive(),
            'text' => $completion['text'] ?? null,
            'parsed' => $parsed,
            'side_effects' => $sideEffects,
            'knowledge_used' => $knowledge,
            'latency_ms' => $latency,
            'error' => $completion['error'] ?? null,
        ];
    }

    /**
     * Full inbound orchestration: classify → draft → qualify → escalate.
     *
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function processInbound(Workspace $workspace, array $context): array
    {
        $classify = $this->runAgent($workspace, 'support', 'classify', $context);
        $intent = (string) data_get($classify, 'parsed.intent', 'general_inquiry');

        $draftAgent = in_array($intent, ['purchase_intent', 'service_request'], true) ? 'sales' : 'support';
        $draft = $this->runAgent($workspace, $draftAgent, 'draft_reply', array_merge($context, [
            'intent' => $intent,
        ]));

        $qualify = null;
        if (in_array($intent, ['purchase_intent', 'service_request', 'general_inquiry'], true)) {
            $qualify = $this->runAgent($workspace, 'lead_qualification', 'qualify', array_merge($context, [
                'intent' => $intent,
            ]));
        }

        $escalate = $this->runAgent($workspace, 'support', 'escalate', array_merge($context, [
            'intent' => $intent,
        ]));

        return [
            'ok' => true,
            'intent' => $intent,
            'classify' => $classify,
            'draft' => $draft,
            'qualify' => $qualify,
            'escalate' => $escalate,
            'suggested_reply' => data_get($draft, 'text'),
            'needs_human' => (bool) data_get($escalate, 'parsed.escalate', false)
                || (bool) data_get($classify, 'parsed.needs_human', false),
        ];
    }

    /**
     * @return list<array{id:string,title:string,excerpt:string}>
     */
    protected function retrieveKnowledge(Workspace $workspace, string $message): array
    {
        $query = KnowledgeSource::query()
            ->where('workspace_id', $workspace->id)
            ->where('status', 'published')
            ->orderByDesc('updated_at')
            ->limit(8)
            ->get();

        $needle = strtolower($message);
        $scored = $query->map(function (KnowledgeSource $source) use ($needle) {
            $hay = strtolower(($source->title ?? '').' '.($source->body ?? '').' '.implode(' ', $source->tags ?? []));
            $score = 0;
            foreach (preg_split('/\W+/', $needle) ?: [] as $token) {
                if (strlen($token) < 3) {
                    continue;
                }
                if (str_contains($hay, $token)) {
                    $score++;
                }
            }

            return [
                'id' => $source->id,
                'title' => $source->title,
                'excerpt' => Str::limit((string) $source->body, 280),
                'score' => $score,
            ];
        })->sortByDesc('score')->take(3)->values();

        return $scored->map(fn ($row) => [
            'id' => $row['id'],
            'title' => $row['title'],
            'excerpt' => $row['excerpt'],
        ])->all();
    }

    protected function catalogHints(Workspace $workspace): string
    {
        $products = Product::query()->where('workspace_id', $workspace->id)->orderBy('title')->limit(5)->pluck('title')->all();
        $services = ServiceOffering::query()->where('workspace_id', $workspace->id)->orderBy('name')->limit(5)->pluck('name')->all();

        return 'Products: '.implode(', ', $products ?: ['(none seeded)']).'. Services: '.implode(', ', $services ?: ['(none seeded)']).'.';
    }

    protected function systemPrompt(?AgentConfig $agent, string $purpose, array $knowledge, string $catalog): string
    {
        $role = $agent?->role ?? 'support';
        $name = $agent?->name ?? 'Triada assistant';
        $policy = (string) data_get($agent?->config, 'system_prompt', '');
        $kb = collect($knowledge)->map(fn ($k) => "- {$k['title']}: {$k['excerpt']}")->implode("\n");

        return trim(<<<TXT
You are {$name} ({$role}) for Triada Designs.
Purpose: {$purpose}.
Never invent prices, stock, reviews, or medical claims. Prefer verified knowledge.
{$policy}
Catalog: {$catalog}
Approved knowledge:
{$kb}
TXT);
    }

    protected function userPrompt(string $purpose, string $message, array $context): string
    {
        $intent = (string) ($context['intent'] ?? '');

        return "Purpose: {$purpose}\nIntent hint: {$intent}\nCustomer message:\n{$message}";
    }

    /**
     * @return array<string, mixed>
     */
    protected function parseOutput(string $purpose, string $text): array
    {
        $trimmed = trim($text);
        if (str_starts_with($trimmed, '{')) {
            try {
                $json = json_decode($trimmed, true, 512, JSON_THROW_ON_ERROR);
                if (is_array($json)) {
                    return $json;
                }
            } catch (\Throwable) {
                // fall through
            }
        }

        if (str_contains($purpose, 'classif')) {
            return ['intent' => 'general_inquiry', 'language' => 'en', 'raw_text' => $text];
        }

        if (str_contains($purpose, 'qualif')) {
            return ['score' => 50, 'stage' => 'working', 'summary' => $text];
        }

        if (str_contains($purpose, 'escalat')) {
            return ['escalate' => false, 'reason' => $text];
        }

        return ['text' => $text];
    }

    /**
     * @param  array<string, mixed>  $parsed
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    protected function applySideEffects(
        Workspace $workspace,
        string $agentKey,
        string $purpose,
        array $parsed,
        array $context
    ): array {
        $effects = [];

        if (str_contains($purpose, 'qualif') && ! empty($context['contact_id'])) {
            $score = (int) ($parsed['score'] ?? 0);
            $stage = (string) ($parsed['stage'] ?? ($score >= 70 ? 'qualified' : 'new'));
            $lead = Lead::query()->updateOrCreate(
                [
                    'workspace_id' => $workspace->id,
                    'contact_id' => $context['contact_id'],
                ],
                [
                    'stage' => $stage,
                    'score' => $score,
                    'source_channel' => $context['channel'] ?? null,
                    'qualification_data' => [
                        'summary' => (string) ($parsed['summary'] ?? 'AI qualification'),
                        'provider' => 'ai_orchestrator',
                    ],
                    'score_reasons' => [
                        'ai_score' => $score,
                        'intent' => $context['intent'] ?? null,
                    ],
                ]
            );
            $effects['lead_id'] = $lead->id;
            $effects['lead_stage'] = $stage;
        }

        if (! empty($parsed['escalate']) || ($agentKey === 'sales_ops' && ($parsed['create_task'] ?? false))) {
            $task = Task::query()->create([
                'workspace_id' => $workspace->id,
                'contact_id' => $context['contact_id'] ?? null,
                'conversation_id' => $context['conversation_id'] ?? null,
                'lead_id' => $effects['lead_id'] ?? ($context['lead_id'] ?? null),
                'type' => 'escalation',
                'title' => 'AI escalation follow-up',
                'description' => (string) ($parsed['reason'] ?? 'Human review requested by orchestrator.'),
                'due_at' => now()->addHours(4),
                'status' => 'open',
            ]);
            $effects['task_id'] = $task->id;
        }

        return $effects;
    }
}
