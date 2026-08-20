/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@fillin/schemas", "@fillin/shared", "@fillin/ai"],
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Lint runs via the monorepo's own eslint config (see package.json scripts).
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;