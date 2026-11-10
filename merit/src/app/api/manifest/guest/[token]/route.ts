import { headers } from "next/headers";
import { guestMeta, resolveGuestTokenLimited } from "@/modules/menu/server/guestToken";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const h = await headers();
  // Same unknown-token limits as /q/[token]: the manifest must not be a free token oracle.
  const target = await resolveGuestTokenLimited(token, guestMeta(h), undefined, undefined, { log: false });

  const outletName = target.kind === "TABLE" ? target.state.outletName : "Menü";
  const hotelName = target.kind === "TABLE" ? target.state.hotelName : "Merit";
  const name = `${hotelName} ${outletName} - Menü`;
  const shortName = outletName;
  const bg = target.kind === "TABLE" ? target.state.theme.bg : "#0f0d0a";

  return Response.json(
    {
      name,
      short_name: shortName,
      description: `${name} QR Menü ve Sipariş`,
      start_url: `/q/${encodeURIComponent(token)}`,
      scope: `/q/${encodeURIComponent(token)}`,
      display: "standalone",
      display_override: ["standalone", "minimal-ui", "browser"],
      orientation: "portrait",
      background_color: bg,
      theme_color: bg,
      icons: [
        { src: "/icons/merit.svg", sizes: "any", type: "image/svg+xml" },
        { src: "/icons/legacy/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/legacy/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/legacy/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
