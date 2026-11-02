import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError, type FieldErrors } from "@/lib/result";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import {
  type ListQuery,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "./crud";

const SCREEN = "CR-TAN";

export type HotelRow = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  isSystemDefault: boolean;
  isActive: boolean;
  emailNotifyEnabled: boolean;
  emailAlertEnabled: boolean;
  emailReportEnabled: boolean;
  emailSystemEnabled: boolean;
};

const SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  logoUrl: true,
  isSystemDefault: true,
  isActive: true,
  emailNotifyEnabled: true,
  emailAlertEnabled: true,
  emailReportEnabled: true,
  emailSystemEnabled: true,
} satisfies Prisma.HotelSelect;

/** Empty text clears an optional column; `undefined` leaves it as it is. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter olabilir`)
    .transform((value) => value || null)
    .nullish();

/** The logo is a root-relative path or an http(s) address, nothing else (it ends up in `src`). */
const logoUrl = optionalText(500).refine(
  (value) => value == null || /^(\/(?!\/)|https?:\/\/)/.test(value),
  "Logo adresi / veya http(s):// ile başlamalıdır",
);

export const hotelUpdateSchema = z.object({
  name: z.string().trim().min(1, "Otel adı gerekli").max(120, "En fazla 120 karakter olabilir"),
  /** Read-only: accepted so a form can echo it back, but a different value is rejected. */
  code: z.string().trim().optional(),
  address: optionalText(300),
  phone: optionalText(40),
  logoUrl,
  isActive: z.boolean().optional(),
  emailNotifyEnabled: z.boolean().optional(),
  emailAlertEnabled: z.boolean().optional(),
  emailReportEnabled: z.boolean().optional(),
  emailSystemEnabled: z.boolean().optional(),
});
export type HotelUpdateInput = z.input<typeof hotelUpdateSchema>;

const ORDER = {
  name: (dir: "asc" | "desc") => ({ name: dir }),
  code: (dir: "asc" | "desc") => ({ code: dir }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
};

/**
 * Hotels of the caller's scope that they may view in Tanımlamalar (a hotel they cannot view is
 * left out). With `hotelId` only that hotel is listed, and viewing it is asserted (FORBIDDEN).
 */
export async function list(ctx: Ctx, query: ListQuery, hotelId?: string): Promise<Page<HotelRow>> {
  let ids: string[];
  if (hotelId !== undefined) {
    await assertCan(ctx, SCREEN, "V", hotelId);
    ids = [hotelId];
  } else {
    const checks = await Promise.all(
      ctx.hotelIds.map(async (id) => ((await can(ctx, SCREEN, "V", id)) ? id : undefined)),
    );
    ids = checks.filter((id): id is string => id !== undefined);
  }
  const where: Prisma.HotelWhereInput = {
    id: { in: ids },
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { code: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.hotel.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.HotelOrderByWithRelationInput>(query.sort, ORDER, { name: "asc" }),
      ...pageArgs(query),
    }),
    prisma.hotel.count({ where }),
  ]);
  return toPage(items, total, query);
}

export async function update(ctx: Ctx, id: string, raw: HotelUpdateInput): Promise<HotelRow> {
  const input = parseInput(hotelUpdateSchema, raw);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: id }, async (tx) => {
    const before = await tx.hotel.findUnique({ where: { id }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", "Otel bulunamadı");
    if (input.code !== undefined && input.code !== before.code) {
      const fieldErrors: FieldErrors = { code: ["Otel kodu değiştirilemez"] };
      throw new DomainError("VALIDATION", "Otel kodu değiştirilemez", { fieldErrors });
    }
    if (before.isSystemDefault && input.isActive === false) {
      throw new DomainError("FORBIDDEN", "Sistem oteli pasife alınamaz");
    }
    const after = await tx.hotel.update({
      where: { id },
      data: {
        name: input.name,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.emailNotifyEnabled !== undefined
          ? { emailNotifyEnabled: input.emailNotifyEnabled }
          : {}),
        ...(input.emailAlertEnabled !== undefined
          ? { emailAlertEnabled: input.emailAlertEnabled }
          : {}),
        ...(input.emailReportEnabled !== undefined
          ? { emailReportEnabled: input.emailReportEnabled }
          : {}),
        ...(input.emailSystemEnabled !== undefined
          ? { emailSystemEnabled: input.emailSystemEnabled }
          : {}),
      },
      select: SELECT,
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: id,
      action: "HOTEL_UPDATE",
      entity: "Hotel",
      entityId: id,
      before,
      after,
    });
    await publishDefinition(tx, { hotelId: id, entity: "hotel", id, op: "update" });
    return after;
  });
}
