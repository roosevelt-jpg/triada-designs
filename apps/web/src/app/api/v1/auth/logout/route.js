import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  getUserFromAccessToken,
  readBearerToken,
} from "@/lib/auth/supabase-auth";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dual-run logout matching Laravel Sanctum `POST /api/v1/auth/logout`.
 * Client already clears localStorage; we best-effort revoke the Supabase session.
 */
export async function POST(request) {
  const token = readBearerToken(request);
  if (token && hasSupabaseAdminCredentials()) {
    const session = await getUserFromAccessToken(token);
    if (session.ok && session.user?.id) {
      const admin = createAdminSupabaseClient();
      try {
        await admin?.auth.admin.signOut(session.user.id, "global");
      } catch {
        // Ignore revoke failures — client token drop is enough for UX.
      }
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
