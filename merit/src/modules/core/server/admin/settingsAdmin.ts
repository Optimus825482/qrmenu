import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { assertCan, can } from "@/lib/rbac";
import {
  DEFAULT_SETTINGS,
  isSettingKey,
  SETTING_GROUPS,
  SETTING_META,
  SETTING_SCHEMAS,
  type SettingGroup,
  type SettingKey,
  type SettingMeta,
} from "@/lib/settings-defs";
import { storedValue } from "@/lib/settings";
import { audit } from "@/modules/core/server/audit";
import { withAdminTx } from "./crud";

const SCREEN = "CR-SYS";
const MASK = "••••••••";

export type SettingSource = "default" | "system" | "hotel";
export type SettingItem = {
  key: SettingKey;
  meta: SettingMeta;
  /** Effective value at the scope; a secret is replaced by a mask (empty stays empty). */
  value: unknown;
  source: SettingSource;
};
export type SettingGroupRow = { group: SettingGroup; items: SettingItem[] };

export type SettingsScopes = {
  /** The system-wide scope may be edited (SISTEM roles only). */
  system: boolean;
  hotels: { id: string; code: string; name: string }[];
};

type Reader = Pick<Prisma.TransactionClient, "setting">;
type Row = { hotelId: string | null; key: string; value: unknown };

const mask = (meta: SettingMeta, value: unknown): unknown =>
  meta.secret && value !== "" && value !== null && value !== undefined ? MASK : value;

function valid(key: SettingKey, value: unknown): boolean {
  return SETTING_SCHEMAS[key].safeParse(value).success;
}

/** hotel row → system row → default, like `getSetting`; a stored value that no longer fits is ignored. */
function resolveItem(key: SettingKey, rows: Row[], hotelId: string | null): SettingItem {
  const meta = SETTING_META[key];
  const hotelRow = hotelId ? rows.find((r) => r.key === key && r.hotelId === hotelId) : undefined;
  const systemRow = rows.find((r) => r.key === key && r.hotelId === null);
  let value: unknown = DEFAULT_SETTINGS[key];
  let source: SettingSource = "default";
  if (hotelRow && valid(key, hotelRow.value)) {
    value = SETTING_SCHEMAS[key].parse(hotelRow.value);
    source = "hotel";
  } else if (systemRow && valid(key, systemRow.value)) {
    value = SETTING_SCHEMAS[key].parse(systemRow.value);
    source = "system";
  }
  return { key, meta, value: mask(meta, value), source };
}

async function loadRows(db: Reader, keys: readonly SettingKey[], hotelId: string | null) {
  return db.setting.findMany({
    where: {
      key: { in: [...keys] },
      OR: hotelId ? [{ hotelId: null }, { hotelId }] : [{ hotelId: null }],
    },
    select: { hotelId: true, key: true, value: true },
  });
}

/** Read access: a hotel scope needs CR-SYS view there; the system scope is for SISTEM roles only. */
async function assertReadable(ctx: Ctx, hotelId: string | null): Promise<void> {
  if (hotelId === null) {
    await assertCan(ctx, SCREEN, "V");
    if (ctx.user.roleKind !== "SISTEM") {
      throw new DomainError(
        "FORBIDDEN",
        "Sistem geneli ayarları yalnızca sistem yöneticisi görebilir",
      );
    }
  } else {
    await assertCan(ctx, SCREEN, "V", hotelId);
  }
}

function parseWrite(key: string, value: unknown, hotelId: string | null): SettingKey {
  if (!isSettingKey(key)) {
    throw new DomainError("VALIDATION", "Bilinmeyen ayar anahtarı", {
      fieldErrors: { key: [`Bilinmeyen ayar anahtarı: ${key}`] },
    });
  }
  if (hotelId !== null && SETTING_META[key].systemOnly) {
    throw new DomainError("VALIDATION", "Bu ayar yalnızca sistem geneli için tanımlanabilir", {
      fieldErrors: { key: ["Bu ayar yalnızca sistem geneli için tanımlanabilir"] },
    });
  }
  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    throw new DomainError("VALIDATION", "Girilen bilgiler geçersiz", {
      fieldErrors: { value: parsed.error.issues.map((i) => i.message) },
    });
  }
  return key;
}

