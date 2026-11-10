import type { PriceDisplay } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

/** outlet override, else the hotel/system `price.display` setting (default HIDE). */
export async function resolvePriceDisplay(outlet: {
  hotelId: string;
  priceDisplay: PriceDisplay;
}): Promise<"SHOW" | "HIDE"> {
  if (outlet.priceDisplay !== "INHERIT") return outlet.priceDisplay;
  return getSetting("price.display", outlet.hotelId);
}

/** The outlet's own currency (chosen with its price display in the outlet form); EUR for an unknown outlet. */
export async function resolveCurrency(outletId: string): Promise<string> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { currency: true } });
  return outlet?.currency ?? "EUR";
}
