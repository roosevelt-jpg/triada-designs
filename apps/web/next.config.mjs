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
        "Set API_ORIGIN to the Laravel API base URL, e.g. https://triada-api.onrender.com",
    );
  }
}

if (onVercel) {
  if (!rawApiOrigin) {
    throw new Error(
      "API_ORIGIN is required on Vercel. Set it in Project → Settings → Environment Variables " +
        "(Production) to the public Laravel API base URL with no trailing slash.",
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
    // Browser calls same-origin /api/* and /storage/*; Next proxies to Laravel.
    // Local default: 127.0.0.1:8088. On Vercel: API_ORIGIN must be a public URL.
    return [
      {
        source: "/api/:path*",
        destination: `${resolvedApiOrigin}/api/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${resolvedApiOrigin}/storage/:path*`,
      },
    ];
  },
};

export default nextConfig;
