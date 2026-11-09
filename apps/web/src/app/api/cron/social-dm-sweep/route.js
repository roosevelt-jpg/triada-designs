import { NextResponse } from "next/server";
import { sweepUnansweredSocialDms } from "@/lib/agents/social-media-manager";
import { warmInboundRuntime } from "@/lib/meta/warm-inbound-runtime";
import { requireCronSecret } from "@/lib/security/request-auth";

/**
 * Vercel Cron: Social Media Manager unanswered DM sweep (Hobby-safe daily).
 * Path: GET|POST /api/cron/social-dm-sweep
 * Replies open Instagram / Messenger / Facebook / LinkedIn DMs so none stay unanswered.
 * Inbound simulate + manual sweep API still reply immediately between cron runs.
 * Also soft-warms WhatsApp Support inbound modules to cut cold-start latency.
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
  const dryRun = url.searchParams.get("dry_run") === "1";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw != null ? Number(limitRaw) : 20;

  try {
    const warm = await warmInboundRuntime().catch(() => null);
    const result = await sweepUnansweredSocialDms({
      dry_run: dryRun,
      limit: Number.isFinite(limit) ? limit : 20,
    });
    return NextResponse.json(
      {
        ok: Boolean(result.ok),
        worker: "social_dm_sweep",
        agent_key: "social_media_manager",
        ...result,
        warm,
        time: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        worker: "social_dm_sweep",
        agent_key: "social_media_manager",
        error: err instanceof Error ? err.message : "social_dm_sweep_failed",
        time: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
