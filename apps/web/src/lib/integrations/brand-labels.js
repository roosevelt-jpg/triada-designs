/**
 * Brand-safe labels for Integrations / LLM / health UI.
 * Never expose raw provider= / active= dumps or model version IDs in user-facing copy.
 */

/** @param {string | undefined | null} model */
export function modelNickname(model) {
  const m = String(model || "").trim().toLowerCase();
  if (!m || m === "local-heuristic" || m === "local") return "Local assistant";
  if (m.includes("opus")) return "Claude Opus";
  if (m.includes("haiku")) return "Claude Haiku";
  if (m.includes("sonnet") || m.includes("claude")) return "Claude Sonnet";
  if (m.includes("flash")) return "Gemini Flash";
  if (m.includes("pro") && m.includes("gemini")) return "Gemini Pro";
  if (m.includes("gemini")) return "Gemini";
  return "AI model";
}

/**
 * @param {string | undefined | null} status
 * @param {{ live?: boolean, hasCredentials?: boolean } } [opts]
 */
export function connectionLabel(status, opts = {}) {
  const s = String(status || "").toLowerCase();
  if (opts.live || s === "live") return "Connected";
  if (s === "connected" || s === "healthy" || opts.hasCredentials) return "Connected";
  if (s === "awaiting_credentials") return "Waiting credentials";
  if (s === "seeded") return "Seeded catalog";
  if (s === "local" || s === "local_sim" || s === "local_seed") return "Local";
  if (s === "error" || s === "disconnected") return "Unavailable";
  if (!s || s === "—") return "Waiting credentials";
  // Never echo snake_case machine status strings to the UI.
  if (s.includes("_")) return "Waiting credentials";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** @param {string | undefined | null} provider */
export function providerNickname(provider) {
  const p = String(provider || "").toLowerCase();
  if (p === "anthropic" || p === "claude") return "Claude";
  if (p === "gemini" || p === "google") return "Gemini";
  if (p === "local" || p === "local_sim") return "Local assistant";
  if (p === "resend" || p === "email") return "Email";
  if (p === "messenger") return "Messenger";
  if (p === "meta" || p === "facebook" || p === "instagram" || p === "whatsapp") {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }
  if (!p) return "AI";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/**
 * One-line AI status for Integrations / Agents (no raw IDs).
 * @param {{ status?: string, provider?: string, model?: string, has_credentials?: boolean }} llm
 */
export function aiStatusSummary(llm) {
  if (!llm) return "AI waiting for host credentials.";
  const live =
    llm.status === "live" ||
    llm.status === "connected" ||
    Boolean(llm.has_credentials);
  if (!live) {
    return "Waiting for AI credentials on the host (Vercel).";
  }
  const who = providerNickname(llm.provider);
  const model = modelNickname(llm.model);
  return `${who} connected · ${model}`;
}

/** Soften creative mode badges (gemini → Live AI, local_sim → Local). */
export function creativeModeLabel(mode) {
  const m = String(mode || "").toLowerCase();
  if (m === "gemini" || m === "anthropic" || m === "live") return "Live AI";
  if (m === "local_sim" || m === "local" || m === "local_seed") return "Local";
  if (!m) return "Local";
  if (m.includes("_")) return "Local";
  return "Live AI";
}
