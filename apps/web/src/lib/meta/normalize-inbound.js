/**
 * Normalize Meta Cloud API webhook payloads into inbound message records.
 * Mirrors Laravel WhatsAppCloudAdapter / FacebookMessengerAdapter / InstagramMessagingAdapter.
 *
 * Instagram Messaging delivers two shapes:
 * - Classic Messenger Platform: entry[].messaging[] (and standby[])
 * - Instagram Platform / Graph webhooks reference: entry[].changes[] with
 *   field=messages|messaging_postbacks (+ sender/recipient/message in value)
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

/** Instagram / Page messaging fields delivered as entry.changes[]. */
const PAGE_MESSAGING_CHANGE_FIELDS = new Set([
  "messages",
  "messaging_postbacks",
  "message_edit",
]);

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

  // Fallback: try WhatsApp shape then page messaging (covers omitted object).
  const wa = normalizeWhatsApp(body);
  if (wa.length) return wa;
  return normalizeMessaging(body, "facebook");
}

/**
 * True only for WhatsApp Cloud shapes — not Instagram Platform field=messages.
 * @param {Record<string, unknown>} body
 */
function hasWhatsAppChanges(body) {
  const objectType = String(body.object || "").toLowerCase();
  if (objectType === "instagram" || objectType === "page" || objectType === "facebook") {
    return false;
  }
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray(/** @type {any} */ (entry).changes)
      ? /** @type {any} */ (entry).changes
      : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value || typeof value !== "object") continue;
      // WA Cloud: value.messages[] (+ optional metadata.phone_number_id).
      if (Array.isArray(value.messages)) return true;
      if (
        String(change?.field || "") === "messages" &&
        value.metadata &&
        typeof value.metadata === "object" &&
        (value.metadata.phone_number_id || value.metadata.display_phone_number)
      ) {
        return true;
      }
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
 * @param {number|string|undefined|null} raw
 * @returns {string}
 */
function timestampToIso(raw) {
  const tsMs = Number(raw || 0);
  if (!tsMs) return new Date().toISOString();
  return new Date(tsMs > 1e12 ? tsMs : tsMs * 1000).toISOString();
}

/**
 * Resolve Support channel for a Page / Instagram event.
 * @param {string} objectType
 * @param {"facebook"|"instagram"|"messenger"} defaultChannel
 */
function resolvePageChannel(objectType, defaultChannel) {
  if (objectType === "instagram") return "instagram";
  if (defaultChannel === "instagram") return "instagram";
  // Messenger often arrives as object=page — treat as messenger for Support ownership.
  if (defaultChannel === "facebook" || defaultChannel === "messenger") {
    return "messenger";
  }
  return defaultChannel;
}

/**
 * Extract text body from a messaging / changes message object.
 * @param {Record<string, unknown>} message
 * @param {Record<string, unknown> | null} [postback]
 */
function extractPageMessageBody(message, postback = null) {
  if (postback && typeof postback === "object") {
    const title = String(postback.title || "").trim();
    const payload = String(postback.payload || "").trim();
    return title || payload || "[postback received]";
  }
  const text = String(message?.text || "").trim();
  if (text) return text;
  if (Array.isArray(message?.attachments) && message.attachments.length) {
    const type = String(message.attachments[0]?.type || "attachment");
    return `[${type} received]`;
  }
  if (message?.is_deleted) return "[message deleted]";
  return "[message received]";
}

/**
 * Push one normalized Page / Instagram messaging event.
 * @param {NormalizedInbound[]} out
 * @param {{
 *   objectType: string,
 *   defaultChannel: "facebook"|"instagram"|"messenger",
 *   accountId: string,
 *   event: Record<string, unknown>,
 *   source: string,
 * }} args
 */
function pushMessagingEvent(out, args) {
  const { objectType, defaultChannel, accountId, event, source } = args;
  if (!event || typeof event !== "object") return;

  const postback =
    event.postback && typeof event.postback === "object"
      ? /** @type {Record<string, unknown>} */ (event.postback)
      : null;
  const message =
    event.message && typeof event.message === "object"
      ? /** @type {Record<string, unknown>} */ (event.message)
      : null;

  // Need a message or postback payload.
  if (!message && !postback) return;
  if (message?.is_echo) return;
  if (message?.is_self === true || event.is_self === true) return;

  const sender = String(
    /** @type {any} */ (event.sender)?.id ||
      /** @type {any} */ (event.from)?.id ||
      "",
  ).trim();
  if (!sender) return;

  const mid = String(
    message?.mid ||
      postback?.mid ||
      `msg-${Date.now().toString(36)}-${out.length}`,
  );
  const body = extractPageMessageBody(message || {}, postback);
  const channel = resolvePageChannel(objectType, defaultChannel);

  out.push({
    channel,
    provider_event_id: mid,
    provider_message_id: mid,
    external_user_id: sender,
    external_conversation_id: `${accountId || channel}:${sender}`,
    page_or_account_id: accountId,
    message_type: postback ? "postback" : "text",
    body,
    timestamp: timestampToIso(event.timestamp),
    metadata: {
      object: objectType || defaultChannel,
      recipient_id:
        /** @type {any} */ (event.recipient)?.id ||
        /** @type {any} */ (event.to)?.id ||
        null,
      source,
      field: typeof event._field === "string" ? event._field : null,
    },
  });
}

/**
 * Page / Instagram messaging shape — messaging[], standby[], and changes[].
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
      pushMessagingEvent(out, {
        objectType,
        defaultChannel,
        accountId,
        event,
        source: "messaging",
      });
    }

    // Handover Protocol: secondary receiver gets events on standby[].
    const standby = Array.isArray(/** @type {any} */ (entry).standby)
      ? /** @type {any} */ (entry).standby
      : [];
    for (const event of standby) {
      pushMessagingEvent(out, {
        objectType,
        defaultChannel,
        accountId,
        event,
        source: "standby",
      });
    }

    // Instagram Platform / Graph webhooks reference: field + value.
    const changes = Array.isArray(/** @type {any} */ (entry).changes)
      ? /** @type {any} */ (entry).changes
      : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const field = String(change.field || "").toLowerCase();
      if (!PAGE_MESSAGING_CHANGE_FIELDS.has(field)) continue;
      const value = change.value;
      if (!value || typeof value !== "object") continue;

      // Some payloads nest a messaging array inside value.
      if (Array.isArray(/** @type {any} */ (value).messaging)) {
        for (const event of /** @type {any} */ (value).messaging) {
          pushMessagingEvent(out, {
            objectType,
            defaultChannel,
            accountId,
            event: { ...event, _field: field },
            source: `changes:${field}`,
          });
        }
        continue;
      }

      pushMessagingEvent(out, {
        objectType,
        defaultChannel,
        accountId,
        event: { .../** @type {Record<string, unknown>} */ (value), _field: field },
        source: `changes:${field}`,
      });
    }
  }
  return out;
}
