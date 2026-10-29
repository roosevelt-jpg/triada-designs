/**
 * Workflow Builder Assistant — admin describes intent; we build a full
 * visual definition (wired trigger → actions → end). Storage is JSON;
 * the edit surface remains the visual builder. Anthropic when keyed;
 * otherwise a jewellery-ops heuristic so Production stays usable.
 */

import { completeAnthropic } from "@/lib/agents/anthropic-client";
import {
  ACTION_TYPES,
  TRIGGER_TYPES,
  layoutNodes,
  normalizeDefinition,
} from "@/lib/workflow-definition";

const ACTION_SET = new Set(ACTION_TYPES);
const TRIGGER_SET = new Set(TRIGGER_TYPES);

/**
 * @param {string} text
 */
function slugKey(text, fallback = "node") {
  const base = String(text || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28);
  return base || fallback;
}

/**
 * @param {Array<Record<string, unknown>>} nodeList
 * @param {string} entryHint
 */
function assembleDefinition(nodeList, entryHint = "") {
  /** @type {Record<string, object>} */
  const nodes = {};
  /** @type {string[]} */
  const order = [];

  for (const raw of nodeList) {
    if (!raw || typeof raw !== "object") continue;
    let key = String(raw.key || raw.id || "").trim();
    if (!key) key = slugKey(raw.label || raw.type || "node");
    let unique = key;
    let i = 1;
    while (nodes[unique]) unique = `${key}_${i++}`;

    const type = String(raw.type || "action");
    /** @type {Record<string, unknown>} */
    const config =
      raw.config && typeof raw.config === "object"
        ? { .../** @type {Record<string, unknown>} */ (raw.config) }
        : {};

    if (type === "trigger") {
      const tt = String(config.trigger_type || raw.trigger_type || "incoming_message");
      config.trigger_type = TRIGGER_SET.has(tt) ? tt : "incoming_message";
    }
    if (type === "action") {
      const at = String(config.action_type || raw.action_type || "notify_team");
      config.action_type = ACTION_SET.has(at) ? at : "notify_team";
    }
    if (type === "delay" && config.seconds == null) config.seconds = 3600;
    if (type === "condition") {
      if (!config.field) config.field = "intent";
      if (!config.operator) config.operator = "equals";
      if (config.value == null) config.value = "";
    }

    /** @type {Record<string, unknown>} */
    const node = {
      type,
      label: String(raw.label || type),
      config,
    };

    if (type === "condition") {
      node.next_true = raw.next_true || raw.nextTrue || null;
      node.next_false = raw.next_false || raw.nextFalse || null;
    } else if (type !== "end") {
      node.next = raw.next || null;
    }

    nodes[unique] = node;
    order.push(unique);
  }

  // Wire linear next pointers when the model omitted them.
  for (let i = 0; i < order.length; i++) {
    const key = order[i];
    const node = nodes[key];
    if (!node || node.type === "end" || node.type === "condition") continue;
    if (!node.next) {
      const nxt = order[i + 1];
      if (nxt) node.next = nxt;
    } else if (!nodes[String(node.next)]) {
      node.next = order[i + 1] || null;
    }
  }
  for (const key of order) {
    const node = nodes[key];
    if (!node || node.type !== "condition") continue;
    if (node.next_true && !nodes[String(node.next_true)]) node.next_true = null;
    if (node.next_false && !nodes[String(node.next_false)]) node.next_false = null;
  }

  let entry =
    (entryHint && nodes[entryHint] && entryHint) ||
    order.find((k) => nodes[k]?.type === "trigger") ||
    order[0] ||
    "";

  const draft = normalizeDefinition({ entry, nodes, layout: {} });
  draft.layout = layoutNodes(draft);
  return draft;
}

/**
 * Heuristic jewellery-ops workflows when LLM is unavailable.
 * @param {string} prompt
 */
