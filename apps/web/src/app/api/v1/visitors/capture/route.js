import { NextResponse } from "next/server";
import {
  captureVisitorAsLead,
  isAllowedVisitorOrigin,
} from "@/lib/crm/visitor-leads";
import { presentLead } from "@/lib/crm/leads-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public first-party visitor → CRM lead capture (no admin session).
 *   POST /api/v1/visitors/capture
 *   OPTIONS (CORS preflight for triada-designs.com embeds)
 *
 * Body: {
 *   visitor_id?, page?, referrer?, email?, name?, phone?,
 *   source?, token?,
 *   utm_source?, utm_medium?, utm_campaign?, utm_term?, utm_content?
 * }
 */

/**
 * @param {string | null} requestOrigin
 * @param {Request} request
 */
function corsHeaders(requestOrigin, request) {
  const referer = request.headers.get("referer");
  const allowed =
    (requestOrigin && isAllowedVisitorOrigin(requestOrigin, null)) ||
    isAllowedVisitorOrigin(null, referer);
  const origin =
    allowed && requestOrigin
      ? requestOrigin
      : allowed
        ? "*"
        : requestOrigin && isAllowedVisitorOrigin(requestOrigin, referer)
          ? requestOrigin
          : null;

  /** @type {Record<string, string>} */
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (requestOrigin && isAllowedVisitorOrigin(requestOrigin, referer)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  } else {
    // Still echo allowed Triada origins; browsers enforce Origin match.
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

/**
 * @param {Request} request
 * @param {unknown} body
 */
function authorizeCapture(request, body) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fromTriada = isAllowedVisitorOrigin(origin, referer);
  const token =
    body && typeof body === "object" && /** @type {Record<string, unknown>} */ (body).token
      ? String(/** @type {Record<string, unknown>} */ (body).token).trim()
      : "";
  const expected = String(
    process.env.WEBCHAT_WIDGET_TOKEN ||
      process.env.VISITOR_CAPTURE_TOKEN ||
      "",
  ).trim();

  // First-party Triada hosts always allowed (marketing site + ops public pages).
  if (fromTriada) return { ok: true };
  // Optional shared widget token (same idea as webchat/messages).
  if (expected && token && token === expected) return { ok: true };
  if (!expected && token) return { ok: true };

  return {
    ok: false,
    status: 401,
    message: "Visitor capture requires a Triada site origin or widget token.",
  };
}

export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin"), request),
  });
}

export async function POST(request) {
  const headers = corsHeaders(request.headers.get("origin"), request);

  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON body." },
      { status: 400, headers },
    );
  }

  const auth = authorizeCapture(request, body);
  if (!auth.ok) {
    return NextResponse.json(
      { message: auth.message },
      { status: auth.status || 401, headers },
    );
  }

  const input =
    body && typeof body === "object"
      ? /** @type {Record<string, unknown>} */ (body)
      : {};

  const result = await captureVisitorAsLead(input);
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message || "Capture failed." },
      { status: result.status || 422, headers },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      created: result.created,
      mode: result.mode,
      match: result.match,
      lead: result.lead ? presentLead(result.lead) : null,
      lead_id: result.lead?.id || null,
    },
    { status: result.status || 200, headers },
  );
}
