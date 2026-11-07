import { Prisma } from "@/generated/prisma/client";
import type { ReportScope } from "@/modules/reporting/server/types";

/** Minutes with one decimal; `null` stays `null`. */
export const min1 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10;

export const money2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : Math.round(v * 100) / 100;

export const hotelIn = (column: string, scope: ReportScope): Prisma.Sql =>
  Prisma.sql`${Prisma.raw(column)} IN (${Prisma.join(scope.hotelIds)})`;

export const outletEq = (column: string, scope: ReportScope): Prisma.Sql =>
  scope.outletId ? Prisma.sql`AND ${Prisma.raw(column)} = ${scope.outletId}` : Prisma.empty;
