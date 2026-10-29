/**
 * Normalize Telegram / email / TikTok / webchat inbound payloads
 * into the same shape Support handlers expect.
 */

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
