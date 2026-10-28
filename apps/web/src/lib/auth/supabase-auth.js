import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseAdminCredentials,
  hasSupabaseAnonCredentials,
} from "@/lib/supabase/config";

/** Production-style admin used across seeders and dashboard login. */
export const ADMIN_EMAIL = "info@triada-designs.com";
export const ADMIN_PASSWORD = "triada-local";
export const ADMIN_NAME = "Triada Admin";

/** Bearer prefix for local dual-run when Supabase Auth env is unset. */
export const LOCAL_SEED_TOKEN_PREFIX = "triada-local-seed.";

/**
 * Local seed auth is for dual-run hosts without Supabase keys
 * (never enabled when anon credentials are present).
 */
export function localSeedAuthEnabled() {
  if (hasSupabaseAnonCredentials()) return false;
  if (process.env.TRIADA_DISABLE_LOCAL_SEED_AUTH === "1") return false;
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.TRIADA_LOCAL_SEED_AUTH === "1"
  );
}

/** @returns {import('@supabase/supabase-js').User} */
export function localSeedUser() {
  return {
    id: "local-seed-admin",
    email: ADMIN_EMAIL,
    user_metadata: { name: ADMIN_NAME },
    app_metadata: { provider: "local_seed" },
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * @param {{ id: string, email: string, name?: string, phone?: string, role_title?: string }} profile
 * @returns {import('@supabase/supabase-js').User}
 */
export function localSeedUserFromProfile(profile) {
  return {
    id: profile.id,
    email: profile.email,
    user_metadata: {
      name: profile.name || "",
      phone: profile.phone || "",
      role_title: profile.role_title || "",
    },
    app_metadata: { provider: "local_seed" },
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * Encode a local dual-run bearer token for any team member.
 * @param {{ id: string, email: string, name?: string, phone?: string, role_title?: string }} profile
 */
export function issueLocalSeedToken(profile) {
  const payload = Buffer.from(
    JSON.stringify({
      id: profile.id,
      email: String(profile.email || "").toLowerCase(),
      name: profile.name || "",
      phone: profile.phone || "",
      role_title: profile.role_title || "",
      iat: Date.now(),
    }),
    "utf8",
  ).toString("base64url");
  return `${LOCAL_SEED_TOKEN_PREFIX}${payload}`;
}

/**
 * @param {string} token
 * @returns {import('@supabase/supabase-js').User | null}
 */
export function parseLocalSeedToken(token) {
  if (!isLocalSeedToken(token)) return null;
  const rest = token.slice(LOCAL_SEED_TOKEN_PREFIX.length);
  // Legacy admin tokens: triada-local-seed.<timestamp>
  if (/^\d+$/.test(rest)) {
    return localSeedUser();
  }
  try {
    const json = Buffer.from(rest, "base64url").toString("utf8");
    const data = JSON.parse(json);
    if (!data?.id || !data?.email) return localSeedUser();
    return localSeedUserFromProfile(data);
  } catch {
    return localSeedUser();
  }
}

/** @param {string} token */
export function isLocalSeedToken(token) {
  return Boolean(token && token.startsWith(LOCAL_SEED_TOKEN_PREFIX));
}

/**
 * Sanctum-shaped workspace stub so the existing dashboard shell keeps working
 * while Laravel dual-run APIs are still migrating.
 */
export function defaultWorkspacePayload() {
  return {
    id: "triada-ops",
    name: "Triada Designs",
    slug: "triada-designs",
  };
}

/**
 * @param {{ id?: string, email?: string | null, user_metadata?: Record<string, unknown> | null }} user
 */
export function toAuthUser(user) {
  const metaName =
    (user?.user_metadata && typeof user.user_metadata.name === "string"
      ? user.user_metadata.name
      : "") || "";
  const email = user?.email || "";
  return {
    id: user?.id || "",
    name: metaName || (email === ADMIN_EMAIL ? ADMIN_NAME : email.split("@")[0] || "User"),
    email,
  };
}

/**
 * Shape Laravel Sanctum `POST /api/v1/auth/login` returned historically.
 * @param {string} accessToken
 * @param {import('@supabase/supabase-js').User} user
 * @param {{ role?: string, permissions?: object, member?: object, isAdmin?: boolean }} [extras]
 */
export function loginResponsePayload(accessToken, user, extras = {}) {
  const local = isLocalSeedToken(accessToken);
  const email = (user?.email || "").toLowerCase();
  const isAdmin =
    extras.isAdmin === true ||
    extras.role === "admin" ||
    email === ADMIN_EMAIL.toLowerCase();
  return {
    token: accessToken,
    token_type: "Bearer",
    user: toAuthUser(user),
    workspace: defaultWorkspacePayload(),
    role: extras.role || (isAdmin ? "admin" : "member"),
    permissions: extras.permissions || null,
    member: extras.member || null,
    is_admin: isAdmin,
    auth_provider: local ? "local_seed" : "supabase",
  };
}

/**
 * Shape Laravel Sanctum `GET /api/v1/auth/me`.
 * @param {import('@supabase/supabase-js').User} user
 * @param {{ role?: string, permissions?: object, member?: object, isAdmin?: boolean, authProvider?: string }} [extras]
 */
export function meResponsePayload(user, extras = {}) {
  const email = (user?.email || "").toLowerCase();
  const isAdmin =
    extras.isAdmin === true ||
    extras.role === "admin" ||
    email === ADMIN_EMAIL.toLowerCase();
  return {
    user: toAuthUser(user),
    workspace: defaultWorkspacePayload(),
    role: extras.role || (isAdmin ? "admin" : "member"),
    permissions: extras.permissions || null,
    member: extras.member || null,
    is_admin: isAdmin,
    auth_provider: extras.authProvider || "supabase",
  };
}

/** @param {Request} request */
export function readBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

/**
 * Ensure the seeded admin exists in Supabase Auth (service role).
 * Only creates/resets when `password` matches the known seed so failed
 * login attempts cannot overwrite the admin secret with a typo.
 * @param {string} [email]
 * @param {string} [password]
 */
export async function ensureAdminUser(
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
) {
  if (!hasSupabaseAdminCredentials()) {
    return { ok: false, reason: "missing_service_role" };
  }

  const admin = createAdminSupabaseClient();
  if (!admin) return { ok: false, reason: "missing_service_role" };

  const normalized = email.trim().toLowerCase();
  if (normalized !== ADMIN_EMAIL.toLowerCase()) {
    return { ok: false, reason: "not_seed_admin" };
  }
  if (password !== ADMIN_PASSWORD) {
    return { ok: false, reason: "not_seed_password" };
  }

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) {
    return { ok: false, reason: listed.error.message };
  }

  const existing = (listed.data?.users || []).find(
    (u) => (u.email || "").toLowerCase() === normalized,
  );

  if (existing) {
    const updated = await admin.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata || {}),
        name: existing.user_metadata?.name || ADMIN_NAME,
      },
    });
    if (updated.error) {
      return { ok: false, reason: updated.error.message, userId: existing.id };
    }
    return { ok: true, created: false, userId: existing.id };
  }

  const created = await admin.auth.admin.createUser({
    email: normalized,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: ADMIN_NAME },
  });

  if (created.error) {
    return { ok: false, reason: created.error.message };
  }

  return { ok: true, created: true, userId: created.data.user?.id };
}

