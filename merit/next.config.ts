import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { MERIT_BUILD_DATE: new Date().toISOString().slice(0, 10) },
  // Clickjacking protection: pages may only be framed by Merit itself (the shell's iframe apps).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
