import { NextResponse } from "next/server";
import { processQuoteInspirationCron } from "@/lib/content/quote-inspiration-engine";
import { requireCronSecret } from "@/lib/security/request-auth";

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
  const auth = requireCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

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
