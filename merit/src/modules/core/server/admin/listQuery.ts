import { z } from "zod";

/*
 * List input and output shapes shared by the admin services and the grid. Client-safe on purpose
 * (zod only): the UI imports this file, never crud.ts, which pulls in Prisma and pg.
 */

export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** `field` becomes an ORDER BY key, so only identifier-like names (dots allow relations) pass. */
const sortSchema = z.object({
  field: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z][A-Za-z0-9_.]*$/, "Geçersiz sıralama alanı"),
  dir: z.enum(["asc", "desc"]),
});

export const listQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined)
    .optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.literal(PAGE_SIZES).default(20),
  sort: sortSchema.optional(),
});

export type ListQuery = z.output<typeof listQuerySchema>;
/** What a caller may send: the defaults are filled in by `listQuerySchema`. */
export type ListQueryInput = z.input<typeof listQuerySchema>;
export type SortSpec = NonNullable<ListQuery["sort"]>;

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

/** Prisma `skip`/`take` of a query. */
export function pageArgs(query: Pick<ListQuery, "page" | "pageSize">): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function toPage<T>(items: T[], total: number, query: ListQuery): Page<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
