/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Use 127.0.0.1 instead of localhost to force IPv4
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  // Ensure SSE streams aren't buffered
  async headers() {
    return [
      {
        source: "/api/progress/:path*",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },
};

export default nextConfig;

