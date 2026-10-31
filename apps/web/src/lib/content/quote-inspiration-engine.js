/**
 * Quote / Inspiration engine:
 * generate designed quote cards → human approve → weekday schedule → WhatsApp broadcast.
 * Learns from Training Docs (jewellery niche / tone / customers).
 */

import { completeAnthropic } from "@/lib/agents/anthropic-client";
import { ensureBrandedOutboundText } from "@/lib/brand/wrap-message";
import { BRAND } from "@/lib/brand/identity";
import { creativeModeLabel } from "@/lib/integrations/brand-labels";
import { hasGeminiEnv } from "@/lib/integrations/env-presence";
import {
  extractWhatsAppMediaInput,
  sendWhatsAppMediaMessage,
  uploadWhatsAppMedia,
} from "@/lib/integrations/whatsapp-cloud-media";
import { sendWhatsAppTemplateMessage } from "@/lib/integrations/whatsapp-cloud-templates";
import { listWhatsAppCampaignRecipients } from "@/lib/crm/contacts-store";
import { toWhatsAppRecipient } from "@/lib/crm/phone-e164";
import { upsertMediaAsset } from "@/lib/creative/media-store";
import { quoteCardBase64, quoteCardDataUrl } from "@/lib/creative/quote-card";
import {
  QUOTE_PROMPT_VERSION,
  forQuoteCardImage,
  localQuotePackage,
  quoteInspirationSystemPrompt,
  quoteInspirationUserPrompt,
} from "@/lib/creative/quote-prompts";
import { retrieveTrainingDocs } from "@/lib/training/training-docs-store";
import { patchContent } from "@/lib/content-schedule-store";
import {
  appendQuoteInspirationHistory,
  createQuoteContentId,
  getQuoteInspirationSettings,
  isoWeekday,
  isWeekdaySendDue,
  nextWeekdaySendAt,
  patchQuoteInspirationHistory,
  saveQuoteInspirationSettings,
} from "./quote-inspiration-store.js";
import { mapParallel } from "@/lib/runtime/parallel-map";

/**
 * @param {string} text
 * @param {Record<string, unknown>} fallback
 */
function parseJsonObject(text, fallback) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { ...fallback };
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return { ...fallback };
  try {
    const decoded = JSON.parse(trimmed.slice(start, end + 1));
    if (decoded && typeof decoded === "object") {
      return { ...fallback, ...decoded };
    }
  } catch {
    /* fall through */
  }
  return { ...fallback };
}

/**
 * Retrieve jewellery / niche / customer training context for quote generation.
 * @param {{ theme?: string, language?: string }} [opts]
 */
export async function loadQuoteTrainingContext(opts = {}) {
  const theme = String(opts.theme || "jewellery inspiration tone customers niche");
  const docs = await retrieveTrainingDocs(
    `${theme} jewellery brand niche customers inspiration quote tone timing`,
    {
      limit: 5,
      categories: ["tone", "timing", "conversation", "inspiration", "niche", "general"],
    },
  );
  const trainingText = docs
    .map((d) => `### ${d.title} (${d.category})\n${d.excerpt}`)
    .join("\n\n");
  return { docs, trainingText };
}

/**
 * Generate a quote + designed card; creates a Content Studio item in_review.
 * @param {{
 *   theme?: string,
 *   language?: string,
 *   niche_hint?: string,
 *   customer_hint?: string,
 *   schedule?: boolean,
 *   approve?: boolean,
 * }} [input]
 */
