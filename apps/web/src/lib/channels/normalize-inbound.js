/**
 * Normalize Telegram / email / TikTok / webchat / LinkedIn inbound payloads
 * into the same shape Support handlers expect.
 */

/**
 * Strip LinkedIn person URN → bare member id.
 * @param {unknown} value
 * @returns {string}
 */
function linkedInPersonId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/urn:li:person:([^,\s/]+)/i);
  if (match) return match[1];
  return raw.replace(/^urn:li:person:/i, "").trim();
}

/**
 * Pull plain text from LinkedIn message body shapes.
 * @param {unknown} message
 * @returns {string}
 */
function linkedInMessageText(message) {
  if (!message || typeof message !== "object") return "";
  const msg = /** @type {Record<string, unknown>} */ (message);
  const body = msg.body;
  if (typeof body === "string") return body.trim();
  if (body && typeof body === "object") {
    const nested = /** @type {Record<string, unknown>} */ (body);
    const text = nested.text || nested.content || nested.message;
    if (typeof text === "string") return text.trim();
  }
  return String(msg.text || msg.content || msg.message || "").trim();
}

/**
 * @typedef {{
 *   channel: string,
 *   body: string,
 *   subject?: string,
 *   external_user_id: string,
 *   external_conversation_id: string,
 *   provider_message_id: string,
 *   contact_name?: string | null,
 *   metadata?: Record<string, unknown>,
 * }} NormalizedChannelMessage
 */

/**
 * Telegram Bot API update → normalized messages.
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedChannelMessage[]}
 */
export function normalizeTelegramInbound(payload) {
  const message =
    /** @type {Record<string, unknown> | null} */ (
      payload?.message || payload?.edited_message || null
    );
  if (!message || typeof message !== "object") return [];

  const from =
    message.from && typeof message.from === "object"
      ? /** @type {Record<string, unknown>} */ (message.from)
      : {};
  const chat =
    message.chat && typeof message.chat === "object"
      ? /** @type {Record<string, unknown>} */ (message.chat)
      : {};
  const text = String(message.text || message.caption || "").trim();
  if (!text) return [];

  const userId = String(from.id || chat.id || "unknown");
  const chatId = String(chat.id || userId);
  const updateId = String(payload.update_id || message.message_id || "");
  const first = String(from.first_name || "").trim();
  const last = String(from.last_name || "").trim();
  const contactName = `${first} ${last}`.trim() || null;

  return [
    {
      channel: "telegram",
      body: text,
      external_user_id: userId,
      external_conversation_id: `telegram:${chatId}`,
      provider_message_id: String(message.message_id || updateId),
      contact_name: contactName,
      metadata: {
        chat_id: chatId,
        username: from.username || null,
        contact_name: contactName,
        update_id: updateId,
      },
    },
  ];
}

/**
 * Email inbound webhook → normalized messages.
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedChannelMessage[]}
 */
export function normalizeEmailInbound(payload) {
  const from = String(payload.from || payload.sender || "").trim();
  const body = String(payload.body || payload.text || payload.html || "").trim();
  if (!from || !body) return [];

  const subject = String(payload.subject || "").trim();
  const messageId = String(
    payload.message_id || payload.id || `email-${Date.now().toString(36)}`,
  );

  return [
    {
      channel: "email",
      body: subject ? `${subject}\n\n${body}` : body,
      subject: subject || undefined,
      external_user_id: from.toLowerCase(),
      external_conversation_id: `email:${from.toLowerCase()}`,
      provider_message_id: messageId,
      contact_name: String(payload.contact_name || from).trim() || from,
      metadata: {
        email: from.toLowerCase(),
        contact_name: String(payload.contact_name || from).trim() || from,
        subject,
      },
    },
  ];
}

/**
 * TikTok inbound → normalized messages.
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedChannelMessage[]}
 */
