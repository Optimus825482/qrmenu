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

export const APP_VERSION = process.env.MERIT_VERSION ?? (pkg as { version?: string }).version ?? "2.6.1";
export const BUILD_DATE = process.env.MERIT_BUILD_DATE ?? new Date().toISOString().slice(0, 10);
export const BUILD_ID = process.env.MERIT_BUILD_ID ?? `${APP_VERSION}.${BUILD_DATE.replace(/-/g, "")}`;
export const APP_NAME = "Merit Royal F&B Command Center";
export const RELEASE_CODENAME = "Merit Royal Enterprise Suite";

export const RELEASE_HIGHLIGHTS = [
  "F&B Görev Seçimine Minibar Takip Operasyonu, Süpervizör, Depo Sorumlusu ve Kat Sorumlusu unvanları eklendi",
  "Ekip Yönetimi: Konsolide outlet görünümü, aday filtreleme, anında kullanıcı tanımlama ve outlet rol ezme (override)",
  "Kullanıcı Yönetimi: 123456 varsayılan geçici şifre, 6 haneli güvenlik politikası ve rol bazlı filtreleme",
  "Çoklu Görev (Multi-Duty): Personelin farklı outletlerde farklı yetki ve unvanlarla çalışabilmesi",
  "F&B Raporlama Sihirbazı & Otomasyonu",
  "Google Drive Bulut Entegrasyonu & Yedekleme",
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
