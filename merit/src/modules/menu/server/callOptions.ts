import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { parseInput, withAdminTx } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import {
  CALL_LANGS,
  MAX_ACTIVE_OPTIONS,
  type CallLang,
  type CallType,
  type GuestCallOption,
} from "../callOptions";
import { assertOutletScope } from "./menuNodeAccess";

export { MAX_ACTIVE_OPTIONS };

export type CallOptionRow = GuestCallOption & {
  sortOrder: number;
  isActive: boolean;
};

function sanitizeText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
}

const saveOptionSchema = z.object({
  id: z.string().min(1).optional(),
  label: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(1, "Etiket boş olamaz").max(60, "Etiket en fazla 60 karakter olabilir")),
  translations: z
    .record(z.string(), z.string())
    .optional()
    .default({})
    .transform((rec) => {
      const out: Partial<Record<CallLang, string>> = {};
      for (const lang of CALL_LANGS) {
        if (rec[lang] !== undefined) {
          const clean = sanitizeText(rec[lang] ?? "");
          if (clean.length > 0) {
            out[lang] = clean.slice(0, 60);
          }
        }
      }
      return out;
    }),
  callType: z.enum(["GARSON", "HESAP", "DIGER"] as const, {
    message: "Geçersiz çağrı tipi",
  }),
  isActive: z.boolean().optional().default(true),
});

export type SaveCallOptionInput = z.input<typeof saveOptionSchema>;

async function authorizeCallOptionOutlet(ctx: Ctx, outletId: string, action: "V" | "D") {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true },
  });
  if (!outlet || !ctx.hotelIds.includes(outlet.hotelId)) {
    throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  }
  assertOutletScope(ctx, outletId);
  const canTem = await can(ctx, "QM-TEM", action, outlet.hotelId);
  const canMen = await can(ctx, "QM-MEN", action, outlet.hotelId);
  if (!canTem && !canMen) {
    throw new DomainError("FORBIDDEN", "Bu işlem için Menü veya Tema Yönetimi yetkisi gerekir");
  }
  const screen = canTem ? "QM-TEM" : "QM-MEN";
  return { outlet, screen };
}

/** Whether the caller may change the outlet's call options (QM-TEM "D", or QM-MEN "D" as the fallback). */
export async function canWrite(ctx: Ctx, outletId: string): Promise<boolean> {
  try {
    await authorizeCallOptionOutlet(ctx, outletId, "D");
    return true;
  } catch {
    return false;
  }
}

export async function list(ctx: Ctx, outletId: string): Promise<CallOptionRow[]> {
  await authorizeCallOptionOutlet(ctx, outletId, "V");
  const rows = await prisma.outletCallOption.findMany({
    where: { outletId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    translations: (r.translations as Record<string, string>) || {},
    callType: r.callType as CallType,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
  }));
}

