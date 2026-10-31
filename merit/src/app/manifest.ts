import type { MetadataRoute } from "next";
import { APP_THEME_COLOR } from "@/shell/appearance";

/** Web app manifest, served at /manifest.webmanifest ("Uygulama olarak yükle"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Merit OS",
    short_name: "Merit OS",
    description: "Merit otelleri operasyon platformu",
    lang: "tr",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    icons: [
      { src: "/icons/merit.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/merit-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/merit-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/merit-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
