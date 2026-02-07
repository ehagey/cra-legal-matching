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
};

export default nextConfig;