export async function generateQuoteInspiration(input = {}) {
  const settings = await getQuoteInspirationSettings();
  const theme = String(input.theme || settings.theme || "quiet luxury jewellery");
  const language = String(input.language || settings.language || "en");
  const { docs, trainingText } = await loadQuoteTrainingContext({ theme, language });

  const fallback = localQuotePackage({ theme });
  let packageData = { ...fallback };
  let copyLive = false;

  const completion = await completeAnthropic({
    system: quoteInspirationSystemPrompt(trainingText),
    prompt: quoteInspirationUserPrompt({
      theme,
      language,
      niche_hint: input.niche_hint,
      customer_hint: input.customer_hint,
    }),
    temperature: 0.65,
    max_tokens: 700,
  });

  if (completion.ok && completion.text) {
    packageData = parseJsonObject(completion.text, fallback);
    copyLive = true;
  }

  const quote = String(packageData.quote || fallback.quote).trim();
  const attribution = String(
    packageData.attribution || fallback.attribution || BRAND.name,
  ).trim();
  const caption = String(packageData.caption || fallback.caption).trim();
  const cta = String(packageData.cta || fallback.cta || "Discover Triada").trim();
  const visualMood = String(
    packageData.visual_mood || fallback.visual_mood || "",
  ).trim();
  const hashtags = Array.isArray(packageData.hashtags)
    ? packageData.hashtags.map(String).slice(0, 8)
    : fallback.hashtags;

  const imagePrompt = forQuoteCardImage(quote, {
    theme,
    visual_mood: visualMood,
  });
  const cardUrl = quoteCardDataUrl({
    quote,
    attribution,
    theme,
    brand: BRAND.name,
    width: 1080,
    height: 1080,
  });

  const geminiReady = hasGeminiEnv();
  const mediaMode = geminiReady ? "gemini" : "local_sim";
  const overallMode = copyLive || geminiReady ? (geminiReady ? "gemini" : "live") : "local_sim";

  const contentId = createQuoteContentId();
  const scheduledFor =
    input.schedule !== false && settings.auto_schedule_next
      ? nextWeekdaySendAt(settings)
      : null;

  let status = "in_review";
  let approvalVersion = 0;
  let approvedAt = null;
  let approvedBy = null;

  if (input.approve === true || settings.require_approval === false) {
    status = scheduledFor ? "scheduled" : "approved";
    approvalVersion = 1;
    approvedAt = new Date().toISOString();
    approvedBy = input.approve === true ? "admin" : "quote_engine_auto";
  } else if (scheduledFor && settings.require_approval) {
    // Keep in_review until human approves; still attach proposed weekday slot.
    status = "in_review";
  }

  const content = patchContent(contentId, {
    id: contentId,
    title: `Inspiration · ${theme}`,
    body: quote,
    content_type: "inspiration_quote",
    objective: "inspiration",
    channel: settings.channel || "whatsapp",
    campaign_key: settings.campaign_key || "inspiration",
    status,
    scheduled_for: status === "scheduled" ? scheduledFor : null,
    proposed_scheduled_for: scheduledFor,
    approval_version: approvalVersion,
    approved_at: approvedAt,
    approved_by: approvedBy,
    product_context: {
      name: "Triada Inspiration",
      materials: "brand atmosphere",
    },
    creative_brief: {
      kind: "quote_card",
      quote,
      attribution,
      caption,
      cta,
      hashtags,
      theme,
      visual_mood: visualMood,
      image_prompt: imagePrompt,
      prompt_version: QUOTE_PROMPT_VERSION,
      training_doc_ids: docs.map((d) => d.id),
      language,
    },
    publish_metadata: {
      quote_engine: true,
      weekday: scheduledFor ? isoWeekday(new Date(scheduledFor)) : null,
      proposed_scheduled_for: scheduledFor,
      proposal_source: "quote_inspiration_engine",
    },
    review_notified_at: null,
  });

  const asset = upsertMediaAsset(contentId, {
    id: `asset-${contentId}-quote-card`,
    kind: "image",
    mode: mediaMode,
    width: 1080,
    height: 1080,
    aspect_ratio: "1:1",
    url: cardUrl,
    mime_type: "image/svg+xml",
    prompt: imagePrompt,
    preview_ready: true,
    metadata: {
      quote_card: true,
      quote,
      attribution,
    },
  });

  const history = await appendQuoteInspirationHistory({
    content_id: contentId,
    quote,
    attribution,
    caption,
    theme,
    status: content.status,
    card_url: cardUrl,
    scheduled_for: content.scheduled_for || scheduledFor,
    weekday: scheduledFor ? isoWeekday(new Date(scheduledFor)) : null,
    training_doc_ids: docs.map((d) => d.id),
  });

  await saveQuoteInspirationSettings({
    last_run_at: new Date().toISOString(),
    last_content_id: contentId,
  });

  return {
    ok: true,
    mode: overallMode,
    mode_label: creativeModeLabel(overallMode),
    prompt_version: QUOTE_PROMPT_VERSION,
    content,
    asset,
    history,
    quote: {
      quote,
      attribution,
      caption,
      cta,
      hashtags,
      theme,
      visual_mood: visualMood,
      card_url: cardUrl,
    },
    training_docs: docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      score: d.score,
    })),
    next_send_at: scheduledFor,
    preview_required: content.status === "in_review",
    review_url: "/content/review",
    message:
      content.status === "in_review"
        ? "Quote card ready — preview and approve before weekday broadcast."
        : "Quote card generated and queued for the next selected weekday.",
  };
}

