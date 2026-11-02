import type { ModuleKey } from "@/generated/prisma/client";

export interface HotelDef {
  code: string;
  name: string;
}

export const HOTELS: HotelDef[] = [
  { code: "DIAMOND", name: "Merit Royal Diamond" },
  { code: "ROYAL", name: "Merit Royal" },
  { code: "PREMIUM", name: "Merit Royal Premium" },
];

/** Modules enabled for every seeded hotel. CORE is implicit and has no HotelModule row. */
export const HOTEL_MODULES: ModuleKey[] = ["MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"];

/** Hotel codes that demo data (SEED_DEMO=true) is scoped to. */
export const DEMO_HOTEL_CODES = HOTELS.map((hotel) => hotel.code);
