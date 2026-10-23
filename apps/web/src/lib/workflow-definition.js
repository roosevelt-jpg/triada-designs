/** Helpers for the visual workflow builder. JSON is storage only — never the edit surface. */

export const NODE_TYPES = [
  { value: "trigger", label: "Trigger", icon: "▶", blurb: "Start when an event fires" },
  { value: "condition", label: "Condition", icon: "◇", blurb: "Branch true / false" },
  { value: "action", label: "Action", icon: "●", blurb: "Do something" },
  { value: "delay", label: "Delay", icon: "◷", blurb: "Wait before continuing" },
  { value: "ai_task", label: "AI reply", icon: "✦", blurb: "AI-assisted step" },
  { value: "human_handoff", label: "Assign human", icon: "◎", blurb: "Hand off to staff" },
  { value: "end", label: "End", icon: "■", blurb: "Stop the workflow" },
];

/** Drag palette: several concrete action types operators can drop onto the canvas. */
export const PALETTE_ITEMS = [
  { id: "trigger", kind: "node", type: "trigger", label: "Trigger", icon: "▶" },
  { id: "message", kind: "action", type: "action", actionType: "send_eligible_reply", label: "Message", icon: "✉" },
  { id: "condition", kind: "node", type: "condition", label: "Condition", icon: "◇" },
  { id: "delay", kind: "node", type: "delay", label: "Delay", icon: "◷" },
  { id: "assign_human", kind: "action", type: "action", actionType: "assign_human", label: "Assign human", icon: "◎" },
  { id: "sync_crm", kind: "action", type: "action", actionType: "sync_crm", label: "Sync CRM", icon: "⇄" },
  { id: "sync_shopify", kind: "action", type: "action", actionType: "sync_shopify", label: "Sync Shopify", icon: "◈" },
  { id: "publish_tpl", kind: "action", type: "action", actionType: "publish_channel_template", label: "Publish template", icon: "⇪" },
  { id: "wa_template", kind: "action", type: "action", actionType: "send_whatsapp_template", label: "WA template", icon: "✆" },
  { id: "wa_window", kind: "action", type: "action", actionType: "whatsapp_window_follow_up", label: "WA window path", icon: "◷" },
  { id: "wa_optout", kind: "action", type: "action", actionType: "check_whatsapp_opt_out", label: "WA opt-out", icon: "⊘" },
  { id: "ai_reply", kind: "action", type: "action", actionType: "ai_reply", label: "AI reply", icon: "✦" },
  { id: "gen_image", kind: "action", type: "action", actionType: "generate_content_image", label: "Gen image", icon: "▣" },
  { id: "gen_variants", kind: "action", type: "action", actionType: "generate_content_variants", label: "Gen variants", icon: "▦" },
  { id: "gen_video", kind: "action", type: "action", actionType: "generate_content_video", label: "Gen video", icon: "▶" },
  { id: "gen_anim", kind: "action", type: "action", actionType: "generate_content_animation", label: "Gen animation", icon: "⟳" },
  { id: "ensure_creative", kind: "action", type: "action", actionType: "ensure_content_creative", label: "Ensure creative", icon: "▣" },
  { id: "handoff", kind: "node", type: "human_handoff", label: "Handoff", icon: "⤴" },
  { id: "notify", kind: "action", type: "action", actionType: "notify_team", label: "Notify team", icon: "⚑" },
  { id: "end", kind: "node", type: "end", label: "End", icon: "■" },
];

export const TRIGGER_TYPES = [
  "incoming_message",
  "incoming_meta_message",
  "comment_to_dm",
  "whatsapp_template_needed",
  "new_contact",
  "lead_qualified",
  "conversation_escalated",
  "follow_up_due",
  "content_approved",
  "content_created",
  "shopify_order_updated",
  "shopify_order_created",
  "manual",
];

export const ACTION_TYPES = [
  "create_task",
  "update_lead_stage",
  "assign_conversation",
  "assign_human",
  "add_tag",
  "notify_team",
  "draft_reply",
  "ai_reply",
  "ai_classify",
  "ai_qualify",
  "ai_escalate",
  "send_eligible_reply",
  "create_content_draft",
  "sync_zoho_lead",
  "sync_crm",
  "sync_shopify",
  "publish_channel_template",
  "send_whatsapp_template",
  "check_whatsapp_opt_out",
  "whatsapp_window_follow_up",
  "generate_content_image",
  "generate_content_variants",
  "generate_content_video",
  "generate_content_animation",
  "ensure_content_creative",
];

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "greater_than",
  "less_than",
  "gte",
  "lte",
  "in",
  "exists",
];

const NODE_W = 220;
const NODE_H = 88;
const GAP_X = 48;
const GAP_Y = 72;

/**
 * @param {Record<string, unknown>} definition
 * @returns {{ entry: string, nodes: Record<string, object>, layout?: Record<string, {x:number,y:number}> }}
 */
