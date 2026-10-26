import { NextResponse } from "next/server";
import { invokeLaravelCron } from "@/lib/cron-proxy";

/**
 * Vercel Cron Jobs target: GET /api/cron/abandonment
 * Forwards to Laravel POST /api/v1/cron/abandonment/process with CRON_SECRET.
 */
export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

async function handle(request) {
  const result = await invokeLaravelCron(request, "/api/v1/cron/abandonment/process");
  return NextResponse.json(result.body, { status: result.status });
}
