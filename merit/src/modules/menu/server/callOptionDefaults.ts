import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export const DEFAULT_CALL_OPTIONS = [
  {
    label: "Peçete istiyorum",
    callType: "GARSON" as const,
    sortOrder: 0,
    translations: {
      en: "Napkins, please",
      de: "Servietten bitte",
      ru: "Салфетки, пожалуйста",
      ar: "مناديل من فضلك",
      fr: "Des serviettes, s'il vous plaît",
      el: "Χαρτοπετσέτες, παρακαλώ",
      it: "Tovaglioli, per favore",
    },
  },
  {
    label: "Sipariş vereceğim",
    callType: "GARSON" as const,
    sortOrder: 1,
    translations: {
      en: "I'd like to order",
      de: "Ich möchte bestellen",
      ru: "Я хочу сделать заказ",
      ar: "أرغب في الطلب",
      fr: "Je voudrais commander",
      el: "Θα ήθελα να παραγγείλω",
      it: "Vorrei ordinare",
    },
  },
  {
    label: "Su istiyorum",
    callType: "GARSON" as const,
    sortOrder: 2,
    translations: {
      en: "Water, please",
      de: "Wasser, bitte",
      ru: "Воды, пожалуйста",
      ar: "ماء من فضلك",
      fr: "De l'eau, s'il vous plaît",
      el: "Νερό, παρακαλώ",
      it: "Acqua, per favore",
    },
  },
  {
    label: "Hesap",
    callType: "HESAP" as const,
    sortOrder: 3,
    translations: {
      en: "The bill, please",
      de: "Die Rechnung, bitte",
      ru: "Счёт, пожалуйста",
      ar: "الحساب من فضلك",
      fr: "L'addition, s'il vous plaît",
      el: "Το λογαριασμό, παρακαλώ",
      it: "Il conto, per favore",
    },
  },
] as const;

/**
 * Adds the default call options if an outlet has none.
 * Idempotent: does nothing if the outlet already has options (even inactive/customized ones).
 */
export async function ensureDefaultCallOptions(
  db: PrismaClient | Prisma.TransactionClient,
  outletId: string,
): Promise<void> {
  const existingCount = await db.outletCallOption.count({ where: { outletId } });
  if (existingCount > 0) return;

  await db.outletCallOption.createMany({
    data: DEFAULT_CALL_OPTIONS.map((opt) => ({
      outletId,
      label: opt.label,
      translations: opt.translations as unknown as Prisma.InputJsonValue,
      callType: opt.callType,
      sortOrder: opt.sortOrder,
      isActive: true,
    })),
  });
}
