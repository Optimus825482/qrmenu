import { cache } from "react";
import { ZodError } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import {
  DEFAULT_SETTINGS,
  isSettingKey,
  SETTING_SCHEMAS,
  type SettingKey,
  type SettingValue,
} from "./settings-defs";

export { DEFAULT_SETTINGS, SETTING_SCHEMAS, type SettingKey, type SettingValue };

type Row = { hotelId: string | null; key: string; value: unknown };

/** A stored value that no longer fits its schema (hand-edited row) is ignored, not trusted. */
function parseStored<K extends SettingKey>(key: K, value: unknown): SettingValue<K> | undefined {
  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  return parsed.success ? (parsed.data as SettingValue<K>) : undefined;
}

/** hotel row → system row (hotelId null) → default, from the rows of one query. */
function resolve<K extends SettingKey>(key: K, rows: Row[], hotelId?: string): SettingValue<K> {
  const hotelRow = hotelId ? rows.find((r) => r.key === key && r.hotelId === hotelId) : undefined;
  const systemRow = rows.find((r) => r.key === key && r.hotelId === null);
  return (
    (hotelRow ? parseStored(key, hotelRow.value) : undefined) ??
    (systemRow ? parseStored(key, systemRow.value) : undefined) ??
    DEFAULT_SETTINGS[key]
  );
}

async function loadRows(keys: readonly SettingKey[], hotelId?: string): Promise<Row[]> {
  return prisma.setting.findMany({
    where: {
      key: { in: [...keys] },
      OR: hotelId ? [{ hotelId: null }, { hotelId }] : [{ hotelId: null }],
    },
    select: { hotelId: true, key: true, value: true },
  });
}

/**
 * Per-request memo: React cache() dedupes identical (key, hotelId) reads within one request.
 * Caveat: a getSetting after a setSetting of the same key in the same request returns the old value.
 */
const readSetting = cache(async (key: SettingKey, hotelId: string): Promise<unknown> => {
  return resolve(key, await loadRows([key], hotelId || undefined), hotelId || undefined);
});

/** Effective value of one setting: hotel row, else system row, else the built-in default. */
export async function getSetting<K extends SettingKey>(
  key: K,
  hotelId?: string,
): Promise<SettingValue<K>> {
  return (await readSetting(key, hotelId ?? "")) as SettingValue<K>;
}

/** Effective values of several settings with a single query. */
export async function getSettings<K extends SettingKey>(
  keys: readonly K[],
  hotelId?: string,
): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = await loadRows(keys, hotelId);
  const out = {} as { [P in K]: SettingValue<P> };
  for (const key of keys) out[key] = resolve(key, rows, hotelId);
  return out;
}

/**
 * Writes the value at the given scope (a hotel row, or the system row when `hotelId` is omitted).
 * Needs edit permission on CR-SYS; the value is validated against the key's schema. Value, audit
 * and the `settings.changed` event are one transaction.
 */
export async function setSetting<K extends SettingKey>(
  ctx: Ctx,
  key: K,
  value: SettingValue<K>,
  hotelId?: string,
): Promise<void> {
  await assertCan(ctx, "CR-SYS", "D", hotelId);
  // Without a hotel, assertCan falls back to the session hotel, so a hotel manager holding D on
  // CR-SYS would pass it: system-wide rows are reserved for SISTEM roles.
  if (hotelId === undefined && ctx.user.roleKind !== "SISTEM") {
    try {
      await audit(prisma, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "YETKISIZ_DENEME",
        entity: "Setting",
        entityId: key,
        after: { scope: "SYSTEM" },
      });
    } catch (error) {
      // A failing audit write must never mask the denial.
      console.error("setSetting: YETKISIZ_DENEME denetim kaydı yazılamadı", { key, error });
    }
    throw new DomainError(
      "FORBIDDEN",
      "Sistem geneli ayarları yalnızca sistem yöneticisi değiştirebilir",
    );
  }
  if (!isSettingKey(key)) {
    throw new DomainError("VALIDATION", `Bilinmeyen ayar anahtarı: ${String(key)}`);
  }
  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  if (!parsed.success) throw fromZod(parsed.error as ZodError);
  const next = parsed.data as Prisma.InputJsonValue;

  await prisma.$transaction(async (tx) => {
    // Prisma's upsert cannot target the (null, key) pair, so find-then-write for both scopes;
    // the advisory lock serializes concurrent first writes of one (hotel, key).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`setting:${hotelId ?? ""}:${key}`}))`;
    const existing = await tx.setting.findFirst({ where: { hotelId: hotelId ?? null, key } });
    if (existing) {
      await tx.setting.update({ where: { id: existing.id }, data: { value: next } });
    } else {
      await tx.setting.create({ data: { hotelId: hotelId ?? null, key, value: next } });
    }
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: hotelId ?? ctx.session.hotelId,
      action: "SETTING_UPDATE",
      entity: "Setting",
      entityId: key,
      before: existing?.value,
      after: next,
    });
    await publish({ type: "settings.changed", hotelId, payload: { key } }, tx);
  });
}
