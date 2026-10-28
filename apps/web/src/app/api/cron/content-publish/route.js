import { NextResponse } from "next/server";
import { invokeLaravelCron } from "@/lib/cron-proxy";
import { processDueContentPublish } from "@/lib/content-schedule-store";

/**
 * Vercel Cron Jobs target: GET /api/cron/content-publish
 * Forwards to Laravel POST /api/v1/cron/content-publish/process with CRON_SECRET.
 * Falls back to Next dual-run mutable content store when Laravel is unreachable.
 */
export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

async function handle(request) {
  const result = await invokeLaravelCron(request, "/api/v1/cron/content-publish/process");

  if (result.status >= 200 && result.status < 300 && result.body?.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  // Dual-run / local fallback so scheduled posts still drain without Laravel.
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const alt = (request.headers.get("x-cron-secret") || "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || (bearer !== expected && alt !== expected)) {
    return NextResponse.json(result.body, { status: result.status || 401 });
  }

  const local = processDueContentPublish();
  return NextResponse.json(
    {
      ok: true,
      worker: "content_publish",
      mode: "next_dual_run",
      laravel_status: result.status,
      laravel_error: result.body?.error || result.body?.detail || null,
      ...local,
      time: new Date().toISOString(),
    },
    { status: 200 }
  );
}
