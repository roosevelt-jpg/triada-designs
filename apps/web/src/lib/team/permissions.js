/**
 * Fine-grained dashboard permissions for Triada ops team members.
 * Each area supports view + manage. Nav/API enforcement uses these keys.
 */

/** @typedef {{ view: boolean, manage: boolean }} AreaPerm */

/** Dashboard areas admins can grant. */
export const PERMISSION_AREAS = [
  {
    key: "overview",
    label: "Overview",
    description: "Workspace overview and AI insights",
    hrefs: ["/overview"],
  },
  {
    key: "inbox",
    label: "Unified inbox",
    description: "Conversations across channels",
    hrefs: ["/inbox"],
  },
  {
    key: "crm",
    label: "CRM",
    description: "Contacts and leads",
    hrefs: ["/contacts", "/leads"],
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Reports and charts",
    hrefs: ["/analytics"],
  },
  {
    key: "catalog",
    label: "Catalog",
    description: "Products, services, orders, manufacturer",
    hrefs: ["/products", "/services", "/orders", "/manufacturer"],
  },
  {
    key: "content",
    label: "Content / Calendar",
    description: "Content studio, review queue, calendar, campaigns",
    hrefs: ["/content", "/content/review", "/calendar", "/campaigns"],
  },
  {
    key: "templates",
    label: "Templates",
    description: "Channel message templates",
    hrefs: ["/templates"],
  },
  {
    key: "ugc",
    label: "UGC",
    description: "User-generated content and tags",
    hrefs: ["/ugc"],
  },
  {
    key: "popups",
    label: "Pop-ups",
    description: "Pop-up markets and applications",
    hrefs: ["/popups"],
  },
  {
    key: "outreach",
    label: "Outreach",
    description: "Outreach CRM",
    hrefs: ["/outreach"],
  },
  {
    key: "automations",
    label: "Automations",
    description: "Workflows and jewellery ops",
    hrefs: ["/automations", "/jewellery-ops"],
  },
  {
    key: "agents",
    label: "Agents",
    description: "AI agents, training docs, knowledge",
    hrefs: ["/agents", "/knowledge"],
  },
  {
    key: "integrations",
    label: "Integrations",
    description: "Channel and provider connection status",
    hrefs: ["/integrations"],
  },
  {
    key: "team",
    label: "Team",
    description: "Invites, roles, and memberships",
    hrefs: ["/team"],
  },
  {
    key: "settings",
    label: "Settings",
    description: "Workspace settings and audit logs",
    hrefs: ["/settings", "/audit-logs"],
  },
];

export const PERMISSION_AREA_KEYS = PERMISSION_AREAS.map((a) => a.key);

/** @returns {Record<string, AreaPerm>} */
export function emptyPermissions() {
  /** @type {Record<string, AreaPerm>} */
  const out = {};
  for (const area of PERMISSION_AREAS) {
    out[area.key] = { view: false, manage: false };
  }
  return out;
}

/** @returns {Record<string, AreaPerm>} */
export function allPermissions(manage = true) {
  /** @type {Record<string, AreaPerm>} */
  const out = {};
  for (const area of PERMISSION_AREAS) {
    out[area.key] = { view: true, manage: Boolean(manage) };
  }
  return out;
}

/**
 * @param {Record<string, AreaPerm> | null | undefined} permissions
 * @returns {Record<string, AreaPerm>}
 */
export function normalizePermissions(permissions) {
  const base = emptyPermissions();
  if (!permissions || typeof permissions !== "object") return base;
  for (const key of PERMISSION_AREA_KEYS) {
    const row = permissions[key];
    if (!row || typeof row !== "object") continue;
    const view = Boolean(row.view);
    const manage = Boolean(row.manage);
    base[key] = { view: view || manage, manage };
  }
  return base;
}

/**
 * @param {string[]} keys
 * @param {{ manage?: boolean }} [opts]
 */
export function permissionsForAreas(keys, opts = {}) {
  const manage = opts.manage !== false;
  const out = emptyPermissions();
  for (const key of keys) {
    if (!PERMISSION_AREA_KEYS.includes(key)) continue;
    out[key] = { view: true, manage };
  }
  return out;
}

