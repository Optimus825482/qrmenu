import { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import type { ZodType } from "zod";
import { DomainError, fromZod } from "@/lib/result";
import { type Action, assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import type { SortSpec } from "./listQuery";

export {
  type ListQuery,
  type ListQueryInput,
  listQuerySchema,
  type Page,
  PAGE_SIZES,
  type PageSize,
  pageArgs,
  type SortSpec,
  toPage,
} from "./listQuery";

/*
 * Shared plumbing of the admin definition services (P1): list paging/search/sort input, the
 * authorise-then-transact wrapper and the realtime notification every write ends with. Server-only:
 * the client talks to it through Server Actions.
 */

export type AdminTxOptions = {
  screen: string;
  action: Action;
  hotelId?: string;
  /** Role codes that may make this system-wide write besides SISTEM roles (they still need the screen permission). */
  delegateRoles?: readonly string[];
};

/**
 * Authorises (`assertCan` audits a denial; no `hotelId` = system-wide, SISTEM roles only), then runs `fn` in one database transaction and returns
 * its value. Audit rows and `publishDefinition` written through `tx` commit or roll back with it.
 */
export async function withAdminTx<T>(
  ctx: Ctx,
  options: AdminTxOptions,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  await assertCan(ctx, options.screen, options.action, options.hotelId);
  // Without a hotel assertCan falls back to the session hotel, so a hotel manager holding the
  // permission would pass it: system-wide writes (hotels, roles...) are reserved for SISTEM roles.
  const delegated = options.delegateRoles?.includes(ctx.user.roleCode) === true;
  if (options.hotelId === undefined && ctx.user.roleKind !== "SISTEM" && !delegated) {
    try {
      await audit(prisma, {
        userId: ctx.user.id,
        hotelId: undefined,
        action: "YETKISIZ_DENEME",
        entity: options.screen,
        after: { action: options.action, scope: "SYSTEM" },
      });
    } catch (error) {
      // A failing audit write must never mask the denial.
      console.error("withAdminTx: YETKISIZ_DENEME denetim kaydı yazılamadı", {
        screen: options.screen,
        error,
      });
    }
    throw new DomainError(
      "FORBIDDEN",
      "Sistem geneli işlemleri yalnızca sistem yöneticisi yapabilir",
    );
  }
  return prisma.$transaction(fn);
}

/** Prisma error codes that mean "other rows are in the way": unique, foreign key, required relation. */
const CONFLICT_CODES = new Set(["P2002", "P2003", "P2014"]);

/**
 * Turns a constraint violation into a Turkish `CONFLICT` with the caller's message; any other
 * error is rethrown untouched. Use in a `catch`: `catch (e) { conflictFromPrisma(e, "...") }`.
 */
export function conflictFromPrisma(err: unknown, message: string): never {
  if (isConflictError(err)) throw new DomainError("CONFLICT", message);
  throw err;
}

const GENERIC_CONFLICT = "Kayıt başka bir kayıtla çakıştığı için işlem tamamlanamadı";

/**
 * Like `conflictFromPrisma`, but only a unique violation (P2002) gets the caller's specific
 * message; other constraint codes (e.g. a foreign key, P2003) get a generic conflict message.
 */
export function uniqueConflictFromPrisma(err: unknown, message: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new DomainError("CONFLICT", message);
  }
  return conflictFromPrisma(err, GENERIC_CONFLICT);
}

/** True for a Prisma constraint violation; lets a caller compute an expensive message only then. */
export function isConflictError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && CONFLICT_CODES.has(err.code);
}

export type DefinitionChange = {
  /** Omit for system-wide entities (hotels, roles). */
  hotelId?: string;
  entity: string;
  id: string;
  op: "create" | "update" | "delete";
  /** Extra payload fields (e.g. `roleId` of a permission change). */
  extra?: Record<string, unknown>;
  /** Deliver to every role kind (default: SISTEM/YONETIM only), e.g. permission changes reach affected users. */
  allRoles?: boolean;
};

/** Tells open admin lists to refresh; delivered after `tx` commits, to SISTEM/YONETIM sessions. */
export async function publishDefinition(
  tx: Prisma.TransactionClient,
  change: DefinitionChange,
): Promise<void> {
  await publish(
    {
      type: "definition.changed",
      hotelId: change.hotelId,
      roleKinds: change.allRoles ? undefined : ["SISTEM", "YONETIM"],
      payload: { ...change.extra, entity: change.entity, id: change.id, op: change.op },
    },
    tx,
  );
}

/**
 * Parses service input with `schema`; a failure becomes a `VALIDATION` DomainError carrying
 * `fieldErrors`, so direct service calls (tests, jobs) fail the same way the Server Actions do.
 */
export function parseInput<T>(schema: ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw fromZod(parsed.error);
  return parsed.data;
}

/**
 * Prisma `orderBy` of a list query: the requested sort when its field is in `allowed` (client
 * field name → Prisma orderBy builder), else `fallback`; `id` breaks ties so paging is stable.
 */
export function orderByFor<O>(
  sort: SortSpec | undefined,
  allowed: Record<string, (dir: "asc" | "desc") => O>,
  fallback: O,
): (O | { id: "asc" })[] {
  const build = sort ? allowed[sort.field] : undefined;
  return [build && sort ? build(sort.dir) : fallback, { id: "asc" }];
}
