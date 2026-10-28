import { NextResponse } from "next/server";
import { processQuoteInspirationCron } from "@/lib/content/quote-inspiration-engine";

/**
 * Vercel Cron: weekday Quote / Inspiration broadcast.
 * Path: GET|POST /api/cron/quote-inspiration
 * Engine skips non-selected weekdays and already-sent days.
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
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  if (expected && bearer !== expected && alt !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processQuoteInspirationCron({
      force,
      generate_if_missing: false,
    });
    return NextResponse.json(
      {
        ok: true,
        worker: "quote_inspiration",
        ...result,
        time: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        worker: "quote_inspiration",
        error: err instanceof Error ? err.message : "quote_inspiration_failed",
        time: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
