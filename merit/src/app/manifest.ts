import type { MetadataRoute } from "next";
import { APP_THEME_COLOR } from "@/shell/appearance";

/** Web app manifest, served at /manifest.webmanifest ("Uygulama olarak yükle"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin?v=4",
    name: "F&B Command Center",
    short_name: "F&B Center",
    description: "Merit Royal F&B Command Center Otel Operasyon Platformu",
    lang: "tr",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    icons: [
      { src: "/icons/merit-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/merit-192.png?v=4", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/merit-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/merit.svg?v=4", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
