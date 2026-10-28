/**
 * JS agent orchestration for Next dual-run.
 * Retrieves training docs (RAG-style) into Anthropic system prompts.
 * Hard rule: never fabricate off-brand words — retrieve docs when unsure.
 */

import { completeAnthropic } from "./anthropic-client";
import { getAnthropicStatus } from "@/lib/integrations/anthropic-credentials";
import { retrieveTrainingDocs } from "@/lib/training/training-docs-store";
import { BRAND, warmGreeting, brandAddressPlain } from "@/lib/brand/identity";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";
import { buildAgents } from "@/lib/api/seed-data";

/**
 * @param {{
 *   agent_key?: string,
 *   agent?: Record<string, unknown>,
 *   purpose?: string,
 *   message?: string,
 *   dry_run?: boolean,
 *   context?: Record<string, unknown>,
 * }} input
 */
export async function runAgentOrchestration(input = {}) {
  const started = Date.now();
  const purpose = String(input.purpose || "draft_reply");
  const message = String(input.message || input.context?.message || "").trim();
  const agentKey = String(input.agent_key || input.agent?.key || "answer_bot");
  const agents = buildAgents();
  const agent =
    input.agent ||
    agents.find((a) => a.id === agentKey || a.key === agentKey || a.name === agentKey) ||
    agents[0] ||
    { name: "Triada assistant", config: {} };

  const training = await retrieveTrainingDocs(message || purpose, { limit: 4 });
  const status = await getAnthropicStatus();
  const system = buildSystemPrompt({
    agent,
    purpose,
    training,
    customPrompt: agent?.config?.system_prompt,
  });
  const userPrompt = [
    `Purpose: ${purpose}`,
    input.context?.intent ? `Intent hint: ${input.context.intent}` : "",
    `Customer message:\n${message || "(empty)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  let completion = await completeAnthropic({
    system,
    prompt: userPrompt,
    temperature: 0.2,
    max_tokens: 1024,
  });

  let text = completion.text || "";
  let mode = completion.mode;

  if (!completion.ok || !text) {
    text = localHeuristicReply({ message, purpose, training });
    mode = completion.mode === "awaiting_credentials" ? "local_sim" : mode || "local_sim";
    completion = {
      ...completion,
      ok: true,
      text,
      provider: completion.provider || "local_sim",
      mode,
    };
  }

  const branded = ensureBrandedOutboundText(text, {
    greetingKind: purpose.includes("after") ? "after_sale" : "default",
    customerName:
      typeof input.context?.customer_name === "string"
        ? input.context.customer_name
        : undefined,
  });

  return {
    ok: true,
    agent_key: agentKey,
    agent_name: agent?.name || "Triada assistant",
    purpose,
    provider: completion.provider,
    model: completion.model || status.model,
    mode: completion.mode || mode,
    live: completion.mode === "live" && status.has_credentials,
    text: branded.text,
    output: branded.text,
    branded: true,
    logo_url: branded.logo_url,
    training_used: training,
    training_ids: training.map((t) => t.id),
    dry_run: Boolean(input.dry_run),
    latency_ms: Date.now() - started,
    rules: {
      no_fabrication: true,
      retrieve_when_unsure: true,
      brand_wrappers: true,
    },
  };
}

/**
 * @param {{
 *   agent: Record<string, unknown>,
 *   purpose: string,
 *   training: Array<{ title: string, excerpt: string, category: string }>,
 *   customPrompt?: unknown,
 * }} opts
 */
export function buildSystemPrompt(opts) {
  const name = String(opts.agent?.name || "Triada assistant");
  const role = String(opts.agent?.role || opts.agent?.config?.role || "support");
  const policy = String(opts.customPrompt || "").trim();
  const kb = (opts.training || [])
    .map((k) => `- [${k.category}] ${k.title}: ${k.excerpt}`)
    .join("\n");

  return `You are ${name} (${role}) for ${BRAND.name} — jewellery and Salt & Spirit collections.
Purpose: ${opts.purpose}.

Hard rules:
- Disclose you are an AI assistant and that a person is available on request.
- NEVER invent prices, stock, delivery promises, custom quotes, or off-brand words.
- When unsure of tone, timing, open/close wording, or policy — use the Training Docs below. If still unsure, say you will connect a human.
- Start customer-facing replies with a warm Triada greeting when appropriate.
- End threads with Triada contact/address when closing.
- WhatsApp: business messages only to opted-in customers. Broadcasts need human approval.
- Materials: silver with gold plating; 14K and 18K gold on request. Typical make time ~7 days.

Brand contact footer (use when closing):
${brandAddressPlain()}

${policy ? `Agent policy:\n${policy}\n` : ""}
Training docs (authoritative — retrieve & obey; do not fabricate beyond these):
${kb || "(none loaded — escalate rather than invent)"}
`;
}

/**
 * Local heuristic when Anthropic is not keyed — still grounded in training docs.
 * @param {{ message: string, purpose: string, training: Array<{ title: string, excerpt: string }> }} opts
 */
function localHeuristicReply(opts) {
  const greeting = warmGreeting("default");
  const msg = opts.message.toLowerCase();
  const fromDocs = opts.training.map((t) => t.excerpt).join(" ");

  let core =
    "Thank you for writing. Our Salt & Spirit pieces are silver with gold plating; 14K/18K gold on request. Typical make time is about 7 days. Prices come from the approved catalog only.";

  if (/ship|deliver|international/.test(msg)) {
    core =
      "Thank you for asking about shipping. We confirm delivery options from approved policy only — a specialist can confirm rates for your destination.";
  } else if (/price|cost|how much/.test(msg)) {
    core =
      "I’d love to help with pricing from our approved catalog. A specialist can confirm the exact piece and quote — I won’t invent prices.";
  } else if (/care|clean|plate/.test(msg)) {
    core =
      "Care tip: store dry, wipe gently after wear, and avoid harsh chemicals. Reply if you’d like more care guidance.";
  } else if (fromDocs && /warm|greeting|tone/.test(fromDocs.toLowerCase())) {
    core =
      "I’m here to help with materials, care, and order updates in Triada’s warm brand voice. How may we assist your piece today?";
  }

  return `${greeting}\n\n${core}\n\nIf you’d like a person, just say the word — we’re glad to connect you.`;
}
