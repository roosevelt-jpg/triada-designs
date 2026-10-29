import { NextResponse } from "next/server";
import { warmInboundRuntime } from "@/lib/meta/warm-inbound-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Optional ?warm=1 preloads Meta inbound Support modules (cold-start mitigation).
 */
export async function GET(request) {
  const url = new URL(request.url);
  const warm = url.searchParams.get("warm") === "1";

  /** @type {Record<string, unknown>} */
  const body = {
    ok: true,
    service: "triada-web",
    time: new Date().toISOString(),
  };

  if (warm) {
    try {
      body.warm = await warmInboundRuntime();
    } catch (err) {
      body.warm = {
        ok: false,
        error: err instanceof Error ? err.message : "warm_failed",
      };
    }
  }

  return NextResponse.json(body);
}
