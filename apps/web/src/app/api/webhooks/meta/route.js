import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestMetaWebhook } from "@/lib/meta/webhook-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta webhook Callback URL (Vercel / Next — not rewritten to Laravel):
 *   https://dashboard.triada-designs.com/api/webhooks/meta
 * Optional alias when api host is rewritten to this deployment:
 *   https://api.triada-designs.com/api/webhooks/meta
 */

/** Production Meta Verify Token default when Vercel env is unset. */
const DEFAULT_META_VERIFY_TOKEN = "triada-meta-verify-2026";

function resolveVerifyToken() {
  return (
    process.env.META_VERIFY_TOKEN?.trim() ||
    process.env.META_HUB_VERIFY_TOKEN?.trim() ||
    DEFAULT_META_VERIFY_TOKEN
  );
}

/**
 * Meta sends hub.mode / hub.verify_token / hub.challenge (dotted) —
 * also accept underscore variants for proxies that normalize query keys.
 * @param {URLSearchParams} searchParams
 */
function readHubParams(searchParams) {
  const mode =
    searchParams.get("hub.mode") ||
    searchParams.get("hub_mode") ||
    "";
  const token =
    searchParams.get("hub.verify_token") ||
    searchParams.get("hub_verify_token") ||
    "";
  const challenge =
    searchParams.get("hub.challenge") ||
    searchParams.get("hub_challenge") ||
    "";
  return { mode, token, challenge };
}

/**
 * GET — Meta subscription verification (hub.challenge).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const { mode, token, challenge } = readHubParams(searchParams);
  const expected = resolveVerifyToken();

  if (mode === "subscribe" && token && challenge && timingSafeEqual(token, expected)) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ message: "Verification failed." }, { status: 403 });
}

/**
 * POST — inbound Meta events (ingest stub → Supabase or local mock).
 */
export async function POST(request) {
  const rawBody = await request.text();
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  /** @type {Record<string, string | null>} */
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // Signature verification (X-Hub-Signature-256) lands with full control-plane port.
  // Slice 1 accepts and stores so Meta delivery can be proven end-to-end.
  const result = await ingestMetaWebhook({ payload, rawBody, headers });

  return NextResponse.json(
    {
      ok: result.ok,
      storage: result.storage,
      id: result.id,
      provider_event_id: result.provider_event_id,
      message: result.message,
      warning: result.warning,
    },
    { status: 200 },
  );
}

/**
 * Constant-time string compare for verify tokens.
 * @param {string} a
 * @param {string} b
 */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return cryptoTimingSafeEqual(bufA, bufB);
}