/**
 * Password sign-in via anon key. Optionally ensures admin when credentials fail.
 * @param {string} email
 * @param {string} password
 */
export async function signInWithPassword(email, password) {
  if (!hasSupabaseAnonCredentials()) {
    if (!localSeedAuthEnabled()) {
      return {
        ok: false,
        status: 503,
        message:
          "Supabase Auth is not configured on this host (missing SUPABASE_URL / anon key).",
      };
    }
    const normalized = email.trim().toLowerCase();
    if (normalized === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
      const user = localSeedUser();
      return {
        ok: true,
        accessToken: issueLocalSeedToken({
          id: user.id,
          email: user.email,
          name: ADMIN_NAME,
        }),
        user,
      };
    }
    try {
      const { authenticateLocalMember } = await import("@/lib/team/team-store");
      const local = await authenticateLocalMember(normalized, password);
      if (local.ok) {
        return {
          ok: true,
          accessToken: issueLocalSeedToken(local.profile),
          user: localSeedUserFromProfile(local.profile),
        };
      }
    } catch {
      /* fall through */
    }
    return {
      ok: false,
      status: 422,
      message: "The provided credentials are incorrect.",
      errors: { email: ["The provided credentials are incorrect."] },
    };
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      status: 503,
      message: "Supabase Auth client unavailable.",
    };
  }

  const normalized = email.trim().toLowerCase();
  let result = await supabase.auth.signInWithPassword({
    email: normalized,
    password,
  });

  const authError = result.error;
  const missingUser =
    authError &&
    /invalid login credentials|email not confirmed|user not found/i.test(
      authError.message || "",
    );

  if (
    missingUser &&
    normalized === ADMIN_EMAIL.toLowerCase() &&
    password === ADMIN_PASSWORD &&
    hasSupabaseAdminCredentials()
  ) {
    const ensured = await ensureAdminUser(normalized, password);
    if (ensured.ok) {
      result = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
    } else if (ensured.reason === "missing_service_role") {
      return {
        ok: false,
        status: 503,
        message: `Unable to provision admin user: ${ensured.reason}`,
      };
    }
    // Other ensure failures fall through to invalid-credentials below.
  }

  if (result.error || !result.data?.session?.access_token || !result.data.user) {
    return {
      ok: false,
      status: 422,
      message: result.error?.message || "The provided credentials are incorrect.",
      errors: { email: ["The provided credentials are incorrect."] },
    };
  }

  return {
    ok: true,
    accessToken: result.data.session.access_token,
    user: result.data.user,
  };
}

/**
 * Validate a Bearer access token against Supabase Auth.
 * @param {string} accessToken
 */
export async function getUserFromAccessToken(accessToken) {
  if (!accessToken) {
    return { ok: false, status: 401, message: "Unauthenticated." };
  }
  if (isLocalSeedToken(accessToken) && localSeedAuthEnabled()) {
    const user = parseLocalSeedToken(accessToken) || localSeedUser();
    return { ok: true, user };
  }
  if (!hasSupabaseAnonCredentials()) {
    return {
      ok: false,
      status: 503,
      message: "Supabase Auth is not configured on this host.",
    };
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      status: 503,
      message: "Supabase Auth client unavailable.",
    };
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) {
    return { ok: false, status: 401, message: "Unauthenticated." };
  }

  return { ok: true, user: data.user };
}

/** Diagnostic helpers (never return secret values). */
export function authConfigStatus() {
  return {
    hasUrl: Boolean(getSupabaseUrl()),
    hasAnon: Boolean(getSupabaseAnonKey()),
    hasServiceRole: hasSupabaseAdminCredentials(),
    hasAnonPair: hasSupabaseAnonCredentials(),
  };
}
