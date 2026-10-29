/**
 * Team members, invites, and roles.
 * Persists to Supabase when service role is present; else .triada-local JSON.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { getLocalDataDir } from "@/lib/local-data-dir";
import {
  ADMIN_EMAIL,
  ADMIN_NAME,
} from "@/lib/auth/supabase-auth";
import {
  allPermissions,
  defaultRoleDefinitions,
  normalizePermissions,
} from "./permissions";
import { resolvePublicAppUrl } from "@/lib/public-app-url";

const WORKSPACE_ID = "triada-ops";
const ROLES_TABLE = "team_roles";
const MEMBERS_TABLE = "team_members";
const INVITES_TABLE = "team_invites";
const LOCAL_FILE = path.join(getLocalDataDir(), "team.json");

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function newToken() {
  return randomBytes(32).toString("hex");
}

/** @param {string} token */
export function hashInviteToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

/** Local dual-run only — never used when Supabase Auth is keyed. */
export function hashLocalPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(String(password), salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

/** @param {string} password @param {string} stored */
export function verifyLocalPassword(password, stored) {
  if (!stored || !String(stored).includes(":")) return false;
  const [salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const derived = scryptSync(String(password), salt, 32).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** @returns {Promise<{ roles: any[], members: any[], invites: any[] }>} */
async function readLocal() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      roles: Array.isArray(parsed.roles) ? parsed.roles : defaultRoleDefinitions(),
      members: Array.isArray(parsed.members) ? parsed.members : [],
      invites: Array.isArray(parsed.invites) ? parsed.invites : [],
    };
  } catch {
    return {
      roles: defaultRoleDefinitions(),
      members: [seedAdminMember()],
      invites: [],
    };
  }
}

/** @param {{ roles: any[], members: any[], invites: any[] }} state */
async function writeLocal(state) {
  await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await writeFile(LOCAL_FILE, JSON.stringify(state, null, 2), "utf8");
}

function seedAdminMember() {
  const at = nowIso();
  return {
    id: "member-admin",
    workspace_id: WORKSPACE_ID,
    user_id: "local-seed-admin",
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    phone: "",
    role_title: "Owner",
    role_id: "role-admin",
    role_slug: "admin",
    status: "active",
    permissions_override: null,
    profile_completed: true,
    last_login_at: null,
    invited_by: null,
    created_at: at,
    updated_at: at,
  };
}

/** @type {boolean|null} null=unknown, true=tables exist, false=missing (use local) */
let supabaseTeamSchemaOk = null;

function isMissingTeamTableError(err) {
  const msg = String(
    (err && typeof err === "object" && (err.message || err.details || err.hint)) ||
      err ||
      "",
  );
  return /Could not find the table|schema cache|PGRST205|relation ["'].*["'] does not exist|does not exist/i.test(
    msg,
  );
}

function hasSupabaseBackend() {
  if (supabaseTeamSchemaOk === false) return false;
  return hasSupabaseAdminCredentials();
}

function markTeamTablesMissing(err) {
  if (isMissingTeamTableError(err)) {
    supabaseTeamSchemaOk = false;
    return true;
  }
  return false;
}

async function ensureLocalSeeded() {
  const state = await readLocal();
  let dirty = false;
  if (!state.roles?.length) {
    state.roles = defaultRoleDefinitions();
    dirty = true;
  }
  if (!state.members?.some((m) => m.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())) {
    state.members = [seedAdminMember(), ...(state.members || [])];
    dirty = true;
  }
  if (dirty) await writeLocal(state);
  return state;
}

async function ensureSupabaseSeeded() {
  const admin = createAdminSupabaseClient();
  if (!admin) return;
  if (supabaseTeamSchemaOk === false) return;

  const { data: roles, error: rolesErr } = await admin
    .from(ROLES_TABLE)
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .limit(1);

  if (rolesErr) {
    if (markTeamTablesMissing(rolesErr)) return;
    throw new Error(rolesErr.message);
  }
  supabaseTeamSchemaOk = true;

  if (!roles?.length) {
    const defs = defaultRoleDefinitions();
    const { error: upsertRolesErr } = await admin
      .from(ROLES_TABLE)
      .upsert(defs.map(shapeRoleForDb));
    if (upsertRolesErr) {
      if (markTeamTablesMissing(upsertRolesErr)) return;
      throw new Error(upsertRolesErr.message);
    }
  }

  const { data: members, error: membersErr } = await admin
    .from(MEMBERS_TABLE)
    .select("id")
    .eq("workspace_id", WORKSPACE_ID)
    .ilike("email", ADMIN_EMAIL)
    .limit(1);

  if (membersErr) {
    if (markTeamTablesMissing(membersErr)) return;
    throw new Error(membersErr.message);
  }

  if (!members?.length) {
    const { error: upsertMemberErr } = await admin
      .from(MEMBERS_TABLE)
      .upsert(shapeMemberForDb(seedAdminMember()));
    if (upsertMemberErr) {
      if (markTeamTablesMissing(upsertMemberErr)) return;
      throw new Error(upsertMemberErr.message);
    }
  }
}

