/**
 * Soft-warm Meta inbound auto-reply modules so a later customer “Hi”
 * avoids the worst cold-start tax (module graph + credential resolvers).
 * Safe to call from crons / health — no outbound Graph send.
 */

import { getAnthropicStatus } from "@/lib/integrations/anthropic-credentials";
import { resolveWhatsAppCloudCredentials } from "@/lib/integrations/meta-credentials";
import { listAgents } from "@/lib/agents/agent-store";
import { isSimpleSupportGreeting } from "@/lib/agents/support-fast-path";
import { normalizeMetaInboundMessages } from "@/lib/meta/normalize-inbound";

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   warmed: string[],
 *   greeting_fast_path: boolean,
 *   anthropic: string,
 *   whatsapp_send_ready: boolean,
 *   agents: number,
 *   latency_ms: number,
 * }>}
 */
export async function warmInboundRuntime() {
  const started = Date.now();
  const warmed = [];

  // Touch normalize + fast-path (pure, sync) so the module graph stays resident.
  normalizeMetaInboundMessages({ object: "whatsapp_business_account", entry: [] });
  warmed.push("normalize-inbound");
  const greetingOk = isSimpleSupportGreeting("Hi");
  warmed.push("support-fast-path");

  const [anthropic, wa, agents] = await Promise.all([
    getAnthropicStatus().catch(() => ({ has_credentials: false, source: "error" })),
    resolveWhatsAppCloudCredentials().catch(() => ({ sendReady: false })),
    listAgents().catch(() => ({ data: [] })),
  ]);
  warmed.push("anthropic-credentials", "whatsapp-credentials", "agents");

  return {
    ok: true,
    warmed,
    greeting_fast_path: greetingOk,
    anthropic: anthropic?.source || (anthropic?.has_credentials ? "keyed" : "missing"),
    whatsapp_send_ready: Boolean(wa?.sendReady),
    agents: Array.isArray(agents?.data) ? agents.data.length : 0,
    latency_ms: Date.now() - started,
  };
}
