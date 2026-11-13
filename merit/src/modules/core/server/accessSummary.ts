import { createHash } from "node:crypto";
import type { ModuleKey } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { actionsByScreen, type Action } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { GENERIC_ACTION_TEXT, guideFor, type GuideContext } from "../screenGuide";
import { MODULE_GROUPS, SCREENS } from "../screens";
import { pickLanding } from "./landing";

export type ScreenAccess = {
  code: string;
  name: string;
  path: string;
  moduleKey: ModuleKey;
  group: string;
  actions: Action[];
  sentences: string[];
  purpose: string;
  context: GuideContext;
};

export type AccessSummary = {
  user: { fullName: string; roleCode: string; roleName: string };
  hotel: { id: string; name: string };
  outlet?: { id: string; name: string };
  modules: { moduleKey: ModuleKey; label: string; screens: ScreenAccess[] }[];
  landing: { screenCode: string; path: string };
  hash: string;
};

/** `userId` set = that person (their own exceptions apply); unset = the bare role. */
export type AccessSubject = { roleId: string; hotelId: string; outletId?: string; fullName?: string; userId?: string };


/** Fingerprint of the screen and action set only (not of the guide texts): a permission change re-shows the summary. */
export function accessHash(entries: ReadonlyArray<{ code: string; actions: readonly Action[] }>): string {
  const json = JSON.stringify(entries.map((e) => [e.code, e.actions.join("")]));
  return createHash("sha256").update(json).digest("hex").slice(0, 12);
}

function isCtx(subject: Ctx | AccessSubject): subject is Ctx {
  return "session" in subject;
}

/**
 * What a role may do in a hotel, in plain Turkish: only the screens the role can view (there is no
 * "screens you cannot see" section). Works from the role matrix so the admin preview can describe a
 * role without a session.
 */
export async function accessSummary(subject: Ctx | AccessSubject, hotelId?: string): Promise<AccessSummary> {
  const ctx = isCtx(subject) ? subject : undefined;
  const roleId = ctx ? ctx.user.roleId : (subject as AccessSubject).roleId;
  const effectiveHotel = hotelId ?? (ctx ? ctx.session.hotelId : (subject as AccessSubject).hotelId);
  const outletId = ctx ? ctx.session.outletId : (subject as AccessSubject).outletId;
  const userId = ctx ? ctx.user.id : (subject as AccessSubject).userId;

  const [role, hotel, outlet, perScreen] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { code: true, name: true, defaultScreen: true } }),
    prisma.hotel.findUnique({ where: { id: effectiveHotel }, select: { id: true, name: true } }),
    outletId
      ? prisma.outlet.findUnique({ where: { id: outletId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    actionsByScreen(roleId, effectiveHotel, userId),
  ]);
  if (!role) throw new DomainError("NOT_FOUND", "Rol bulunamadı");
  if (!hotel) throw new DomainError("NOT_FOUND", "Otel bulunamadı");

  const owned: ScreenAccess[] = [];
  for (const screen of SCREENS) {
    const actions = perScreen.get(screen.code);
    if (!actions) continue;
    const g = guideFor(screen.code);
    owned.push({
      code: screen.code,
      name: screen.name,
      path: screen.path,
      moduleKey: screen.moduleKey,
      group: screen.group,
      actions,
      sentences: actions.map((a) => g.actions?.[a] ?? GENERIC_ACTION_TEXT[a]),
      purpose: g.purpose,
      context: g.context,
    });
  }

  const modules: AccessSummary["modules"] = [];
  for (const s of owned) {
    let bucket = modules.find((m) => m.moduleKey === s.moduleKey);
    if (!bucket) {
      bucket = { moduleKey: s.moduleKey, label: MODULE_GROUPS[s.moduleKey], screens: [] };
      modules.push(bucket);
    }
    bucket.screens.push(s);
  }

  const landing = pickLanding(owned.map((s) => s.code), role.defaultScreen);
  return {
    user: {
      fullName: ctx?.user.fullName ?? (subject as AccessSubject).fullName ?? "",
      roleCode: role.code,
      roleName: role.name,
    },
    hotel,
    ...(outlet ? { outlet } : {}),
    modules,
    landing: { screenCode: landing.screenCode, path: landing.path },
    hash: accessHash(owned),
  };
}

