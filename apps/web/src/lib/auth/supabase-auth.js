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
 */
export function loginResponsePayload(accessToken, user) {
  return {
    token: accessToken,
    token_type: "Bearer",
    user: toAuthUser(user),
    workspace: defaultWorkspacePayload(),
    role: "admin",
    auth_provider: "supabase",
  };
}

/**
 * Shape Laravel Sanctum `GET /api/v1/auth/me`.
 * @param {import('@supabase/supabase-js').User} user
 */
export function meResponsePayload(user) {
  return {
    user: toAuthUser(user),
    workspace: defaultWorkspacePayload(),
    role: "admin",
    auth_provider: "supabase",
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
    return {
      ok: false,
      status: 503,
      message:
        "Supabase Auth is not configured on this host (missing SUPABASE_URL / anon key).",
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
