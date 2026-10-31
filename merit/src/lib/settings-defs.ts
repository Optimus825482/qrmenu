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
