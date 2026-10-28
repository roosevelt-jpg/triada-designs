/** @type {import('next').NextConfig} */
const rawApiOrigin = process.env.API_ORIGIN?.trim() || "";
const onVercel = process.env.VERCEL === "1";

function assertPublicApiOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(
      `API_ORIGIN must be an absolute URL (got ${JSON.stringify(origin)}).`,
    );
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  ) {
    throw new Error(
      `API_ORIGIN must be a public host on Vercel (refusing loopback ${host}). ` +
        "Set API_ORIGIN to the Laravel API base URL, e.g. https://api.triada-designs.com",
    );
  }
}

if (onVercel) {
  if (!rawApiOrigin) {
    throw new Error(
      "API_ORIGIN is required on Vercel during dual-run. Set it in Project → Settings → Environment Variables " +
        "(Production) to the public Laravel API base URL with no trailing slash. " +
        "Meta webhooks (/api/webhooks/meta) are handled by Next Route Handlers and do not use this rewrite.",
    );
  }
  assertPublicApiOrigin(rawApiOrigin);
}

const resolvedApiOrigin = rawApiOrigin || "http://127.0.0.1:8088";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  async rewrites() {
    // Dual-mode (Next.js + Supabase migration):
    // - Filesystem Route Handlers always win:
    //   /api/webhooks/meta, /api/health, /api/cron/*, /api/v1/auth/{login,me,logout}
    // - Laravel proxy lives in `fallback` so those paths never hit a dead API_ORIGIN.
    // - Other /api/* (including remaining /api/webhooks/* and /api/v1/*) still proxy to API_ORIGIN.
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
