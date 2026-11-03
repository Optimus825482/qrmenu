import type { NextRequest } from "next/server";
import { buildManifest } from "@/shell/manifests";

/** POS PWA manifesti (kasa); `?ekran=kds` mutfak ekranı varyantını verir. */
export function GET(request: NextRequest) {
  const kitchen = request.nextUrl.searchParams.get("ekran") === "kds";
  return Response.json(buildManifest("pos", { screen: kitchen ? "kds" : "kasa" }), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