/** Scopes the user may edit: the system scope (SISTEM only) and the in-scope hotels with CR-SYS edit. */
export async function scopes(ctx: Ctx): Promise<SettingsScopes> {
  const system = ctx.user.roleKind === "SISTEM" && (await can(ctx, SCREEN, "D"));
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  const editable = [];
  for (const hotel of hotels) if (await can(ctx, SCREEN, "D", hotel.id)) editable.push(hotel);
  return { system, hotels: editable };
}

/** Every setting grouped for the window, with the effective value and where it comes from. */
export async function listGrouped(ctx: Ctx, hotelId: string | null): Promise<SettingGroupRow[]> {
  await assertReadable(ctx, hotelId);
  const keys = Object.keys(SETTING_SCHEMAS) as SettingKey[];
  const rows = await loadRows(prisma, keys, hotelId);
  return SETTING_GROUPS.map((group) => ({
    group,
    items: keys.filter((k) => SETTING_META[k].group === group).map((k) => resolveItem(k, rows, hotelId)),
  })).filter((g) => g.items.length > 0);
}

/** Writes the value at the given scope (hotel row, or the system row for `null`) and returns the new item. */
export async function set(
  ctx: Ctx,
  hotelId: string | null,
  key: string,
  value: unknown,
): Promise<SettingItem> {
  const k = parseWrite(key, value, hotelId);
  const meta = SETTING_META[k];
  // The mask the window shows for a stored secret is not a new value: sending it back keeps the stored one.
  if (meta.sealed && value === MASK) {
    // Same gates as the real write: scope readability (system scope = SISTEM only) and CR-SYS edit.
    await assertReadable(ctx, hotelId);
    await assertCan(ctx, SCREEN, "D", hotelId ?? undefined);
    return resolveItem(k, await loadRows(prisma, [k], hotelId), hotelId);
  }
  const next = storedValue(k, SETTING_SCHEMAS[k].parse(value)) as Prisma.InputJsonValue;
  const scope = hotelId === null ? "SYSTEM" : "HOTEL";
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: hotelId ?? undefined }, async (tx) => {
    // Prisma's upsert cannot target the (null, key) pair; the advisory lock serializes first writes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`setting:${hotelId ?? ""}:${k}`}))`;
    const existing = await tx.setting.findFirst({ where: { hotelId, key: k } });
    if (existing) await tx.setting.update({ where: { id: existing.id }, data: { value: next } });
    else await tx.setting.create({ data: { hotelId, key: k, value: next } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: hotelId ?? undefined,
      action: "SETTING_SET",
      entity: "Setting",
      entityId: k,
      before: { scope, value: mask(meta, existing?.value ?? null) },
      after: { scope, value: mask(meta, next) },
    });
    await publish(
      { type: "settings.changed", hotelId: hotelId ?? undefined, payload: { key: k } },
      tx,
    );
    if (k === "price.display" || k === "price.currency") {
      await publish({ type: "price.display", hotelId: hotelId ?? undefined }, tx);
      await publish({ type: "menu.changed", hotelId: hotelId ?? undefined }, tx);
      if (k === "price.currency" && typeof value === "string") {
        if (hotelId) {
          await tx.menuNode.updateMany({
            where: { outlet: { hotelId } },
            data: { currency: value },
          });
        } else {
          await tx.menuNode.updateMany({
            data: { currency: value },
          });
        }
      }
    }
    return resolveItem(k, await loadRows(tx, [k], hotelId), hotelId);
  });
}

/** Removes a hotel's own value of a key so the system value (or the default) applies again. */
export async function clearHotelOverride(
  ctx: Ctx,
  hotelId: string,
  key: string,
): Promise<SettingItem> {
  if (!isSettingKey(key)) {
    throw new DomainError("VALIDATION", "Bilinmeyen ayar anahtarı", {
      fieldErrors: { key: [`Bilinmeyen ayar anahtarı: ${key}`] },
    });
  }
  const meta = SETTING_META[key];
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`setting:${hotelId}:${key}`}))`;
    const existing = await tx.setting.findFirst({ where: { hotelId, key } });
    if (existing) {
      await tx.setting.delete({ where: { id: existing.id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "SETTING_CLEAR",
        entity: "Setting",
        entityId: key,
        before: { scope: "HOTEL", value: mask(meta, existing.value) },
      });
      await publish({ type: "settings.changed", hotelId, payload: { key } }, tx);
      if (key === "price.display" || key === "price.currency") {
        await publish({ type: "price.display", hotelId }, tx);
        await publish({ type: "menu.changed", hotelId }, tx);
      }
    }
    return resolveItem(key, await loadRows(tx, [key], hotelId), hotelId);
  });
}
