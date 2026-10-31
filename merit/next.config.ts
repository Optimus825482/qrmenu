import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: { MERIT_BUILD_DATE: new Date().toISOString().slice(0, 10) },
  /* config options here */
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
