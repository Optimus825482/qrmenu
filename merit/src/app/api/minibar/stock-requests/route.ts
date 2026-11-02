import { z } from "zod";
import { handle, parseBody, parseQuery } from "@/modules/minibar/server/apiAuthHelper";
import { createStockRequest, listRequests } from "@/modules/minibar/server/stockRequests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["BEKLEMEDE", "ONAYLANDI", "TESLIM_EDILDI", "REDDEDILDI", "IPTAL"] as const;

const querySchema = z.object({
  /** comma separated, e.g. `BEKLEMEDE,ONAYLANDI` */
  status: z
    .string()
    .max(100)
    .optional()
    .transform((v) => (v ? v.split(",").filter(Boolean) : undefined))
    .pipe(z.array(z.enum(STATUSES)).optional()),
  mine: z
    .enum(["1", "true", "0", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "1" || v === "true")),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  return handle(async (ctx) => listRequests(ctx, parseQuery(new URL(request.url).searchParams, querySchema)));
}

// Field validation (and its Turkish messages) lives in the service.
const bodySchema = z.object({}).passthrough();

export async function POST(request: Request) {
  return handle(async (ctx) => {
    const body = await parseBody(request, bodySchema);
    return createStockRequest(ctx, body as Parameters<typeof createStockRequest>[1]);
  });
}
