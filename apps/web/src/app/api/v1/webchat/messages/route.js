import { NextResponse } from "next/server";
import { normalizeWebchatInbound } from "@/lib/channels/normalize-inbound";
import { handleInboundSupportChannel } from "@/lib/agents/support-channel";
import { captureVisitorAsLead } from "@/lib/crm/visitor-leads";
import { extractEmail } from "@/lib/crm/extract-contact-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Public website widget inbound (no admin session).
 *   POST /api/v1/webchat/messages
 * Body: { token, body, visitor_id?, name?, email? }
 *
 * Draft stays on the request so the widget gets suggested_reply.
 * Provider outbound send runs via background_send (after response).
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

  // Non-blocking CRM lead from webchat (page / referrer / utm / email when present).
  const payload =
    body && typeof body === "object"
      ? /** @type {Record<string, unknown>} */ (body)
      : {};
  void captureVisitorAsLead({
    visitor_id: normalized.external_user_id,
    page: payload.page || payload.page_url || null,
    referrer: payload.referrer || null,
    email:
      extractEmail(payload.email) ||
      extractEmail(inboundBody) ||
      null,
    name: normalized.contact_name || payload.name || null,
    source: "webchat",
    source_channel: "webchat",
    utm_source: payload.utm_source,
    utm_medium: payload.utm_medium,
    utm_campaign: payload.utm_campaign,
    utm_term: payload.utm_term,
    utm_content: payload.utm_content,
    metadata: {
      webchat_token_present: Boolean(token),
      conversation_hint: normalized.external_conversation_id,
    },
  }).catch(() => {});

  const handled = await handleInboundSupportChannel({
    channel: "webchat",
    body: normalized.body,
    external_user_id: normalized.external_user_id,
    external_conversation_id: normalized.external_conversation_id,
    provider_message_id: normalized.provider_message_id,
    contact_name: normalized.contact_name,
    metadata: normalized.metadata,
    auto_reply: true,
    // Provider send (local_sim / live) after HTTP response — draft stays sync.
    background_send: true,
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
    send_pending: Boolean(handled.reply?.send_pending),
    fast_path: Boolean(handled.reply?.fast_path),
    draft_latency_ms: handled.reply?.latency_ms ?? null,
  });
}