export async function save(ctx: Ctx, outletId: string, raw: SaveCallOptionInput): Promise<CallOptionRow> {
  const input = parseInput(saveOptionSchema, raw);
  const { outlet, screen } = await authorizeCallOptionOutlet(ctx, outletId, "D");

  return await withAdminTx(ctx, { screen, action: "D", hotelId: outlet.hotelId }, async (tx) => {
    // Serialize active-count checks (including simultaneous create/reactivation) per outlet.
    await tx.$queryRaw<{ id: string }[]>`SELECT id FROM outlets WHERE id = ${outletId} FOR UPDATE`;
    if (input.isActive) {
      const activeCount = await tx.outletCallOption.count({
        where: {
          outletId,
          isActive: true,
          ...(input.id ? { id: { not: input.id } } : {}),
        },
      });
      if (activeCount >= MAX_ACTIVE_OPTIONS) {
        throw new DomainError("CONFLICT", "En fazla 8 aktif çağrı seçeneği olabilir");
      }
    }

    let row;
    if (input.id) {
      const existing = await tx.outletCallOption.findFirst({
        where: { id: input.id, outletId },
      });
      if (!existing) {
        throw new DomainError("NOT_FOUND", "Çağrı seçeneği bulunamadı");
      }
      row = await tx.outletCallOption.update({
        where: { id: input.id },
        data: {
          label: input.label,
          translations: input.translations as Prisma.InputJsonValue,
          callType: input.callType,
          isActive: input.isActive,
        },
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: outlet.hotelId,
        action: "OUTLET_CALL_OPTION_SAVE",
        entity: "OutletCallOption",
        entityId: row.id,
        before: existing,
        after: row,
      });
    } else {
      const last = await tx.outletCallOption.findFirst({
        where: { outletId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const nextSortOrder = (last?.sortOrder ?? -1) + 1;
      row = await tx.outletCallOption.create({
        data: {
          outletId,
          label: input.label,
          translations: input.translations as Prisma.InputJsonValue,
          callType: input.callType,
          sortOrder: nextSortOrder,
          isActive: input.isActive,
        },
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: outlet.hotelId,
        action: "OUTLET_CALL_OPTION_SAVE",
        entity: "OutletCallOption",
        entityId: row.id,
        after: row,
      });
    }

    await publish(
      {
        type: "menu.changed",
        hotelId: outlet.hotelId,
        outletId,
        payload: { op: "callOptions" },
      },
      tx as Prisma.TransactionClient,
    );

    return {
      id: row.id,
      label: row.label,
      translations: (row.translations as Record<string, string>) || {},
      callType: row.callType as CallType,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    };
  });
}

export async function reorder(ctx: Ctx, outletId: string, orderedIds: string[]): Promise<void> {
  const { outlet, screen } = await authorizeCallOptionOutlet(ctx, outletId, "D");

  await withAdminTx(ctx, { screen, action: "D", hotelId: outlet.hotelId }, async (tx) => {
    const existing = await tx.outletCallOption.findMany({
      where: { outletId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));
    if (
      orderedIds.length !== existing.length ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new DomainError("VALIDATION", "Geçersiz sıralama listesi");
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await tx.outletCallOption.update({
        where: { id: orderedIds[i] },
        data: { sortOrder: i },
      });
    }

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: outlet.hotelId,
      action: "OUTLET_CALL_OPTION_REORDER",
      entity: "OutletCallOption",
      after: { orderedIds },
    });

    await publish(
      {
        type: "menu.changed",
        hotelId: outlet.hotelId,
        outletId,
        payload: { op: "callOptions" },
      },
      tx as Prisma.TransactionClient,
    );
  });
}

export async function remove(ctx: Ctx, id: string): Promise<void> {
  const target = await prisma.outletCallOption.findUnique({
    where: { id },
    include: { outlet: { select: { id: true, hotelId: true } } },
  });
  if (!target || !ctx.hotelIds.includes(target.outlet.hotelId)) {
    throw new DomainError("NOT_FOUND", "Çağrı seçeneği bulunamadı");
  }
  assertOutletScope(ctx, target.outletId);

  const canTem = await can(ctx, "QM-TEM", "D", target.outlet.hotelId);
  const canMen = await can(ctx, "QM-MEN", "D", target.outlet.hotelId);
  if (!canTem && !canMen) {
    throw new DomainError("FORBIDDEN", "Bu işlem için Menü veya Tema Yönetimi yetkisi gerekir");
  }
  const screen = canTem ? "QM-TEM" : "QM-MEN";

  await withAdminTx(ctx, { screen, action: "D", hotelId: target.outlet.hotelId }, async (tx) => {
    const before = await tx.outletCallOption.delete({
      where: { id },
    });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: target.outlet.hotelId,
      action: "OUTLET_CALL_OPTION_REMOVE",
      entity: "OutletCallOption",
      entityId: id,
      before,
    });

    await publish(
      {
        type: "menu.changed",
        hotelId: target.outlet.hotelId,
        outletId: target.outletId,
        payload: { op: "callOptions" },
      },
      tx as Prisma.TransactionClient,
    );
  });
}

/**
 * Public/guest active call options ordered by sortOrder.
 */
export async function listActive(outletId: string): Promise<GuestCallOption[]> {
  const rows = await prisma.outletCallOption.findMany({
    where: { outletId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, translations: true, callType: true },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    translations: (r.translations as Record<string, string>) || {},
    callType: r.callType as CallType,
  }));
}

/**
 * Resolves an active call option within the outlet during guest call creation.
 */
export async function resolveActive(
  db: PrismaClient | Prisma.TransactionClient,
  outletId: string,
  optionId: string,
): Promise<{ label: string; callType: "GARSON" | "HESAP" | "DIGER" }> {
  const option = await db.outletCallOption.findFirst({
    where: { id: optionId, outletId, isActive: true },
    select: { label: true, callType: true },
  });
  if (!option) {
    throw new DomainError("NOT_FOUND", "Çağrı seçeneği bulunamadı");
  }
  return {
    label: option.label,
    callType: option.callType as "GARSON" | "HESAP" | "DIGER",
  };
}
