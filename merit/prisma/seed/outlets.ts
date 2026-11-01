import type { OutletArea, OutletType } from "@/generated/prisma/client";

export type SeedOutlet = {
  hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM";
  name: string;
  type: OutletType;
  areas: { type: OutletArea; name: string; tableCount: number }[];
};

/** QR-service points from the hotel brief; A La Carte restaurants are intentionally excluded. */
export const SEED_OUTLETS: SeedOutlet[] = [
  { hotelCode: "DIAMOND", name: "Diamond 24/7 Lobby Lounge", type: "BAR", areas: [{ type: "KAPALI", name: "Lobi", tableCount: 8 }] },
  { hotelCode: "DIAMOND", name: "Diamond Lagoon Pool Bar & Deck", type: "HAVUZ", areas: [{ type: "ACIK", name: "Lagün havuz terası", tableCount: 24 }] },
  { hotelCode: "DIAMOND", name: "Diamond Royal Tea & Patisserie", type: "SALON", areas: [{ type: "KAPALI", name: "Pastane", tableCount: 10 }] },
  { hotelCode: "DIAMOND", name: "Diamond Exclusive Whiskey House", type: "BAR", areas: [{ type: "KAPALI", name: "Whiskey House", tableCount: 6 }] },
  { hotelCode: "DIAMOND", name: "Shisha & Sunset Terrace", type: "BAHCE", areas: [{ type: "ACIK", name: "Sunset Terrace", tableCount: 12 }] },
  { hotelCode: "DIAMOND", name: "Diamond Royal Spa & Wellness", type: "SPA", areas: [{ type: "KAPALI", name: "Spa dinlenme alanı", tableCount: 10 }] },

  { hotelCode: "ROYAL", name: "Captain’s Lounge Bar", type: "BAR", areas: [{ type: "KAPALI", name: "Lounge", tableCount: 8 }] },
  { hotelCode: "ROYAL", name: "Dionysos Wine House", type: "SALON", areas: [{ type: "KAPALI", name: "Şarap evi", tableCount: 6 }] },
  { hotelCode: "ROYAL", name: "Vienna Cafe", type: "SALON", areas: [{ type: "KAPALI", name: "Kafe", tableCount: 12 }] },
  { hotelCode: "ROYAL", name: "Royal Sea View Pool Bar", type: "HAVUZ", areas: [{ type: "ACIK", name: "Deniz havuzu", tableCount: 18 }] },
  { hotelCode: "ROYAL", name: "Royal Spa & Hamam Dinlenme", type: "SPA", areas: [{ type: "KAPALI", name: "Spa dinlenme alanı", tableCount: 8 }] },

  { hotelCode: "PREMIUM", name: "Premium Lobby & Atrium Bar", type: "BAR", areas: [{ type: "KAPALI", name: "Atrium", tableCount: 10 }] },
  { hotelCode: "PREMIUM", name: "Meritta Club Park & Aile Bahçesi", type: "BAHCE", areas: [{ type: "ACIK", name: "Aile bahçesi", tableCount: 12 }] },
  { hotelCode: "PREMIUM", name: "Tenis Kortları & Açık Hava Fitness", type: "BAHCE", areas: [{ type: "ACIK", name: "Kort ve fitness alanı", tableCount: 8 }] },
  { hotelCode: "PREMIUM", name: "Premium Lagoon & Kids Pool Bar", type: "HAVUZ", areas: [{ type: "ACIK", name: "Lagün ve çocuk havuzu", tableCount: 20 }] },
];
