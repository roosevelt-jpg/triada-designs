export const APP_NAME = "Triada Designs";
export const DEMO_CREDENTIALS = {
  email: "admin@triada-designs.com",
  password: "triada-demo",
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
      { href: "/analytics", label: "Analytics" },
      { href: "/team", label: "Team" },
      { href: "/audit-logs", label: "Audit logs" },
      { href: "/settings", label: "Settings" },
    ],
  },
];
