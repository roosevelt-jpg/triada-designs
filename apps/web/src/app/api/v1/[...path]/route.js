import { NextResponse } from "next/server";
import { dispatchV1, requireAuth } from "@/lib/api/v1-dispatch";

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

  const auth = await requireAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { message: auth.message || "Unauthenticated." },
      { status: auth.status || 401 },
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
