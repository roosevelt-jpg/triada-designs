import { NextResponse } from "next/server";
import { normalizeLinkedInInbound } from "@/lib/channels/normalize-inbound";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel";
import { runAfterResponse } from "@/lib/runtime/after-response";
import { mapParallel } from "@/lib/runtime/parallel-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * LinkedIn Messaging inbound webhook:
 *   https://dashboard.triada-designs.com/api/webhooks/linkedin
 *
 * Early-200 + background Support auto-reply (same pattern as Telegram / TikTok).
 */

/**
 * @param {Request} request
 */
function secretOk(request) {
  const expected = String(
    process.env.LINKEDIN_WEBHOOK_SECRET ||
      process.env.LINKEDIN_CHANNEL_WEBHOOK_SECRET ||
      "",
  ).trim();
  if (!expected) return true;
  const provided = String(
    request.headers.get("x-linkedin-webhook-secret") ||
      request.headers.get("x-channel-webhook-secret") ||
      "",
  ).trim();
  return provided === expected;
}

/**
 * LinkedIn app webhook challenge (echo challengeCode when present).
 * @param {URL} url
 */
function challengeResponse(url) {
  const challenge =
    url.searchParams.get("challengeCode") ||
    url.searchParams.get("challenge") ||
    url.searchParams.get("hub.challenge") ||
    "";
  if (!challenge) return null;
  return NextResponse.json({ challengeCode: challenge, challenge });
}

/**
 * @param {Array<Record<string, unknown>>} normalized
 */
async function processLinkedInInbound(normalized) {
  const outcomes = await mapParallel(
    normalized,
    async (item) => {
      const handled = await handleInboundSupportChannel({
        channel: "linkedin",
        body: item.body,
        external_user_id: item.external_user_id,
        external_conversation_id: item.external_conversation_id,
        provider_message_id: item.provider_message_id,
        contact_name: item.contact_name,
        metadata: item.metadata,
        auto_reply: true,
      });
      return {
        replied: Boolean(handled.replied),
        automation: {
          channel: "linkedin",
          agent_key: "ai_support",
          replied: handled.replied,
          deduplicated: handled.deduplicated || false,
          conversation_id: handled.conversation?.id || null,
          send_mode: handled.reply?.send?.mode || handled.reply?.mode || null,
          send_ok: handled.reply?.send?.ok ?? null,
          send_error: handled.reply?.send?.error || handled.reply?.error || null,
          send_pending: Boolean(handled.reply?.send_pending),
          fast_path: Boolean(handled.reply?.fast_path),
          draft_latency_ms: handled.reply?.latency_ms ?? null,
        },
      };
    },
    { concurrency: 6 },
  );

  return {
    replied: outcomes.filter((o) => o.replied).length,
    automations: outcomes.map((o) => o.automation),
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const challenge = challengeResponse(url);
  if (challenge) return challenge;
  return NextResponse.json({
    ok: true,
    channel: "linkedin",
    webhook: "/api/webhooks/linkedin",
  });
}

export async function POST(request) {
  if (!secretOk(request)) {
    return NextResponse.json({ message: "Invalid webhook secret." }, { status: 401 });
  }

  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const normalized = normalizeLinkedInInbound(
    /** @type {Record<string, unknown>} */ (payload || {}),
  );
  if (!normalized.length) {
    return NextResponse.json({ ok: true, ignored: true, replied: 0 });
  }

  runAfterResponse(async () => {
    await processLinkedInInbound(normalized);
  });

  return NextResponse.json({
    ok: true,
    accepted: true,
    background: true,
    channel: "linkedin",
    queued: normalized.length,
  });
}
