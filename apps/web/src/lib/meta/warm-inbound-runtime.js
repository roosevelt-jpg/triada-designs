/**
 * Soft-warm inbound Support auto-reply modules so a later customer “Hi”
 * avoids the worst cold-start tax (module graph + credential resolvers).
 * Covers Meta + Telegram / webchat / email / TikTok / LinkedIn.
 * Safe to call from crons / health — no outbound provider send.
 */

import { getAnthropicStatus } from "@/lib/integrations/anthropic-credentials";
import { resolveWhatsAppCloudCredentials } from "@/lib/integrations/meta-credentials";
import {
  hasLinkedInEnv,
  hasTelegramEnv,
  hasTikTokEnv,
} from "@/lib/integrations/env-presence";
import { listAgents } from "@/lib/agents/agent-store";
import { isSimpleSupportGreeting } from "@/lib/agents/support-fast-path";
import { normalizeMetaInboundMessages } from "@/lib/meta/normalize-inbound";
import {
  normalizeTelegramInbound,
  normalizeEmailInbound,
  normalizeTikTokInbound,
  normalizeWebchatInbound,
  normalizeLinkedInInbound,
} from "@/lib/channels/normalize-inbound";

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   warmed: string[],
 *   greeting_fast_path: boolean,
 *   channels_warmed: string[],
 *   anthropic: string,
 *   whatsapp_send_ready: boolean,
 *   telegram_send_ready: boolean,
 *   linkedin_send_ready: boolean,
 *   tiktok_send_ready: boolean,
 *   agents: number,
 *   latency_ms: number,
 * }>}
 */
export async function warmInboundRuntime() {
  const started = Date.now();
  const warmed = [];
  const channelsWarmed = [];

  // Touch normalize + fast-path (pure, sync) so the module graph stays resident.
  normalizeMetaInboundMessages({ object: "whatsapp_business_account", entry: [] });
  warmed.push("normalize-inbound-meta");
  channelsWarmed.push("whatsapp", "instagram", "messenger", "facebook");

  normalizeTelegramInbound({});
  normalizeEmailInbound({ from: "warm@triada.local", body: "Hi" });
  normalizeTikTokInbound({
    event: "im_receive_msg",
    user_openid: "warm-tt",
    content: JSON.stringify({ text: "Hi" }),
    simulated: true,
  });
  normalizeWebchatInbound({ body: "Hi", visitor_id: "warm" });
  normalizeLinkedInInbound({
    text: "Hi",
    from: "urn:li:person:warm",
    simulated: true,
  });
  warmed.push("normalize-inbound-channels");
  channelsWarmed.push("telegram", "email", "tiktok", "webchat", "linkedin");

  const greetingOk =
    isSimpleSupportGreeting("Hi") &&
    isSimpleSupportGreeting("Hello\n\nHi");
  warmed.push("support-fast-path");

  const [anthropic, wa, agents] = await Promise.all([
    getAnthropicStatus().catch(() => ({ has_credentials: false, source: "error" })),
    resolveWhatsAppCloudCredentials().catch(() => ({ sendReady: false })),
    listAgents().catch(() => ({ data: [] })),
  ]);
  warmed.push("anthropic-credentials", "whatsapp-credentials", "agents");
  const telegramReady = hasTelegramEnv();
  const linkedinReady = hasLinkedInEnv();
  const tiktokReady = hasTikTokEnv();
  warmed.push("telegram-credentials", "linkedin-credentials", "tiktok-credentials");

  return {
    ok: true,
    warmed,
    greeting_fast_path: greetingOk,
    channels_warmed: channelsWarmed,
    anthropic: anthropic?.source || (anthropic?.has_credentials ? "keyed" : "missing"),
    whatsapp_send_ready: Boolean(wa?.sendReady),
    telegram_send_ready: telegramReady,
    linkedin_send_ready: linkedinReady,
    tiktok_send_ready: tiktokReady,
    agents: Array.isArray(agents?.data) ? agents.data.length : 0,
    latency_ms: Date.now() - started,
  };
}
