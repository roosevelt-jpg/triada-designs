/**
 * Canonical public URL for the Triada ops dashboard.
 * Branded emails (content review, invites, media links) must never use
 * ephemeral Cloudflare tunnels, localhost, or Vercel preview hosts.
 */

export const PRODUCTION_APP_URL = "https://dashboard.triada-designs.com";
export const PRODUCTION_APP_HOST = "dashboard.triada-designs.com";

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isEphemeralOrTunnelHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) return true;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    return true;
  }
  if (host === "trycloudflare.com" || host.endsWith(".trycloudflare.com")) {
    return true;
  }
  if (host.endsWith(".cloudflare.com") && host.includes("tunnel")) {
    return true;
  }
  // Preview / deployment aliases — never put these in customer/admin email CTAs.
  if (host.endsWith(".vercel.app") || host.endsWith(".now.sh")) {
    return true;
  }
  return false;
}

/**
 * Hosts we allow from APP_URL / NEXT_PUBLIC_APP_URL for outbound branded links.
 * @param {string} hostname
 */
export function isAllowedProductionAppHost(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host || isEphemeralOrTunnelHost(host)) return false;
  // Never email the API origin as a dashboard CTA.
  if (host === "api.triada-designs.com") return false;
  return (
    host === PRODUCTION_APP_HOST ||
    host === "ops.triada-designs.com" ||
    (host.endsWith(".triada-designs.com") && !host.startsWith("api."))
  );
}

/**
 * Normalize a candidate absolute URL; return null if unusable / ephemeral.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function sanitizePublicAppUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withScheme);
    if (!isAllowedProductionAppHost(url.hostname)) return null;
    url.hash = "";
    url.search = "";
    // Keep pathname only if it is empty or "/"
    if (url.pathname && url.pathname !== "/") {
      // App root should not include a deep path.
      url.pathname = "/";
    }
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Resolve the public ops app origin for emails and absolute dashboard links.
 * Always returns a production-safe https origin (never trycloudflare / preview).
 *
 * @param {{ request?: Request | null }} [opts]
 * @returns {string}
 */
export function resolvePublicAppUrl(opts = {}) {
  // Prefer explicit ops/dashboard env. Never use VERCEL_URL (preview host).
  const fromEnv =
    sanitizePublicAppUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    sanitizePublicAppUrl(process.env.OPS_APP_URL) ||
    sanitizePublicAppUrl(process.env.FRONTEND_URL) ||
    sanitizePublicAppUrl(process.env.APP_URL);
  if (fromEnv) return fromEnv;

  // Request Host is only accepted when it is already a production Triada host.
  // Tunnel / localhost / *.vercel.app fall through to PRODUCTION_APP_URL.
  const request = opts.request || null;
  if (request) {
    try {
      const forwarded =
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        "";
      const host = String(forwarded).split(",")[0].trim().split(":")[0];
      const sanitized = sanitizePublicAppUrl(host);
      if (sanitized) return sanitized;
    } catch {
      /* ignore */
    }
  }

  return PRODUCTION_APP_URL;
}

/**
 * Build an absolute dashboard path on the production app origin.
 * @param {string} path
 * @param {{ request?: Request | null }} [opts]
 */
export function absoluteAppUrl(path, opts = {}) {
  const base = resolvePublicAppUrl(opts).replace(/\/$/, "");
  const suffix = String(path || "");
  if (!suffix) return base;
  return `${base}${suffix.startsWith("/") ? "" : "/"}${suffix}`;
}
