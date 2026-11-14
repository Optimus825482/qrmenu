// Pure definitions (no server imports) of the setting keys, their zod schemas and defaults
// (design spec §11). Shared by the settings service and the seed so there is ONE source of truth.
import { z } from "zod";
import { WALL_VIEWS } from "@/modules/radar/constants";

const minutes = z.number().int().min(1).max(1440);
const flag = z.boolean();

/** Comma separated wall views ("genel,kat"): known names only, at least one. */
const wallViewsCsv = z
  .string()
  .refine(
    (v) => {
      const parts = v.split(",").map((x) => x.trim());
      return parts.length > 0 && parts.every((x) => (WALL_VIEWS as readonly string[]).includes(x));
    },
    "Duvar görünümleri genel, kat, masa, kuyruk, odaServisi, mybar, personel adlarından en az biri olmalı",
  );

/** Value schema of every setting key. Adding a key here is all that is needed to type it. */
export const SETTING_SCHEMAS = {
  "session.maxOnlineMinutes": minutes,
  "session.minibarMaxOnlineMinutes": minutes,
  "session.warnBeforeMinutes": minutes,
  "session.idleMinutes": minutes,
  "session.absoluteMaxMinutes": minutes,
  "session.singleDevice": flag,
  "session.singleTargetAuto": flag,
  "shell.confirmSimpleActions": flag,
  "shell.mobileDefinitions": flag,
  "guest.ipRateMultiplier": z.number().int().min(1).max(20),
  "mybar.dailyLimit": flag,
  "mybar.dailyMax": z.number().int().min(1).max(5),
  "mybar.quantityMode": z.enum(["QTY", "TICK"]),
  "mybar.maxQtyPerItem": z.union([z.literal("setup"), z.number().int().min(1).max(20)]),
  "mybar.translateNotes": flag,
  "dnd.minChecks": z.number().int().min(1).max(10),
  "dnd.recheckMinutes": minutes,
  "minibar.requireQrForControl": flag,
  "minibar.manualRoomEntry": flag,
  "minibar.manualRoomEntryFloorIds": z.array(z.string().min(1).max(64)).max(500),
  "minibar.manualRoomEntryRoomIds": z.array(z.string().min(1).max(64)).max(5000),
  "stock.defaultCriticalLevel": z.number().min(0),
  "stock.requestSafetyFactor": z.number().min(1).max(5),
  "price.display": z.enum(["SHOW", "HIDE"]),
  "order.approvalEscalationMinutes": minutes,
  "order.callAlertSeconds": z.number().int().min(1).max(3600),
  "rs.slaMinutes": minutes,
  "rs.maxOpenPerRoom": z.number().int().min(1).max(10),
  /** Wait between two room-service orders of one room; 0 = no waiting (so not the shared `minutes`, which starts at 1). */
  "rs.minMinutesBetweenOrders": z.number().int().min(0).max(1440),
  "email.notifyEnabled": flag,
  "email.alertEnabled": flag,
  "email.reportEnabled": flag,
  "email.systemEnabled": flag,
  "smtp.host": z.string().max(255),
  "smtp.port": z.number().int().min(1).max(65535),
  "smtp.security": z.enum(["NONE", "STARTTLS", "SSL"]),
  "smtp.user": z.string().max(255),
  /** Stored sealed (`enc:v1:…`, see lib/secret-box); the plain text is limited by `SMTP_PASSWORD_MAX`. */
  "smtp.password": z.string().max(512),
  "smtp.fromEmail": z.union([z.literal(""), z.email()]),
  "smtp.fromName": z.string().min(1).max(100),
  "occupancy.fileRetentionDays": z.number().int().min(1).max(365),
  "qr.baseUrl": z.url(),
  "radar.liveBufferMinutes": z.number().int().min(5).max(120),
  "radar.replayRetentionDays": z.number().int().min(7).max(365),
  "radar.wallRotateSeconds": z.number().int().min(5).max(300),
  "radar.wallViews": wallViewsCsv,
  "radar.soundOnEscalation": flag,
  "radar.idleMinutes": z.number().int().min(1).max(60),
  "radar.mybarStaleMinutes": z.number().int().min(5).max(240),
  "radar.printerSilentSeconds": z.number().int().min(30).max(900),
  "translation.deeplKey": z.string().default(""),
  "translation.geminiKey": z.string().default(""),
  "translation.provider": z.enum(["AUTO", "DEEPL", "GEMINI"]),
  "translation.geminiModel": z.enum(["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"]),
  "diagnostic.enabled": flag,
  "diagnostic.developerEmail": z.string().default(""),
  "diagnostic.autoNotify": flag,
  "diagnostic.minSeverity": z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
} as const;

