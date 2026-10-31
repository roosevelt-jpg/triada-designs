import { NextResponse } from "next/server";
import {
  getUserFromAccessToken,
  isLocalSeedToken,
  meResponsePayload,
  readBearerToken,
} from "@/lib/auth/supabase-auth";
import { resolveMembershipForUser } from "@/lib/team/team-store";
import { getAdminProfileSettings } from "@/lib/agents/admin-profile-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dual-run session probe matching Laravel Sanctum `GET /api/v1/auth/me`.
 */
export async function GET(request) {
  const token = readBearerToken(request);
  const result = await getUserFromAccessToken(token);
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message },
      { status: result.status || 401 },
    );
  }

  let membership = {
    member: null,
    role: null,
    permissions: null,
    isAdmin: false,
  };
  try {
    membership = await resolveMembershipForUser(result.user);
  } catch {
    /* keep defaults */
  }

  let adminProfile = null;
  try {
    adminProfile = await getAdminProfileSettings();
  } catch {
    adminProfile = null;
  }

  const payload = meResponsePayload(result.user, {
    role: membership.role?.slug || (membership.isAdmin ? "admin" : "member"),
    permissions: membership.permissions,
    member: membership.member,
    isAdmin: membership.isAdmin,
    authProvider: isLocalSeedToken(token) ? "local_seed" : "supabase",
  });

  if (adminProfile?.avatar_url) {
    payload.user = {
      ...payload.user,
      avatar_url: adminProfile.avatar_url,
    };
  }
  if (adminProfile?.display_name && payload.user) {
    // Keep auth name; expose profile display name separately for header.
    payload.admin_profile = {
      display_name: adminProfile.display_name,
      avatar_url: adminProfile.avatar_url,
    };
  } else if (adminProfile) {
    payload.admin_profile = {
      display_name: adminProfile.display_name,
      avatar_url: adminProfile.avatar_url,
    };
  }

  return NextResponse.json(payload, { status: 200 });
}