/**
 * Broadcast an approved quote card to the WhatsApp campaign / customer list.
 * Uses Meta media upload + template or session media (WA media #39 path).
 * @param {{
 *   content_id?: string,
 *   history_id?: string,
 *   contact_ids?: string[],
 *   limit?: number,
 *   template_name?: string,
 *   dry_run?: boolean,
 * }} [input]
 */
export async function broadcastQuoteInspiration(input = {}) {
  const settings = await getQuoteInspirationSettings();
  const { findContent } = await import("@/lib/content-schedule-store");
  const { getMediaForContent } = await import("@/lib/creative/media-store");

  let contentId = String(input.content_id || settings.last_content_id || "");
  let content = contentId ? findContent(contentId) : null;

  if (!content || content.content_type !== "inspiration_quote") {
    // Fall back to most recent scheduled/approved quote in content store.
    const { getContentItems } = await import("@/lib/content-schedule-store");
    content =
      getContentItems().find(
        (c) =>
          c.content_type === "inspiration_quote" &&
          (c.status === "approved" || c.status === "scheduled" || c.status === "published"),
      ) || null;
    contentId = content?.id || "";
  }

  if (!content) {
    return { ok: false, error: "no_quote_content", message: "Generate and approve a quote card first." };
  }

  if (settings.require_approval && (content.approval_version || 0) < 1) {
    return {
      ok: false,
      error: "approval_required",
      gate: "approval_required",
      message: "Human approval required before broadcast.",
      content_id: content.id,
    };
  }

  const media = getMediaForContent(content.id);
  const cardAsset =
    media.assets.find((a) => a.metadata?.quote_card) ||
    media.assets.find((a) => a.kind === "image") ||
    null;
  const cardUrl = cardAsset?.url || content.creative_brief?.card_url || null;
  const quote = String(content.creative_brief?.quote || content.body || "");
  const captionRaw = String(
    content.creative_brief?.caption || quote || "Inspiration from Triada Designs",
  );
  const branded = await ensureBrandedOutboundText(captionRaw, {
    greetingKind: "default",
  });
  const caption = branded.text || captionRaw;

  const listed = await listWhatsAppCampaignRecipients();
  let recipients = listed.data;
  const allowIds =
    Array.isArray(input.contact_ids) && input.contact_ids.length
      ? input.contact_ids.map(String)
      : settings.contact_ids?.length
        ? settings.contact_ids.map(String)
        : null;
  if (allowIds) {
    const allow = new Set(allowIds);
    recipients = recipients.filter((c) => allow.has(c.id));
  }
  const limit = Math.min(
    Math.max(Number(input.limit ?? settings.recipient_limit) || recipients.length, 0),
    100,
  );
  recipients = recipients.slice(0, limit);

  if (input.dry_run) {
    return {
      ok: true,
      dry_run: true,
      content_id: content.id,
      recipients: recipients.length,
      template_name: input.template_name || settings.template_name,
      has_card: Boolean(cardUrl),
      mode: listed.mode,
    };
  }

  /** @type {string|null} */
  let mediaId = null;
  /** @type {string|null} */
  let mediaLink = null;
  let uploadMode = "local_sim";

  if (cardUrl) {
    if (cardUrl.startsWith("data:")) {
      const uploaded = await uploadWhatsAppMedia({
        media_base64: quoteCardBase64(cardUrl),
        mime_type: "image/svg+xml",
        media_type: "image",
        filename: `triada-quote-${content.id}.svg`,
      });
      mediaId = uploaded.media_id || null;
      uploadMode = uploaded.mode || uploadMode;
      if (!uploaded.ok && uploaded.media_link) mediaLink = uploaded.media_link;
    } else if (/^https?:\/\//i.test(cardUrl)) {
      const uploaded = await uploadWhatsAppMedia({
        media_url: cardUrl,
        media_type: "image",
        filename: `triada-quote-${content.id}.jpg`,
      });
      mediaId = uploaded.media_id || null;
      mediaLink = uploaded.ok ? null : cardUrl;
      uploadMode = uploaded.mode || uploadMode;
      if (!mediaId) mediaLink = cardUrl;
    } else {
      mediaLink = cardUrl.startsWith("/") ? cardUrl : `/${cardUrl}`;
    }
  }

  const templateName = String(
    input.template_name || settings.template_name || "triada_inspiration_share",
  ).trim();
  const results = await mapParallel(
    recipients,
    async (contact) => {
      if (contact.marketing_opt_out) {
        return {
          contact_id: contact.id,
          to: contact.phone_normalized,
          ok: false,
          error: "marketing_opt_out",
        };
      }
      const to =
        contact.phone_normalized ||
        toWhatsAppRecipient(contact.phone_e164 || contact.phone);
      if (!to) {
        return {
          contact_id: contact.id,
          to: null,
          ok: false,
          error: "invalid_phone",
        };
      }

      const mediaPayload = {
        media_id: mediaId,
        media_link: mediaLink,
        media_type: "image",
        caption,
      };

      // Prefer template + HEADER media (broadcast-safe); fall back to session media.
      let send = await sendWhatsAppTemplateMessage({
        to,
        template_name: templateName,
        language: settings.language || "en",
        components: [],
        ...extractWhatsAppMediaInput(mediaPayload),
      });

      if (!send.ok && (mediaId || mediaLink)) {
        send = await sendWhatsAppMediaMessage({
          to,
          ...extractWhatsAppMediaInput(mediaPayload),
          caption,
        });
      }

      return {
        contact_id: contact.id,
        name: contact.name,
        to,
        ok: send.ok,
        mode: send.mode,
        provider_message_id: send.provider_message_id,
        media_id: send.media_id || mediaId,
        error: send.error,
      };
    },
    { concurrency: 8 },
  );

  const sent = results.filter((r) => r.ok).length;
  const broadcast = {
    attempted: results.length,
    sent,
    failed: results.length - sent,
    template_name: templateName,
    media_id: mediaId,
    media_link: mediaLink,
    upload_mode: uploadMode,
    results,
    at: new Date().toISOString(),
  };

  patchContent(content.id, {
    status: "published",
    published_at: broadcast.at,
    publish_metadata: {
      ...(content.publish_metadata || {}),
      adapter: "whatsapp_cloud",
      mode: uploadMode,
      quote_broadcast: broadcast,
    },
  });

  await saveQuoteInspirationSettings({
    last_broadcast_at: broadcast.at,
    last_content_id: content.id,
  });

  if (input.history_id) {
    await patchQuoteInspirationHistory(input.history_id, {
      status: "published",
      broadcast,
    });
  }

  return {
    ok: sent > 0 || results.length === 0,
    content_id: content.id,
    mode: uploadMode,
    broadcast,
    source: "quote_inspiration_engine",
  };
}

