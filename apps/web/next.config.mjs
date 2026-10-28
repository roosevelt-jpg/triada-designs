/** @type {import('next').NextConfig} */
const rawApiOrigin = process.env.API_ORIGIN?.trim() || "";
const onVercel = process.env.VERCEL === "1";

function isPublicApiOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    return false;
  }
  return true;
}

/**
 * API_ORIGIN is optional on Vercel now:
 * - Next Route Handlers cover /api/health, /api/webhooks/meta, /api/cron/*,
 *   /api/v1/auth/*, and the catch-all /api/v1/[...path] (seeded dual-run).
 * - Fallback rewrite to Laravel only when a public API_ORIGIN is set.
 * - Missing/invalid origin → no Laravel rewrite (avoids DNS_HOSTNAME_NOT_FOUND 502s).
 */
const useLaravelFallback =
  Boolean(rawApiOrigin) && isPublicApiOrigin(rawApiOrigin);

if (onVercel && rawApiOrigin && !useLaravelFallback) {
  console.warn(
    `[triada] Ignoring non-public API_ORIGIN on Vercel (${rawApiOrigin}). ` +
      "Next dual-run handlers will serve /api/v1/* without Laravel rewrite.",
  );
}

const resolvedApiOrigin = useLaravelFallback
  ? rawApiOrigin
  : "http://127.0.0.1:8088";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  async rewrites() {
    // Dual-mode (Next.js + Supabase migration):
    // - Filesystem Route Handlers always win over fallback:
    //   /api/webhooks/meta, /api/health, /api/cron/*, /api/v1/auth/*, /api/v1/[...path]
    // - Laravel proxy only when API_ORIGIN is a public URL (optional).
    if (!useLaravelFallback) {
      return { fallback: [] };
    }
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${resolvedApiOrigin}/api/:path*`,
        },
        {
          source: "/storage/:path*",
          destination: `${resolvedApiOrigin}/storage/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
