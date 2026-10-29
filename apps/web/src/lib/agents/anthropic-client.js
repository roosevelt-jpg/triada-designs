/**
 * Minimal Anthropic Messages API client for Next dual-run agent orchestration.
 * Never reports live success without a real key + successful HTTP response.
 * Secrets stay server-side via resolveAnthropicApiKey — never return keys.
 */

import {
  getAnthropicStatus,
  resolveAnthropicApiKey,
} from "@/lib/integrations/anthropic-credentials";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_BASE = "https://api.anthropic.com";

/**
 * @param {{
 *   system?: string,
 *   prompt: string,
 *   max_tokens?: number,
 *   temperature?: number,
 *   timeout_ms?: number,
 * }} request
 * @returns {Promise<{
 *   ok: boolean,
 *   provider: string,
 *   model: string,
 *   text: string,
 *   prompt_tokens: number,
 *   completion_tokens: number,
 *   error?: string,
 *   mode: string,
 * }>}
 */
export async function completeAnthropic(request) {
  const status = await getAnthropicStatus();
  const model = status.model || "claude-sonnet-4-20250514";
  const apiKey = await resolveAnthropicApiKey();

  if (!apiKey) {
    return {
      ok: false,
      provider: "local_sim",
      model,
      text: "",
      prompt_tokens: 0,
      completion_tokens: 0,
      error: "awaiting_credentials",
      mode: "awaiting_credentials",
    };
  }

  const base = (process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const payload = {
    model,
    max_tokens: Number(request.max_tokens || 1024),
    temperature: Number(request.temperature ?? 0.2),
    messages: [{ role: "user", content: String(request.prompt || "") }],
  };
  if (request.system) payload.system = String(request.system);

  const timeoutMs = Math.max(
    3_000,
    Number(request.timeout_ms || process.env.ANTHROPIC_TIMEOUT_MS || 25_000),
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        provider: "anthropic",
        model,
        text: "",
        prompt_tokens: 0,
        completion_tokens: 0,
        error: `Anthropic HTTP ${response.status}`,
        mode: "error",
      };
    }

    const text = extractText(json);
    return {
      ok: true,
      provider: "anthropic",
      model,
      text,
      prompt_tokens: Number(json?.usage?.input_tokens || 0),
      completion_tokens: Number(json?.usage?.output_tokens || 0),
      mode: "live",
    };
  } catch (err) {
    const aborted =
      (err && typeof err === "object" && "name" in err && err.name === "AbortError") ||
      (err instanceof Error && /aborted/i.test(err.message));
    return {
      ok: false,
      provider: "anthropic",
      model,
      text: "",
      prompt_tokens: 0,
      completion_tokens: 0,
      error: aborted
        ? `Anthropic timeout after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : "Anthropic request failed",
      mode: aborted ? "timeout" : "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {Record<string, unknown>} json */
function extractText(json) {
  const content = json?.content;
  if (!Array.isArray(content)) return String(json?.content || "");
  return content
    .filter((part) => part && part.type === "text")
    .map((part) => String(part.text || ""))
    .join("\n")
    .trim();
}
