/**
 * Accept a team invite: create Supabase Auth user (or local), complete profile.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  hasSupabaseAdminCredentials,
  hasSupabaseAnonCredentials,
} from "@/lib/supabase/config";
import {
  issueLocalSeedToken,
  localSeedAuthEnabled,
  localSeedUserFromProfile,
  loginResponsePayload,
  signInWithPassword,
} from "@/lib/auth/supabase-auth";
import { acceptInvite, getPublicInvite } from "./team-store";

/**
 * @param {string} token
 * @param {{
 *   password: string,
 *   name: string,
 *   phone?: string,
 *   role_title?: string,
 * }} body
 */
export async function acceptInviteAndActivate(token, body) {
  const preview = await getPublicInvite(token);
  if (!preview.ok) {
    return {
      ok: false,
      status: preview.status || 400,
      message: preview.message || "Invalid invitation.",
    };
  }

  const password = String(body.password || "");
  const name = String(body.name || preview.data.name || "").trim();
  const phone = String(body.phone || "").trim();
  const roleTitle = String(body.role_title || "").trim();

  if (password.length < 8) {
    return {
      ok: false,
      status: 422,
      message: "Password must be at least 8 characters.",
      errors: { password: ["Password must be at least 8 characters."] },
    };
  }
  if (!name) {
    return {
      ok: false,
      status: 422,
      message: "Name is required.",
      errors: { name: ["Name is required."] },
    };
  }

  const email = preview.data.email;

  /** @type {string} */
  let userId;
  /** @type {string | null} */
  let accessToken = null;
  /** @type {import('@supabase/supabase-js').User | null} */
  let authUser = null;

  if (hasSupabaseAdminCredentials()) {
    const admin = createAdminSupabaseClient();
    if (!admin) {
      return { ok: false, status: 503, message: "Auth admin client unavailable." };
    }

    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listed.error) {
      return { ok: false, status: 502, message: listed.error.message };
    }
    const existing = (listed.data?.users || []).find(
      (u) => (u.email || "").toLowerCase() === email.toLowerCase(),
    );

    if (existing) {
      const updated = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata || {}),
          name,
          phone,
          role_title: roleTitle,
        },
      });
      if (updated.error) {
        return { ok: false, status: 422, message: updated.error.message };
      }
      userId = existing.id;
      authUser = updated.data.user || existing;
    } else {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone, role_title: roleTitle },
      });
      if (created.error || !created.data.user) {
        return {
          ok: false,
          status: 422,
          message: created.error?.message || "Unable to create account.",
        };
      }
      userId = created.data.user.id;
      authUser = created.data.user;
    }

    if (hasSupabaseAnonCredentials()) {
      const signed = await signInWithPassword(email, password);
      if (signed.ok) {
        accessToken = signed.accessToken;
        authUser = signed.user;
      }
    }
  } else if (localSeedAuthEnabled()) {
    userId = `local-member-${email.replace(/[^a-z0-9]+/gi, "-")}`;
    const profile = {
      id: userId,
      email,
      name,
      phone,
      role_title: roleTitle,
    };
    accessToken = issueLocalSeedToken(profile);
    authUser = localSeedUserFromProfile(profile);
  } else {
    return {
      ok: false,
      status: 503,
      message:
        "Supabase Auth is not configured. Set SUPABASE_SERVICE_ROLE_KEY to activate invited accounts.",
    };
  }

  let membership;
  try {
    membership = await acceptInvite(token, {
      user_id: userId,
      name,
      phone,
      role_title: roleTitle,
      local_password: !hasSupabaseAdminCredentials() ? password : undefined,
    });
  } catch (err) {
    return {
      ok: false,
      status: err?.status || 400,
      message: err instanceof Error ? err.message : "Unable to accept invite.",
    };
  }

  const login =
    accessToken && authUser
      ? loginResponsePayload(accessToken, authUser)
      : null;

  if (login) {
    login.role = membership.data.role?.slug || "member";
    login.permissions = membership.data.permissions;
    login.member = membership.data;
  }

  return {
    ok: true,
    data: {
      member: membership.data,
      invite: membership.invite,
      login,
      message: login
        ? "Profile complete. You are signed in."
        : "Profile complete. Please sign in with your email and password.",
    },
  };
}
