import { NextResponse } from "next/server";
import { guestResult } from "@/lib/guest-api";
import { isLocale } from "@/lib/i18n/locales";
import { clientIp } from "@/lib/rate-limit";
import { DomainError, fail } from "@/lib/result";
import { createGuestRequest, guestRequestStatus } from "@/modules/mybar/server/guestRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

/** Guest MyBar submission. The room QR token is the only credential; hotel and room never come from the body. */
/** Gövdeyi en çok `max` bayt okur; aşılırsa okuyucuyu iptal edip `null` döner. */
async function readBodyCapped(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const declared = Number(request.headers.get("content-length") ?? "0");
  const tooLarge = () =>
    NextResponse.json(fail("VALIDATION", "İstek çok büyük"), { status: 413, headers: { "Cache-Control": "no-store" } });
  if (declared > MAX_BODY_BYTES) return tooLarge();
  // Gövde akış olarak okunur; sınır aşılır aşılmaz okuma iptal edilir (Content-Length güvenilmez).
  const text = await readBodyCapped(request, MAX_BODY_BYTES);
  if (text === null) return tooLarge();

  return guestResult(async () => {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new DomainError("VALIDATION", "Geçersiz istek gövdesi");
    }
    const { idempotencyKey, locale, items, note } = body as Record<string, unknown>;
    return createGuestRequest({
      token,
      idempotencyKey: idempotencyKey as string,
      locale: locale as never,
      items: items as never,
      note: note as never,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    });
  });
}

/** Today's request state of the room (BEKLIYOR, GORULDU, KARSILANDI, IPTAL), without staff names. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lang = new URL(request.url).searchParams.get("locale");
  return guestResult(() =>
    guestRequestStatus({
      token,
      locale: isLocale(lang) ? lang : "tr",
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent") ?? "",
    }),
  );
}
