/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_ORIGIN || "http://127.0.0.1:8088";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  async rewrites() {
    // Browser calls same-origin /api/* and /storage/*; Next proxies to Laravel on the VM.
    // Needed so laptop browsers via Cursor port-forward only need the web port.
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${apiOrigin}/storage/:path*`,
      },
    ];
  },
};

export default nextConfig;
