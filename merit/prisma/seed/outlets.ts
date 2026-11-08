import type { OutletArea, OutletType } from "@/generated/prisma/client";

export type SeedOutlet = {
  hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM";
  name: string;
  type: OutletType;
  areas: { type: OutletArea; name: string; tableCount: number }[];
};

/** QR-service and A La Carte points for the Merit Royal complex. */
export const SEED_OUTLETS: SeedOutlet[] = [
  { hotelCode: "DIAMOND", name: "Diamond 24/7 Lobby Lounge", type: "BAR", areas: [{ type: "KAPALI", name: "Lobi", tableCount: 8 }] },
  { hotelCode: "DIAMOND", name: "Diamond Lagoon Pool Bar & Deck", type: "HAVUZ", areas: [{ type: "ACIK", name: "Lagün havuz terası", tableCount: 24 }] },
  { hotelCode: "DIAMOND", name: "Diamond Royal Tea & Patisserie", type: "SALON", areas: [{ type: "KAPALI", name: "Pastane", tableCount: 10 }] },
  { hotelCode: "DIAMOND", name: "Diamond Exclusive Whiskey House", type: "BAR", areas: [{ type: "KAPALI", name: "Whiskey House", tableCount: 6 }] },
  { hotelCode: "DIAMOND", name: "Shisha & Sunset Terrace", type: "BAHCE", areas: [{ type: "ACIK", name: "Sunset Terrace", tableCount: 12 }] },
  { hotelCode: "DIAMOND", name: "The Steakhouse", type: "SALON", areas: [{ type: "KAPALI", name: "Ana Salon", tableCount: 14 }] },

  { hotelCode: "ROYAL", name: "Captain’s Lounge Bar", type: "BAR", areas: [{ type: "KAPALI", name: "Lounge", tableCount: 8 }] },
  { hotelCode: "ROYAL", name: "Dionysos Wine House", type: "SALON", areas: [{ type: "KAPALI", name: "Şarap evi", tableCount: 6 }] },
  { hotelCode: "ROYAL", name: "Vienna Cafe", type: "SALON", areas: [{ type: "KAPALI", name: "Kafe", tableCount: 12 }] },
  { hotelCode: "ROYAL", name: "Royal Sea View Pool Bar", type: "HAVUZ", areas: [{ type: "ACIK", name: "Deniz havuzu", tableCount: 18 }] },
  { hotelCode: "ROYAL", name: "Beach Bar", type: "SAHIL", areas: [{ type: "ACIK", name: "Sahil & İskele", tableCount: 16 }] },
  { hotelCode: "ROYAL", name: "Blue Sea Alakart", type: "SALON", areas: [{ type: "ACIK", name: "Sahil Teras", tableCount: 16 }] },
  { hotelCode: "ROYAL", name: "Royal Mandarin", type: "SALON", areas: [{ type: "KAPALI", name: "Ana Salon", tableCount: 14 }] },
  { hotelCode: "ROYAL", name: "Bella Merit", type: "SALON", areas: [{ type: "KAPALI", name: "Ana Salon", tableCount: 14 }] },

  { hotelCode: "PREMIUM", name: "Premium Lobby & Atrium Bar", type: "BAR", areas: [{ type: "KAPALI", name: "Atrium", tableCount: 10 }] },
  { hotelCode: "PREMIUM", name: "Premium Lagoon & Kids Pool Bar", type: "HAVUZ", areas: [{ type: "ACIK", name: "Lagün ve çocuk havuzu", tableCount: 20 }] },
  { hotelCode: "PREMIUM", name: "Merit Premium Cafe Verde", type: "SALON", areas: [{ type: "KAPALI", name: "Kafe & Teras", tableCount: 14 }] },
];
