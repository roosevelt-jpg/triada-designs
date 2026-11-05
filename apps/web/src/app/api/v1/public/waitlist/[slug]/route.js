import { NextResponse } from "next/server";
import { getBrandContactSettings } from "@/lib/brand/brand-contact-settings";
import { BRAND, brandLogoUrl, warmGreeting } from "@/lib/brand/identity";
import {
  getActiveWaitlistFormBySlug,
  presentPublicWaitlistForm,
} from "@/lib/waitlist/forms-store";
import { submitWaitlistInterest } from "@/lib/waitlist/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public waitlist / product-interest form (no admin session).
 *   GET  /api/v1/public/waitlist/[slug]
 *   POST /api/v1/public/waitlist/[slug]
 *   OPTIONS (CORS for triada-designs.com embeds)
 */

/**
 * @param {string | null} requestOrigin
 */
function corsHeaders(requestOrigin) {
  /** @type {Record<string, string>} */
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  let allow = "*";
  if (requestOrigin) {
    try {
      const host = new URL(requestOrigin).hostname.toLowerCase();
      if (
        host === "triada-designs.com" ||
        host.endsWith(".triada-designs.com") ||
        host === "localhost" ||
        host === "127.0.0.1"
      ) {
        allow = requestOrigin;
      }
    } catch {
      /* keep * */
    }
  }
  headers["Access-Control-Allow-Origin"] = allow;
  return headers;
}

/**
 * @param {Request} request
 * @param {{ params: Promise<{ slug?: string }> | { slug?: string } }} context
 */
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

/**
 * @param {Request} request
 * @param {{ params: Promise<{ slug?: string }> | { slug?: string } }} context
 */
export async function GET(request, context) {
  const headers = corsHeaders(request.headers.get("origin"));
  const resolved = await context.params;
  const slug = String(resolved?.slug || "").trim();

  const form = await getActiveWaitlistFormBySlug(slug);
  if (!form) {
    return NextResponse.json(
      { message: "This form is unavailable." },
      { status: 404, headers },
    );
  }

  const brandContact = await getBrandContactSettings();

  return NextResponse.json(
    {
      ok: true,
      form: presentPublicWaitlistForm(form),
      brand: {
        name: BRAND.name,
        tagline: BRAND.tagline,
        site_url: BRAND.siteUrl,
        logo_url: brandLogoUrl(),
        logo_url_local: BRAND.logoUrlLocal,
        address_line: brandContact.address_line,
        ops_email: brandContact.ops_email,
        phones: brandContact.phones,
        warm_greeting: warmGreeting("thank_you"),
      },
      source: "next_dual_run",
    },
    { status: 200, headers },
  );
}

/**
 * @param {Request} request
 * @param {{ params: Promise<{ slug?: string }> | { slug?: string } }} context
 */
export async function POST(request, context) {
  const headers = corsHeaders(request.headers.get("origin"));
  const resolved = await context.params;
  const slug = String(resolved?.slug || "").trim();

  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Invalid JSON body." },
      { status: 400, headers },
    );
  }

  const input =
    body && typeof body === "object"
      ? /** @type {Record<string, unknown>} */ (body)
      : {};

  const result = await submitWaitlistInterest(slug, input);
  if (!result.ok) {
    return NextResponse.json(
      { message: result.message || "Unable to save your interest." },
      { status: result.status || 422, headers },
    );
  }

  const brandContact = await getBrandContactSettings();

  return NextResponse.json(
    {
      ok: true,
      success_message: result.success_message,
      warm_greeting: warmGreeting("thank_you", {
        customerName: String(input.name || "").trim() || undefined,
      }),
      brand: {
        name: BRAND.name,
        address_line: brandContact.address_line,
        ops_email: brandContact.ops_email,
        phones: brandContact.phones,
        site_url: BRAND.siteUrl,
      },
      contact_id: result.contact_id,
      lead_id: result.lead_id,
      whatsapp_ready: result.whatsapp_ready,
      source: "next_dual_run",
    },
    { status: result.status || 201, headers },
  );
}
