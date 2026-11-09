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

export const APP_VERSION = process.env.MERIT_VERSION ?? (pkg as { version?: string }).version ?? "2.5.0";
export const BUILD_DATE = process.env.MERIT_BUILD_DATE ?? new Date().toISOString().slice(0, 10);
export const BUILD_ID = process.env.MERIT_BUILD_ID ?? `${APP_VERSION}.${BUILD_DATE.replace(/-/g, "")}`;
export const APP_NAME = "Merit Royal F&B Command Center";
export const RELEASE_CODENAME = "Merit Royal Enterprise Suite";

export const RELEASE_HIGHLIGHTS = [
  "F&B Departmanı Yönetici Analiz ve Raporlama Merkezi",
  "Google Drive Otomatik Rapor Yedekleme Entegrasyonu",
  "Cihaz Sürüm Takibi ve Tek Tıkla Canlı Güncelleme Sistemi",
  "Mobil ve PWA Performans İyileştirmeleri",
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
