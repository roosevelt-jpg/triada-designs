import { NextResponse } from "next/server";
import { processDueAbandonment } from "@/lib/jewellery-ops/abandonment";

/**
 * Vercel Cron: cart / sizing abandonment (1-day reminders).
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

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (bearer !== expected && alt !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await processDueAbandonment();
    return NextResponse.json(
      {
        ok: true,
        ...result,
        time: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        worker: "abandonment",
        error: err instanceof Error ? err.message : "abandonment_failed",
        time: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
