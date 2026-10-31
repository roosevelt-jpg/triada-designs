/**
 * After Creative publishes a post, fan out to ALL registered subscribers:
 * email (Resend HTML with image/video links), WhatsApp (Meta media),
 * Telegram (photo/video or link caption).
 */

import { wrapEmailMessage } from "@/lib/brand/wrap-email";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";
import { BRAND } from "@/lib/brand/identity";
import { listContacts } from "@/lib/crm/contacts-store";
import { listConversations } from "@/lib/crm/conversations-store";
import { toWhatsAppRecipient } from "@/lib/crm/phone-e164";
import { getMediaForContent } from "@/lib/creative/media-store";
import { sendResendEmail } from "@/lib/email/resend";
import {
  extractWhatsAppMediaInput,
  sendWhatsAppMediaMessage,
  uploadWhatsAppMedia,
} from "@/lib/integrations/whatsapp-cloud-media";
import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp-cloud-text";
import { sendTelegramTextMessage } from "@/lib/integrations/telegram-bot-text";
import {
  sendTelegramPhoto,
  sendTelegramVideo,
} from "@/lib/integrations/telegram-bot-media";
import { listJewelleryOpsRecords } from "@/lib/jewellery-ops/store";
import { absolutePublicMediaUrl } from "@/lib/integrations/whatsapp-campaign-promo";
import { absoluteAppUrl, PRODUCTION_APP_URL } from "@/lib/public-app-url";
import { mapParallel } from "@/lib/runtime/parallel-map";

const FANOUT_RECIPIENT_CAP = 200;
const FANOUT_CONCURRENCY = 8;

/**
 * @param {string | null | undefined} url
 */
function isDataUrl(url) {
  return /^data:/i.test(String(url || "").trim());
}

/**
 * @param {string | null | undefined} url
 */
function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

/**
 * Prefer a usable public HTTPS URL; relative paths become dashboard absolute.
 * Data URLs stay as-is for upload/embed paths.
 * @param {string | null | undefined} raw
 */
function normalizeMediaUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (isDataUrl(value) || isHttpUrl(value)) return value;
  return absolutePublicMediaUrl(value);
}

/**
 * @param {object | null | undefined} asset
 */