function shapeRoleForDb(role) {
  return {
    id: role.id,
    workspace_id: role.workspace_id || WORKSPACE_ID,
    slug: role.slug,
    name: role.name,
    description: role.description || "",
    is_system: Boolean(role.is_system),
    permissions: normalizePermissions(role.permissions),
    created_at: role.created_at || nowIso(),
    updated_at: role.updated_at || nowIso(),
  };
}

function shapeMemberForDb(member) {
  return {
    id: member.id,
    workspace_id: member.workspace_id || WORKSPACE_ID,
    user_id: member.user_id || null,
    email: String(member.email || "").toLowerCase(),
    name: member.name || "",
    phone: member.phone || "",
    role_title: member.role_title || "",
    role_id: member.role_id,
    role_slug: member.role_slug || "",
    status: member.status || "active",
    permissions_override: member.permissions_override || null,
    profile_completed: Boolean(member.profile_completed),
    last_login_at: member.last_login_at || null,
    invited_by: member.invited_by || null,
    created_at: member.created_at || nowIso(),
    updated_at: member.updated_at || nowIso(),
  };
}

function shapeInviteForDb(invite) {
  return {
    id: invite.id,
    workspace_id: invite.workspace_id || WORKSPACE_ID,
    email: String(invite.email || "").toLowerCase(),
    name: invite.name || "",
    role_id: invite.role_id,
    role_slug: invite.role_slug || "",
    token_hash: invite.token_hash,
    status: invite.status || "pending",
    invited_by: invite.invited_by || null,
    invited_by_email: invite.invited_by_email || null,
    expires_at: invite.expires_at,
    accepted_at: invite.accepted_at || null,
    created_at: invite.created_at || nowIso(),
    updated_at: invite.updated_at || nowIso(),
  };
}

function publicInvite(invite, { includeToken = false, token = null } = {}) {
  return {
    id: invite.id,
    email: invite.email,
    name: invite.name || "",
    role_id: invite.role_id,
    role_slug: invite.role_slug,
    status: invite.status,
    expires_at: invite.expires_at,
    invited_by_email: invite.invited_by_email || null,
    created_at: invite.created_at,
    ...(includeToken && token ? { token } : {}),
  };
}

function publicMember(member, role) {
  const permissions =
    member.permissions_override != null
      ? normalizePermissions(member.permissions_override)
      : normalizePermissions(role?.permissions || allPermissions(false));
  return {
    id: member.id,
    user_id: member.user_id,
    email: member.email,
    name: member.name,
    phone: member.phone || "",
    role_title: member.role_title || "",
    status: member.status,
    profile_completed: Boolean(member.profile_completed),
    last_login_at: member.last_login_at,
    created_at: member.created_at,
    updated_at: member.updated_at,
    role: role
      ? {
          id: role.id,
          slug: role.slug,
          name: role.name,
          description: role.description,
        }
      : {
          id: member.role_id,
          slug: member.role_slug,
          name: member.role_slug || "Role",
        },
    permissions,
    user: {
      id: member.user_id,
      name: member.name,
      email: member.email,
      last_login_at: member.last_login_at,
    },
  };
}

function publicRole(role) {
  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    description: role.description || "",
    is_system: Boolean(role.is_system),
    permissions: normalizePermissions(role.permissions),
    created_at: role.created_at,
    updated_at: role.updated_at,
  };
}