/** Longest plain SMTP password; its sealed form stays within the 512 characters of the schema. */
export const SMTP_PASSWORD_MAX = 256;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

/** System-wide defaults. A system row (hotelId null) overrides them, a hotel row overrides both. */
export const DEFAULT_SETTINGS: { [K in SettingKey]: SettingValue<K> } = {
  "session.maxOnlineMinutes": 480,
  "session.minibarMaxOnlineMinutes": 600,
  "session.warnBeforeMinutes": 5,
  "session.idleMinutes": 45,
  "session.absoluteMaxMinutes": 720,
  "session.singleDevice": true,
  "session.singleTargetAuto": true,
  "shell.confirmSimpleActions": false,
  "shell.mobileDefinitions": false,
  "guest.ipRateMultiplier": 1,
  "mybar.dailyLimit": true,
  "mybar.dailyMax": 1,
  "mybar.quantityMode": "QTY",
  "mybar.maxQtyPerItem": "setup",
  "mybar.translateNotes": true,
  "dnd.minChecks": 2,
  "dnd.recheckMinutes": 120,
  "minibar.requireQrForControl": false,
  "minibar.manualRoomEntry": false,
  "minibar.manualRoomEntryFloorIds": [],
  "minibar.manualRoomEntryRoomIds": [],
  "stock.defaultCriticalLevel": 50,
  "stock.requestSafetyFactor": 1.5,
  "price.display": "HIDE",
  "order.approvalEscalationMinutes": 2,
  "order.callAlertSeconds": 60,
  "rs.slaMinutes": 30,
  "rs.maxOpenPerRoom": 3,
  "rs.minMinutesBetweenOrders": 15,
  "email.notifyEnabled": false,
  "email.alertEnabled": false,
  "email.reportEnabled": false,
  "email.systemEnabled": false,
  "smtp.host": "",
  "smtp.port": 587,
  "smtp.security": "STARTTLS",
  "smtp.user": "",
  "smtp.password": "",
  "smtp.fromEmail": "",
  "smtp.fromName": "Merit Royal",
  "occupancy.fileRetentionDays": 4,
  "qr.baseUrl": "http://localhost:3000",
  "radar.liveBufferMinutes": 30,
  "radar.replayRetentionDays": 90,
  "radar.wallRotateSeconds": 20,
  "radar.wallViews": "genel,kat,masa,kuyruk",
  "radar.soundOnEscalation": false,
  "radar.idleMinutes": 10,
  "radar.mybarStaleMinutes": 30,
  "radar.printerSilentSeconds": 120,
  "translation.deeplKey": "",
  "translation.geminiKey": "",
  "translation.provider": "AUTO",
  "translation.geminiModel": "gemini-3.8-flash",
  "diagnostic.enabled": true,
  "diagnostic.developerEmail": "",
  "diagnostic.autoNotify": true,
  "diagnostic.minSeverity": "HIGH",
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_SCHEMAS, key);
}

export const SETTING_GROUPS = [
  "Oturum",
  "MyBar",
  "Minibar",
  "Misafir",
  "DND",
  "Stok",
  "Fiyat",
  "Sipariş",
  "Oda Servisi",
  "Kabuk",
  "E-posta",
  "QR",
  "Çeviri",
  "Radar",
  "Elle Oda Girişi",
  "Sistem",
] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

/** `list`: an id array edited only in its own panel (e.g. Elle Oda Girişi), never as a plain field. */
export type SettingInputType = "boolean" | "number" | "enum" | "text" | "list";

/** Editor description of one key for the Denetim Masası → Sistem window (Turkish labels). */
export type SettingMeta = {
  label: string;
  description: string;
  group: SettingGroup;
  type: SettingInputType;
  /** `enum` only: allowed values with their labels. */
  options?: readonly { value: string | number; label: string }[];
  unit?: string;
  /** `number` only: step of the input (decimals). */
  step?: number;
  /** Never echoed back or written to the audit log in clear. */
  secret?: boolean;
  /** Encrypted at rest (`enc:v1:`, lib/secret-box); readers use `openSecret`. Secrets without it stay plain (legacy). */
  sealed?: boolean;
  /** Only the system scope may hold it (a hotel row is refused). */
  systemOnly?: boolean;
  placeholder?: string;
  helpLink?: { url: string; label: string };
};

