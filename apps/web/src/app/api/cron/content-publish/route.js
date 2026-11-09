import { NextResponse } from "next/server";
import {
  hydrateContentFromSupabase,
  processDueContentPublish,
} from "@/lib/content-schedule-store";
import { requireCronSecret } from "@/lib/security/request-auth";

/**
 * Vercel Cron Jobs target: GET /api/cron/content-publish
 * Next-native — no Laravel dependency.
 */
export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

async function handle(request) {
  const auth = requireCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  await hydrateContentFromSupabase();
  const local = await processDueContentPublish();
  return NextResponse.json(
    {
      ok: true,
      worker: "content_publish",
      mode: "next_native",
      ...local,
      time: new Date().toISOString(),
    },
    { status: 200 },
  );
}
