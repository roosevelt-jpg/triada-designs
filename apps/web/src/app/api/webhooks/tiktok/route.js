import { NextResponse } from "next/server";
import { normalizeTikTokInbound } from "@/lib/channels/normalize-inbound";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * TikTok inbound webhook:
 *   https://dashboard.triada-designs.com/api/webhooks/tiktok
 */

/**
 * @param {Request} request
 */
function secretOk(request) {
  const expected = String(
    process.env.TIKTOK_WEBHOOK_SECRET || process.env.TIKTOK_CHANNEL_WEBHOOK_SECRET || "",
  ).trim();
  if (!expected) return true;
  const provided = String(
    request.headers.get("x-tiktok-webhook-secret") ||
      request.headers.get("x-channel-webhook-secret") ||
      "",
  ).trim();
  return provided === expected;
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

  const normalized = normalizeTikTokInbound(
    /** @type {Record<string, unknown>} */ (payload || {}),
  );
  if (!normalized.length) {
    return NextResponse.json({ ok: true, ignored: true, replied: 0 });
  }

  /** @type {Array<Record<string, unknown>>} */
  const automations = [];
  let replied = 0;

  for (const item of normalized) {
    const handled = await handleInboundSupportChannel({
      channel: "tiktok",
      body: item.body,
      external_user_id: item.external_user_id,
      external_conversation_id: item.external_conversation_id,
      provider_message_id: item.provider_message_id,
      contact_name: item.contact_name,
      metadata: item.metadata,
      auto_reply: true,
    });
    if (handled.replied) replied += 1;
    automations.push({
      channel: "tiktok",
      agent_key: "ai_support",
      replied: handled.replied,
      deduplicated: handled.deduplicated || false,
      conversation_id: handled.conversation?.id || null,
      send_mode: handled.reply?.send?.mode || handled.reply?.mode || null,
      send_ok: handled.reply?.send?.ok ?? null,
      send_error: handled.reply?.send?.error || handled.reply?.error || null,
    });
  }

  return NextResponse.json({
    ok: true,
    channel: "tiktok",
    replied,
    automations,
  });
}
