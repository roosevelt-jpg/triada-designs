import { NextResponse } from "next/server";
import {
  authConfigStatus,
  loginResponsePayload,
  signInWithPassword,
} from "@/lib/auth/supabase-auth";
import { resolveMembershipForUser } from "@/lib/team/team-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dual-run login: Supabase Auth (Next) wins over Laravel rewrite fallback.
 * Returns the historical Sanctum JSON shape so the dashboard client needs no change.
 * POST /api/v1/auth/login
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      {
        message: "The given data was invalid.",
        errors: {
          ...(email ? {} : { email: ["The email field is required."] }),
          ...(password ? {} : { password: ["The password field is required."] }),
        },
      },
      { status: 422 },
    );
  }

  const result = await signInWithPassword(email, password);
  if (!result.ok) {
    const payload = {
      message: result.message,
      ...(result.errors ? { errors: result.errors } : {}),
      ...(result.status === 503 ? { auth: authConfigStatus() } : {}),
    };
    return NextResponse.json(payload, { status: result.status || 422 });
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

  if (
    membership.member &&
    membership.member.status &&
    membership.member.status !== "active" &&
    !membership.isAdmin
  ) {
    return NextResponse.json(
      { message: "Your team membership is not active. Contact an admin." },
      { status: 403 },
    );
  }

  return NextResponse.json(
    loginResponsePayload(result.accessToken, result.user, {
      role: membership.role?.slug || (membership.isAdmin ? "admin" : "member"),
      permissions: membership.permissions,
      member: membership.member,
      isAdmin: membership.isAdmin,
    }),
    { status: 200 },
  );
}
