import { NextResponse } from "next/server";
import { getPublicInvite } from "@/lib/team/team-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public invite preview (no auth) — invitee opens email link.
 * GET /api/v1/invites/:token
 */
export async function GET(_request, context) {
  const resolved = await context.params;
  const token = String(resolved?.token || "").trim();
  if (!token) {
    return NextResponse.json({ message: "Missing invite token." }, { status: 400 });
  }

  const result = await getPublicInvite(token);
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message },
      { status: result.status || 404 },
    );
  }

  return NextResponse.json(result.data, { status: 200 });
}