/** Sensible default roles for Triada jewellery ops. */
export function defaultRoleDefinitions() {
  const at = new Date().toISOString();
  return [
    {
      id: "role-admin",
      workspace_id: "triada-ops",
      slug: "admin",
      name: "Admin",
      description: "Full access — invites, roles, settings, and all dashboard areas.",
      is_system: true,
      permissions: allPermissions(true),
      created_at: at,
      updated_at: at,
    },
    {
      id: "role-manager",
      workspace_id: "triada-ops",
      slug: "manager",
      name: "Manager",
      description: "Operate the business day-to-day; view team, no settings manage.",
      is_system: true,
      permissions: normalizePermissions({
        ...allPermissions(true),
        team: { view: true, manage: false },
        settings: { view: true, manage: false },
        integrations: { view: true, manage: false },
      }),
      created_at: at,
      updated_at: at,
    },
    {
      id: "role-support",
      workspace_id: "triada-ops",
      slug: "support",
      name: "Support",
      description: "Inbox and CRM — help customers across channels.",
      is_system: true,
      permissions: normalizePermissions({
        overview: { view: true, manage: false },
        inbox: { view: true, manage: true },
        crm: { view: true, manage: true },
        catalog: { view: true, manage: false },
        templates: { view: true, manage: false },
        agents: { view: true, manage: false },
      }),
      created_at: at,
      updated_at: at,
    },
    {
      id: "role-marketing",
      workspace_id: "triada-ops",
      slug: "marketing",
      name: "Marketing",
      description: "Content, calendar, campaigns, templates, and UGC.",
      is_system: true,
      permissions: normalizePermissions({
        overview: { view: true, manage: false },
        content: { view: true, manage: true },
        templates: { view: true, manage: true },
        ugc: { view: true, manage: true },
        popups: { view: true, manage: true },
        outreach: { view: true, manage: true },
        catalog: { view: true, manage: false },
        analytics: { view: true, manage: false },
        crm: { view: true, manage: false },
      }),
      created_at: at,
      updated_at: at,
    },
    {
      id: "role-viewer",
      workspace_id: "triada-ops",
      slug: "viewer",
      name: "Viewer",
      description: "Read-only across core dashboard areas.",
      is_system: true,
      permissions: normalizePermissions({
        overview: { view: true, manage: false },
        inbox: { view: true, manage: false },
        crm: { view: true, manage: false },
        analytics: { view: true, manage: false },
        catalog: { view: true, manage: false },
        content: { view: true, manage: false },
        templates: { view: true, manage: false },
      }),
      created_at: at,
      updated_at: at,
    },
  ];
}

/**
 * Map a pathname to a permission area key.
 * @param {string} pathname
 * @returns {string | null}
 */
export function areaKeyForPath(pathname) {
  const path = String(pathname || "").split("?")[0];
  let best = null;
  let bestLen = -1;
  for (const area of PERMISSION_AREAS) {
    for (const href of area.hrefs) {
      if (path === href || path.startsWith(`${href}/`)) {
        if (href.length > bestLen) {
          best = area.key;
          bestLen = href.length;
        }
      }
    }
  }
  return best;
}

/**
 * @param {Record<string, AreaPerm> | null | undefined} permissions
 * @param {string} areaKey
 * @param {"view"|"manage"} [level]
 */
export function canAccess(permissions, areaKey, level = "view") {
  const row = normalizePermissions(permissions)[areaKey];
  if (!row) return false;
  if (level === "manage") return Boolean(row.manage);
  return Boolean(row.view || row.manage);
}

/**
 * Filter sidebar nav sections by view permission.
 * @param {Array<{ label: string, items: Array<{ href: string, label: string }> }>} nav
 * @param {Record<string, AreaPerm> | null | undefined} permissions
 * @param {{ isAdmin?: boolean }} [opts]
 */
export function filterNavByPermissions(nav, permissions, opts = {}) {
  if (opts.isAdmin) return nav;
  const perms = normalizePermissions(permissions);
  return nav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const key = areaKeyForPath(item.href);
        if (!key) return true;
        return canAccess(perms, key, "view");
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** API path prefixes → required area + level */
export const API_PERMISSION_RULES = [
  { match: /^team(\/|$)/, area: "team", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^team(\/|$)/, area: "team", level: "view", methods: ["GET"] },
  { match: /^integrations(\/|$)/, area: "integrations", level: "view", methods: ["GET"] },
  { match: /^integrations(\/|$)/, area: "integrations", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^agents(\/|$)/, area: "agents", level: "view", methods: ["GET"] },
  { match: /^agents(\/|$)/, area: "agents", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^channel-templates(\/|$)/, area: "templates", level: "view", methods: ["GET"] },
  { match: /^channel-templates(\/|$)/, area: "templates", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^contacts(\/|$)/, area: "crm", level: "view", methods: ["GET"] },
  { match: /^contacts(\/|$)/, area: "crm", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^leads(\/|$)/, area: "crm", level: "view", methods: ["GET"] },
  { match: /^leads(\/|$)/, area: "crm", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^settings(\/|$)/, area: "settings", level: "view", methods: ["GET"] },
  { match: /^settings(\/|$)/, area: "settings", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^content(\/|$)/, area: "content", level: "view", methods: ["GET"] },
  { match: /^content(\/|$)/, area: "content", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^workflows(\/|$)/, area: "automations", level: "view", methods: ["GET"] },
  { match: /^workflows(\/|$)/, area: "automations", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
  { match: /^automations(\/|$)/, area: "automations", level: "view", methods: ["GET"] },
  { match: /^automations(\/|$)/, area: "automations", level: "manage", methods: ["POST", "PATCH", "PUT", "DELETE"] },
];
