import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ingestMetaWebhook } from "@/lib/meta/webhook-ingest";
import { warmInboundRuntime } from "@/lib/meta/warm-inbound-runtime";
import { runAfterResponse } from "@/lib/runtime/after-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Keep isolate alive for background draft + Graph send after early 200. */
export const maxDuration = 60;

/**
 * Meta webhook Callback URL (Vercel / Next — not rewritten to Laravel):
 *   https://dashboard.triada-designs.com/api/webhooks/meta
 * Optional alias when api host is rewritten to this deployment:
 *   https://api.triada-designs.com/api/webhooks/meta
 */

/**
 * Meta App Verify Token used in Production Subscribe.
 * Always accepted so a stale Vercel META_VERIFY_TOKEN (e.g. legacy
 * triada-local-verify) cannot block Meta Verify and Save.
 */
const DEFAULT_META_VERIFY_TOKEN = "triada-meta-verify-2026";

/**
 * Allowed hub.verify_token values: META_VERIFY_TOKEN, META_HUB_VERIFY_TOKEN,
 * plus the Production Meta App default (covers unset or stale Vercel env).
 * @returns {string[]}
 */
function resolveAllowedVerifyTokens() {
  /** @type {Set<string>} */
  const tokens = new Set();
  const primary = process.env.META_VERIFY_TOKEN?.trim();
  const hubAlias = process.env.META_HUB_VERIFY_TOKEN?.trim();
  if (primary) tokens.add(primary);
  if (hubAlias) tokens.add(hubAlias);
  tokens.add(DEFAULT_META_VERIFY_TOKEN);
  return [...tokens];
}

/**
 * @param {string} provided
 * @param {string[]} allowed
 */
function matchesAnyVerifyToken(provided, allowed) {
  for (const expected of allowed) {
    if (timingSafeEqual(provided, expected)) return true;
  }
  return false;
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
  const allowed = resolveAllowedVerifyTokens();

  if (
    mode === "subscribe" &&
    token &&
    challenge &&
    matchesAnyVerifyToken(token, allowed)
  ) {
    // Soft-warm Support inbound modules when Meta verifies (cheap cold-start cut).
    void warmInboundRuntime().catch(() => null);
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return NextResponse.json({ message: "Verification failed." }, { status: 403 });
}

/**
 * POST — early 200, then background store → inbox → Support auto-reply (+ Graph).
 * WhatsApp Cloud + Instagram Messaging + Facebook Messenger → AI Support.
 * Never awaits outbound provider sends on the webhook critical path.
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
  // Always 200 after accept so Meta does not poison-retry on AI/Graph failures.
  runAfterResponse(async () => {
    await ingestMetaWebhook({
      payload,
      rawBody,
      headers,
      background_send: false,
    });
  });

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      background: true,
      message: "Accepted — processing inbound in background.",
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
