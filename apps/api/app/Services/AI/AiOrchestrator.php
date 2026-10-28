<?php

namespace App\Services\AI;

use App\Models\AgentConfig;
use App\Models\AiRun;
use App\Models\ContentItem;
use App\Models\KnowledgeSource;
use App\Models\Lead;
use App\Models\Product;
use App\Models\ServiceOffering;
use App\Models\Task;
use App\Models\Workspace;
use App\Services\AI\Contracts\LlmAdapterInterface;
use App\Services\Creative\CreativeMediaService;
use App\Services\Creative\JewelleryPromptBuilder;
use Illuminate\Support\Str;

class AiOrchestrator
{
    public function __construct(protected LlmAdapterInterface $llm)
    {
    }

    public function llmStatus(): array
    {
        $store = app(LlmCredentialStore::class);
        $configured = $this->normalizeProvider((string) config('integrations.llm.provider', 'anthropic'));
        $anthropicKey = filled($store->anthropicApiKey());
        $geminiKey = filled(config('integrations.llm.gemini.api_key'))
            || ($configured === 'gemini' && filled(config('integrations.llm.api_key')));
        $openaiKey = filled(config('integrations.llm.api_key'));
        $live = $this->llm->isLive();

        $status = match (true) {
            $live => 'live',
            $configured === 'anthropic' && ! $anthropicKey => 'awaiting_credentials',
            $configured === 'gemini' && ! $geminiKey => 'awaiting_credentials',
            $configured === 'openai_compatible' && ! $openaiKey => 'awaiting_credentials',
            default => 'local',
        };

        $honesty = match ($status) {
            'live' => 'Live LLM calls enabled via '.$this->llm->providerKey().'.',
            'awaiting_credentials' => match ($configured) {
                'anthropic' => 'Add Anthropic API key on Integrations (or ANTHROPIC_API_KEY). Using local heuristic until credentials are present — never fake Claude success.',
                'gemini' => 'Add GEMINI_API_KEY to enable Gemini. Using local heuristic until credentials are present.',
                default => 'Add LLM_API_KEY and set INTEGRATION_MODE=live for openai_compatible. Using local heuristic until credentials are present.',
            },
            default => 'Using local heuristic adapter (LLM_PROVIDER=local or credentials not live).',
        };

        $hasCredentials = match ($configured) {
            'anthropic' => $anthropicKey,
            'gemini' => $geminiKey,
            'local' => false,
            default => $openaiKey,
        };

        $model = match ($configured) {
            'anthropic' => $store->anthropicModel(),
            'gemini' => (string) (config('integrations.llm.gemini.model') ?: $this->llm->model()),
            default => $this->llm->model(),
        };

        return [
            'configured_provider' => $configured,
            'provider' => $this->llm->providerKey(),
            'model' => $model,
            'live' => $live,
            'status' => $status,
            'has_credentials' => $hasCredentials,
            'honesty' => $honesty,
            'env_hint' => $configured === 'anthropic'
                ? 'Paste Anthropic API key on Integrations, or set ANTHROPIC_API_KEY (optional ANTHROPIC_MODEL) in apps/api/.env, then restart the API.'
                : 'Set LLM_PROVIDER, credentials, and INTEGRATION_MODE=live as needed.',
            'integrations_path' => '/integrations',
        ];
    }

