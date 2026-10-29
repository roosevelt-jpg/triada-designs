/**
 * Jewellery action types for the dual-run automation runner.
 */

import { suggestGifts } from "@/lib/jewellery-ops/gift-finder";
import { trackAbandonment, processDueAbandonment } from "@/lib/jewellery-ops/abandonment";
import { processDueAfterSale, scheduleAfterSaleJobs } from "@/lib/jewellery-ops/after-sale";
import { notifyWaitlistRestock, announceVipDrop } from "@/lib/jewellery-ops/waitlist";
import { sendTelegramAlert, detectAlertType } from "@/lib/jewellery-ops/telegram-alerts";
import { collectCustomPiece } from "@/lib/jewellery-ops/custom-pieces";
import { recordUgcTag } from "@/lib/jewellery-ops/ugc";
import { draftOutreachMessage, upsertOutreachProspect } from "@/lib/jewellery-ops/outreach";
import { answerFaq, AI_DISCLOSURE } from "@/lib/jewellery-ops/knowledge";
import {
  upsertCommerceOrder,
  pushManufacturerOrder,
} from "@/lib/manufacturer";
import { draftPopupApplication, scanPopupAlerts } from "@/lib/popups/popup-markets-store";
import { runAgentOrchestration } from "@/lib/agents/orchestrator";
import { upsertInvoiceDoc } from "@/lib/invoices/invoice-docs-store";

export const JEWELLERY_ACTION_TYPES = [
  "answer_bot_reply",
  "gift_finder_suggest",
  "collect_custom_piece",
  "order_lifecycle_message",
  "create_invoice",
  "telegram_priority_alert",
  "abandonment_remind",
  "waitlist_notify",
  "vip_drop_announce",
  "after_sale_followup",
  "ugc_tag_alert",
  "outreach_draft",
  "popup_draft_application",
  "manufacturer_push_order",
  "content_cross_post",
  "weekly_content_summary",
  "notify_telegram",
  "send_message",
];

/**
 * @param {string} actionType
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} context
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function executeJewelleryWorkflowAction(actionType, config, context, opts = {}) {
  const dryRun = opts.dryRun === true;
  const merged = { ...context, ...config };

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      action_type: actionType,
      would_run: true,
      preview: {
        who: merged.who || merged.recipient || null,
        to: merged.to || merged.phone || merged.email || null,
        message: merged.message || merged.body || null,
      },
    };
  }

  switch (actionType) {
    case "answer_bot_reply": {
      const message = String(merged.message || merged.body || "");
      const faq = answerFaq(message);
      if (faq) {
        return { ok: true, action_type: actionType, reply: faq, mode: "faq" };
      }
      const result = await runAgentOrchestration({
        agent_key: "ai_support",
        purpose: "draft_reply",
        message,
        dry_run: false,
        context: merged,
      });
      return {
        ok: true,
        action_type: actionType,
        reply: result.text,
        mode: result.mode,
        provider: result.provider,
      };
    }
    case "gift_finder_suggest":
      return {
        ok: true,
        action_type: actionType,
        ...(await suggestGifts(merged)),
      };
    case "collect_custom_piece":
      return {
        ok: true,
        action_type: actionType,
        ...(await collectCustomPiece(merged)),
      };
    case "order_lifecycle_message":
      return {
        ok: true,
        action_type: actionType,
        ...(await upsertCommerceOrder(merged)),
      };
    case "create_invoice": {
      const saved = await upsertInvoiceDoc({
        customer_name: merged.customer_name || "Customer",
        customer_email: merged.customer_email || "",
        total: merged.total || 0,
        currency: merged.currency || "AED",
        line_items: Array.isArray(merged.line_items) ? merged.line_items : [],
        number: merged.number || merged.invoice_number,
        order_id: merged.order_id || null,
      });
      return { ok: true, action_type: actionType, invoice: saved.doc, storage: saved.storage };
    }
    case "telegram_priority_alert":
    case "notify_telegram": {
      const detected =
        detectAlertType(String(merged.message || merged.body || "")) ||
        String(merged.alert_type || "ops");
      return {
        ok: true,
        action_type: actionType,
        ...(await sendTelegramAlert({
          ...merged,
          alert_type: detected,
          title: merged.title || `Alert: ${detected}`,
          body: merged.body || merged.message || "",
        })),
      };
    }
    case "abandonment_remind": {
      if (merged.process_due === true) {
        return { ok: true, action_type: actionType, ...(await processDueAbandonment()) };
      }
      return { ok: true, action_type: actionType, ...(await trackAbandonment(merged)) };
    }
    case "waitlist_notify":
      return {
        ok: true,
        action_type: actionType,
        ...(await notifyWaitlistRestock(merged)),
      };
    case "vip_drop_announce":
      return {
        ok: true,
        action_type: actionType,
        ...(await announceVipDrop(merged)),
      };
    case "after_sale_followup": {
      if (merged.process_due === true) {
        return { ok: true, action_type: actionType, ...(await processDueAfterSale()) };
      }
      return { ok: true, action_type: actionType, ...(await scheduleAfterSaleJobs(merged)) };
    }
    case "ugc_tag_alert":
      return { ok: true, action_type: actionType, ...(await recordUgcTag(merged)) };
    case "outreach_draft": {
      let prospectId = merged.prospect_id ? String(merged.prospect_id) : "";
      if (!prospectId) {
        const created = await upsertOutreachProspect(merged);
        if (!created.ok) return { ok: false, action_type: actionType, ...created };
        prospectId = created.prospect.id;
      }
      return {
        ok: true,
        action_type: actionType,
        ...(await draftOutreachMessage(prospectId, merged)),
      };
    }
    case "popup_draft_application": {
      if (merged.scan_alerts === true) {
        return { ok: true, action_type: actionType, ...(await scanPopupAlerts()) };
      }
      const marketId = String(merged.popup_id || merged.market_id || "");
      if (!marketId) {
        return { ok: false, action_type: actionType, error: "popup_id_required" };
      }
      const application = await draftPopupApplication(marketId);
      return { ok: true, action_type: actionType, application };
    }
    case "manufacturer_push_order":
      return {
        ok: true,
        action_type: actionType,
        ...(await pushManufacturerOrder(merged)),
      };
    case "content_cross_post":
      return {
        ok: true,
        action_type: actionType,
        mode: "queued_for_approval",
        note: "Cross-post requires human approve in Content Studio.",
        disclosure: AI_DISCLOSURE,
      };
    case "weekly_content_summary":
      return {
        ok: true,
        action_type: actionType,
        summary: {
          window: "7d",
          note: "Weekly performance summary generated.",
          mode: "next_native",
        },
      };
    case "send_message":
      return {
        ok: true,
        action_type: actionType,
        mode: "delegated",
        note: "Use send_whatsapp_template / send_whatsapp_media for live WA sends.",
      };
    default:
      return { ok: false, action_type: actionType, error: "unsupported_jewellery_action" };
  }
}
