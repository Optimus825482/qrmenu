// Pure definitions (no server imports) of the setting keys, their zod schemas and defaults
// (design spec §11). Shared by the settings service and the seed so there is ONE source of truth.
import { z } from "zod";

const minutes = z.number().int().min(1).max(1440);
const flag = z.boolean();

/** Value schema of every setting key. Adding a key here is all that is needed to type it. */
export const SETTING_SCHEMAS = {
  "session.maxOnlineMinutes": minutes,
  "session.minibarMaxOnlineMinutes": minutes,
  "session.warnBeforeMinutes": minutes,
  "session.idleMinutes": minutes,
  "session.singleDevice": flag,
  "session.singleTargetAuto": flag,
  "shell.confirmSimpleActions": flag,
  "shell.mobileDefinitions": flag,
  "mybar.dailyLimit": flag,
  "mybar.quantityMode": z.enum(["QTY", "TICK"]),
  "mybar.maxQtyPerItem": z.union([z.literal("setup"), z.number().int().min(1).max(20)]),
  "mybar.translateNotes": flag,
  "dnd.minChecks": z.number().int().min(1).max(10),
  "dnd.recheckMinutes": minutes,
  "stock.defaultCriticalLevel": z.number().min(0),
  "stock.requestSafetyFactor": z.number().min(1).max(5),
  "price.display": z.enum(["SHOW", "HIDE"]),
  "price.currency": z.string().regex(/^[A-Z]{3}$/, "3 büyük harfli para birimi kodu olmalı"),
  "order.approvalEscalationMinutes": minutes,
  "order.callAlertSeconds": z.number().int().min(1).max(3600),
  "rs.slaMinutes": minutes,
  "email.notifyEnabled": flag,
  "email.alertEnabled": flag,
  "email.reportEnabled": flag,
  "email.systemEnabled": flag,
  "occupancy.fileRetentionDays": z.number().int().min(1).max(365),
  "qr.baseUrl": z.url(),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

/** System-wide defaults. A system row (hotelId null) overrides them, a hotel row overrides both. */
export const DEFAULT_SETTINGS: { [K in SettingKey]: SettingValue<K> } = {
  "session.maxOnlineMinutes": 480,
  "session.minibarMaxOnlineMinutes": 600,
  "session.warnBeforeMinutes": 60,
  "session.idleMinutes": 45,
  "session.singleDevice": true,
  "session.singleTargetAuto": true,
  "shell.confirmSimpleActions": true,
  "shell.mobileDefinitions": false,
  "mybar.dailyLimit": true,
  "mybar.quantityMode": "QTY",
  "mybar.maxQtyPerItem": "setup",
  "mybar.translateNotes": true,
  "dnd.minChecks": 2,
  "dnd.recheckMinutes": 120,
  "stock.defaultCriticalLevel": 50,
  "stock.requestSafetyFactor": 1.5,
  "price.display": "HIDE",
  "price.currency": "EUR",
  "order.approvalEscalationMinutes": 2,
  "order.callAlertSeconds": 60,
  "rs.slaMinutes": 30,
  "email.notifyEnabled": false,
  "email.alertEnabled": false,
  "email.reportEnabled": false,
  "email.systemEnabled": false,
  "occupancy.fileRetentionDays": 4,
  "qr.baseUrl": "http://localhost:3000",
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_SCHEMAS, key);
}

export const SETTING_GROUPS = [
  "Oturum",
  "MyBar",
  "DND",
  "Stok",
  "Fiyat",
  "Sipariş",
  "Oda Servisi",
  "Kabuk",
  "E-posta",
  "QR",
] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export type SettingInputType = "boolean" | "number" | "enum" | "text";

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
  /** Only the system scope may hold it (a hotel row is refused). */
  systemOnly?: boolean;
};

export const SETTING_META: { [K in SettingKey]: SettingMeta } = {
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
    description: "Oluşturma ve düzenleme gibi basit işlemlerde de onay penceresi gösterilir.",
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
    description: "Misafir notları personelin diline otomatik çevrilir.",
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
  "price.currency": {
    label: "Para birimi",
    description: "3 büyük harfli para birimi kodu (örn. EUR, TRY, USD).",
    group: "Fiyat",
    type: "text",
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
  "qr.baseUrl": {
    label: "QR taban adresi",
    description: "QR kodlarına yazılan genel adres (örn. https://menu.ornek.com).",
    group: "QR",
    type: "text",
  },
};
