import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { parseInput, withAdminTx } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope, loadNodeScope } from "./menuNodeAccess";

const SCREEN = "QM-MEN";
export const TRANSLATION_LANGS = ["en", "de", "ru", "ar", "fr", "el", "it"] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];

const DEEPL_TARGET: Record<TranslationLang, string> = {
  en: "EN-GB", de: "DE", ru: "RU", ar: "AR", fr: "FR", el: "EL", it: "IT",
};

/** Translate a Turkish menu record into every supported guest language. */
async function deeplTranslate(name: string, detail: string | null): Promise<Record<TranslationLang, { name: string; detail: string | null }>> {
  const key = process.env.DEEPL_AUTH_KEY;
  if (!key) throw new DomainError("VALIDATION", "Otomatik çeviri için DEEPL_AUTH_KEY ayarlanmalı. Menü bilgisi kaydedildi; çeviriler oluşturulmadı.");
  const endpoint = key.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
  const sourceTexts = detail ? [name, detail] : [name];
  const entries = await Promise.all(TRANSLATION_LANGS.map(async (lang) => {
    const body = new URLSearchParams({ source_lang: "TR", target_lang: DEEPL_TARGET[lang] });
    for (const text of sourceTexts) body.append("text", text);
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `DeepL-Auth-Key ${key}`, "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!response.ok) throw new DomainError("VALIDATION", `DeepL ${lang.toUpperCase()} çevirisini oluşturamadı (HTTP ${response.status}). Hiçbir çeviri kaydedilmedi.`);
    const payload: unknown = await response.json();
    const translated = (payload as { translations?: { text?: unknown }[] })?.translations?.map((item) => item.text);
    if (!translated || translated.length !== sourceTexts.length || translated.some((value) => typeof value !== "string" || !value.trim())) {
      throw new DomainError("VALIDATION", `${lang.toUpperCase()} çeviri yanıtı eksik veya geçersiz. Hiçbir çeviri kaydedilmedi.`);
    }
    return [lang, { name: String(translated[0]).trim(), detail: detail ? String(translated[1]).trim() : null }] as const;
  }));
  return Object.fromEntries(entries) as Record<TranslationLang, { name: string; detail: string | null }>;
}

/** Generate complete translations first, then persist all languages as a single operation. */
export async function autoGenerate(ctx: Ctx, nodeId: string): Promise<{ languages: TranslationLang[] }> {
  const scope = await loadNodeScope(nodeId);
  assertOutletScope(ctx, scope.outletId);
  await assertCan(ctx, SCREEN, "D", scope.hotelId);
  const source = await prisma.menuNode.findUnique({ where: { id: nodeId }, select: { name: true, detail: true } });
  if (!source) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
  const translated = await deeplTranslate(source.name, source.detail);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
    assertOutletScope(ctx, scope.outletId);
    for (const lang of TRANSLATION_LANGS) {
      const value = translated[lang];
      await tx.menuNodeTranslation.upsert({
        where: { nodeId_lang: { nodeId, lang } },
        create: { nodeId, lang, name: value.name, detail: value.detail, isVerified: false },
        update: { name: value.name, detail: value.detail, isVerified: false },
      });
      await audit(tx, { userId: ctx.user.id, hotelId: scope.hotelId, action: "MENU_TRANSLATION_SET", entity: "MenuNode", entityId: nodeId, after: { lang, name: value.name, provider: "DeepL", auto: true } });
    }
    await publish({ type: "menu.changed", hotelId: scope.hotelId, outletId: scope.outletId, payload: { nodeId, op: "translation", auto: true } }, tx);
  });
  return { languages: [...TRANSLATION_LANGS] };
}

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
      update: { name: input.name, detail: input.detail, isVerified: true },
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

/** Publish a generated translation only after a user has reviewed it. */
export async function verify(ctx: Ctx, nodeId: string, lang: string): Promise<void> {
  const code = checkLang(lang);
  const scope = await loadNodeScope(nodeId);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId: scope.hotelId }, async (tx) => {
    assertOutletScope(ctx, scope.outletId);
    const found = await tx.menuNodeTranslation.findUnique({ where: { nodeId_lang: { nodeId, lang: code } } });
    if (!found) throw new DomainError("NOT_FOUND", "Çeviri bulunamadı");
    if (found.isVerified) return;
    await tx.menuNodeTranslation.update({ where: { id: found.id }, data: { isVerified: true } });
    await audit(tx, { userId: ctx.user.id, hotelId: scope.hotelId, action: "MENU_TRANSLATION_VERIFY", entity: "MenuNode", entityId: nodeId, after: { lang: code, name: found.name } });
    await publish({ type: "menu.changed", hotelId: scope.hotelId, outletId: scope.outletId, payload: { nodeId, op: "translation", verified: true } }, tx);
  });
}
