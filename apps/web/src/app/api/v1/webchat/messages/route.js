import { NextResponse } from "next/server";
import { normalizeWebchatInbound } from "@/lib/channels/normalize-inbound";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public website widget inbound (no admin session).
 *   POST /api/v1/webchat/messages
 * Body: { token, body, visitor_id?, name?, email? }
 */
export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const token =
    body && typeof body === "object" && body.token
      ? String(body.token).trim()
      : "";
  if (!token) {
    return NextResponse.json({ message: "Widget token is required." }, { status: 401 });
  }

  const inboundBody =
    body && typeof body === "object" && body.body
      ? String(body.body).trim()
      : "";
  if (!inboundBody) {
    return NextResponse.json({ message: "Message body is required." }, { status: 422 });
  }

  const [normalized] = normalizeWebchatInbound({
    ...(body && typeof body === "object" ? body : {}),
    token,
    body: inboundBody,
  });

  const handled = await handleInboundSupportChannel({
    channel: "webchat",
    body: normalized.body,
    external_user_id: normalized.external_user_id,
    external_conversation_id: normalized.external_conversation_id,
    provider_message_id: normalized.provider_message_id,
    contact_name: normalized.contact_name,
    metadata: normalized.metadata,
    auto_reply: true,
  });

  return NextResponse.json({
    ok: true,
    conversation_id: handled.conversation?.id || null,
    suggested_reply:
      handled.reply?.reply ||
      "Thanks — a Triada specialist can continue from here.",
    replied: handled.replied,
    agent_key: "ai_support",
    mode: handled.reply?.send?.mode || handled.reply?.mode || "local_sim",
    send_ok: handled.reply?.send?.ok ?? null,
    fast_path: Boolean(handled.reply?.fast_path),
    draft_latency_ms: handled.reply?.latency_ms ?? null,
  });
}