    protected function normalizeProvider(string $provider): string
    {
        $normalized = strtolower(str_replace('-', '_', trim($provider)));

        return match ($normalized) {
            'claude', 'anthropic_claude' => 'anthropic',
            'openai', 'openai_compatible', 'http', 'http_llm' => 'openai_compatible',
            'gemini', 'google', 'google_gemini' => 'gemini',
            'local', 'heuristic', 'local_heuristic' => 'local',
            default => $normalized !== '' ? $normalized : 'anthropic',
        };
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
You are {$name} ({$role}) for Triada Designs — jewellery and Salt & Spirit collections.
Purpose: {$purpose}.
You collaborate with the Triada agent team via shared context; hand off clearly when unsure.
Hard rules:
- Disclose you are an AI assistant and that a person is available on request.
- Never invent prices, stock, delivery promises, discounts, reviews, or custom quotes — use approved knowledge only; escalate when unsure.
- When unsure of tone, timing, open/close, or policy — use approved knowledge below; otherwise connect a human or Escalation officer.
- Materials: silver with gold plating; 14K and 18K gold on request. Typical make time ~7 days per piece.
- WhatsApp: business messages only (orders, products, support) to opted-in customers.
- Posts, broadcasts, and custom quotes require human approval before sending.
- Never mention internal tooling or implementation details in customer-facing copy.
- Match the customer's language on every reply (including Arabic, Romanian, German, French, Russian, Spanish, Portuguese, English). Shared team notes may stay in English; customer-facing text follows the customer.
Agent policy:
{$policy}
Catalog: {$catalog}
Approved knowledge (authoritative — do not fabricate beyond these):
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

    /**
     * Allowlisted creative tools for marketing / content agents.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function runCreativeTool(Workspace $workspace, string $agentKey, string $tool, array $payload = []): array
    {
        if (! CreativeToolAllowlist::allows($agentKey, $tool)) {
            return [
                'ok' => false,
                'error' => "Tool {$tool} is not allowlisted for agent {$agentKey}.",
                'allowlist' => CreativeToolAllowlist::catalog(),
            ];
        }

        $contentId = $payload['content_item_id'] ?? null;
        $item = null;
        if ($contentId) {
            $item = ContentItem::query()
                ->where('workspace_id', $workspace->id)
                ->where('id', $contentId)
                ->first();
        }

        $creativeToolsNeedingItem = [
            'generate_image',
            'generate_platform_variants',
            'generate_short_video',
            'generate_animation',
            'ensure_creative_pack',
        ];

        if (! $item && in_array($tool, $creativeToolsNeedingItem, true)) {
            $item = ContentItem::query()->create([
                'workspace_id' => $workspace->id,
                'title' => (string) ($payload['title'] ?? 'AI creative draft'),
                'content_type' => 'social_post',
                'objective' => (string) ($payload['objective'] ?? 'awareness'),
                'status' => 'draft',
                'body' => (string) ($payload['caption'] ?? $payload['message'] ?? ''),
                'channel' => (string) ($payload['channel'] ?? 'instagram'),
                'approval_version' => 0,
                'product_context' => array_filter([
                    'name' => $payload['product'] ?? null,
                    'materials' => $payload['materials'] ?? null,
                ]),
            ]);
        }

        $creative = app(CreativeMediaService::class);
        $prompts = app(JewelleryPromptBuilder::class);

        $result = match ($tool) {
            'propose_creative_brief' => [
                'ok' => true,
                'brief' => $prompts->creativeBrief(
                    (string) ($payload['caption'] ?? $item?->body ?? $payload['message'] ?? ''),
                    $payload
                ),
                'mode' => 'brief_only',
                'note' => 'Brief proposed — generate tools and human approval still required before publish.',
            ],
            'generate_image' => $creative->generateImage($workspace, $item, $payload),
            'generate_platform_variants' => $creative->generateVariants(
                $workspace,
                $item,
                $payload['source_media_asset_id'] ?? null,
                $payload['platforms'] ?? null
            ),
            'generate_short_video' => $creative->generateVideo($workspace, $item, $payload),
            'generate_animation' => $creative->generateAnimation($workspace, $item, $payload),
            'ensure_creative_pack' => $creative->ensureCreativePack($workspace, $item, $payload),
            default => ['ok' => false, 'error' => 'Unknown tool'],
        };

        AiRun::query()->create([
            'workspace_id' => $workspace->id,
            'agent_key' => $agentKey,
            'purpose' => 'creative_tool:'.$tool,
            'provider' => $this->llm->providerKey(),
            'model' => $this->llm->model(),
            'status' => ($result['ok'] ?? false) ? 'completed' : 'failed',
            'input' => ['tool' => $tool, 'payload' => $payload],
            'output' => [
                'mode' => $result['mode'] ?? null,
                'content_item_id' => $item?->id,
                'asset_id' => data_get($result, 'asset.id'),
                'variant_count' => isset($result['variants']) ? count($result['variants']) : null,
            ],
            'error_message' => $result['error'] ?? null,
            'latency_ms' => null,
        ]);

        return array_merge($result, [
            'agent_key' => $agentKey,
            'tool' => $tool,
            'content_item_id' => $item?->id,
            'approval_required' => true,
            'allowlist' => CreativeToolAllowlist::catalog(),
        ]);
    }
}
