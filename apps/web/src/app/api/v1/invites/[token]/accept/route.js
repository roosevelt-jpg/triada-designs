import { NextResponse } from "next/server";
import { acceptInviteAndActivate } from "@/lib/team/accept-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public invite accept — set password + complete profile.
 * POST /api/v1/invites/:token/accept
 */
export async function POST(request, context) {
  const resolved = await context.params;
  const token = String(resolved?.token || "").trim();
  if (!token) {
    return NextResponse.json({ message: "Missing invite token." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const result = await acceptInviteAndActivate(token, body || {});
  if (!result.ok) {
    return NextResponse.json(
      {
        message: result.message,
        ...(result.errors ? { errors: result.errors } : {}),
      },
      { status: result.status || 400 },
    );
  }

  return NextResponse.json(result.data, { status: 200 });
}
