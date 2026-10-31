import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { parseInput, withAdminTx } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope } from "./menuNodeAccess";

const SCREEN = "QM-MEN";
export const TRANSLATION_LANGS = ["en", "de", "ru", "ar"] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];

const textSchema = z.object({
  name: z.string("Ad gerekli").trim().min(1, "Ad gerekli").max(120, "Ad en fazla 120 karakter olabilir"),
  detail: z
    .string()
    .trim()
    .max(1000, "Açıklama en fazla 1000 karakter olabilir")
    .nullish()
    .transform((v) => v || null),
});

function checkLang(lang: string): TranslationLang {
  if (lang === "tr") {
    throw new DomainError("VALIDATION", "Türkçe temel kayıttır; çeviri olarak kaydedilemez");
  }
  if (!(TRANSLATION_LANGS as readonly string[]).includes(lang)) {
    throw new DomainError("VALIDATION", "Geçersiz dil");
  }
  return lang as TranslationLang;
}

export async function set(
  ctx: Ctx,
  nodeId: string,
  lang: string,
  raw: { name: string; detail?: string | null },
): Promise<{ lang: string; name: string; detail: string | null }> {
  const code = checkLang(lang);
  const input = parseInput(textSchema, raw);
  const scope = await loadNodeScope(nodeId);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
    assertOutletScope(ctx, scope.outletId);
    const row = await tx.menuNodeTranslation.upsert({
      where: { nodeId_lang: { nodeId, lang: code } },
      create: { nodeId, lang: code, name: input.name, detail: input.detail },
      update: { name: input.name, detail: input.detail },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_TRANSLATION_SET",
      entity: "MenuNode",
      entityId: nodeId,
      after: { lang: code, name: input.name },
    });
    await publish(
      {
        type: "menu.changed",
        hotelId: scope.hotelId,
        outletId: scope.outletId,
        payload: { nodeId, op: "translation" },
      },
      tx,
    );
    return { lang: row.lang, name: row.name, detail: row.detail };
  });
}

export async function remove(ctx: Ctx, nodeId: string, lang: string): Promise<void> {
  const code = checkLang(lang);
  const scope = await loadNodeScope(nodeId);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
    assertOutletScope(ctx, scope.outletId);
    const found = await tx.menuNodeTranslation.findUnique({
      where: { nodeId_lang: { nodeId, lang: code } },
    });
    if (!found) throw new DomainError("NOT_FOUND", "Çeviri bulunamadı");
    await tx.menuNodeTranslation.delete({ where: { id: found.id } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: scope.hotelId,
      action: "MENU_TRANSLATION_REMOVE",
      entity: "MenuNode",
      entityId: nodeId,
      before: { lang: code, name: found.name },
    });
    await publish(
      {
        type: "menu.changed",
        hotelId: scope.hotelId,
        outletId: scope.outletId,
        payload: { nodeId, op: "translation" },
      },
      tx,
    );
  });
}
