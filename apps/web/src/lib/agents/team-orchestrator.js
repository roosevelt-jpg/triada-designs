/**
 * Multi-agent collaboration: primary agent + collaborators share memory/kv,
 * then optionally QC/Compliance/Escalation review the draft.
 *
 * latency_mode "fast" (inbound Support auto-reply): one primary draft only —
 * skip collaborator LLM reviews on the critical path so Graph send is not
 * blocked by sequential Anthropic calls. Shared-memory handoff still writes.
 */

import { runAgentOrchestration } from "./orchestrator";
import { listAgents, listTasks } from "./agent-store";
import {
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
 *   latency_mode?: "fast" | "full",
 *   max_tokens?: number,
 * }} input
 */
export async function runTeamCollaboration(input = {}) {
  const started = Date.now();
  const purpose = String(input.purpose || "draft_reply");
  const message = String(input.message || "").trim();
  const dryRun = input.dry_run !== false;
  const latencyMode = input.latency_mode === "fast" ? "fast" : "full";
  const fast = latencyMode === "fast";

  const listed = await listAgents();
  const wantedKey = String(input.agent_key || "ai_support");
  const primary =
    listed.data.find((a) => a.key === wantedKey || a.id === wantedKey) ||
    resolveAgent(wantedKey, listed.data) ||
    listed.data[0];
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

  const memoryKeys = fast
    ? ["collab.active_thread", `thread.${primary.key}`]
    : [
        "workspace.brand",
        "collab.active_thread",
        "collab.last_handoff",
        `thread.${primary.key}`,
        ...(Array.isArray(input.context?.memory_keys)
          ? input.context.memory_keys.map(String)
          : []),
      ];

  const [shared, openTasks] = await Promise.all([
    readCollaborationContext(memoryKeys),
    fast
      ? Promise.resolve({ data: [] })
      : listTasks(primary.id).catch(() => ({ data: [] })),
  ]);

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
    latency_mode: latencyMode,
  };

  const primaryResult = await runAgentOrchestration({
    agent_key: primary.key,
    agent: primary,
    purpose,
    message,
    dry_run: dryRun,
    context: enrichedContext,
    latency_mode: latencyMode,
    max_tokens:
      typeof input.max_tokens === "number"
        ? input.max_tokens
        : fast
          ? 400
          : undefined,
  });

  const detectedLanguage = String(primaryResult.detected_language || "en");
  enrichedContext.detected_language = detectedLanguage;
  enrichedContext.customer_message = message;

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

  if (!fast) {
    const reviewers = [];
    for (const key of collaboratorKeys) {
      const peer = resolveAgent(key, listed.data);
      if (!peer || peer.status === "paused") continue;

      const role = String(peer.role || peer.key);
      const isReviewer =
        role.includes("quality") ||
        role.includes("compliance") ||
        role.includes("escalation");

      if (!isReviewer && role !== "follow_up" && role !== "lead_qualification") {
        void setSharedKv({
          key: `collab.note.${peer.key}`,
          value: {
            from: primary.key,
            purpose,
            excerpt: draft.slice(0, 400),
            at: new Date().toISOString(),
          },
          written_by: primary.key,
          tags: ["collab", "note"],
        }).catch(() => null);
        steps.push({
          agent_key: peer.key,
          agent_name: peer.name,
          role: peer.role,
          step: "context_shared",
          ok: true,
        });
        continue;
      }

      reviewers.push({ peer, role });
    }

    // Parallel QC / Compliance / Escalation reviews (was sequential).
    const reviewResults = await Promise.all(
      reviewers.map(async ({ peer, role }) => {
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
            customer_message: message,
            detected_language: detectedLanguage,
            draft,
          },
          max_tokens: 256,
        });

        void setSharedKv({
          key: `collab.review.${peer.key}`,
          value: {
            purpose: reviewPurpose,
            notes: String(review.text || "").slice(0, 600),
            primary: primary.key,
            at: new Date().toISOString(),
          },
          written_by: peer.key,
          tags: ["collab", "review", reviewPurpose],
        }).catch(() => null);

        return {
          agent_key: peer.key,
          agent_name: peer.name,
          role: peer.role,
          purpose: reviewPurpose,
          text: review.text,
          mode: review.mode,
        };
      }),
    );

    for (const review of reviewResults) {
      reviews.push(review);
      steps.push({
        agent_key: review.agent_key,
        agent_name: review.agent_name,
        role: review.role,
        step: review.purpose,
        text: review.text,
        mode: review.mode,
      });
    }
  } else if (collaboratorKeys.length) {
    steps.push({
      step: "reviews_deferred",
      reason: "latency_mode_fast",
      collaborators: collaboratorKeys,
    });
  }

  // Non-blocking handoff writes — do not serialize Graph send behind KV.
  void setSharedKv({
    key: "collab.last_handoff",
    value: {
      primary: primary.key,
      purpose,
      collaborators: collaboratorKeys,
      dry_run: dryRun,
      latency_mode: latencyMode,
      at: new Date().toISOString(),
    },
    written_by: primary.key,
    tags: ["orchestration", "handoff"],
  }).catch(() => null);

  void setSharedKv({
    key: `thread.${primary.key}`,
    value: {
      last_message: message.slice(0, 500),
      last_draft: draft.slice(0, 800),
      purpose,
      latency_mode: latencyMode,
      at: new Date().toISOString(),
    },
    written_by: primary.key,
    tags: ["thread", primary.key],
  }).catch(() => null);

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
    draft,
    provider: primaryResult.provider,
    mode: primaryResult.mode,
    detected_language: detectedLanguage,
    detected_language_name: primaryResult.detected_language_name,
    language_rtl: primaryResult.language_rtl,
    training_used: primaryResult.training_used,
    shared_memory: {
      storage: shared.storage,
      entries_used: shared.entries.map((e) => e.key),
      last_handoff: null,
    },
    assigned_tasks: openTasks.data?.slice(0, 8) || [],
    dry_run: dryRun,
    latency_mode: latencyMode,
    latency_ms: Date.now() - started,
  };
}