export function heuristicWorkflowFromPrompt(prompt) {
  const q = String(prompt || "").toLowerCase();

  if (/abandon|cart|sizing.*remind|left.*cart/.test(q)) {
    return {
      name: "Cart / sizing abandonment",
      description: String(prompt).trim().slice(0, 240),
      trigger_type: "cart_abandoned",
      nodes: [
        {
          key: "trig",
          type: "trigger",
          label: "Cart abandoned",
          config: { trigger_type: "cart_abandoned" },
          next: "delay1",
        },
        {
          key: "delay1",
          type: "delay",
          label: "Wait 1 day",
          config: { seconds: 86400 },
          next: "remind",
        },
        {
          key: "remind",
          type: "action",
          label: "Abandonment remind",
          config: { action_type: "abandonment_remind" },
          next: "end1",
        },
        { key: "end1", type: "end", label: "End" },
      ],
    };
  }

  if (/gift/.test(q)) {
    return {
      name: "Gift finder",
      description: String(prompt).trim().slice(0, 240),
      trigger_type: "incoming_message",
      nodes: [
        {
          key: "trig",
          type: "trigger",
          label: "Incoming message",
          config: { trigger_type: "incoming_message" },
          next: "gift",
        },
        {
          key: "gift",
          type: "action",
          label: "Gift finder",
          config: { action_type: "gift_finder_suggest" },
          next: "end1",
        },
        { key: "end1", type: "end", label: "End" },
      ],
    };
  }

  if (/custom|bespoke|engrav|consult/.test(q)) {
    return {
      name: "Custom piece intake",
      description: String(prompt).trim().slice(0, 240),
      trigger_type: "incoming_message",
      nodes: [
        {
          key: "trig",
          type: "trigger",
          label: "Incoming message",
          config: { trigger_type: "incoming_message" },
          next: "collect",
        },
        {
          key: "collect",
          type: "action",
          label: "Collect custom details",
          config: { action_type: "collect_custom_piece" },
          next: "handoff",
        },
        {
          key: "handoff",
          type: "human_handoff",
          label: "Human quote approval",
          config: { reason: "custom_quote" },
          next: "end1",
        },
        { key: "end1", type: "end", label: "End" },
      ],
    };
  }

  if (/order|ship|deliver|lifecycle|invoice/.test(q)) {
    return {
      name: "Order lifecycle notices",
      description: String(prompt).trim().slice(0, 240),
      trigger_type: "order_lifecycle_changed",
      nodes: [
        {
          key: "trig",
          type: "trigger",
          label: "Order updated",
          config: { trigger_type: "order_lifecycle_changed" },
          next: "life",
        },
        {
          key: "life",
          type: "action",
          label: "Order lifecycle message",
          config: { action_type: "order_lifecycle_message" },
          next: "invoice",
        },
        {
          key: "invoice",
          type: "action",
          label: "Create invoice",
          config: { action_type: "create_invoice" },
          next: "end1",
        },
        { key: "end1", type: "end", label: "End" },
      ],
    };
  }

  if (/whatsapp|wa |meta|instagram|messenger|facebook/.test(q)) {
    return {
      name: "Meta inbound reply",
      description: String(prompt).trim().slice(0, 240),
      trigger_type: "incoming_meta_message",
      nodes: [
        {
          key: "trig",
          type: "trigger",
          label: "Meta inbound",
          config: { trigger_type: "incoming_meta_message" },
          next: "opt",
        },
        {
          key: "opt",
          type: "action",
          label: "Check WA opt-out",
          config: { action_type: "check_whatsapp_opt_out" },
          next: "ai",
        },
        {
          key: "ai",
          type: "action",
          label: "AI reply",
          config: { action_type: "ai_reply" },
          next: "send",
        },
        {
          key: "send",
          type: "action",
          label: "Send eligible reply",
          config: { action_type: "send_eligible_reply" },
          next: "end1",
        },
        { key: "end1", type: "end", label: "End" },
      ],
    };
  }

  if (/after.?sale|care|thank/.test(q)) {
    return {
      name: "After-sale follow-up",
      description: String(prompt).trim().slice(0, 240),
      trigger_type: "shopify_order_updated",
      nodes: [
        {
          key: "trig",
          type: "trigger",
          label: "Order delivered",
          config: { trigger_type: "shopify_order_updated" },
          next: "delay1",
        },
        {
          key: "delay1",
          type: "delay",
          label: "Wait 2 days",
          config: { seconds: 172800 },
          next: "follow",
        },
        {
          key: "follow",
          type: "action",
          label: "After-sale follow-up",
          config: { action_type: "after_sale_followup" },
          next: "end1",
        },
        { key: "end1", type: "end", label: "End" },
      ],
    };
  }

  // Default: answer-bot FAQ with human handoff when unsure
  return {
    name: "Answer-bot jewellery FAQ",
    description: String(prompt || "Incoming questions → answer-bot with human handoff.").trim().slice(0, 240),
    trigger_type: "incoming_message",
    nodes: [
      {
        key: "trig",
        type: "trigger",
        label: "Incoming message",
        config: { trigger_type: "incoming_message" },
        next: "bot",
      },
      {
        key: "bot",
        type: "action",
        label: "Answer-bot",
        config: { action_type: "answer_bot_reply" },
        next: "check",
      },
      {
        key: "check",
        type: "condition",
        label: "Needs human?",
        config: { field: "needs_human", operator: "equals", value: "true" },
        next_true: "handoff",
        next_false: "send",
      },
      {
        key: "handoff",
        type: "human_handoff",
        label: "Assign human",
        config: { reason: "unsure" },
        next: "end1",
      },
      {
        key: "send",
        type: "action",
        label: "Send reply",
        config: { action_type: "send_eligible_reply" },
        next: "end1",
      },
      { key: "end1", type: "end", label: "End" },
    ],
  };
}

