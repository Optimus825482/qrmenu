"use server";

import { z } from "zod";
import { buildNav, type NavModel } from "@/components/staff/navModel";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { actionsByScreen, assertCan } from "@/lib/rbac";
import { DomainError, type Result, safeAction } from "@/lib/result";
import { audit } from "../audit";
import { accessSummary, type AccessSummary } from "../accessSummary";

/** Screen whose view right opens "Kullanıcıya göster" / "Bu rol ne görür?" (user management). */
const PREVIEW_SCREEN = "CR-KUL";

export type AccessPreview = { summary: AccessSummary; nav: NavModel };

const userInput = z.object({ userId: z.string().min(1), hotelId: z.string().min(1), outletId: z.string().min(1).optional() });
const roleInput = z.object({ roleId: z.string().min(1), hotelId: z.string().min(1) });

async function previewOf(
  roleId: string,
  hotelId: string,
  outletId: string | undefined,
  fullName: string | undefined,
  userId?: string,
): Promise<AccessPreview> {
  const [summary, perScreen, outlet] = await Promise.all([
    accessSummary({ roleId, hotelId, ...(outletId ? { outletId } : {}), ...(fullName !== undefined ? { fullName } : {}), ...(userId ? { userId } : {}) }),
    actionsByScreen(roleId, hotelId, userId),
    outletId ? prisma.outlet.findUnique({ where: { id: outletId }, select: { hasOrdering: true } }) : null,
  ]);
  const nav = buildNav(new Set(perScreen.keys()), {
    // Same rule as the real shell (loadShellProps): the outlet takes orders AND the role may open them.
    canCreate: Boolean(outlet?.hasOrdering) && (perScreen.get("QS-KUY")?.includes("O") ?? false),
  });
  return { summary, nav };
}

/**
 * What the given user sees in a hotel, for an administrator. Read-only: the caller's session and
 * cookies are untouched, and the result carries the summary and the nav model only (no password, session or token data).
 * Every preview is audited (`YETKI_ONIZLEME`).
 */
export async function previewAccessAction(input: {
  userId: string;
  hotelId: string;
  outletId?: string;
}): Promise<Result<AccessPreview>> {
  return safeAction(userInput, async (value) => {
    const ctx = await requireUser();
    await assertCan(ctx, PREVIEW_SCREEN, "V", value.hotelId);
    const target = await prisma.user.findFirst({
      where: {
        id: value.userId,
        deletedAt: null,
        OR: [{ hotelId: value.hotelId }, { userHotels: { some: { hotelId: value.hotelId } } }],
      },
      select: { id: true, roleId: true, fullName: true },
    });
    if (!target) throw new DomainError("NOT_FOUND", "Kullanıcı bulunamadı");
    if (value.outletId) {
      const outlet = await prisma.outlet.findFirst({ where: { id: value.outletId, hotelId: value.hotelId }, select: { id: true } });
      if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    }
    const preview = await previewOf(target.roleId, value.hotelId, value.outletId, target.fullName, target.id);
    await prisma.$transaction((tx) =>
      audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "YETKI_ONIZLEME",
        entity: "User",
        entityId: target.id,
        after: { hotelId: value.hotelId, ...(value.outletId ? { outletId: value.outletId } : {}) },
      }),
    );
    return preview;
  })(input);
}

/** Same preview for a role (no person): the "Bu rol ne görür?" tab of the permission matrix. */
export async function previewRoleAccessAction(input: { roleId: string; hotelId: string }): Promise<Result<AccessPreview>> {
  return safeAction(roleInput, async (value) => {
    const ctx = await requireUser();
    await assertCan(ctx, PREVIEW_SCREEN, "V", value.hotelId);
    const role = await prisma.role.findUnique({ where: { id: value.roleId }, select: { id: true } });
    if (!role) throw new DomainError("NOT_FOUND", "Rol bulunamadı");
    const preview = await previewOf(role.id, value.hotelId, undefined, undefined);
    await prisma.$transaction((tx) =>
      audit(tx, {
        userId: ctx.user.id,
        hotelId: ctx.session.hotelId,
        action: "YETKI_ONIZLEME",
        entity: "Role",
        entityId: role.id,
        after: { hotelId: value.hotelId },
      }),
    );
    return preview;
  })(input);
}
