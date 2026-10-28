import { NextResponse } from "next/server";
import {
  getUserFromAccessToken,
  isLocalSeedToken,
  meResponsePayload,
  readBearerToken,
} from "@/lib/auth/supabase-auth";
import { resolveMembershipForUser } from "@/lib/team/team-store";

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

  return NextResponse.json(
    meResponsePayload(result.user, {
      role: membership.role?.slug || (membership.isAdmin ? "admin" : "member"),
      permissions: membership.permissions,
      member: membership.member,
      isAdmin: membership.isAdmin,
      authProvider: isLocalSeedToken(token) ? "local_seed" : "supabase",
    }),
    { status: 200 },
  );
}