export async function listRoles() {
  if (hasSupabaseBackend()) {
    try {
      await ensureSupabaseSeeded();
      if (hasSupabaseBackend()) {
        const admin = createAdminSupabaseClient();
        const { data, error } = await admin
          .from(ROLES_TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("name", { ascending: true });
        if (error) {
          if (!markTeamTablesMissing(error)) throw new Error(error.message);
        } else {
          return { data: (data || []).map(publicRole), source: "supabase" };
        }
      }
    } catch (err) {
      if (!markTeamTablesMissing(err)) throw err;
    }
  }
  const state = await ensureLocalSeeded();
  return { data: state.roles.map(publicRole), source: "local" };
}

/** @param {string} roleIdOrSlug */
export async function getRole(roleIdOrSlug) {
  const { data } = await listRoles();
  return (
    data.find((r) => r.id === roleIdOrSlug || r.slug === roleIdOrSlug) || null
  );
}

/**
 * @param {{ name: string, description?: string, permissions?: object, slug?: string }} input
 */
export async function createRole(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Role name is required.");
  const slug =
    String(input.slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const at = nowIso();
  const role = {
    id: newId("role"),
    workspace_id: WORKSPACE_ID,
    slug,
    name,
    description: String(input.description || "").trim(),
    is_system: false,
    permissions: normalizePermissions(input.permissions),
    created_at: at,
    updated_at: at,
  };

  if (hasSupabaseBackend()) {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from(ROLES_TABLE).insert(shapeRoleForDb(role));
    if (error) throw new Error(error.message);
    return { data: publicRole(role), source: "supabase" };
  }

  const state = await ensureLocalSeeded();
  if (state.roles.some((r) => r.slug === slug)) {
    throw new Error("A role with this slug already exists.");
  }
  state.roles.push(role);
  await writeLocal(state);
  return { data: publicRole(role), source: "local" };
}

/**
 * @param {string} roleId
 * @param {{ name?: string, description?: string, permissions?: object }} patch
 */
export async function updateRole(roleId, patch) {
  if (hasSupabaseBackend()) {
    const admin = createAdminSupabaseClient();
    const { data: existing, error: findErr } = await admin
      .from(ROLES_TABLE)
      .select("*")
      .eq("id", roleId)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!existing) throw new Error("Role not found.");

    const next = {
      ...existing,
      name: patch.name != null ? String(patch.name).trim() : existing.name,
      description:
        patch.description != null
          ? String(patch.description).trim()
          : existing.description,
      permissions:
        patch.permissions != null
          ? normalizePermissions(patch.permissions)
          : normalizePermissions(existing.permissions),
      updated_at: nowIso(),
    };
    const { error } = await admin
      .from(ROLES_TABLE)
      .update(shapeRoleForDb(next))
      .eq("id", roleId);
    if (error) throw new Error(error.message);
    return { data: publicRole(next), source: "supabase" };
  }

  const state = await ensureLocalSeeded();
  const idx = state.roles.findIndex((r) => r.id === roleId);
  if (idx < 0) throw new Error("Role not found.");
  const existing = state.roles[idx];
  const next = {
    ...existing,
    name: patch.name != null ? String(patch.name).trim() : existing.name,
    description:
      patch.description != null
        ? String(patch.description).trim()
        : existing.description,
    permissions:
      patch.permissions != null
        ? normalizePermissions(patch.permissions)
        : normalizePermissions(existing.permissions),
    updated_at: nowIso(),
  };
  state.roles[idx] = next;
  await writeLocal(state);
  return { data: publicRole(next), source: "local" };
}

export async function listMembers() {
  const rolesResult = await listRoles();
  const roleMap = Object.fromEntries(rolesResult.data.map((r) => [r.id, r]));

  if (hasSupabaseBackend()) {
    try {
      await ensureSupabaseSeeded();
      if (hasSupabaseBackend()) {
        const admin = createAdminSupabaseClient();
        const { data, error } = await admin
          .from(MEMBERS_TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("created_at", { ascending: true });
        if (error) {
          if (!markTeamTablesMissing(error)) throw new Error(error.message);
        } else {
          return {
            data: (data || []).map((m) =>
              publicMember(
                m,
                roleMap[m.role_id] ||
                  rolesResult.data.find((r) => r.slug === m.role_slug),
              ),
            ),
            source: "supabase",
          };
        }
      }
    } catch (err) {
      if (!markTeamTablesMissing(err)) throw err;
    }
  }

  const state = await ensureLocalSeeded();
  return {
    data: state.members.map((m) =>
      publicMember(m, roleMap[m.role_id] || rolesResult.data.find((r) => r.slug === m.role_slug)),
    ),
    source: "local",
  };
}

/** @param {string} email */
export async function getMemberByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await listMembers();
  return data.find((m) => m.email?.toLowerCase() === normalized) || null;
}

/** @param {string} userId */
export async function getMemberByUserId(userId) {
  if (!userId) return null;
  const { data } = await listMembers();
  return data.find((m) => m.user_id === userId) || null;
}

/**
 * Resolve membership + permissions for an auth user (admin seed fallback).
 * @param {{ id?: string, email?: string | null }} user
 */
export async function resolveMembershipForUser(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  let member =
    (user?.id ? await getMemberByUserId(user.id) : null) ||
    (email ? await getMemberByEmail(email) : null);

  if (!member && email === ADMIN_EMAIL.toLowerCase()) {
    const role = await getRole("admin");
    return {
      member: {
        id: "member-admin",
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        status: "active",
        role: { id: "role-admin", slug: "admin", name: "Admin" },
        permissions: allPermissions(true),
      },
      role: role || { slug: "admin", name: "Admin", permissions: allPermissions(true) },
      permissions: allPermissions(true),
      isAdmin: true,
    };
  }

  if (!member) {
    return {
      member: null,
      role: null,
      permissions: null,
      isAdmin: false,
    };
  }

  const isAdmin =
    member.role?.slug === "admin" ||
    email === ADMIN_EMAIL.toLowerCase();
  return {
    member,
    role: member.role,
    permissions: isAdmin ? allPermissions(true) : member.permissions,
    isAdmin,
  };
}

/**
 * @param {string} memberId
 * @param {{ role_id?: string, status?: string, name?: string, phone?: string, role_title?: string }} patch
 */
export async function updateMember(memberId, patch) {
  const role =
    patch.role_id != null ? await getRole(patch.role_id) : null;
  if (patch.role_id != null && !role) throw new Error("Role not found.");

  if (hasSupabaseBackend()) {
    const admin = createAdminSupabaseClient();
    const { data: existing, error: findErr } = await admin
      .from(MEMBERS_TABLE)
      .select("*")
      .eq("id", memberId)
      .maybeSingle();
    if (findErr) {
      if (!markTeamTablesMissing(findErr)) throw new Error(findErr.message);
    } else if (!existing) {
      throw new Error("Member not found.");
    } else {
      const next = {
        ...existing,
        role_id: role ? role.id : existing.role_id,
        role_slug: role ? role.slug : existing.role_slug,
        status: patch.status != null ? String(patch.status) : existing.status,
        name: patch.name != null ? String(patch.name).trim() : existing.name,
        phone: patch.phone != null ? String(patch.phone).trim() : existing.phone,
        role_title:
          patch.role_title != null
            ? String(patch.role_title).trim()
            : existing.role_title,
        updated_at: nowIso(),
      };
      const { error } = await admin
        .from(MEMBERS_TABLE)
        .update(shapeMemberForDb(next))
        .eq("id", memberId);
      if (error) {
        if (!markTeamTablesMissing(error)) throw new Error(error.message);
      } else {
        return {
          data: publicMember(next, role || (await getRole(next.role_id))),
          source: "supabase",
        };
      }
    }
  }

  const state = await ensureLocalSeeded();
  const idx = state.members.findIndex((m) => m.id === memberId);
  if (idx < 0) throw new Error("Member not found.");
  const existing = state.members[idx];
  const next = {
    ...existing,
    role_id: role ? role.id : existing.role_id,
    role_slug: role ? role.slug : existing.role_slug,
    status: patch.status != null ? String(patch.status) : existing.status,
    name: patch.name != null ? String(patch.name).trim() : existing.name,
    phone: patch.phone != null ? String(patch.phone).trim() : existing.phone,
    role_title:
      patch.role_title != null
        ? String(patch.role_title).trim()
        : existing.role_title,
    updated_at: nowIso(),
  };
  state.members[idx] = next;
  await writeLocal(state);
  const roles = await listRoles();
  const roleObj =
    role || roles.data.find((r) => r.id === next.role_id) || null;
  return { data: publicMember(next, roleObj), source: "local" };
}

export async function listInvites({ status = "pending" } = {}) {
  if (hasSupabaseBackend()) {
    try {
      await ensureSupabaseSeeded();
      if (hasSupabaseBackend()) {
        const admin = createAdminSupabaseClient();
        let query = admin
          .from(INVITES_TABLE)
          .select("*")
          .eq("workspace_id", WORKSPACE_ID)
          .order("created_at", { ascending: false });
        if (status) query = query.eq("status", status);
        const { data, error } = await query;
        if (error) {
          if (!markTeamTablesMissing(error)) throw new Error(error.message);
        } else {
          return {
            data: (data || []).map((i) => publicInvite(i)),
            source: "supabase",
          };
        }
      }
    } catch (err) {
      if (!markTeamTablesMissing(err)) throw err;
    }
  }

  const state = await ensureLocalSeeded();
  let invites = state.invites;
  if (status) invites = invites.filter((i) => i.status === status);
  return {
    data: invites
      .slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((i) => publicInvite(i)),
    source: "local",
  };
}

/**
 * @param {{
 *   email: string,
 *   name?: string,
 *   role_id: string,
 *   invited_by?: string,
 *   invited_by_email?: string,
 * }} input
 */
export async function createInvite(input) {
  const email = String(input.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  const existingMember = await getMemberByEmail(email);
  if (existingMember && existingMember.status === "active") {
    throw new Error("This email already belongs to an active team member.");
  }

  const role = await getRole(input.role_id);
  if (!role) throw new Error("Role not found.");

  const token = newToken();
  const at = nowIso();
  const invite = {
    id: newId("invite"),
    workspace_id: WORKSPACE_ID,
    email,
    name: String(input.name || "").trim(),
    role_id: role.id,
    role_slug: role.slug,
    token_hash: hashInviteToken(token),
    status: "pending",
    invited_by: input.invited_by || null,
    invited_by_email: input.invited_by_email || null,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    accepted_at: null,
    created_at: at,
    updated_at: at,
  };

  // Revoke prior pending invites for same email
  let source = "local";
  if (hasSupabaseBackend()) {
    try {
      const admin = createAdminSupabaseClient();
      const { error: revokeErr } = await admin
        .from(INVITES_TABLE)
        .update({ status: "revoked", updated_at: at })
        .eq("workspace_id", WORKSPACE_ID)
        .eq("email", email)
        .eq("status", "pending");
      if (revokeErr && !markTeamTablesMissing(revokeErr)) {
        throw new Error(revokeErr.message);
      }
      if (hasSupabaseBackend()) {
        const { error } = await admin
          .from(INVITES_TABLE)
          .insert(shapeInviteForDb(invite));
        if (error) {
          if (!markTeamTablesMissing(error)) throw new Error(error.message);
        } else {
          source = "supabase";
        }
      }
    } catch (err) {
      if (!markTeamTablesMissing(err)) throw err;
    }
  }
  if (source === "local") {
    const state = await ensureLocalSeeded();
    state.invites = state.invites.map((i) =>
      i.email === email && i.status === "pending"
        ? { ...i, status: "revoked", updated_at: at }
        : i,
    );
    state.invites.push(invite);
    await writeLocal(state);
  }

  return {
    data: publicInvite(invite, { includeToken: true, token }),
    token,
    role,
    source,
  };
}

/** @param {string} token */
export async function findInviteByToken(token) {
  const hash = hashInviteToken(token);
  if (hasSupabaseBackend()) {
    try {
      const admin = createAdminSupabaseClient();
      const { data, error } = await admin
        .from(INVITES_TABLE)
        .select("*")
        .eq("token_hash", hash)
        .maybeSingle();
      if (error) {
        if (!markTeamTablesMissing(error)) throw new Error(error.message);
      } else {
        return data || null;
      }
    } catch (err) {
      if (!markTeamTablesMissing(err)) throw err;
    }
  }
  const state = await ensureLocalSeeded();
  return state.invites.find((i) => i.token_hash === hash) || null;
}

/** @param {string} token */
export async function getPublicInvite(token) {
  const invite = await findInviteByToken(token);
  if (!invite) return { ok: false, status: 404, message: "Invitation not found." };
  if (invite.status !== "pending") {
    return {
      ok: false,
      status: 410,
      message: `This invitation is ${invite.status}.`,
    };
  }
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, message: "This invitation has expired." };
  }
  const role = await getRole(invite.role_id);
  return {
    ok: true,
    data: {
      ...publicInvite(invite),
      role: role
        ? { id: role.id, slug: role.slug, name: role.name }
        : { id: invite.role_id, slug: invite.role_slug, name: invite.role_slug },
      workspace: { id: WORKSPACE_ID, name: "Triada Designs" },
    },
  };
}

