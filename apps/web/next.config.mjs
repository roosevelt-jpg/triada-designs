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
 * Next+Supabase is the Production path. Never rewrite /api/* to Laravel —
 * dead API_ORIGIN caused 502s and masked Next dual-run handlers.
 * Filesystem Route Handlers cover health, webhooks, crons, and /api/v1/*.
 */
if (onVercel && rawApiOrigin && isPublicApiOrigin(rawApiOrigin)) {
  console.warn(
    `[triada] Ignoring API_ORIGIN (${rawApiOrigin}). ` +
      "Next dual-run handlers serve /api/* without Laravel rewrite.",
  );
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  async rewrites() {
    return { fallback: [] };
  },
};

export default nextConfig;
