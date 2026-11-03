import type { MetadataRoute } from "next";
import { APP_THEME_COLOR } from "./appearance";

/** Kabuk renkleri (manifest `theme_color`/`background_color`): personel lacivert, POS koyu gri. */
export const PERSONEL_THEME_COLOR = "#0b2545";
export const POS_THEME_COLOR = "#23272e";

export type ManifestKind = "admin" | "personel" | "pos";

const COMMON = { lang: "tr", scope: "/" } as const;

function iconSet(prefix: string): MetadataRoute.Manifest["icons"] {
  return [
    { src: `/icons/${prefix}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `/icons/${prefix}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/icons/${prefix}-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

/**
 * Üç PWA manifesti (spec 4.4). Her biri farklı `id` taşır; böylece aynı cihaza ayrı ayrı yüklenebilir ve
 * ana ekranda farklı zeminli simgelerle ayırt edilir. POS `fullscreen` + `landscape`, KDS ise yönü serbest bırakır.
 */
export function buildManifest(kind: ManifestKind, opts: { screen?: "kasa" | "kds" } = {}): MetadataRoute.Manifest {
  if (kind === "admin") {
    return {
      ...COMMON,
      id: "/admin?v=4",
      name: "F&B Command Center",
      short_name: "F&B Center",
      description: "Merit Royal F&B Command Center Otel Operasyon Platformu",
      start_url: "/admin",
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
  if (kind === "personel") {
    return {
      ...COMMON,
      id: "/personel?v=1",
      name: "Merit Personel",
      short_name: "Merit Personel",
      description: "Merit otelleri kat, depo, garson ve oda servisi personel uygulaması",
      start_url: "/baslat?kabuk=personel",
      display: "standalone",
      orientation: "portrait",
      background_color: PERSONEL_THEME_COLOR,
      theme_color: PERSONEL_THEME_COLOR,
      icons: iconSet("merit-personel"),
    };
  }
  const kitchen = opts.screen === "kds";
  return {
    ...COMMON,
    id: kitchen ? "/pos?e=kds" : "/pos?v=1",
    name: kitchen ? "Merit Mutfak Ekranı" : "Merit Kasa",
    short_name: kitchen ? "Merit Mutfak" : "Merit Kasa",
    description: kitchen ? "Merit otelleri mutfak ekranı (KDS)" : "Merit otelleri dokunmatik kasa terminali",
    start_url: kitchen ? "/baslat?kabuk=pos&ekran=kds" : "/baslat?kabuk=pos",
    display: "fullscreen",
    orientation: kitchen ? "any" : "landscape",
    background_color: POS_THEME_COLOR,
    theme_color: POS_THEME_COLOR,
    icons: iconSet("merit-pos"),
  };
}