/** @param {string} inviteId */
export async function revokeInvite(inviteId) {
  const at = nowIso();
  if (hasSupabaseBackend()) {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from(INVITES_TABLE)
      .update({ status: "revoked", updated_at: at })
      .eq("id", inviteId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Pending invite not found.");
    return { data: publicInvite(data), source: "supabase" };
  }
  const state = await ensureLocalSeeded();
  const idx = state.invites.findIndex(
    (i) => i.id === inviteId && i.status === "pending",
  );
  if (idx < 0) throw new Error("Pending invite not found.");
  state.invites[idx] = {
    ...state.invites[idx],
    status: "revoked",
    updated_at: at,
  };
  await writeLocal(state);
  return { data: publicInvite(state.invites[idx]), source: "local" };
}

/**
 * Local dual-run password check for invited members (when Supabase Auth is unset).
 * @param {string} email
 * @param {string} password
 */
export async function authenticateLocalMember(email, password) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized || !password) return { ok: false };

  if (hasSupabaseBackend()) {
    // Local password hashes are dual-run only.
    return { ok: false };
  }

  const state = await ensureLocalSeeded();
  const member = state.members.find(
    (m) =>
      m.email?.toLowerCase() === normalized &&
      m.status === "active" &&
      m.local_password_hash,
  );
  if (!member) return { ok: false };
  if (!verifyLocalPassword(password, member.local_password_hash)) {
    return { ok: false };
  }
  return {
    ok: true,
    profile: {
      id: member.user_id || member.id,
      email: member.email,
      name: member.name,
      phone: member.phone || "",
      role_title: member.role_title || "",
    },
  };
}

