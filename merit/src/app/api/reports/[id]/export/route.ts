import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { exportLimiter } from "@/modules/reporting/server/exportLimiter";
import { exportReport } from "@/modules/reporting/server/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı");
const querySchema = z.object({
  format: z.enum(["xlsx", "pdf"], { message: "Biçim xlsx veya pdf olmalı" }),
  hotelIds: z
    .string({ message: "Otel seçin" })
    .max(700)
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  from: DAY.optional(),
  to: DAY.optional(),
  outletId: z.string().min(1).max(64).optional(),
});

const error = (message: string, status: number, headers?: HeadersInit) =>
  NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });

/**
 * GET /api/reports/<key>/export?format=xlsx|pdf&hotelIds=a,b&from=yyyy-MM-dd&to=yyyy-MM-dd
 *   [&outletId=…][&p.<param>=…]
 * Session required; scope/permission per hotel via the report engine; EXPORT_RATE_PER_MINUTE per user.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireUser();
    const rate = exportLimiter.hit(ctx.user.id);
    if (!rate.allowed) {
      return error("Çok fazla dışa aktarma isteği; lütfen biraz sonra tekrar deneyin", 429, {
        "Retry-After": String(rate.retryAfterSec),
      });
    }
    const { id } = await params;
    const search = new URL(req.url).searchParams;
    const query = querySchema.parse(Object.fromEntries([...search].filter(([k]) => !k.startsWith("p."))));
    const reportParams: Record<string, string> = {};
    for (const [k, v] of search) if (k.startsWith("p.") && k.length > 2) reportParams[k.slice(2)] = v;

    const { format, ...rest } = query;
    const file = await exportReport(ctx, id, { ...rest, params: reportParams }, format);
    return new Response(new Uint8Array(file.data), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.data.length),
        "Content-Disposition": `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof DomainError) return error(err.message, err.httpStatus);
    if (err instanceof ZodError) return error(err.issues[0]?.message ?? "Geçersiz istek", 400);
    console.error("[reports/export]", err);
    return error("Beklenmeyen bir hata oluştu", 500);
  }
}
