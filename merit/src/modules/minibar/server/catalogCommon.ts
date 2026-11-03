import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";

/** Screen of the minibar catalogue (product groups, products, setups, room-type assignments). */
export const CATALOG_SCREEN = "MB-TAN";

/** Purchase/sale prices are visible to system and management roles only. */
export function pricesVisible(ctx: Ctx): boolean {
  return ctx.user.roleKind === "SISTEM" || ctx.user.roleKind === "YONETIM";
}

/** Decimal(10,2) value as the "12.50" string the client receives (null stays null). */
export function priceText(value: { toFixed(digits: number): string } | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(2);
}

/**
 * Name comparison key: Turkish lower-casing ("İçecekler" = "içecekler") with dotless ı folded to i,
 * because Turkish lower-casing turns "MINI" into "mını" and people type both spellings.
 */
export const nameKey = (name: string): string => name.trim().toLocaleLowerCase("tr").replaceAll("ı", "i");

/**
 * True when another row already uses `name` (case-insensitive, Turkish aware). The catalogues are
 * small, so the names are compared in memory; a transaction-scoped advisory lock per `scope` makes
 * check-then-insert safe against a concurrent writer (the DB unique index alone is case sensitive).
 */
export async function nameTaken(
  tx: Prisma.TransactionClient,
  scope: "productGroup" | "setup",
  name: string,
  excludeId?: string,
): Promise<boolean> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`minibar.catalog.${scope}.name`}))`;
  const rows: { id: string; name: string }[] =
    scope === "productGroup"
      ? await tx.productGroup.findMany({ select: { id: true, name: true } })
      : await tx.setup.findMany({ select: { id: true, name: true } });
  const key = nameKey(name);
  return rows.some((r) => r.id !== excludeId && nameKey(r.name) === key);
}