/**
 * Cron worker: on selected weekdays, generate (if needed) and broadcast due quotes.
 * @param {{ force?: boolean, generate_if_missing?: boolean }} [opts]
 */
export async function processQuoteInspirationCron(opts = {}) {
  const settings = await getQuoteInspirationSettings();
  const now = new Date();

  if (!opts.force && !isWeekdaySendDue(settings, now)) {
    return {
      ok: true,
      skipped: true,
      reason: settings.enabled ? "not_due_or_wrong_weekday" : "disabled",
      weekday: isoWeekday(now),
      weekdays: settings.weekdays,
      next_send_at: nextWeekdaySendAt(settings, now),
    };
  }

  const { getContentItems, findContent } = await import("@/lib/content-schedule-store");
  let due =
    getContentItems().find(
      (c) =>
        c.content_type === "inspiration_quote" &&
        c.status === "scheduled" &&
        c.scheduled_for &&
        new Date(c.scheduled_for).getTime() <= now.getTime() &&
        (c.approval_version || 0) > 0,
    ) || null;

  if (!due && settings.last_content_id) {
    const last = findContent(settings.last_content_id);
    if (
      last &&
      last.content_type === "inspiration_quote" &&
      (last.status === "approved" || last.status === "scheduled") &&
      (last.approval_version || 0) > 0
    ) {
      due = last;
    }
  }

  let generated = null;
  if (!due && (opts.generate_if_missing || settings.require_approval === false)) {
    generated = await generateQuoteInspiration({
      approve: settings.require_approval === false,
      schedule: false,
    });
    if (generated.content && (generated.content.approval_version || 0) > 0) {
      due = generated.content;
    }
  }

  if (!due) {
    return {
      ok: true,
      skipped: true,
      reason: "awaiting_approved_quote",
      generated: generated
        ? { content_id: generated.content?.id, status: generated.content?.status }
        : null,
      next_send_at: nextWeekdaySendAt(settings, now),
    };
  }

  const broadcast = await broadcastQuoteInspiration({ content_id: due.id });
  return {
    ok: broadcast.ok,
    weekday: isoWeekday(now),
    content_id: due.id,
    generated: generated
      ? { content_id: generated.content?.id, status: generated.content?.status }
      : null,
    broadcast,
    next_send_at: nextWeekdaySendAt(settings, now),
  };
}