/**
 * Accept invite: mark accepted + create/update member (caller creates Auth user).
 * @param {string} token
 * @param {{
 *   user_id: string,
 *   name: string,
 *   phone?: string,
 *   role_title?: string,
 *   local_password?: string,
 * }} profile
 */
export async function acceptInvite(token, profile) {
  const invite = await findInviteByToken(token);
  if (!invite) throw Object.assign(new Error("Invitation not found."), { status: 404 });
  if (invite.status !== "pending") {
    throw Object.assign(new Error(`This invitation is ${invite.status}.`), {
      status: 410,
    });
  }
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("This invitation has expired."), { status: 410 });
  }

  const role = await getRole(invite.role_id);
  if (!role) throw new Error("Invite role is missing.");

  const at = nowIso();
  const name = String(profile.name || invite.name || "").trim();
  if (!name) throw new Error("Name is required.");
  if (!profile.user_id) throw new Error("user_id is required.");

  const member = {
    id: newId("member"),
    workspace_id: WORKSPACE_ID,
    user_id: profile.user_id,
    email: invite.email,
    name,
    phone: String(profile.phone || "").trim(),
    role_title: String(profile.role_title || "").trim(),
    role_id: role.id,
    role_slug: role.slug,
    status: "active",
    permissions_override: null,
    profile_completed: true,
    last_login_at: at,
    invited_by: invite.invited_by,
    created_at: at,
    updated_at: at,
    ...(profile.local_password && !hasSupabaseBackend()
      ? { local_password_hash: hashLocalPassword(profile.local_password) }
      : {}),
  };

  if (hasSupabaseBackend()) {
    const admin = createAdminSupabaseClient();
    // Soft-remove prior membership for same email
    await admin
      .from(MEMBERS_TABLE)
      .update({ status: "replaced", updated_at: at })
      .eq("workspace_id", WORKSPACE_ID)
      .eq("email", invite.email)
      .neq("status", "replaced");

    const { error: memErr } = await admin
      .from(MEMBERS_TABLE)
      .insert(shapeMemberForDb(member));
    if (memErr) throw new Error(memErr.message);

    const { error: invErr } = await admin
      .from(INVITES_TABLE)
      .update({
        status: "accepted",
        accepted_at: at,
        updated_at: at,
        name,
      })
      .eq("id", invite.id);
    if (invErr) throw new Error(invErr.message);
  } else {
    const state = await ensureLocalSeeded();
    state.members = state.members.map((m) =>
      m.email === invite.email
        ? { ...m, status: "replaced", updated_at: at }
        : m,
    );
    state.members.push(member);
    const invIdx = state.invites.findIndex((i) => i.id === invite.id);
    if (invIdx >= 0) {
      state.invites[invIdx] = {
        ...state.invites[invIdx],
        status: "accepted",
        accepted_at: at,
        updated_at: at,
        name,
      };
    }
    await writeLocal(state);
  }

  return {
    data: publicMember(member, role),
    invite: publicInvite({ ...invite, status: "accepted", accepted_at: at, name }),
    source: hasSupabaseBackend() ? "supabase" : "local",
  };
}

/**
 * App base URL for invite links (Production dashboard only).
 * Scrubs trycloudflare / Vercel preview / localhost — never email those.
 * @param {Request} [request]
 */
export function inviteAppBaseUrl(request) {
  return resolvePublicAppUrl({ request: request || null });
}
