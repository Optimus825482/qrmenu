import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import pkg from "./package.json";

// Guest (QR menu) pages only: the admin app never calls next-intl.
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Shown in Hakkında and Denetim Masası → Uygulama (inlined into client bundles too).
  env: { MERIT_BUILD_DATE: new Date().toISOString().slice(0, 10), MERIT_VERSION: pkg.version },
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
      {
        // The service worker must be revalidated on every check, or updates reach browsers late.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
    ];
  },
  // Menu images are uploaded through a Server Action (up to 2 MB + form overhead).
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
