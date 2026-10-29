import { NextResponse } from "next/server";
import {
  hydrateContentFromSupabase,
  processDueContentPublish,
} from "@/lib/content-schedule-store";

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
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const alt = (request.headers.get("x-cron-secret") || "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || (bearer !== expected && alt !== expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await hydrateContentFromSupabase();
  const local = processDueContentPublish();
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
