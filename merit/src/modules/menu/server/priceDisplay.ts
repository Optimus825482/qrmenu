import type { PriceDisplay } from "@/generated/prisma/client";
import { getSetting } from "@/lib/settings";

/** outlet override, else the hotel/system `price.display` setting (default HIDE). */
export async function resolvePriceDisplay(outlet: {
  hotelId: string;
  priceDisplay: PriceDisplay;
}): Promise<"SHOW" | "HIDE"> {
  if (outlet.priceDisplay !== "INHERIT") return outlet.priceDisplay;
  return getSetting("price.display", outlet.hotelId);
}

export function resolveCurrency(hotelId: string): Promise<string> {
  return getSetting("price.currency", hotelId);
}
