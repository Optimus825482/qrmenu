import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { randomBytes } from "node:crypto";
import { requireUser, type Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import { type Action, assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import type { UserAuditCtx } from "./minibarDefinitionsService";

export type { UserAuditCtx };

/** Maps any thrown value to a JSON response. Unknown errors are logged and never echoed to the client. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) err = fromZod(err);
  if (err instanceof DomainError) {
    return NextResponse.json(
      {
        error: err.message,
        code: err.code,
        ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
      },
      { status: err.httpStatus },
    );
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2002" || code === "P2003" || code === "P2014") {
    return NextResponse.json(
      { error: "Kayıt başka bir kayıtla çakıştığı için işlem tamamlanamadı", code: "CONFLICT" },
      { status: 409 },
    );
  }
  const errorId = randomBytes(4).toString("hex");
  console.error(`[api/minibar] ${errorId}`, err);
  return NextResponse.json(
    { error: "Beklenmeyen bir hata oluştu", code: "INTERNAL", errorId },
    { status: 500 },
  );
}

/**
 * Wraps a route handler: requireUser() first (401 without a valid session, never a fallback user),
 * then `fn`. DomainError/ZodError become their HTTP status, anything else a generic 500.
 */
export async function handle(fn: (ctx: Ctx) => Promise<unknown>): Promise<Response> {
  try {
    const ctx = await requireUser();
    const data = await fn(ctx);
    return data instanceof Response ? data : NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

/** Reads and validates a JSON body (VALIDATION on malformed JSON or schema mismatch). */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  return parsed.data;
}

/** Validates query-string input. */
export function parseQuery<T>(params: URLSearchParams, schema: ZodType<T>): T {
  const parsed = schema.safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success) throw fromZod(parsed.error);
  return parsed.data;
}

/**
 * Hotel picked by the hotel selector of a list screen: the requested hotel (or the session hotel),
 * authorised against the user's scope and the screen matrix (assertCan rejects hotels outside
 * `ctx.hotelIds`). Entity routes must NOT use this; they derive the hotel from the entity.
 */
export async function selectHotel(
  ctx: Ctx,
  requested: string | null | undefined,
  screen: string,
  action: Action,
): Promise<string> {
  const hotelId = requested || ctx.session.hotelId;
  await assertCan(ctx, screen, action, hotelId);
  return hotelId;
}

/** Hotels the user may pick from (never the whole hotel table). */
export function scopedHotelIds(ctx: Ctx): string[] {
  return ctx.hotelIds;
}

/** Purchase/sale prices are visible to system and management roles only. */
export function canSeePrices(ctx: Ctx): boolean {
  return ctx.user.roleKind === "SISTEM" || ctx.user.roleKind === "YONETIM";
}

const PRICE_KEYS = new Set([
  "purchasePrice",
  "salePrice",
  "price",
  "unitPrice",
  "lineTotal",
  "totalCost",
  "totalAmount",
]);

/** Deep copy of `value` with every price field zeroed (null stays null). No-op when `allowed`. */
export function maskPrices<T>(value: T, allowed: boolean): T {
  if (allowed) return value;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = PRICE_KEYS.has(k) ? (val === null ? null : 0) : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** Audit context of an authenticated request (hotel = the entity's hotel when known). */
export function auditCtxOf(ctx: Ctx, req: Request, hotelId?: string): UserAuditCtx {
  return {
    userId: ctx.user.id,
    hotelId: hotelId ?? ctx.session.hotelId,
    ip: clientIp(req.headers),
  };
}

/** Back-compat helper: strict (401 without a session), no demo fallback. */
export async function getAuditCtxFromRequest(req: Request): Promise<UserAuditCtx> {
  const ctx = await requireUser();
  return auditCtxOf(ctx, req);
}

/**
 * Global catalogue (products, groups, setups) is system-wide: writes need the screen permission AND the
 * SISTEM role. Other roles get FORBIDDEN plus a YETKISIZ_DENEME audit row.
 */
export async function assertCatalogWriter(ctx: Ctx, action: Action): Promise<void> {
  await assertCan(ctx, "MB-TAN", action, ctx.session.hotelId);
  if (ctx.user.roleKind === "SISTEM") return;
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: "AppScreen",
      entityId: "MB-TAN",
      after: { action, reason: "global-catalogue-system-only" },
    });
  } catch (error) {
    console.error("assertCatalogWriter: YETKISIZ_DENEME denetim kaydı yazılamadı", { userId: ctx.user.id, error });
  }
  throw new DomainError("FORBIDDEN", "Bu işlem için yetkiniz yok");
}
