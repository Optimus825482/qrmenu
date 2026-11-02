import { APP_THEME_COLOR } from "@/shell/appearance";

export const dynamic = "force-static";
export function GET() {
  return Response.json(
    {
      id: "/garson",
      name: "Merit Garson Terminali",
      short_name: "Merit Garson",
      description: "Merit otelleri garson sipariş ve servis yönetim terminali",
      start_url: "/garson",
      scope: "/garson",
      display: "standalone",
      display_override: ["standalone", "minimal-ui", "browser"],
      orientation: "portrait-primary",
      background_color: APP_THEME_COLOR,
      theme_color: APP_THEME_COLOR,
      icons: [
        { src: "/icons/merit.svg", sizes: "any", type: "image/svg+xml" },
        { src: "/icons/legacy/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/legacy/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/legacy/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        {
          name: "Çağrılar",
          short_name: "Çağrılar",
          description: "Bekleyen misafir çağrılarını görüntüle",
          url: "/garson/cagrilar",
          icons: [{ src: "/icons/legacy/icon-192.png", sizes: "192x192" }],
        },
        {
          name: "Masalarım",
          short_name: "Masalar",
          description: "Sorumlu olduğum masaları listele",
          url: "/garson?sekme=masalar",
          icons: [{ src: "/icons/legacy/icon-192.png", sizes: "192x192" }],
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    }
  );
}
