import { NextResponse } from "next/server";
import { processDueAfterSale } from "@/lib/jewellery-ops/after-sale";

/**
 * Vercel Cron: after-sale care / review / set / UGC invite.
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
    const result = await processDueAfterSale();
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
        worker: "after_sale",
        error: err instanceof Error ? err.message : "after_sale_failed",
        time: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
