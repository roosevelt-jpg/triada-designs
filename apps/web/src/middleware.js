import { NextResponse } from "next/server";

/**
 * Admin subdomain gate:
 * - Public routes: login + health
 * - Everything else under the dashboard requires a client token check on the page;
 *   middleware only normalizes host-aware redirects for the ops entry.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
