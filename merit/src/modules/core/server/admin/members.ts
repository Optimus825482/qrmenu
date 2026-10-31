import { z } from "zod";
import type { Prisma, RoleKind } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  listQuerySchema,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "./crud";

const SCREEN = "CR-KUL";
const INVALID = "Girilen bilgiler geçersiz";
const ALREADY_MEMBER = "Bu kullanıcı zaten bu outletin ekibinde";
const NOT_FOUND = "Ekip üyeliği bulunamadı";
const OUTLET_ROLE_KINDS: RoleKind[] = ["OUTLET", "MUTFAK"];

export type MemberRow = {
  id: string;
  userId: string;
  outletId: string;
  username: string;
  fullName: string;
  userIsActive: boolean;
  /** Role override of this membership (null = the user's own role). */
  roleId: string | null;
  /** Role the user acts with at this outlet: the override, else their own. */
  roleName: string;
  isActive: boolean;
};

const SELECT = {
  id: true,
  userId: true,
  outletId: true,
  roleId: true,
  isActive: true,
  user: { select: { username: true, fullName: true, isActive: true, role: { select: { name: true } } } },
  role: { select: { name: true } },
} satisfies Prisma.OutletMemberSelect;

type MemberWithRelations = Prisma.OutletMemberGetPayload<{ select: typeof SELECT }>;

const toRow = (m: MemberWithRelations): MemberRow => ({
  id: m.id,
  userId: m.userId,
  outletId: m.outletId,
  username: m.user.username,
  fullName: m.user.fullName,
  userIsActive: m.user.isActive,
  roleId: m.roleId,
  roleName: m.role?.name ?? m.user.role.name,
  isActive: m.isActive,
});

export const memberListQuerySchema = listQuerySchema;

const assignSchema = z.object({
  userId: z.string("Kullanıcı seçin").min(1, "Kullanıcı seçin"),
  outletId: z.string().min(1),
  roleId: z
    .string()
    .nullish()
    .transform((v) => v || undefined),
});
export type AssignInput = z.input<typeof assignSchema>;

const ORDER = {
  username: (dir: "asc" | "desc") => ({ user: { username: dir } }),
  fullName: (dir: "asc" | "desc") => ({ user: { fullName: dir } }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
};

async function outletHotel(outletId: string): Promise<string> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  return outlet.hotelId;
}

export async function list(
  ctx: Ctx,
  outletId: string,
  rawQuery: z.input<typeof memberListQuerySchema>,
): Promise<Page<MemberRow>> {
  const hotelId = await outletHotel(outletId);
  await assertCan(ctx, SCREEN, "V", hotelId);
  const query = parseInput(memberListQuerySchema, rawQuery);
  const where: Prisma.OutletMemberWhereInput = {
    outletId,
    ...(query.q
      ? {
          user: {
            OR: [
              { username: { contains: query.q, mode: "insensitive" } },
              { fullName: { contains: query.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.outletMember.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.OutletMemberOrderByWithRelationInput>(query.sort, ORDER, {
        user: { username: "asc" },
      }),
      ...pageArgs(query),
    }),
    prisma.outletMember.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

export type MemberCandidate = { id: string; username: string; fullName: string; roleName: string };

/** Active users of the outlet's hotel that are not on its team yet (the "Kullanıcı ekle" search). */
export async function candidates(ctx: Ctx, outletId: string, q?: string): Promise<MemberCandidate[]> {
  const hotelId = await outletHotel(outletId);
  await assertCan(ctx, SCREEN, "O", hotelId);
  const term = q?.trim();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { kind: { not: "SISTEM" } },
      OR: [{ hotelId }, { userHotels: { some: { hotelId } } }],
      outletMemberships: { none: { outletId } },
      ...(term
        ? {
            AND: [
              {
                OR: [
                  { username: { contains: term, mode: "insensitive" } },
                  { fullName: { contains: term, mode: "insensitive" } },
                ],
              },
            ],
          }
        : {}),
    },
    select: { id: true, username: true, fullName: true, role: { select: { name: true } } },
    orderBy: { username: "asc" },
    take: 20,
  });
  return users.map((u) => ({ id: u.id, username: u.username, fullName: u.fullName, roleName: u.role.name }));
}

/** Adds a user to an outlet's team; `roleId` (OUTLET/MUTFAK roles only) overrides their base role there. */
export async function assign(ctx: Ctx, raw: AssignInput): Promise<MemberRow> {
  const input = parseInput(assignSchema, raw);
  const hotelId = await outletHotel(input.outletId);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, isActive: true, hotelId: true, userHotels: { select: { hotelId: true } } },
      });
      if (!user) {
        throw new DomainError("VALIDATION", INVALID, { fieldErrors: { userId: ["Kullanıcı bulunamadı"] } });
      }
      if (!user.isActive) {
        throw new DomainError("VALIDATION", INVALID, {
          fieldErrors: { userId: ["Pasif kullanıcı ekibe eklenemez"] },
        });
      }
      const inHotel = user.hotelId === hotelId || user.userHotels.some((l) => l.hotelId === hotelId);
      if (!inHotel) {
        throw new DomainError("VALIDATION", INVALID, {
          fieldErrors: { userId: ["Kullanıcı bu otele bağlı değil"] },
        });
      }
      if (input.roleId) {
        const role = await tx.role.findUnique({ where: { id: input.roleId }, select: { kind: true } });
        if (!role || !OUTLET_ROLE_KINDS.includes(role.kind)) {
          throw new DomainError("VALIDATION", INVALID, {
            fieldErrors: { roleId: ["Ekip rolü bir outlet veya mutfak rolü olmalı"] },
          });
        }
      }
      if (
        await tx.outletMember.findUnique({
          where: { userId_outletId: { userId: input.userId, outletId: input.outletId } },
          select: { id: true },
        })
      ) {
        throw new DomainError("CONFLICT", ALREADY_MEMBER, { fieldErrors: { userId: [ALREADY_MEMBER] } });
      }
      const created = await tx.outletMember.create({
        data: { userId: input.userId, outletId: input.outletId, roleId: input.roleId },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "MEMBER_ASSIGN",
        entity: "OutletMember",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "member", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, ALREADY_MEMBER);
  }
}

async function memberHotel(id: string): Promise<string> {
  const member = await prisma.outletMember.findUnique({
    where: { id },
    select: { outlet: { select: { hotelId: true } } },
  });
  if (!member) throw new DomainError("NOT_FOUND", NOT_FOUND);
  return member.outlet.hotelId;
}

export async function remove(ctx: Ctx, id: string): Promise<void> {
  const hotelId = await memberHotel(id);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const before = await tx.outletMember.findUnique({ where: { id }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
    await tx.outletMember.delete({ where: { id } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "MEMBER_REMOVE",
      entity: "OutletMember",
      entityId: id,
      before: toRow(before),
    });
    await publishDefinition(tx, { hotelId, entity: "member", id, op: "delete" });
  });
}

export async function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<MemberRow> {
  const hotelId = await memberHotel(id);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const before = await tx.outletMember.findUnique({ where: { id }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", NOT_FOUND);
    if (before.isActive === isActive) return toRow(before);
    const row = toRow(await tx.outletMember.update({ where: { id }, data: { isActive }, select: SELECT }));
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "MEMBER_SET_ACTIVE",
      entity: "OutletMember",
      entityId: id,
      before: toRow(before),
      after: row,
    });
    await publishDefinition(tx, { hotelId, entity: "member", id, op: "update" });
    return row;
  });
}
