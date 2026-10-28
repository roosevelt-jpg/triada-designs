import { NextResponse } from "next/server";
import {
  getUserFromAccessToken,
  meResponsePayload,
  readBearerToken,
} from "@/lib/auth/supabase-auth";

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

  return NextResponse.json(meResponsePayload(result.user), { status: 200 });
}