export const SETTING_META: { [K in SettingKey]: SettingMeta } = {
  "guest.ipRateMultiplier": {
    label: "Misafir IP hız sınırı çarpanı",
    description: "Ortak otel Wi-Fi IP adresleri için misafir hız sınırlarını çarpar.",
    group: "Misafir",
    type: "number",
    step: 1,
    systemOnly: true,
  },
  "session.maxOnlineMinutes": {
    label: "En uzun çevrimiçi süre",
    description: "Bir oturumun açık kalabileceği en uzun süre; dolunca oturum kapanır.",
    group: "Oturum",
    type: "number",
    unit: "dk",
  },
  "session.minibarMaxOnlineMinutes": {
    label: "Minibar en uzun çevrimiçi süre",
    description: "Minibar (kat) personeli için en uzun oturum süresi.",
    group: "Oturum",
    type: "number",
    unit: "dk",
  },
  "session.warnBeforeMinutes": {
    label: "Oturum bitmeden uyarı",
    description: "Oturum süresi dolmadan kaç dakika önce uyarı gösterilir.",
    group: "Oturum",
    type: "number",
    unit: "dk",
  },
  "session.idleMinutes": {
    label: "Hareketsizlik süresi",
    description: "Bu süre işlem yapılmazsa oturum hareketsiz sayılıp kapatılır.",
    group: "Oturum",
    type: "number",
    unit: "dk",
  },
  "session.absoluteMaxMinutes": {
    label: "Mutlak oturum ömrü",
    description: "Girişten bu kadar süre sonra oturum, işlem yapılsa bile kapanır ve yeniden giriş gerekir.",
    group: "Oturum",
    type: "number",
    unit: "dk",
  },
  "session.singleDevice": {
    label: "Tek cihazda oturum",
    description: "Açıksa kullanıcı yeni girişte önceki oturumu kapatır.",
    group: "Oturum",
    type: "boolean",
  },
  "session.singleTargetAuto": {
    label: "Tek hedefte otomatik giriş",
    description: "Kullanıcının tek giriş hedefi varsa hedef seçimi atlanır.",
    group: "Oturum",
    type: "boolean",
  },
  "shell.confirmSimpleActions": {
    label: "Basit işlemlerde onay sor",
    description: "Kapalıyken basit işlemler sorulmadan yapılır ve sonuç kısa bir bildirimle gösterilir; silme gibi geri alınamaz işlemler her zaman sorulur.",
    group: "Kabuk",
    type: "boolean",
  },
  "shell.mobileDefinitions": {
    label: "Mobilde tanımlamalar",
    description: "Tanımlama pencereleri mobil arayüzde de açılabilir.",
    group: "Kabuk",
    type: "boolean",
  },
  "mybar.dailyLimit": {
    label: "Günde bir MyBar girişi",
    description: "Açıksa bir oda için günde yalnız bir MyBar girişi alınır.",
    group: "MyBar",
    type: "boolean",
  },
  "mybar.dailyMax": {
    label: "Günlük MyBar giriş sayısı",
    description: "Günlük sınır açıkken bir oda günde en çok bu kadar MyBar girişi gönderebilir (varsayılan 1).",
    group: "MyBar",
    type: "number",
  },
  "mybar.quantityMode": {
    label: "MyBar miktar biçimi",
    description: "Tüketim miktar girilerek (Adet) ya da işaretlenerek (İşaret) kaydedilir.",
    group: "MyBar",
    type: "enum",
    options: [
      { value: "QTY", label: "Adet" },
      { value: "TICK", label: "İşaret" },
    ],
  },
  "mybar.maxQtyPerItem": {
    label: "Ürün başına en çok adet",
    description: "Bir üründe girilebilecek en yüksek adet; \"Kurulum\" odanın kurulum miktarını kullanır.",
    group: "MyBar",
    type: "enum",
    options: [
      { value: "setup", label: "Kurulum miktarı" },
      ...Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
    ],
  },
  "mybar.translateNotes": {
    label: "Notları çevir",
    description: "Misafir notları (MyBar talepleri, oda servisi ve masa siparişleri) personel için Türkçeye otomatik çevrilir; orijinali de gösterilir.",
    group: "MyBar",
    type: "boolean",
  },
  "occupancy.fileRetentionDays": {
    label: "Doluluk dosyası saklama",
    description: "Yüklenen doluluk dosyaları bu kadar gün saklanır, sonra silinir.",
    group: "MyBar",
    type: "number",
    unit: "gün",
  },
  "minibar.requireQrForControl": {
    label: "Oda kontrolünde QR zorunluluğu",
    description: "Açıksa oda kontrol ekranı yalnızca odadaki QR kod okutularak açılabilir; kapalıysa kat planından doğrudan açılabilir.",
    group: "Minibar",
    type: "boolean",
  },
  // Edited in Denetim Masası → Minibar ve Kat → "Elle oda girişi" (hotel, floor and room choice), not as plain rows.
  "minibar.manualRoomEntry": {
    label: "Tüm otelde elle oda girişi",
    description: "QR zorunluyken oda numarası yazılarak oda kontrolü açılabilir. Her elle giriş denetim kaydına yazılır.",
    group: "Elle Oda Girişi",
    type: "boolean",
  },
  "minibar.manualRoomEntryFloorIds": {
    label: "Elle girişe izinli katlar",
    description: "QR zorunluyken bu katlardaki odalar oda numarası yazılarak açılabilir.",
    group: "Elle Oda Girişi",
    type: "list",
  },
  "minibar.manualRoomEntryRoomIds": {
    label: "Elle girişe izinli odalar",
    description: "QR zorunluyken bu odalar (örn. QR etiketi hasarlı) oda numarası yazılarak açılabilir.",
    group: "Elle Oda Girişi",
    type: "list",
  },
  "dnd.minChecks": {
    label: "DND asgari kontrol sayısı",
    description: "Rahatsız Etmeyin odasında gün içinde yapılması gereken en az kontrol sayısı.",
    group: "DND",
    type: "number",
    unit: "kontrol",
  },
  "dnd.recheckMinutes": {
    label: "DND yeniden kontrol aralığı",
    description: "Rahatsız Etmeyin odasının yeniden kontrol edilmesi için beklenen süre.",
    group: "DND",
    type: "number",
    unit: "dk",
  },
  "stock.defaultCriticalLevel": {
    label: "Varsayılan kritik stok",
    description: "Ürüne özel seviye yoksa bu miktarın altı kritik sayılır.",
    group: "Stok",
    type: "number",
    step: 1,
  },
  "stock.requestSafetyFactor": {
    label: "Talep güvenlik katsayısı",
    description: "Stok talebi hesabında ihtiyaç bu katsayıyla çarpılır (1 – 5).",
    group: "Stok",
    type: "number",
    step: 0.1,
  },
  "price.display": {
    label: "Fiyat gösterimi",
    description: "Fiyatlar ekranlarda gösterilir ya da gizlenir.",
    group: "Fiyat",
    type: "enum",
    options: [
      { value: "SHOW", label: "Göster" },
      { value: "HIDE", label: "Gizle" },
    ],
  },
  "order.approvalEscalationMinutes": {
    label: "Onay yükseltme süresi",
    description: "Sipariş onayı bu süre içinde verilmezse bir üst yetkiliye bildirilir.",
    group: "Sipariş",
    type: "number",
    unit: "dk",
  },
  "order.callAlertSeconds": {
    label: "Çağrı uyarı süresi",
    description: "Garson çağrısı bu süre yanıtsız kalırsa uyarı verilir.",
    group: "Sipariş",
    type: "number",
    unit: "sn",
  },
  "rs.slaMinutes": {
    label: "Oda servisi hizmet süresi",
    description: "Oda servisi siparişinin teslim edilmesi gereken süre (SLA).",
    group: "Oda Servisi",
    type: "number",
    unit: "dk",
  },
  "rs.maxOpenPerRoom": {
    label: "Oda başına açık sipariş sınırı",
    description: "Bir odanın aynı anda sahip olabileceği açık oda servisi siparişi sayısı.",
    group: "Oda Servisi",
    type: "number",
    unit: "adet",
  },
  "rs.minMinutesBetweenOrders": {
    label: "İki sipariş arasındaki bekleme süresi",
    description:
      "Bir oda sipariş gönderdikten sonra yeni siparişi bu süre dolunca gönderebilir. Personelin iptal ettiği ya da reddettiği sipariş süreyi başlatmaz. 0 yazılırsa bekleme uygulanmaz.",
    group: "Oda Servisi",
    type: "number",
    unit: "dk",
    step: 1,
  },
  "email.notifyEnabled": {
    label: "Bildirim e-postaları",
    description: "Bildirim e-postaları gönderilsin mi.",
    group: "E-posta",
    type: "boolean",
  },
  "email.alertEnabled": {
    label: "Uyarı e-postaları",
    description: "Uyarı e-postaları gönderilsin mi.",
    group: "E-posta",
    type: "boolean",
  },
  "email.reportEnabled": {
    label: "Rapor e-postaları",
    description: "Zamanlanmış rapor e-postaları gönderilsin mi.",
    group: "E-posta",
    type: "boolean",
  },
  "email.systemEnabled": {
    label: "Sistem e-postaları",
    description: "Sistem e-postaları (parola, güvenlik) gönderilsin mi.",
    group: "E-posta",
    type: "boolean",
  },
  "smtp.host": {
    label: "SMTP sunucusu",
    description: "Giden e-posta sunucusunun adresi (örn. smtp.ornek.com). Otel satırı sistem satırını ezer.",
    group: "E-posta",
    type: "text",
    placeholder: "smtp.ornek.com",
  },
  "smtp.port": {
    label: "SMTP bağlantı noktası",
    description: "Genelde STARTTLS için 587, SSL/TLS için 465.",
    group: "E-posta",
    type: "number",
    step: 1,
  },
  "smtp.security": {
    label: "SMTP güvenliği",
    description: "Sunucuyla bağlantı şifreleme biçimi.",
    group: "E-posta",
    type: "enum",
    options: [
      { value: "NONE", label: "Şifresiz" },
      { value: "STARTTLS", label: "STARTTLS" },
      { value: "SSL", label: "SSL-TLS" },
    ],
  },
  "smtp.user": {
    label: "SMTP kullanıcı adı",
    description: "Sunucu kimlik doğrulaması istiyorsa kullanıcı adı; yoksa boş bırakın.",
    group: "E-posta",
    type: "text",
  },
  "smtp.password": {
    label: "SMTP parolası",
    description: "Veritabanında şifreli saklanır, ekranda gösterilmez. Boş bırakmak parolayı siler.",
    group: "E-posta",
    type: "text",
    secret: true,
    sealed: true,
  },
  "smtp.fromEmail": {
    label: "Gönderen e-posta adresi",
    description: "Giden iletilerin gönderen adresi (From).",
    group: "E-posta",
    type: "text",
    placeholder: "rapor@ornek.com",
  },
  "smtp.fromName": {
    label: "Gönderen adı",
    description: "Giden iletilerde görünen gönderen adı.",
    group: "E-posta",
    type: "text",
  },
  "qr.baseUrl": {
    label: "QR taban adresi",
    description: "QR kodlarına yazılan genel adres (örn. https://menu.ornek.com).",
    group: "QR",
    type: "text",
  },
  "translation.deeplKey": {
    label: "DeepL API anahtarı",
    description: "Menülerin otomatik çevirisi için DeepL API anahtarı (:fx ile biten ücretsiz anahtar desteklenir).",
    group: "Çeviri",
    type: "text",
    secret: true,
    systemOnly: true,
    placeholder: "Örn: 12345678-abcd-...:fx",
    helpLink: {
      url: "https://www.deepl.com/pro-api",
      label: "Ücretsiz DeepL API Anahtarı Al",
    },
  },
  "translation.geminiKey": {
    label: "Google AI Studio API anahtarı",
    description: "DeepL olmadığında veya hata verdiğinde devreye girecek Google Gemini API anahtarı.",
    group: "Çeviri",
    type: "text",
    secret: true,
    systemOnly: true,
    placeholder: "Örn: AIzaSy...",
    helpLink: {
      url: "https://aistudio.google.com/apikey",
      label: "Ücretsiz Google AI Studio API Anahtarı Al",
    },
  },
  "translation.provider": {
    label: "Tercih edilen çeviri servisi",
    description: "Otomatik modda DeepL birincil, Gemini yedektir. Doğrudan tek servis de seçilebilir.",
    group: "Çeviri",
    type: "enum",
    options: [
      { value: "AUTO", label: "Otomatik (DeepL + Gemini Yedek)" },
      { value: "DEEPL", label: "Yalnızca DeepL" },
      { value: "GEMINI", label: "Yalnızca Google Gemini" },
    ],
    systemOnly: true,
  },
  "radar.liveBufferMinutes": {
    label: "Radar geri sarma süresi",
    description: "Canlı radarda tarayıcının bellekte tuttuğu son olay süresi (zaman şeridi geri sarma).",
    group: "Radar",
    type: "number",
    unit: "dk",
    systemOnly: true,
  },
  "radar.replayRetentionDays": {
    label: "Radar tekrar saklama süresi",
    description: "Gün tekrarı için operasyon izlerinin saklandığı süre; eskileri her gece 03:30'da silinir.",
    group: "Radar",
    type: "number",
    unit: "gün",
    systemOnly: true,
  },
  "radar.wallRotateSeconds": {
    label: "Duvar ekranı döngü süresi",
    description: "Duvar ekranında her görünümün ekranda kalma süresi.",
    group: "Radar",
    type: "number",
    unit: "sn",
  },
  "radar.wallViews": {
    label: "Duvar ekranı görünümleri",
    description: "Virgülle ayrılmış sıra: genel, kat, masa, kuyruk, odaServisi, mybar, personel.",
    group: "Radar",
    type: "text",
    placeholder: "genel,kat,masa,kuyruk",
  },
  "radar.soundOnEscalation": {
    label: "Duvar ekranında yükseltme sesi",
    description: "Sipariş yükseltildiğinde yalnız duvar ekranı kısa bir uyarı sesi çalsın.",
    group: "Radar",
    type: "boolean",
  },
  "radar.idleMinutes": {
    label: "Personel boşta süresi",
    description: "Bu süre hareketsiz kalan oturum radarda boşta sayılır.",
    group: "Radar",
    type: "number",
    unit: "dk",
  },
  "radar.mybarStaleMinutes": {
    label: "MyBar bekleme uyarısı",
    description: "Görülmeyen MyBar talebi bu süreyi aşınca radarda uyarı verilir.",
    group: "Radar",
    type: "number",
    unit: "dk",
  },
  "radar.printerSilentSeconds": {
    label: "Yazıcı sessizlik süresi",
    description: "Ağ geçidinden bu süre haber alınamayan yazıcı radarda sessiz sayılır.",
    group: "Radar",
    type: "number",
    unit: "sn",
    systemOnly: true,
  },
  "translation.geminiModel": {
    label: "Gemini yapay zeka modeli",
    description: "Çeviri için kullanılacak Gemini modeli. Flash modelleri çok hızlıdır ve ücretsiz kotası cömerttir.",
    group: "Çeviri",
    type: "enum",
    options: [
      { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Önerilen — En Güncel ve Kararlı)" },
      { value: "gemini-flash-latest", label: "Gemini Flash Latest (Dinamik En Son Sürüm)" },
      { value: "gemini-flash-lite-latest", label: "Gemini Flash-Lite Latest (Ultra Hızlı / Hafif)" },
    ],
    systemOnly: true,
  },
  "diagnostic.enabled": {
    label: "Otomatik Hata Denetimi ve Tanı Sistemi",
    description: "Sistem hatalarını arka planda yakalar, kök neden analizi yapar ve veritabanına kaydeder.",
    group: "Sistem",
    type: "boolean",
    systemOnly: true,
  },
  "diagnostic.developerEmail": {
    label: "Sistem Geliştiricisi / Uyarı E-postası",
    description: "Kritik sistem hatalarında ve tanı analizlerinde bildirim mailinin iletileceği geliştirici adresi.",
    group: "Sistem",
    type: "text",
    placeholder: "gelistirici@merithotels.com",
    systemOnly: true,
  },
  "diagnostic.autoNotify": {
    label: "Otomatik Hata Bildirimi Gönder",
    description: "Kritik sistem hataları oluştuğunda geliştiriciye otomatik tanı e-postası gönderilsin.",
    group: "Sistem",
    type: "boolean",
    systemOnly: true,
  },
  "diagnostic.minSeverity": {
    label: "Asgari Bildirim Şiddeti",
    description: "Hangi seviyedeki hata ve anomalilerde e-posta bildirimi tetiklensin.",
    group: "Sistem",
    type: "enum",
    options: [
      { value: "LOW", label: "Düşük ve Üzeri (Tüm Hatalar)" },
      { value: "MEDIUM", label: "Orta ve Üzeri" },
      { value: "HIGH", label: "Yüksek ve Kritik (Önerilen)" },
      { value: "CRITICAL", label: "Yalnızca Kritik Hatalar" },
    ],
    systemOnly: true,
  },
};