function assetLooksVideo(asset) {
  if (!asset || typeof asset !== "object") return false;
  const kind = String(asset.kind || "").toLowerCase();
  const mime = String(asset.mime_type || "").toLowerCase();
  if (kind === "video" || kind === "ugc_video" || kind === "animation") return true;
  if (mime.startsWith("video/")) return true;
  const url = String(asset.url || "");
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

/**
 * Pick image + video assets from the creative media store / brief.
 * @param {string} contentId
 * @param {Record<string, unknown> | null | undefined} content
 */
export function resolveCreativeFanoutMedia(contentId, content = null) {
  const media = getMediaForContent(contentId);
  const assets = [
    ...(Array.isArray(media.assets) ? media.assets : []),
    ...(Array.isArray(media.variants)
      ? media.variants.map((v) => v?.media_asset || v).filter(Boolean)
      : []),
  ];

  const brief =
    content && typeof content.creative_brief === "object" && content.creative_brief
      ? /** @type {Record<string, unknown>} */ (content.creative_brief)
      : {};

  const imageAsset =
    assets.find((a) => !assetLooksVideo(a) && a?.url) ||
    assets.find((a) => a?.metadata?.quote_card && a?.url) ||
    null;
  const videoAsset = assets.find((a) => assetLooksVideo(a) && a?.url) || null;

  const imageUrl =
    normalizeMediaUrl(imageAsset?.url) ||
    normalizeMediaUrl(brief.card_url) ||
    normalizeMediaUrl(brief.image_url) ||
    null;
  const videoUrl =
    normalizeMediaUrl(videoAsset?.url) ||
    normalizeMediaUrl(brief.video_url) ||
    normalizeMediaUrl(brief.ugc_video_url) ||
    null;

  return {
    imageUrl,
    videoUrl,
    imageMime: imageAsset?.mime_type || (imageUrl && isDataUrl(imageUrl) ? null : "image/jpeg"),
    videoMime: videoAsset?.mime_type || "video/mp4",
    imageAsset,
    videoAsset,
    hasMedia: Boolean(imageUrl || videoUrl),
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} content
 * @param {ReturnType<typeof resolveCreativeFanoutMedia>} media
 */
async function buildCaption(content, media) {
  const title = String(content?.title || "").trim();
  const body = String(content?.body || content?.caption || "").trim();
  const brief =
    content && typeof content.creative_brief === "object" && content.creative_brief
      ? /** @type {Record<string, unknown>} */ (content.creative_brief)
      : {};
  const briefCaption = String(brief.caption || brief.quote || "").trim();
  const parts = [];
  if (title) parts.push(title);
  if (briefCaption) parts.push(briefCaption);
  else if (body) parts.push(body.slice(0, 600));
  if (media.videoUrl && isHttpUrl(media.videoUrl)) {
    parts.push(`Video: ${media.videoUrl}`);
  } else if (media.videoUrl) {
    parts.push("A short video is attached with this drop.");
  }
  if (media.imageUrl && isHttpUrl(media.imageUrl)) {
    parts.push(`Image: ${media.imageUrl}`);
  }
  const viewUrl = absoluteAppUrl(
    `/content?highlight=${encodeURIComponent(String(content?.id || ""))}`,
  );
  parts.push(`Explore more at ${BRAND.siteUrl}`);
  parts.push(viewUrl || PRODUCTION_APP_URL);

  const raw = parts.filter(Boolean).join("\n\n") || `${BRAND.name} just shared a new piece.`;
  const branded = await ensureBrandedOutboundText(raw, {
    greetingKind: "default",
  });
  return branded.text || raw;
}

/**
 * @param {ReturnType<typeof resolveCreativeFanoutMedia>} media
 * @param {string} caption
 * @param {Record<string, unknown> | null | undefined} content
 */
function buildEmailBodies(media, caption, content) {
  const title = String(content?.title || "New from Triada Designs").trim();
  const htmlParts = [];
  htmlParts.push(
    `<p style="margin:0 0 14px;font-size:16px;">${escapeHtml(title)}</p>`,
  );
  const briefCaption =
    content &&
    typeof content.creative_brief === "object" &&
    content.creative_brief
      ? String(
          /** @type {Record<string, unknown>} */ (content.creative_brief).caption ||
            "",
        ).trim()
      : "";
  const bodyText = String(content?.body || briefCaption || "").trim();
  if (bodyText) {
    htmlParts.push(
      `<p style="margin:0 0 16px;white-space:pre-wrap;">${escapeHtml(bodyText.slice(0, 1200))}</p>`,
    );
  }
  if (media.imageUrl) {
    if (isHttpUrl(media.imageUrl) || isDataUrl(media.imageUrl)) {
      htmlParts.push(
        `<p style="margin:0 0 16px;"><img src="${escapeAttr(media.imageUrl)}" alt="${escapeAttr(title)}" style="display:block;max-width:100%;height:auto;border:0;" /></p>`,
      );
    }
    if (isHttpUrl(media.imageUrl)) {
      htmlParts.push(
        `<p style="margin:0 0 10px;font-size:13px;"><a href="${escapeAttr(media.imageUrl)}">Open image</a></p>`,
      );
    }
  }
  if (media.videoUrl) {
    if (isHttpUrl(media.videoUrl)) {
      htmlParts.push(
        `<p style="margin:0 0 10px;"><a href="${escapeAttr(media.videoUrl)}" style="font-weight:600;">Watch the video</a></p>`,
      );
    } else {
      htmlParts.push(
        `<p style="margin:0 0 10px;">A short marketing video is part of this drop — reply and we’ll share the link.</p>`,
      );
    }
  }
  htmlParts.push(
    `<p style="margin:16px 0 0;"><a href="${escapeAttr(BRAND.siteUrl)}">Visit ${escapeHtml(BRAND.name)}</a></p>`,
  );

  const textParts = [caption];
  if (media.imageUrl && isHttpUrl(media.imageUrl)) {
    textParts.push(`Image: ${media.imageUrl}`);
  }
  if (media.videoUrl && isHttpUrl(media.videoUrl)) {
    textParts.push(`Video: ${media.videoUrl}`);
  }

  return {
    bodyHtml: htmlParts.join("\n"),
    bodyText: textParts.join("\n\n"),
    subject: `${BRAND.name} — ${title}`.slice(0, 120),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

/**
 * Email subscribers: CRM contacts with email, not opted out.
 * @param {Awaited<ReturnType<typeof listContacts>>["data"]} contacts
 */
function emailRecipients(contacts) {
  const seen = new Set();
  const out = [];
  for (const c of contacts) {
    if (c.marketing_opt_out) continue;
    const email = String(c.email_normalized || c.email || "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push({ contact_id: c.id, name: c.name || null, email });
  }
  return out.slice(0, FANOUT_RECIPIENT_CAP);
}

/**
 * WhatsApp subscribers: whatsapp_ready CRM contacts.
 * @param {Awaited<ReturnType<typeof listContacts>>["data"]} contacts
 */
function whatsappRecipients(contacts) {
  const seen = new Set();
  const out = [];
  for (const c of contacts) {
    if (c.marketing_opt_out) continue;
    if (!c.whatsapp_ready) continue;
    const to =
      toWhatsAppRecipient(c.phone_e164 || c.phone_normalized || c.phone) ||
      String(c.phone_normalized || "").replace(/\D+/g, "");
    if (!to || seen.has(to)) continue;
    seen.add(to);
    out.push({ contact_id: c.id, name: c.name || null, to });
  }
  return out.slice(0, FANOUT_RECIPIENT_CAP);
}

/**
 * Telegram chat IDs from CRM metadata, inbox conversations, and waitlist.
 * @param {Awaited<ReturnType<typeof listContacts>>["data"]} contacts
 */
async function telegramRecipients(contacts) {
  /** @type {Map<string, { chat_id: string, contact_id?: string|null, source: string }>} */
  const byChat = new Map();

  for (const c of contacts) {
    if (c.marketing_opt_out) continue;
    const meta =
      c.metadata && typeof c.metadata === "object"
        ? /** @type {Record<string, unknown>} */ (c.metadata)
        : {};
    const chatId = String(
      meta.telegram_chat_id || meta.telegram_id || meta.chat_id || "",
    ).trim();
    if (chatId && !byChat.has(chatId)) {
      byChat.set(chatId, {
        chat_id: chatId,
        contact_id: c.id,
        source: "crm_metadata",
      });
    }
  }

  try {
    const conversations = await listConversations({ channel: "telegram" });
    const rows = Array.isArray(conversations) ? conversations : [];
    for (const row of rows) {
      if (row?.marketing_opt_out || row?.handoff_status === "opted_out") continue;
      const chatId = String(
        row.external_user_id ||
          row.metadata?.chat_id ||
          row.metadata?.telegram_chat_id ||
          "",
      ).trim();
      if (!chatId || byChat.has(chatId)) continue;
      byChat.set(chatId, {
        chat_id: chatId,
        contact_id: row.contact_id || null,
        source: "conversation",
      });
    }
  } catch {
    /* inbox optional */
  }

  try {
    const waitlist = await listJewelleryOpsRecords({
      kind: "waitlist",
      limit: 200,
    });
    for (const row of waitlist.data || []) {
      const payload = row.payload || {};
      const via = String(payload.notify_via || "").toLowerCase();
      const chatId = String(payload.chat_id || "").trim();
      if (!chatId || byChat.has(chatId)) continue;
      if (via && via !== "telegram" && via !== "all") continue;
      byChat.set(chatId, {
        chat_id: chatId,
        contact_id: payload.contact_id ? String(payload.contact_id) : null,
        source: "waitlist",
      });
    }
  } catch {
    /* waitlist optional */
  }

  return [...byChat.values()].slice(0, FANOUT_RECIPIENT_CAP);
}

/**
 * Prepare WhatsApp media_id / link once for the broadcast.
 * @param {ReturnType<typeof resolveCreativeFanoutMedia>} media
 */
async function prepareWhatsAppMedia(media) {
  /** @type {{ media_id: string|null, media_link: string|null, media_type: "image"|"video", media_base64?: string|null, upload_mode: string }} */
  const prepared = {
    media_id: null,
    media_link: null,
    media_type: media.videoUrl ? "video" : "image",
    upload_mode: "local_sim",
  };

  const primaryUrl = media.videoUrl || media.imageUrl;
  if (!primaryUrl) return prepared;

  if (isDataUrl(primaryUrl)) {
    const uploaded = await uploadWhatsAppMedia({
      media_base64: primaryUrl,
      mime_type: media.videoUrl ? media.videoMime : media.imageMime,
      media_type: prepared.media_type,
      filename: media.videoUrl
        ? `triada-creative-${Date.now()}.mp4`
        : `triada-creative-${Date.now()}.jpg`,
    });
    prepared.media_id = uploaded.media_id || null;
    prepared.upload_mode = uploaded.mode || prepared.upload_mode;
    if (!uploaded.ok) prepared.media_base64 = primaryUrl;
    return prepared;
  }

  if (isHttpUrl(primaryUrl)) {
    const uploaded = await uploadWhatsAppMedia({
      media_url: primaryUrl,
      mime_type: media.videoUrl ? media.videoMime : media.imageMime,
      media_type: prepared.media_type,
      filename: media.videoUrl
        ? `triada-creative-${Date.now()}.mp4`
        : `triada-creative-${Date.now()}.jpg`,
    });
    prepared.media_id = uploaded.media_id || null;
    prepared.media_link = uploaded.ok ? null : primaryUrl;
    if (!prepared.media_id) prepared.media_link = primaryUrl;
    prepared.upload_mode = uploaded.mode || prepared.upload_mode;
    return prepared;
  }

  prepared.media_link = primaryUrl;
  return prepared;
}

/**
 * Fan out a published creative post to email + WhatsApp + Telegram subscribers.
 *
 * @param {{
 *   content: Record<string, unknown>,
 *   force?: boolean,
 *   dry_run?: boolean,
 *   limit?: number,
 * }} input
 */
export async function fanOutCreativeToSubscribers(input) {
  const content = input.content;
  if (!content || !content.id) {
    return { ok: false, error: "content_required", attempted: 0, sent: 0 };
  }

  const existing =
    content.publish_metadata &&
    typeof content.publish_metadata === "object"
      ? /** @type {Record<string, unknown>} */ (content.publish_metadata)
          .subscriber_fanout
      : null;
  if (existing && !input.force) {
    return {
      ok: true,
      skipped: true,
      reason: "already_fanned_out",
      previous: existing,
    };
  }

  const media = resolveCreativeFanoutMedia(String(content.id), content);
  const caption = await buildCaption(content, media);
  const emailBodies = buildEmailBodies(media, caption, content);

  const listed = await listContacts({});
  let emails = emailRecipients(listed.data);
  let whatsapps = whatsappRecipients(listed.data);
  let telegrams = await telegramRecipients(listed.data);

  const limit = Math.min(
    Math.max(Number(input.limit) || FANOUT_RECIPIENT_CAP, 1),
    FANOUT_RECIPIENT_CAP,
  );
  emails = emails.slice(0, limit);
  whatsapps = whatsapps.slice(0, limit);
  telegrams = telegrams.slice(0, limit);

  if (input.dry_run) {
    return {
      ok: true,
      dry_run: true,
      content_id: content.id,
      media: {
        has_image: Boolean(media.imageUrl),
        has_video: Boolean(media.videoUrl),
        image_http: Boolean(media.imageUrl && isHttpUrl(media.imageUrl)),
        video_http: Boolean(media.videoUrl && isHttpUrl(media.videoUrl)),
      },
      recipients: {
        email: emails.length,
        whatsapp: whatsapps.length,
        telegram: telegrams.length,
      },
      contacts_mode: listed.mode,
    };
  }

  const waMedia = await prepareWhatsAppMedia(media);

  const [emailResults, waResults, tgResults] = await Promise.all([
    mapParallel(
      emails,
      async (row) => {
        const wrapped = wrapEmailMessage({
          subject: emailBodies.subject,
          bodyHtml: emailBodies.bodyHtml,
          bodyText: emailBodies.bodyText,
          customerName: row.name || undefined,
          greetingKind: "default",
        });
        const sent = await sendResendEmail({
          to: row.email,
          subject: wrapped.subject,
          html: wrapped.html,
          text: wrapped.text,
          tags: [{ name: "kind", value: "creative_subscriber_fanout" }],
        });
        return {
          contact_id: row.contact_id,
          to: row.email,
          ok: Boolean(sent.ok),
          mode: sent.mode,
          error: sent.error || null,
          provider_message_id: sent.id || null,
        };
      },
      { concurrency: FANOUT_CONCURRENCY },
    ),
    mapParallel(
      whatsapps,
      async (row) => {
        let send;
        if (waMedia.media_id || waMedia.media_link || waMedia.media_base64) {
          send = await sendWhatsAppMediaMessage({
            to: row.to,
            ...extractWhatsAppMediaInput({
              media_id: waMedia.media_id,
              media_link: waMedia.media_link,
              media_base64: waMedia.media_base64,
              media_type: waMedia.media_type,
              caption,
            }),
            caption,
          });
        } else {
          send = await sendWhatsAppTextMessage({ to: row.to, body: caption });
        }
        return {
          contact_id: row.contact_id,
          to: row.to,
          ok: Boolean(send.ok),
          mode: send.mode,
          error: send.error || null,
          provider_message_id: send.provider_message_id || null,
          media_id: send.media_id || waMedia.media_id || null,
        };
      },
      { concurrency: FANOUT_CONCURRENCY },
    ),
    mapParallel(
      telegrams,
      async (row) => {
        let send;
        const primaryUrl = media.videoUrl || media.imageUrl;
        const useVideo = Boolean(media.videoUrl);
        if (primaryUrl && (isHttpUrl(primaryUrl) || isDataUrl(primaryUrl))) {
          const payload = {
            chat_id: row.chat_id,
            caption,
            media_url: isHttpUrl(primaryUrl) ? primaryUrl : null,
            media_base64: isDataUrl(primaryUrl) ? primaryUrl : null,
            mime_type: useVideo ? media.videoMime : media.imageMime,
            filename: useVideo
              ? `triada-${content.id}.mp4`
              : `triada-${content.id}.jpg`,
          };
          send = useVideo
            ? await sendTelegramVideo(payload)
            : await sendTelegramPhoto(payload);
          if (!send.ok) {
            send = await sendTelegramTextMessage({
              chat_id: row.chat_id,
              body: caption,
            });
          }
        } else {
          send = await sendTelegramTextMessage({
            chat_id: row.chat_id,
            body: caption,
          });
        }
        return {
          chat_id: row.chat_id,
          contact_id: row.contact_id || null,
          source: row.source,
          ok: Boolean(send.ok),
          mode: send.mode,
          kind: send.kind || "text",
          error: send.error || null,
          provider_message_id: send.provider_message_id || null,
        };
      },
      { concurrency: FANOUT_CONCURRENCY },
    ),
  ]);

  const all = [...emailResults, ...waResults, ...tgResults];
  const sent = all.filter((r) => r.ok).length;
  const summary = {
    ok: true,
    content_id: content.id,
    at: new Date().toISOString(),
    attempted: all.length,
    sent,
    failed: all.length - sent,
    channels: {
      email: {
        attempted: emailResults.length,
        sent: emailResults.filter((r) => r.ok).length,
        results: emailResults,
      },
      whatsapp: {
        attempted: waResults.length,
        sent: waResults.filter((r) => r.ok).length,
        upload_mode: waMedia.upload_mode,
        media_id: waMedia.media_id,
        media_type: waMedia.media_type,
        results: waResults,
      },
      telegram: {
        attempted: tgResults.length,
        sent: tgResults.filter((r) => r.ok).length,
        results: tgResults,
      },
    },
    media: {
      has_image: Boolean(media.imageUrl),
      has_video: Boolean(media.videoUrl),
      image_http: Boolean(media.imageUrl && isHttpUrl(media.imageUrl)),
      video_http: Boolean(media.videoUrl && isHttpUrl(media.videoUrl)),
    },
    contacts_mode: listed.mode,
  };

  return summary;
}
