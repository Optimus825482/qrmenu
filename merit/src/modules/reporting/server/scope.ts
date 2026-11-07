import { ZodError } from "zod";
import type { ModuleKey, RoleKind } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { allReports } from "@/modules/reporting/server/registry";
import { dayRange, today } from "@/modules/reporting/server/range";
import {
  reportRequestSchema,
  type ParsedReportRequest,
  type ReportCatalogItem,
  type ReportDef,
  type ReportScope,
} from "@/modules/reporting/server/types";

/** Session role kinds whose reports are pinned to the session outlet (spec §4.1). */
const OUTLET_KINDS: RoleKind[] = ["OUTLET", "MUTFAK"];
export const isOutletSession = (ctx: Ctx): boolean => OUTLET_KINDS.includes(ctx.user.roleKind);

type Mode = "FULL" | "SELF";

const MODULE_LABEL: Record<ModuleKey, string> = {
  CORE: "Çekirdek",
  MINIBAR: "Minibar",
  QR_MENU: "QR Menü",
  QR_ORDER: "QR Sipariş",
  ROOM_SERVICE: "Oda Servisi",
};

async function moduleOn(hotelId: string, moduleKey: ModuleKey): Promise<boolean> {
  if (moduleKey === "CORE") return true;
  const row = await prisma.hotelModule.findUnique({
    where: { hotelId_moduleKey: { hotelId, moduleKey } },
    select: { enabled: true },
  });
  return row?.enabled === true;
}

/** `R` → FULL; selfService with `V` only → SELF; otherwise no access. */
async function modeIn(ctx: Ctx, def: ReportDef, hotelId: string): Promise<Mode | null> {
  if (await can(ctx, def.screenCode, "R", hotelId)) return "FULL";
  if (def.selfService && (await can(ctx, def.screenCode, "V", hotelId))) return "SELF";
  return null;
}

/** Same record as `assertCan`'s denial (YETKISIZ_DENEME against the session hotel), then FORBIDDEN. */
async function deny(ctx: Ctx, def: ReportDef, hotelId: string | undefined, reason: string): Promise<never> {
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: "AppScreen",
      entityId: def.screenCode,
      after: { action: "R", report: def.key, reason, ...(hotelId ? { hotelId } : {}) },
    });
  } catch (error) {
    console.error("resolveScope: YETKISIZ_DENEME denetim kaydı yazılamadı", { userId: ctx.user.id, error });
  }
  throw new DomainError("FORBIDDEN", "Bu rapor için yetkiniz yok");
}

function parseRequest(raw: unknown): ParsedReportRequest {
  try {
    return reportRequestSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) throw fromZod(err);
    throw err;
  }
}

/**
 * Authorises and normalises one report request. Per selected hotel, in this order: inside the
 * session's hotel scope (else FORBIDDEN + audit), the report's module enabled there (else
 * NOT_FOUND), `R` on `def.screenCode` — or `V` for selfService reports — (else FORBIDDEN + audit).
 * OUTLET/MUTFAK sessions may run only outletScoped reports and are pinned to their session outlet.
 * Dates: business days, closed, ≤ MAX_RANGE_DAYS (VALIDATION).
 */
export async function resolveScope(ctx: Ctx, def: ReportDef, raw: unknown, limit: number): Promise<ReportScope> {
  const req = parseRequest(raw);
  const outletSession = isOutletSession(ctx);
  if (outletSession && !def.outletScoped) await deny(ctx, def, undefined, "outlet-oturumu");

  let self = false;
  for (const hotelId of req.hotelIds) {
    if (!ctx.hotelIds.includes(hotelId)) await deny(ctx, def, hotelId, "kapsam-disi-otel");
    if (!(await moduleOn(hotelId, def.moduleKey))) {
      const message = `Rapor bu otelde kullanılamıyor: ${MODULE_LABEL[def.moduleKey]} modülü kapalı`;
      throw new DomainError("NOT_FOUND", message, { fieldErrors: { hotelIds: [message] } });
    }
    const mode = await modeIn(ctx, def, hotelId);
    if (!mode) await deny(ctx, def, hotelId, "yetki-yok");
    if (mode === "SELF") self = true;
  }

  let from: string;
  let to: string;
  if (def.dateMode === "range") {
    if (!req.from || !req.to) {
      throw new DomainError("VALIDATION", "Başlangıç ve bitiş tarihi gerekli", {
        fieldErrors: { ...(req.from ? {} : { from: ["Gerekli"] }), ...(req.to ? {} : { to: ["Gerekli"] }) },
      });
    }
    [from, to] = [req.from, req.to];
  } else if (def.dateMode === "asOf") {
    from = to = req.to ?? req.from ?? today();
  } else {
    from = to = today();
  }
  const range = dayRange(from, to);

  let outletId: string | undefined;
  if (outletSession) {
    // The requested outlet is ignored: an outlet role only ever sees its own outlet.
    outletId = ctx.session.outletId;
    if (!outletId) await deny(ctx, def, undefined, "oturum-outleti-yok");
  } else if (def.outletScoped && req.outletId) {
    const outlet = await prisma.outlet.findUnique({ where: { id: req.outletId }, select: { hotelId: true } });
    if (!outlet || !req.hotelIds.includes(outlet.hotelId)) {
      throw new DomainError("VALIDATION", "Outlet seçili otellere ait değil", {
        fieldErrors: { outletId: ["Outlet seçili otellere ait değil"] },
      });
    }
    outletId = req.outletId;
  }

  return {
    hotelIds: req.hotelIds,
    from,
    to,
    ...range,
    ...(outletId ? { outletId } : {}),
    ...(self ? { selfUserId: ctx.user.id } : {}),
    limit,
  };
}

/**
 * Reports the caller may run, with the hotels (of `hotelId`, or of the whole session scope) where
 * each is runnable. A report without such a hotel is left out; OUTLET/MUTFAK sessions see only
 * outletScoped reports. `mode` is SELF when any of those hotels grants only self-service.
 */
export async function listReports(ctx: Ctx, hotelId?: string): Promise<ReportCatalogItem[]> {
  const candidates = hotelId ? ctx.hotelIds.filter((h) => h === hotelId) : ctx.hotelIds;
  const outletSession = isOutletSession(ctx);
  const items: ReportCatalogItem[] = [];
  for (const def of allReports()) {
    if (outletSession && !def.outletScoped) continue;
    const hotelIds: string[] = [];
    let self = false;
    for (const h of candidates) {
      if (!(await moduleOn(h, def.moduleKey))) continue;
      const mode = await modeIn(ctx, def, h);
      if (!mode) continue;
      hotelIds.push(h);
      if (mode === "SELF") self = true;
    }
    if (hotelIds.length === 0) continue;
    items.push({
      key: def.key,
      group: def.group,
      title: def.title,
      description: def.description,
      mode: self ? "SELF" : "FULL",
      dateMode: def.dateMode,
      outletScoped: def.outletScoped === true,
      paramFields: def.paramFields,
      hotelIds,
    });
  }
  return items;
}
