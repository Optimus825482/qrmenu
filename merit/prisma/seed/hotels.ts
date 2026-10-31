import type { ModuleKey } from "@/generated/prisma/client";

export interface HotelDef {
  code: string;
  name: string;
}

export const HOTELS: HotelDef[] = [
  { code: "MRD", name: "Merit Royal Diamond" },
  { code: "MR", name: "Merit Royal" },
  { code: "MRP", name: "Merit Royal Premium" },
];

/** Modules enabled for every seeded hotel. CORE is implicit and has no HotelModule row. */
export const HOTEL_MODULES: ModuleKey[] = ["MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"];

/** The single room-service outlet every hotel gets. */
export const ROOM_SERVICE_OUTLET = {
  name: "Oda Servisi",
  type: "ODA_SERVISI",
  hasMenu: true,
  hasOrdering: true,
  phoneConfirmRequired: false,
} as const;
