export const APP_NAME = "Triada Designs";
/** Public marketing site (apex). This ops app is intended for a subdomain. */
export const PUBLIC_SITE_URL =
  process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || "https://triada-designs.com";
/** Suggested production host for this admin/ops app. */
export const OPS_HOST =
  process.env.NEXT_PUBLIC_OPS_HOST || "ops.triada-designs.com";
/** Local seed admin (documented in README; not shown as "demo" in the UI). */
export const SEED_ADMIN = {
  email: "admin@triada-designs.com",
  password: "triada-local",
};

export const DASHBOARD_NAV = [
  {
    label: "Workspace",
    items: [
      { href: "/overview", label: "Overview" },
      { href: "/inbox", label: "Unified inbox" },
      { href: "/contacts", label: "Contacts" },
      { href: "/leads", label: "Leads" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/products", label: "Products" },
      { href: "/services", label: "Services" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/content", label: "Content studio" },
      { href: "/templates", label: "Channel templates" },
      { href: "/calendar", label: "Calendar" },
      { href: "/campaigns", label: "Campaigns" },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/automations", label: "Workflows" },
      { href: "/agents", label: "AI agents" },
      { href: "/knowledge", label: "Knowledge" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/integrations", label: "Integrations" },
      { href: "/integrations/channels", label: "Sales channels" },
      { href: "/analytics", label: "Analytics" },
      { href: "/team", label: "Team" },
      { href: "/audit-logs", label: "Audit logs" },
      { href: "/settings", label: "Settings" },
    ],
  },
];