export function normalizeTikTokInbound(payload) {
  const text = String(
    payload.text ||
      /** @type {Record<string, unknown>} */ (payload.message || {})?.text ||
      "",
  ).trim();
  const simulated = Boolean(payload.simulated);
  if (!text && !simulated) return [];

  const userId = String(
    payload.from_user_id ||
      /** @type {Record<string, unknown>} */ (payload.sender || {})?.id ||
      "tiktok-user",
  );
  const eventId = String(payload.event_id || payload.id || `tt-${Date.now()}`);

  return [
    {
      channel: "tiktok",
      body: text || "TikTok inbound event",
      external_user_id: userId,
      external_conversation_id: `tiktok:${userId}`,
      provider_message_id: String(payload.message_id || eventId),
      contact_name: null,
      metadata: { raw_keys: Object.keys(payload || {}) },
    },
  ];
}

/**
 * LinkedIn Messaging inbound → normalized messages.
 * Accepts simulator flats, single events, and `{ events|elements|notifications }` batches.
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedChannelMessage[]}
 */
export function normalizeLinkedInInbound(payload) {
  if (!payload || typeof payload !== "object") return [];

  /** @type {Array<Record<string, unknown>>} */
  const events = [];
  const batch = payload.events || payload.elements || payload.notifications;
  if (Array.isArray(batch) && batch.length) {
    for (const item of batch) {
      if (item && typeof item === "object") {
        events.push(/** @type {Record<string, unknown>} */ (item));
      }
    }
  } else if (payload.event && typeof payload.event === "object") {
    events.push(/** @type {Record<string, unknown>} */ (payload.event));
  } else {
    events.push(payload);
  }

  /** @type {NormalizedChannelMessage[]} */
  const out = [];
  for (const event of events) {
    const message =
      event.message && typeof event.message === "object"
        ? /** @type {Record<string, unknown>} */ (event.message)
        : event;
    const simulated = Boolean(event.simulated || payload.simulated);
    const text =
      linkedInMessageText(message) ||
      String(event.text || event.body || payload.text || payload.body || "").trim();
    if (!text && !simulated) continue;

    const fromRaw =
      event.from_user_id ||
      event.from ||
      event.actor ||
      event.sender ||
      message.from ||
      message.sender ||
      payload.from_user_id ||
      payload.from ||
      "linkedin-user";
    const userId =
      linkedInPersonId(
        typeof fromRaw === "object" && fromRaw
          ? /** @type {Record<string, unknown>} */ (fromRaw).id ||
              /** @type {Record<string, unknown>} */ (fromRaw).urn ||
              fromRaw
          : fromRaw,
      ) || "linkedin-user";

    const eventId = String(
      event.message_id ||
        message.id ||
        event.id ||
        event.event_id ||
        payload.message_id ||
        payload.id ||
        `li-${Date.now()}`,
    );
    const contactName =
      String(
        event.contact_name ||
          payload.contact_name ||
          (typeof fromRaw === "object" && fromRaw
            ? /** @type {Record<string, unknown>} */ (fromRaw).name ||
              /** @type {Record<string, unknown>} */ (fromRaw).firstName ||
              ""
            : "") ||
          "",
      ).trim() || null;

    out.push({
      channel: "linkedin",
      body: text || "LinkedIn inbound event",
      external_user_id: userId,
      external_conversation_id: `linkedin:${userId}`,
      provider_message_id: eventId,
      contact_name: contactName,
      metadata: {
        contact_name: contactName,
        person_urn: `urn:li:person:${userId}`,
        event_type: String(event.eventType || event.type || payload.type || "MESSAGE"),
        simulated,
        raw_keys: Object.keys(event || {}),
      },
    });
  }

  return out;
}

/**
 * Webchat widget POST body → normalized message.
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedChannelMessage[]}
 */
export function normalizeWebchatInbound(payload) {
  const body = String(payload.body || "").trim();
  if (!body) return [];

  const visitorId = String(
    payload.visitor_id ||
      payload.external_user_id ||
      `visitor-${Date.now().toString(36)}`,
  );
  const contactName =
    String(payload.name || payload.contact_name || "").trim() ||
    "Website visitor";
  const messageId = String(
    payload.message_id || `wc-${Date.now().toString(36)}`,
  );

  return [
    {
      channel: "webchat",
      body,
      external_user_id: visitorId,
      external_conversation_id: `webchat:${visitorId}`,
      provider_message_id: messageId,
      contact_name: contactName,
      metadata: {
        contact_name: contactName,
        email: payload.email ? String(payload.email) : null,
        widget_token: payload.token ? String(payload.token).slice(0, 24) : null,
      },
    },
  ];
}
