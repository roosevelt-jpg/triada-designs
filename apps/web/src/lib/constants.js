export const APP_NAME = "Triada Designs";
/** Public marketing site (apex). This ops app is intended for a subdomain. */
export const PUBLIC_SITE_URL =
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "https://triada-designs.com";
/** Production host for this admin/ops dashboard (never trycloudflare / preview). */
export const OPS_HOST =
  process.env.NEXT_PUBLIC_OPS_HOST || "dashboard.triada-designs.com";
/** Local seed admin (documented in README; not shown as "demo" in the UI). */
export const SEED_ADMIN = {
  email: "info@triada-designs.com",
  password: "triada-local",
};

/**
 * Sidebar navigation — collapsible groups with nested page links.
 * Groups: Workspace, Commerce, Marketing, Automation, Admin.
 */
export const DASHBOARD_NAV = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/overview", label: "Overview" },
      { href: "/inbox", label: "Unified inbox" },
      { href: "/contacts", label: "Contacts" },
      { href: "/leads", label: "Leads" },
      { href: "/analytics", label: "Analytics" },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      { href: "/products", label: "Products" },
      { href: "/collections", label: "Collections" },
      { href: "/inventory", label: "Inventory" },
      { href: "/discounts", label: "Discounts" },
      { href: "/transfers", label: "Transfers / POs" },
      { href: "/services", label: "Services" },
      { href: "/orders", label: "Orders & invoices" },
      { href: "/orders/invoices", label: "Invoice editor" },
      { href: "/manufacturer", label: "Manufacturer" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    items: [
      { href: "/content", label: "Content studio" },
      { href: "/content/review", label: "Content review" },
      { href: "/content/inspiration", label: "Quote & Inspiration" },
      { href: "/templates", label: "Channel templates" },
      { href: "/calendar", label: "Calendar" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/ugc", label: "UGC & tags" },
      { href: "/popups", label: "Pop-ups & markets" },
      { href: "/outreach", label: "Outreach CRM" },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    items: [
      { href: "/automations", label: "Workflows" },
      { href: "/agents", label: "AI agents" },
      { href: "/agents/training", label: "Training docs" },
      { href: "/knowledge", label: "Knowledge" },
      { href: "/jewellery-ops", label: "Jewellery ops" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { href: "/integrations", label: "Integrations" },
      { href: "/integrations/channels", label: "Sales channels" },
      { href: "/team", label: "Team" },
      { href: "/audit-logs", label: "Audit logs" },
      { href: "/settings", label: "Settings" },
    ],
  },
];
