/**
 * Live Overview / analytics KPI counts from dual-run stores + entity APIs.
 * Empty workspaces return zeros — no fabricated growth placeholders.
 */

import {
  buildConversations,
  buildIntegrationsList,
  buildLeads,
} from "@/lib/api/seed-data";
import { listAgents, listTasks } from "@/lib/agents/agent-store";
import { getContentItems } from "@/lib/content-schedule-store";
import { countContacts } from "@/lib/crm/contacts-store";
import { listProducts } from "@/lib/commerce/products-store";

/**
 * @param {Array<{ status?: string, automation_mode?: string, last_inbound_at?: string|null }>} conversations
 */
function conversationMetrics(conversations) {
  const rows = Array.isArray(conversations) ? conversations : [];
  const open = rows.filter((c) => c.status === "open");
  return {
    total_conversations: rows.length,
    open_conversations: open.length,
    unanswered_conversations: open.filter(
      (c) => c.automation_mode === "ai" && c.last_inbound_at,
    ).length,
    ai_handled_conversations: rows.filter((c) => c.automation_mode === "ai").length,
    human_escalations: rows.filter((c) => c.automation_mode === "human").length,
  };
}

/**
 * @param {Array<{ stage?: string }>} leads
 */
function leadMetrics(leads) {
  const rows = Array.isArray(leads) ? leads : [];
  return {
    new_leads: rows.filter((l) => l.stage === "new_lead").length,
    qualified_leads: rows.filter((l) => l.stage === "qualified").length,
    leads: rows.length,
  };
}

/**
 * Assemble live dashboard metrics.
 * Contacts / tasks / products / agents come from stores (Supabase when keyed).
 * Conversations / leads use the same payloads Inbox & Leads APIs serve today.
 *
 * @param {{
 *   anthropicHasCredentials?: boolean,
 *   anthropicModel?: string,
 *   metaFacebookReady?: boolean,
 *   metaInstagramReady?: boolean,
 *   metaMessengerReady?: boolean,
 *   metaWhatsAppReady?: boolean,
 * }} [integrationOpts]
 */
export async function collectLiveDashboardMetrics(integrationOpts = {}) {
  const [contacts, tasks, products, agents] = await Promise.all([
    countContacts().catch(() => ({ count: 0 })),
    listTasks().catch(() => ({ data: [] })),
    listProducts().catch(() => ({ data: [] })),
    listAgents().catch(() => ({ data: [] })),
  ]);

  const conversations = buildConversations();
  const leads = buildLeads();
  const conv = conversationMetrics(conversations);
  const lead = leadMetrics(leads);
  const contentItems = getContentItems();
  const integrations = buildIntegrationsList(integrationOpts);

  const openTasks = (tasks.data || []).filter((t) => t.status === "open").length;
  const awaitingApproval = contentItems.filter((c) => c.status === "in_review").length;

  return {
    ...conv,
    contacts: Number(contacts.count) || 0,
    ...lead,
    open_tasks: openTasks,
    content_awaiting_approval: awaitingApproval,
    integration_failures: integrations.filter((i) => i.last_error_code).length,
    // Extra live counts for analytics (not all shown as Overview cards)
    messages: conversations.reduce(
      (sum, c) => sum + (Array.isArray(c.messages) ? c.messages.length : 0),
      0,
    ),
    opportunities: leads.filter((l) => l.stage === "qualified" || l.stage === "won").length,
    content_items: contentItems.length,
    publications: contentItems.filter((c) => c.status === "published").length,
    products: (products.data || []).length,
    agents: (agents.data || []).length,
    human_takeovers: conv.human_escalations,
    ai_runs: conv.ai_handled_conversations,
    ai_prompt_tokens: 0,
    ai_completion_tokens: 0,
  };
}
