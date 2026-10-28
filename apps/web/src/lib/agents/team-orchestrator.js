/**
 * Multi-agent collaboration: primary agent + collaborators share memory/kv,
 * then optionally QC/Compliance/Escalation review the draft.
 */

import { runAgentOrchestration } from "./orchestrator";
import { findAgent, listAgents, listTasks } from "./agent-store";
import {
  getSharedKv,
  readCollaborationContext,
  setSharedKv,
} from "./shared-memory";
import { resolveAgent } from "./team-roster";

/**
 * @param {{
 *   agent_key?: string,
 *   purpose?: string,
 *   message?: string,
 *   dry_run?: boolean,
 *   context?: Record<string, unknown>,
 *   collaborators?: string[],
 * }} input
 */
export async function runTeamCollaboration(input = {}) {
  const started = Date.now();
  const purpose = String(input.purpose || "draft_reply");
  const message = String(input.message || "").trim();
  const dryRun = input.dry_run !== false;

  const listed = await listAgents();
  const primary =
    (await findAgent(input.agent_key || "ai_support")) || listed.data[0];
  if (!primary) {
    return { ok: false, error: "No agents configured." };
  }

  const collabKeys = Array.isArray(primary.config?.collaborates_with)
    ? primary.config.collaborates_with.map(String)
    : [];
  const requested = Array.isArray(input.collaborators)
    ? input.collaborators.map(String)
    : [];
  const collaboratorKeys = [...new Set([...collabKeys, ...requested])].filter(
    (k) => k && k !== primary.key,
  );

  const shared = await readCollaborationContext([
    "workspace.brand",
    "collab.active_thread",
    "collab.last_handoff",
    `thread.${primary.key}`,
    ...(Array.isArray(input.context?.memory_keys)
      ? input.context.memory_keys.map(String)
      : []),
  ]);

  const openTasks = await listTasks(primary.id);
  const taskLines = (openTasks.data || [])
    .filter((t) => t.status === "open" || t.status === "in_progress")
    .slice(0, 5)
    .map((t) => `- [${t.priority}] ${t.title}: ${t.description}`)
    .join("\n");

  const enrichedContext = {
    ...(input.context && typeof input.context === "object" ? input.context : {}),
    shared_memory: shared.summary,
    assigned_tasks: taskLines,
    team: listed.data.map((a) => a.key),
  };

  const primaryResult = await runAgentOrchestration({
    agent_key: primary.key,
    agent: primary,
    purpose,
    message,
    dry_run: dryRun,
    context: enrichedContext,
  });

  const detectedLanguage = String(primaryResult.detected_language || "en");
  enrichedContext.detected_language = detectedLanguage;

  /** @type {Array<Record<string, unknown>>} */
  const steps = [
    {
      agent_key: primary.key,
      agent_name: primary.name,
      role: primary.role,
      step: "primary_draft",
      text: primaryResult.text,
      mode: primaryResult.mode,
      training_used: primaryResult.training_used,
    },
  ];

  let draft = String(primaryResult.text || "");
  const reviews = [];

  for (const key of collaboratorKeys) {
    const peer = resolveAgent(key, listed.data);
    if (!peer || peer.status === "paused") continue;

    const role = String(peer.role || peer.key);
    const isReviewer =
      role.includes("quality") ||
      role.includes("compliance") ||
      role.includes("escalation");

    if (!isReviewer && role !== "follow_up" && role !== "lead_qualification") {
      // Still share context note for non-reviewer collaborators
      await setSharedKv({
        key: `collab.note.${peer.key}`,
        value: {
          from: primary.key,
          purpose,
          excerpt: draft.slice(0, 400),
          at: new Date().toISOString(),
        },
        written_by: primary.key,
        tags: ["collab", "note"],
      });
      steps.push({
        agent_key: peer.key,
        agent_name: peer.name,
        role: peer.role,
        step: "context_shared",
        ok: true,
      });
      continue;
    }

    const reviewPurpose =
      role.includes("escalation")
        ? "escalation_review"
        : role.includes("compliance")
          ? "compliance_review"
          : "quality_review";

    const review = await runAgentOrchestration({
      agent_key: peer.key,
      agent: peer,
      purpose: reviewPurpose,
      message: `Review this draft for ${reviewPurpose.replace("_", " ")}.\n\nCustomer message:\n${message}\n\nDraft:\n${draft}`,
      dry_run: true,
      context: {
        ...enrichedContext,
        primary_agent: primary.key,
        draft,
      },
    });

    reviews.push({
      agent_key: peer.key,
      agent_name: peer.name,
      role: peer.role,
      purpose: reviewPurpose,
      text: review.text,
      mode: review.mode,
    });
    steps.push({
      agent_key: peer.key,
      agent_name: peer.name,
      role: peer.role,
      step: reviewPurpose,
      text: review.text,
      mode: review.mode,
    });

    await setSharedKv({
      key: `collab.review.${peer.key}`,
      value: {
        purpose: reviewPurpose,
        notes: String(review.text || "").slice(0, 600),
        primary: primary.key,
        at: new Date().toISOString(),
      },
      written_by: peer.key,
      tags: ["collab", "review", reviewPurpose],
    });
  }

  await setSharedKv({
    key: "collab.last_handoff",
    value: {
      primary: primary.key,
      purpose,
      collaborators: collaboratorKeys,
      dry_run: dryRun,
      at: new Date().toISOString(),
    },
    written_by: primary.key,
    tags: ["orchestration", "handoff"],
  });

  await setSharedKv({
    key: `thread.${primary.key}`,
    value: {
      last_message: message.slice(0, 500),
      last_draft: draft.slice(0, 800),
      purpose,
      at: new Date().toISOString(),
    },
    written_by: primary.key,
    tags: ["thread", primary.key],
  });

  const lastHandoff = await getSharedKv("collab.last_handoff");

  return {
    ok: true,
    collaboration: true,
    primary: {
      agent_key: primary.key,
      agent_name: primary.name,
      role: primary.role,
    },
    collaborators: collaboratorKeys,
    steps,
    reviews,
    text: draft,
    output: draft,
    provider: primaryResult.provider,
    mode: primaryResult.mode,
    detected_language: detectedLanguage,
    detected_language_name: primaryResult.detected_language_name,
    language_rtl: primaryResult.language_rtl,
    training_used: primaryResult.training_used,
    shared_memory: {
      storage: shared.storage,
      entries_used: shared.entries.map((e) => e.key),
      last_handoff: lastHandoff?.value ?? null,
    },
    assigned_tasks: openTasks.data?.slice(0, 8) || [],
    dry_run: dryRun,
    latency_ms: Date.now() - started,
  };
}
