/**
 * Branded team invitation email (Triada logo header, warm greeting, address footer).
 */

import { BRAND } from "@/lib/brand/identity";
import { wrapEmailMessage } from "@/lib/brand/wrap-email";
import { sendResendEmail } from "@/lib/email/resend";

/**
 * @param {{
 *   toEmail: string,
 *   inviteeName?: string,
 *   inviterName?: string,
 *   roleName?: string,
 *   acceptUrl: string,
 *   expiresAt?: string,
 * }} opts
 */
export function buildInviteEmail(opts) {
  const name = String(opts.inviteeName || "").trim();
  const role = String(opts.roleName || "team member").trim();
  const inviter = String(opts.inviterName || "the Triada team").trim();
  const expiresNote = opts.expiresAt
    ? `<p style="margin:16px 0 0;font-size:13px;color:#9a7958;">This invitation expires on ${escapeHtml(
        formatDate(opts.expiresAt),
      )}.</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 14px;">You have been invited to join the <strong>${escapeHtml(
      BRAND.name,
    )}</strong> operations workspace${
      name ? `, ${escapeHtml(name)}` : ""
    }.</p>
    <p style="margin:0 0 14px;">${escapeHtml(
      inviter,
    )} invited you as <strong>${escapeHtml(role)}</strong>.</p>
    <p style="margin:0 0 18px;">Open the secure link below to set your password and complete your profile. After that you can sign in to the dashboard.</p>
    <p style="margin:0 0 8px;">
      <a href="${escapeAttr(opts.acceptUrl)}"
         style="display:inline-block;padding:12px 22px;background:#000000;color:#c4a882;text-decoration:none;font-weight:600;border-radius:4px;">
        Accept invitation
      </a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#9a7958;word-break:break-all;">
      Or paste this link into your browser:<br/>
      <a href="${escapeAttr(opts.acceptUrl)}" style="color:#9a7958;">${escapeHtml(
        opts.acceptUrl,
      )}</a>
    </p>
    ${expiresNote}
  `;

  const bodyText = [
    name
      ? `You have been invited to join ${BRAND.name}, ${name}.`
      : `You have been invited to join ${BRAND.name}.`,
    `${inviter} invited you as ${role}.`,
    "Open the secure link below to set your password and complete your profile:",
    opts.acceptUrl,
    opts.expiresAt ? `This invitation expires on ${formatDate(opts.expiresAt)}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return wrapEmailMessage({
    subject: `You're invited to ${BRAND.name}`,
    bodyHtml,
    bodyText,
    greetingKind: "first_touch",
    customerName: name || undefined,
    includeGreeting: true,
  });
}

/**
 * @param {Parameters<typeof buildInviteEmail>[0]} opts
 */
export async function sendInviteEmail(opts) {
  const wrapped = buildInviteEmail(opts);
  const result = await sendResendEmail({
    to: opts.toEmail,
    subject: wrapped.subject,
    html: wrapped.html,
    text: wrapped.text,
    tags: [
      { name: "category", value: "team_invite" },
      { name: "workspace", value: "triada-ops" },
    ],
  });
  return { ...result, branded: true, subject: wrapped.subject };
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

/** @param {string} iso */
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC";
  } catch {
    return String(iso);
  }
}
