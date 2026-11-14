import pkg from "../../package.json";

export interface VersionInfo {
  name: string;
  version: string;
  buildDate: string;
  buildId: string;
  codename: string;
  highlights: string[];
  timestamp: number;
}

export const APP_VERSION = process.env.MERIT_VERSION ?? (pkg as { version?: string }).version ?? "2.8.0";
export const BUILD_DATE =
  process.env.MERIT_BUILD_DATE ?? new Date().toLocaleString("sv-SE", { timeZone: "Europe/Nicosia" }).slice(0, 16);
export const BUILD_ID = process.env.MERIT_BUILD_ID ?? `${APP_VERSION}.${BUILD_DATE.replace(/\D/g, "")}`;
export const APP_NAME = "Merit Royal F&B Command Center";
export const RELEASE_CODENAME = "Merit Royal Enterprise Suite";

export const RELEASE_HIGHLIGHTS = [
  "QR kodları: tek tıkla tüm masa / oda QR'larını yenileme ve QR kartlarının PDF çıktısı",
  "Menü: açık renkli tasarımlar, yana kaymayan kategori çubuğu ve 6 yeni kategori şablonu (akordiyon, fotoğraflı karolar vb.)",
  "Menü: outlet logosu yükleme, otel logolu animasyonlu açılış ve kayan başa dön düğmesi",
  "Menü görselleri gözden geçirildi; yanlış görseller kaldırıldı",
];

export function getVersionInfo(): VersionInfo {
  return {
    name: APP_NAME,
    version: APP_VERSION,
    buildDate: BUILD_DATE,
    buildId: BUILD_ID,
    codename: RELEASE_CODENAME,
    highlights: RELEASE_HIGHLIGHTS,
    timestamp: Date.now(),
  };
}
