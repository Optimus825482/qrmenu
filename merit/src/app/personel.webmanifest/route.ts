import { buildManifest } from "@/shell/manifests";

export const dynamic = "force-static";

/** Personel PWA manifesti (kat, depo, garson, oda servisi). */
export function GET() {
  return Response.json(buildManifest("personel"), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
