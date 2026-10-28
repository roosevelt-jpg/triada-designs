/**
 * Notify admin when creative content enters pending review (in_review).
 */

import { BRAND } from "@/lib/brand/identity";
import { wrapEmailMessage } from "@/lib/brand/wrap-email";
import { SEED_ADMIN } from "@/lib/constants";
import { sendResendEmail } from "@/lib/email/resend";
import {
  findContent,
  listPendingReview,
  patchContent,
} from "@/lib/content-schedule-store";
import { pushNotification } from "@/lib/notifications/notifications-store";

function adminEmail() {
  return (
    String(process.env.ADMIN_NOTIFY_EMAIL || "").trim() ||
    String(BRAND.opsEmail || "").trim() ||
    SEED_ADMIN.email
  );
}

function reviewUrl(contentId) {
  const base = String(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://dashboard.triada-designs.com"
  ).replace(/\/$/, "");
  const path = contentId
    ? `/content/review?highlight=${encodeURIComponent(contentId)}`
    : "/content/review";
  return `${base}${path}`;
}

/**
 * @param {{
 *   content: Record<string, unknown>,
 *   kind?: string,
 *   force?: boolean,
 * }} opts
 */
export function buildReviewNotifyEmail(opts) {
  const content = opts.content || {};
  const title = String(content.title || "Untitled creative");
  const kind = String(opts.kind || "creative");
  const channel = String(content.channel || "channel");
  const url = reviewUrl(String(content.id || ""));

  const bodyHtml = `
    <p style="margin:0 0 14px;">A new <strong>${escapeHtml(kind)}</strong> draft is ready for preview and approval.</p>
    <p style="margin:0 0 8px;"><strong>${escapeHtml(title)}</strong></p>
    <p style="margin:0 0 18px;color:#9a7958;">${escapeHtml(channel)} · pending review</p>
    <p style="margin:0 0 8px;">
      <a href="${escapeAttr(url)}"
         style="display:inline-block;padding:12px 22px;background:#000000;color:#c4a882;text-decoration:none;font-weight:600;border-radius:4px;">
        Preview &amp; review
      </a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#9a7958;word-break:break-all;">
      Or open:<br/>
      <a href="${escapeAttr(url)}" style="color:#9a7958;">${escapeHtml(url)}</a>
    </p>
  `;

  const bodyText = [
    `A new ${kind} draft is ready for preview and approval.`,
    `${title}`,
    `${channel} · pending review`,
    `Preview & review: ${url}`,
  ].join("\n\n");

  return wrapEmailMessage({
    subject: `Pending review: ${title}`,
    bodyHtml,
    bodyText,
    greetingKind: "default",
    includeGreeting: true,
  });
}

/**
 * Mirror pending content into the shared dashboard bell feed (deduped).
 * Used by GET /notifications so seed/in_review items appear without regenerate.
 * Generate path still calls notifyAdminPendingReview (same pushNotification).
 */
export function syncPendingReviewNotifications() {
  const pending = listPendingReview();
  const synced = [];
  for (const item of pending) {
    const event = pushNotification({
      type: "content_pending_review",
      title: `Pending review: ${String(item.title || "Untitled creative")}`,
      body: `A ${String(item.channel || "channel")} draft is ready for preview and approval.`,
      href: `/content/review?highlight=${encodeURIComponent(item.id)}`,
      severity: "warning",
      entity_type: "content_item",
      entity_id: item.id,
      payload: {
        content_id: item.id,
        channel: item.channel || null,
        status: item.status || "in_review",
      },
      dedupe: true,
    });
    synced.push(event);
  }
  return { synced: synced.length, notifications: synced };
}

/**
 * Send (or locally log) an admin review notification once per pending cycle.
 * Always writes the shared bell feed; email is once per pending cycle.
 * @param {{
 *   contentId: string,
 *   kind?: string,
 *   force?: boolean,
 * }} opts
 */
export async function notifyAdminPendingReview(opts) {
  const contentId = String(opts.contentId || "");
  const item = findContent(contentId);
  if (!item) {
    return { ok: false, skipped: true, reason: "missing_content" };
  }

  if (item.status !== "in_review" && item.status !== "draft") {
    return { ok: false, skipped: true, reason: "not_pending" };
  }

  const kind = opts.kind || "creative";
  const hrefPath = contentId
    ? `/content/review?highlight=${encodeURIComponent(contentId)}`
    : "/content/review";

  // Always emit/refresh the dashboard bell feed (TD-75 wires the UI).
  const bell = pushNotification({
    type: "content_pending_review",
    title: `Pending review: ${String(item.title || "Untitled creative")}`,
    body: `A new ${kind} draft is ready for preview and approval · ${String(item.channel || "channel")}.`,
    href: hrefPath,
    severity: "warning",
    entity_type: "content_item",
    entity_id: contentId,
    payload: {
      content_id: contentId,
      kind,
      channel: item.channel || null,
      status: item.status || "in_review",
    },
    dedupe: true,
  });

  const alreadyEmailed = Boolean(item.review_notified_at) && !opts.force;
  let result = {
    ok: true,
    skipped: true,
    reason: "already_notified",
    mode: item.review_notify_mode || null,
  };

  if (!alreadyEmailed) {
    const wrapped = buildReviewNotifyEmail({
      content: item,
      kind,
    });
    const to = adminEmail();
    result = await sendResendEmail({
      to,
      subject: wrapped.subject,
      html: wrapped.html,
      text: wrapped.text,
      tags: [
        { name: "category", value: "content_review" },
        { name: "workspace", value: "triada-ops" },
      ],
    });
    result.to = to;
  }

  const notifiedAt = new Date().toISOString();
  // Bell feed write counts as notified even when email falls back / is unkeyed.
  if (result.ok || bell?.id) {
    patchContent(contentId, {
      review_notified_at: item.review_notified_at || notifiedAt,
      review_notify_mode: alreadyEmailed
        ? item.review_notify_mode || "email"
        : result.ok
          ? result.mode || null
          : "bell_feed",
      review_notification_id: bell?.id || item.review_notification_id || null,
    });
  }

  return {
    ...result,
    ok: Boolean(result.ok || bell?.id),
    to: result.to || adminEmail(),
    content_id: contentId,
    review_url: reviewUrl(contentId),
    notified_at: item.review_notified_at || notifiedAt,
    bell_notification: bell,
    channels: {
      email: alreadyEmailed
        ? { ok: true, skipped: true, reason: "already_notified" }
        : result,
      dashboard_bell: { ok: Boolean(bell?.id), id: bell?.id || null },
    },
  };
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
