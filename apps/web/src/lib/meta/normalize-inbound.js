/**
 * Normalize Meta Cloud API webhook payloads into inbound message records.
 * Mirrors Laravel WhatsAppCloudAdapter / FacebookMessengerAdapter / InstagramMessagingAdapter.
 */

/**
 * @typedef {{
 *   channel: string,
 *   provider_event_id: string,
 *   provider_message_id: string,
 *   external_user_id: string,
 *   external_conversation_id: string,
 *   page_or_account_id: string,
 *   message_type: string,
 *   body: string,
 *   timestamp: string,
 *   metadata: Record<string, unknown>,
 * }} NormalizedInbound
 */

/**
 * @param {unknown} payload
 * @returns {NormalizedInbound[]}
 */
export function normalizeMetaInboundMessages(payload) {
  if (!payload || typeof payload !== "object") return [];
  const body = /** @type {Record<string, unknown>} */ (payload);
  const objectType = String(body.object || "").toLowerCase();

  if (
    objectType === "whatsapp_business_account" ||
    objectType === "whatsapp" ||
    hasWhatsAppChanges(body)
  ) {
    return normalizeWhatsApp(body);
  }

  if (objectType === "instagram") {
    return normalizeMessaging(body, "instagram");
  }

  if (objectType === "page" || objectType === "facebook") {
    return normalizeMessaging(body, "facebook");
  }

  // Fallback: try WhatsApp shape then page messaging.
  const wa = normalizeWhatsApp(body);
  if (wa.length) return wa;
  return normalizeMessaging(body, "facebook");
}

/**
 * @param {Record<string, unknown>} body
 */
function hasWhatsAppChanges(body) {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray(/** @type {any} */ (entry).changes)
      ? /** @type {any} */ (entry).changes
      : [];
    for (const change of changes) {
      if (change?.value && Array.isArray(change.value.messages)) return true;
      if (String(change?.field || "") === "messages") return true;
    }
  }
  return false;
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedInbound[]}
 */
function normalizeWhatsApp(payload) {
  /** @type {NormalizedInbound[]} */
  const out = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray(/** @type {any} */ (entry).changes)
      ? /** @type {any} */ (entry).changes
      : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value || typeof value !== "object") continue;
      // Status delivery receipts — ignore.
      if (Array.isArray(value.statuses) && !Array.isArray(value.messages)) {
        continue;
      }
      const phoneNumberId = String(value.metadata?.phone_number_id || "");
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactName =
        contacts[0]?.profile && typeof contacts[0].profile === "object"
          ? String(contacts[0].profile.name || "") || null
          : null;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        if (!msg || typeof msg !== "object") continue;
        const mid = String(msg.id || `wa-${Date.now()}`);
        const from = String(msg.from || "");
        if (!from) continue;
        const text = extractWhatsAppBody(msg);
        const ts = msg.timestamp
          ? new Date(Number(msg.timestamp) * 1000).toISOString()
          : new Date().toISOString();
        out.push({
          channel: "whatsapp",
          provider_event_id: mid,
          provider_message_id: mid,
          external_user_id: from,
          external_conversation_id: `${phoneNumberId || "wa"}:${from}`,
          page_or_account_id: phoneNumberId,
          message_type: String(msg.type || "text"),
          body: text,
          timestamp: ts,
          metadata: {
            wa_id: from,
            contact_name: contactName,
            phone_number_id: phoneNumberId,
          },
        });
      }
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} msg
 */
function extractWhatsAppBody(msg) {
  const type = String(msg.type || "text");
  if (type === "text" && msg.text && typeof msg.text === "object") {
    return String(/** @type {any} */ (msg.text).body || "").trim();
  }
  if (type === "button" && msg.button && typeof msg.button === "object") {
    return String(
      /** @type {any} */ (msg.button).text ||
        /** @type {any} */ (msg.button).payload ||
        "",
    ).trim();
  }
  if (
    type === "interactive" &&
    msg.interactive &&
    typeof msg.interactive === "object"
  ) {
    const interactive = /** @type {any} */ (msg.interactive);
    if (interactive.button_reply?.title) {
      return String(interactive.button_reply.title).trim();
    }
    if (interactive.list_reply?.title) {
      return String(interactive.list_reply.title).trim();
    }
  }
  if (type === "image" || type === "video" || type === "audio" || type === "document") {
    const caption =
      msg[type] && typeof msg[type] === "object"
        ? String(/** @type {any} */ (msg[type]).caption || "")
        : "";
    return caption.trim() || `[${type} received]`;
  }
  return type !== "text" ? `[${type} received]` : "";
}

/**
 * Page / Instagram messaging shape.
 * @param {Record<string, unknown>} payload
 * @param {"facebook"|"instagram"|"messenger"} defaultChannel
 * @returns {NormalizedInbound[]}
 */
function normalizeMessaging(payload, defaultChannel) {
  /** @type {NormalizedInbound[]} */
  const out = [];
  const objectType = String(payload.object || "").toLowerCase();
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const accountId = String(/** @type {any} */ (entry).id || "");
    const messaging = Array.isArray(/** @type {any} */ (entry).messaging)
      ? /** @type {any} */ (entry).messaging
      : [];
    for (const event of messaging) {
      if (!event?.message || event.message.is_echo) continue;
      const mid = String(event.message.mid || `msg-${Date.now()}`);
      const sender = String(event.sender?.id || "");
      if (!sender) continue;
      const text = String(event.message.text || "").trim() || "[message received]";
      const tsMs = Number(event.timestamp || 0);
      const ts = tsMs
        ? new Date(tsMs > 1e12 ? tsMs : tsMs * 1000).toISOString()
        : new Date().toISOString();

      let channel = defaultChannel;
      if (objectType === "instagram") channel = "instagram";
      else if (event.message?.is_unsupported) channel = defaultChannel;
      // Messenger often arrives as object=page — treat as messenger for Support ownership.
      if (channel === "facebook") channel = "messenger";

      out.push({
        channel,
        provider_event_id: mid,
        provider_message_id: mid,
        external_user_id: sender,
        external_conversation_id: `${accountId || channel}:${sender}`,
        page_or_account_id: accountId,
        message_type: "text",
        body: text,
        timestamp: ts,
        metadata: {
          object: objectType || defaultChannel,
          recipient_id: event.recipient?.id || null,
        },
      });
    }
  }
  return out;
}
