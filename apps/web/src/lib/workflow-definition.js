/** Helpers for the visual workflow builder. JSON is storage only — never the edit surface. */

export const NODE_TYPES = [
  { value: "trigger", label: "Trigger" },
  { value: "condition", label: "Condition" },
  { value: "action", label: "Action" },
  { value: "delay", label: "Delay" },
  { value: "ai_task", label: "AI task" },
  { value: "human_handoff", label: "Human handoff" },
  { value: "end", label: "End" },
];

export const TRIGGER_TYPES = [
  "incoming_message",
  "incoming_meta_message",
  "whatsapp_template_needed",
  "new_contact",
  "lead_qualified",
  "conversation_escalated",
  "follow_up_due",
  "content_approved",
  "shopify_order_updated",
  "manual",
];

export const ACTION_TYPES = [
  "create_task",
  "update_lead_stage",
  "assign_conversation",
  "add_tag",
  "notify_team",
  "draft_reply",
  "ai_classify",
  "ai_qualify",
  "ai_escalate",
  "send_eligible_reply",
  "create_content_draft",
  "sync_zoho_lead",
];

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "exists",
];

const NODE_W = 220;
const NODE_H = 88;
const GAP_X = 48;
const GAP_Y = 72;

/**
 * @param {Record<string, unknown>} definition
 * @returns {{ entry: string, nodes: Record<string, object> }}
 */
export function normalizeDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    return { entry: "", nodes: {} };
  }
  const nodes = { ...(definition.nodes || {}) };
  const entry = typeof definition.entry === "string" ? definition.entry : "";
  return { entry, nodes };
}

/**
 * @param {{ entry: string, nodes: Record<string, object> }} definition
 */
export function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(normalizeDefinition(definition)));
}

/**
 * Auto-layout nodes top-to-bottom with branch columns.
 * @param {{ entry: string, nodes: Record<string, object> }} definition
 * @returns {Record<string, { x: number, y: number }>}
 */
export function layoutNodes(definition) {
  const { entry, nodes } = normalizeDefinition(definition);
  const positions = {};
  const keys = Object.keys(nodes);
  if (keys.length === 0) return positions;

  const visited = new Set();
  const depthMap = {};
  const laneMap = {};

  function walk(key, depth, lane) {
    if (!key || !nodes[key] || visited.has(key)) return;
    visited.add(key);
    depthMap[key] = depth;
    laneMap[key] = lane;
    const node = nodes[key];
    if (node.next) {
      walk(node.next, depth + 1, lane);
    }
    if (node.next_true || node.next_false) {
      walk(node.next_true, depth + 1, lane - 1);
      walk(node.next_false, depth + 1, lane + 1);
    }
  }

  if (entry && nodes[entry]) {
    walk(entry, 0, 0);
  }

  // Place orphans not reachable from entry
  let orphanDepth = Math.max(0, ...Object.values(depthMap), -1) + 1;
  keys.forEach((key) => {
    if (!visited.has(key)) {
      depthMap[key] = orphanDepth++;
      laneMap[key] = 0;
    }
  });

  const lanes = Object.values(laneMap);
  const minLane = Math.min(...lanes, 0);

  keys.forEach((key) => {
    const depth = depthMap[key] ?? 0;
    const lane = (laneMap[key] ?? 0) - minLane;
    positions[key] = {
      x: 48 + lane * (NODE_W + GAP_X),
      y: 48 + depth * (NODE_H + GAP_Y),
    };
  });

  return positions;
}

export function canvasSize(positions) {
  const vals = Object.values(positions);
  if (vals.length === 0) return { width: 640, height: 360 };
  const maxX = Math.max(...vals.map((p) => p.x));
  const maxY = Math.max(...vals.map((p) => p.y));
  return {
    width: Math.max(640, maxX + NODE_W + 80),
    height: Math.max(360, maxY + NODE_H + 80),
  };
}

export { NODE_W, NODE_H };

/**
 * @param {{ entry: string, nodes: Record<string, object> }} definition
 * @returns {Array<{ from: string, to: string, kind: "next"|"next_true"|"next_false" }>}
 */
export function collectEdges(definition) {
  const { nodes } = normalizeDefinition(definition);
  const edges = [];
  Object.entries(nodes).forEach(([key, node]) => {
    if (node.next) edges.push({ from: key, to: node.next, kind: "next" });
    if (node.next_true) edges.push({ from: key, to: node.next_true, kind: "next_true" });
    if (node.next_false) edges.push({ from: key, to: node.next_false, kind: "next_false" });
  });
  return edges;
}

