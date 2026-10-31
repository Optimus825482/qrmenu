import { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { type Action, assertCan } from "@/lib/rbac";

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

export type AdminTxOptions = { screen: string; action: Action; hotelId?: string };

/**
 * Authorises (`assertCan` audits a denial), then runs `fn` in one database transaction and returns
 * its value. Audit rows and `publishDefinition` written through `tx` commit or roll back with it.
 */
export async function withAdminTx<T>(
  ctx: Ctx,
  options: AdminTxOptions,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  await assertCan(ctx, options.screen, options.action, options.hotelId);
  return prisma.$transaction(fn);
}

/** Prisma error codes that mean "other rows are in the way": unique, foreign key, required relation. */
const CONFLICT_CODES = new Set(["P2002", "P2003", "P2014"]);

/**
 * Turns a constraint violation into a Turkish `CONFLICT` with the caller's message; any other
 * error is rethrown untouched. Use in a `catch`: `catch (e) { conflictFromPrisma(e, "...") }`.
 */
export function conflictFromPrisma(err: unknown, message: string): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && CONFLICT_CODES.has(err.code)) {
    throw new DomainError("CONFLICT", message);
  }
  throw err;
}

export type DefinitionChange = {
  /** Omit for system-wide entities (hotels, roles). */
  hotelId?: string;
  entity: string;
  id: string;
  op: "create" | "update" | "delete";
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
      roleKinds: ["SISTEM", "YONETIM"],
      payload: { entity: change.entity, id: change.id, op: change.op },
    },
    tx,
  );
}
