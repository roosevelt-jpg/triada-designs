import { NextResponse } from "next/server";
import {
  dispatchV1,
  enforceApiPermission,
  requireMembership,
} from "@/lib/api/v1-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catch-all dual-run for /api/v1/* (auth/{login,me,logout} keep dedicated routes).
 * Filesystem Route Handlers win over next.config `fallback` rewrites to API_ORIGIN,
 * so dashboard pages no longer 502 when Laravel/Cloudflare is down.
 */

/**
 * @param {Request} request
 * @param {{ params: Promise<{ path?: string[] }> | { path?: string[] } }} context
 */
async function handle(request, context) {
  const resolved = await context.params;
  const segments = Array.isArray(resolved?.path) ? resolved.path : [];

  // Dedicated auth routes must not be shadowed — but Next prefers more specific
  // folders. Guard anyway if a request somehow lands here.
  if (segments[0] === "auth" && ["login", "me", "logout"].includes(segments[1] || "")) {
    return NextResponse.json(
      { message: "Use dedicated auth route handlers." },
      { status: 404 },
    );
  }

  // Public invite routes live under /api/v1/invites/* (dedicated handlers).
  if (segments[0] === "invites") {
    return NextResponse.json(
      { message: "Use dedicated invite route handlers." },
      { status: 404 },
    );
  }

  const membership = await requireMembership(request);
  if (!membership.ok) {
    return NextResponse.json(
      { message: membership.message || "Unauthenticated." },
      { status: membership.status || 401 },
    );
  }

  const path = segments.join("/");
  const permitted = enforceApiPermission(request.method, path, membership);
  if (!permitted.ok) {
    return NextResponse.json(
      { message: permitted.message || "Forbidden." },
      { status: permitted.status || 403 },
    );
  }

  let body;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
      }
    }
  }

  try {
    const result = await dispatchV1(request.method, segments, request, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal dual-run error.";
    return NextResponse.json(
      { message, source: "next_dual_run" },
      { status: 500 },
    );
  }
}

export async function GET(request, context) {
  return handle(request, context);
}

export async function POST(request, context) {
  return handle(request, context);
}

export async function PUT(request, context) {
  return handle(request, context);
}

export async function PATCH(request, context) {
  return handle(request, context);
}

export async function DELETE(request, context) {
  return handle(request, context);
}