function slugify(label) {
  return String(label || "node")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
}

/**
 * @param {{ entry: string, nodes: Record<string, object> }} definition
 * @param {{ type: string, label?: string }} opts
 */
export function addNode(definition, opts) {
  const next = cloneDefinition(definition);
  const type = opts.type || "action";
  const label = opts.label || NODE_TYPES.find((t) => t.value === type)?.label || "Node";
  let base = `${type.slice(0, 4)}_${slugify(label)}`;
  let key = base;
  let i = 1;
  while (next.nodes[key]) {
    key = `${base}_${i++}`;
  }

  const config = defaultConfigFor(type);
  next.nodes[key] = {
    type,
    label,
    config,
    ...(type === "condition"
      ? { next_true: null, next_false: null }
      : type === "end"
        ? {}
        : { next: null }),
  };

  if (!next.entry && type === "trigger") {
    next.entry = key;
  }

  return { definition: next, key };
}

export function defaultConfigFor(type) {
  if (type === "trigger") return { trigger_type: "incoming_message" };
  if (type === "condition") {
    return { field: "intent", operator: "equals", value: "" };
  }
  if (type === "action") {
    return { action_type: "notify_team", message: "" };
  }
  if (type === "delay") return { duration_seconds: 60 };
  if (type === "ai_task") return { purpose: "draft_reply" };
  if (type === "human_handoff") return { reason: "" };
  return {};
}

/**
 * @param {{ entry: string, nodes: Record<string, object> }} definition
 * @param {string} key
 */
export function removeNode(definition, key) {
  const next = cloneDefinition(definition);
  delete next.nodes[key];
  if (next.entry === key) {
    const firstTrigger = Object.entries(next.nodes).find(([, n]) => n.type === "trigger");
    next.entry = firstTrigger ? firstTrigger[0] : Object.keys(next.nodes)[0] || "";
  }
  Object.values(next.nodes).forEach((node) => {
    if (node.next === key) node.next = null;
    if (node.next_true === key) node.next_true = null;
    if (node.next_false === key) node.next_false = null;
  });
  return next;
}

/**
 * @param {{ entry: string, nodes: Record<string, object> }} definition
 * @param {string} key
 * @param {object} patch
 */
export function updateNode(definition, key, patch) {
  const next = cloneDefinition(definition);
  if (!next.nodes[key]) return next;
  const node = next.nodes[key];
  if (patch.label !== undefined) node.label = patch.label;
  if (patch.type !== undefined) {
    node.type = patch.type;
    if (patch.type === "condition") {
      delete node.next;
      if (!("next_true" in node)) node.next_true = null;
      if (!("next_false" in node)) node.next_false = null;
    } else if (patch.type === "end") {
      delete node.next;
      delete node.next_true;
      delete node.next_false;
    } else {
      delete node.next_true;
      delete node.next_false;
      if (!("next" in node)) node.next = null;
    }
  }
  if (patch.config !== undefined) {
    node.config = { ...(node.config || {}), ...patch.config };
  }
  if (patch.next !== undefined) node.next = patch.next || null;
  if (patch.next_true !== undefined) node.next_true = patch.next_true || null;
  if (patch.next_false !== undefined) node.next_false = patch.next_false || null;
  return next;
}

export function setEntry(definition, key) {
  const next = cloneDefinition(definition);
  if (next.nodes[key]) next.entry = key;
  return next;
}

export function defaultContextFor(triggerType) {
  if (triggerType === "incoming_message") {
    return {
      intent: "product_inquiry",
      channel: "webchat",
      automation_mode: "ai",
    };
  }
  if (triggerType === "incoming_meta_message") {
    return {
      intent: "product_inquiry",
      channel: "instagram",
      automation_mode: "ai",
    };
  }
  if (triggerType === "whatsapp_template_needed") {
    return {
      channel: "whatsapp",
      requires_whatsapp_template: true,
      automation_mode: "ai",
    };
  }
  if (triggerType === "content_approved") {
    return { content_title: "Warm neutrals for spring rituals" };
  }
  if (triggerType === "lead_qualified") {
    return { lead_score: 82 };
  }
  return {};
}

export function nodeTypeIcon(type) {
  const map = {
    trigger: "▶",
    condition: "◇",
    action: "●",
    delay: "◷",
    ai_task: "✦",
    human_handoff: "◎",
    end: "■",
  };
  return map[type] || "○";
}
