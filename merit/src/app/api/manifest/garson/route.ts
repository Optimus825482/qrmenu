import { APP_THEME_COLOR } from "@/shell/appearance";

export const dynamic = "force-static";
export function GET() {
  return Response.json({ name: "Merit Garson", short_name: "Merit Garson", start_url: "/garson", scope: "/garson", display: "standalone", background_color: APP_THEME_COLOR, theme_color: APP_THEME_COLOR, icons: [{ src: "/icons/merit.svg", sizes: "any", type: "image/svg+xml" }] }, { headers: { "Content-Type": "application/manifest+json" } });
}