/**
 * @param {string} raw
 */
function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Build a full visual workflow from a natural-language brief.
 * @param {{ prompt: string }} input
 */
export async function buildWorkflowFromPrompt(input) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) {
    return { ok: false, error: "Describe the workflow you want.", status: 422 };
  }

  const system = [
    "You are the Triada Designs Workflow Builder Assistant.",
    "Return ONLY valid JSON (no markdown) for a jewellery ops visual workflow.",
    "Schema: { name, description, trigger_type, entry, nodes: [{ key, type, label, config, next?, next_true?, next_false? }] }",
    `Allowed trigger_type values: ${TRIGGER_TYPES.join(", ")}`,
    `Allowed action config.action_type values: ${ACTION_TYPES.join(", ")}`,
    "Node types: trigger, condition, action, delay, ai_task, human_handoff, end.",
    "Wire every non-end node with next (or next_true/next_false for conditions).",
    "Include a trigger and an end. Prefer Triada jewellery flows (WhatsApp, Meta DMs, orders, abandonment, gift finder, custom pieces).",
    "Never invent credentials or mention JSON as the admin edit UI — this becomes a visual canvas.",
  ].join("\n");

  const completion = await completeAnthropic({
    system,
    prompt: `Build the full workflow for this admin brief:\n\n${prompt}`,
    max_tokens: 1800,
    temperature: 0.2,
    timeout_ms: 35_000,
  });

  let draft = null;
  let mode = "heuristic";

  if (completion.ok && completion.text) {
    const parsed = extractJsonObject(completion.text);
    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length) {
      draft = parsed;
      mode = "anthropic";
    }
  }

  if (!draft) {
    draft = heuristicWorkflowFromPrompt(prompt);
    mode = completion.mode === "awaiting_credentials" ? "heuristic_awaiting_credentials" : "heuristic";
  }

  const definition = assembleDefinition(
    /** @type {Array<Record<string, unknown>>} */ (draft.nodes || []),
    String(draft.entry || ""),
  );
  const trigger_type =
    (draft.trigger_type && TRIGGER_SET.has(String(draft.trigger_type))
      ? String(draft.trigger_type)
      : null) ||
    definition.nodes?.[definition.entry]?.config?.trigger_type ||
    "incoming_message";

  const name =
    String(draft.name || "").trim() ||
    prompt.slice(0, 60) ||
    "New workflow";
  const description =
    String(draft.description || prompt).trim().slice(0, 400) || prompt.slice(0, 400);

  const nodeCount = Object.keys(definition.nodes || {}).length;
  if (!definition.entry || nodeCount < 2) {
    return { ok: false, error: "Assistant could not build a usable workflow.", status: 422 };
  }

  return {
    ok: true,
    mode,
    provider: completion.provider || "local",
    name,
    description,
    trigger_type: String(trigger_type),
    definition,
    summary: `${nodeCount} nodes · trigger ${String(trigger_type).replaceAll("_", " ")}`,
  };
}