export function normalizeDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    return { entry: "", nodes: {}, layout: {} };
  }
  const nodes = { ...(definition.nodes || {}) };
  const entry = typeof definition.entry === "string" ? definition.entry : "";
  const layout =
    definition.layout && typeof definition.layout === "object"
      ? { ...definition.layout }
      : {};
  return { entry, nodes, layout };
}

/**
 * @param {{ entry: string, nodes: Record<string, object>, layout?: Record<string, {x:number,y:number}> }} definition
 */
export function cloneDefinition(definition) {
  return JSON.parse(JSON.stringify(normalizeDefinition(definition)));
}

/**
 * Auto-layout nodes top-to-bottom with branch columns.
 * Respects saved layout positions when present.
 * @param {{ entry: string, nodes: Record<string, object>, layout?: Record<string, {x:number,y:number}> }} definition
 * @returns {Record<string, { x: number, y: number }>}
 */
export function layoutNodes(definition) {
  const { entry, nodes, layout } = normalizeDefinition(definition);
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
    if (layout[key] && typeof layout[key].x === "number" && typeof layout[key].y === "number") {
      positions[key] = { x: layout[key].x, y: layout[key].y };
      return;
    }
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
  if (vals.length === 0) return { width: 720, height: 420 };
  const maxX = Math.max(...vals.map((p) => p.x));
  const maxY = Math.max(...vals.map((p) => p.y));
  return {
    width: Math.max(720, maxX + NODE_W + 120),
    height: Math.max(420, maxY + NODE_H + 120),
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
 * @param {{ entry: string, nodes: Record<string, object>, layout?: object }} definition
 * @param {{ type: string, label?: string, actionType?: string, x?: number, y?: number }} opts
 */
export function addNode(definition, opts) {
  const next = cloneDefinition(definition);
  const type = opts.type || "action";
  const label =
    opts.label || NODE_TYPES.find((t) => t.value === type)?.label || "Node";
  let base = `${type.slice(0, 4)}_${slugify(label)}`;
  let key = base;
  let i = 1;
  while (next.nodes[key]) {
    key = `${base}_${i++}`;
  }

  const config = defaultConfigFor(type, opts.actionType);
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

  if (typeof opts.x === "number" && typeof opts.y === "number") {
    next.layout = next.layout || {};
    next.layout[key] = { x: opts.x, y: opts.y };
  }

  if (!next.entry && type === "trigger") {
    next.entry = key;
  }

  return { definition: next, key };
}

export function defaultConfigFor(type, actionType) {
  if (type === "trigger") return { trigger_type: "incoming_message" };
  if (type === "condition") {
    return { field: "intent", operator: "equals", value: "" };
  }
  if (type === "action") {
    return {
      action_type: actionType || "notify_team",
      message: "",
      ...(actionType === "publish_channel_template"
        ? { platform: "whatsapp", template_slug: "" }
        : {}),
      ...(actionType === "sync_shopify" ? { resource: "order" } : {}),
    };
  }
  if (type === "delay") return { seconds: 60 };
  if (type === "ai_task") return { task: "draft_reply", purpose: "draft_reply" };
  if (type === "human_handoff") return { reason: "" };
  return {};
}

/**
 * @param {{ entry: string, nodes: Record<string, object>, layout?: object }} definition
 * @param {string} key
 */
export function removeNode(definition, key) {
  const next = cloneDefinition(definition);
  delete next.nodes[key];
  if (next.layout) delete next.layout[key];
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
 * @param {{ entry: string, nodes: Record<string, object>, layout?: object }} definition
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

/**
 * @param {{ entry: string, nodes: Record<string, object>, layout?: object }} definition
 * @param {string} key
 * @param {{ x: number, y: number }} pos
 */
export function setNodePosition(definition, key, pos) {
  const next = cloneDefinition(definition);
  if (!next.nodes[key]) return next;
  next.layout = next.layout || {};
  next.layout[key] = {
    x: Math.max(16, Math.round(pos.x)),
    y: Math.max(16, Math.round(pos.y)),
  };
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
  if (triggerType === "comment_to_dm") {
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
  if (triggerType === "shopify_order_created" || triggerType === "shopify_order_updated") {
    return {
      channel: "shopify",
      shopify_order_id: "sim-order-1001",
      external_order_id: "sim-order-1001",
    };
  }
  if (triggerType === "content_approved") {
    return { content_title: "Quiet sparkle — jewellery showcase" };
  }
  if (triggerType === "lead_qualified") {
    return { lead_score: 82 };
  }
  if (triggerType === "follow_up_due") {
    return { channel: "whatsapp", template_slug: "wa-jewellery-follow-up" };
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

export function liveStatusLabel(status) {
  if (status === "active") return "Live";
  if (status === "disabled") return "Disabled";
  return "Draft";
}
