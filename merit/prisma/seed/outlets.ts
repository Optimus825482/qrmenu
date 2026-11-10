import type { OutletArea, OutletType } from "@/generated/prisma/client";

export type SeedOutlet = {
  hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM";
  name: string;
  type: OutletType;
  areas: { type: OutletArea; name: string; tableCount: number }[];
};

/**
 * QR-menu service points of the Merit Royal complex (Kasım 2026 kapsamı): bars, lounges, cafes and pool/beach
 * bars only. The à la carte restaurants are deliberately not here. Names follow the hotel's own menu documents
 * and merithotels.com.
 */
export const SEED_OUTLETS: SeedOutlet[] = [
  { hotelCode: "DIAMOND", name: "Diamond Lobby Bar", type: "BAR", areas: [{ type: "KAPALI", name: "Lobi", tableCount: 8 }] },
  { hotelCode: "DIAMOND", name: "Diamond Pool Bar", type: "HAVUZ", areas: [{ type: "ACIK", name: "Havuz terası", tableCount: 24 }] },
  { hotelCode: "DIAMOND", name: "Tea Lounge", type: "SALON", areas: [{ type: "KAPALI", name: "Pastane", tableCount: 10 }] },
  { hotelCode: "DIAMOND", name: "Whiskey Lounge", type: "BAR", areas: [{ type: "KAPALI", name: "Whiskey House", tableCount: 6 }] },

  { hotelCode: "ROYAL", name: "Royal Lobby Bar", type: "BAR", areas: [{ type: "KAPALI", name: "Lounge", tableCount: 8 }] },
  { hotelCode: "ROYAL", name: "Blue Sea Beach Bar", type: "SAHIL", areas: [{ type: "ACIK", name: "Sahil & İskele", tableCount: 16 }] },
  { hotelCode: "ROYAL", name: "The Roof Garden", type: "BAHCE", areas: [{ type: "ACIK", name: "Teras", tableCount: 12 }] },

  { hotelCode: "PREMIUM", name: "Premium Lobby Bar", type: "BAR", areas: [{ type: "KAPALI", name: "Atrium", tableCount: 10 }] },
  { hotelCode: "PREMIUM", name: "Premium Pool Bar", type: "HAVUZ", areas: [{ type: "ACIK", name: "Havuz terası", tableCount: 20 }] },
  { hotelCode: "PREMIUM", name: "Cafe Verde", type: "SALON", areas: [{ type: "KAPALI", name: "Kafe & Teras", tableCount: 14 }] },
];

/**
 * Outlets that kept their place but got the hotel's own name. Renamed in place so the outlet id, its tables and
 * the table QR tokens survive.
 */
export const RENAMED_OUTLETS: Array<{
  hotelCode: SeedOutlet["hotelCode"];
  from: string;
  to: string;
  /** Area renamed together with the outlet: [old, new]. */
  area?: [string, string];
}> = [
  { hotelCode: "DIAMOND", from: "Diamond 24/7 Lobby Lounge", to: "Diamond Lobby Bar" },
  { hotelCode: "DIAMOND", from: "Diamond Lagoon Pool Bar & Deck", to: "Diamond Pool Bar", area: ["Lagün havuz terası", "Havuz terası"] },
  { hotelCode: "DIAMOND", from: "Diamond Royal Tea & Patisserie", to: "Tea Lounge" },
  { hotelCode: "DIAMOND", from: "Diamond Exclusive Whiskey House", to: "Whiskey Lounge" },
  { hotelCode: "ROYAL", from: "Captain’s Lounge Bar", to: "Royal Lobby Bar" },
  { hotelCode: "ROYAL", from: "Beach Bar", to: "Blue Sea Beach Bar" },
  { hotelCode: "PREMIUM", from: "Premium Lobby & Atrium Bar", to: "Premium Lobby Bar" },
  { hotelCode: "PREMIUM", from: "Premium Lagoon & Kids Pool Bar", to: "Premium Pool Bar", area: ["Lagün ve çocuk havuzu", "Havuz terası"] },
  { hotelCode: "PREMIUM", from: "Merit Premium Cafe Verde", to: "Cafe Verde" },
];
