import { askReason } from "@/components/ui/reason";

/** The DND note holds 200 characters and starts with "MMD: ". */
const MAX = 190;

/** "Diğer sebep": the attendant types why the guest is not available. `null` when they give up. */
export async function askMmdReason(roomNumber?: string): Promise<string | null> {
  const reason = await askReason({
    title: roomNumber ? `MMD sebebi · Oda ${roomNumber}` : "MMD sebebi",
    message: "Listede olmayan sebebi kendi cümlenizle yazın.",
    reasons: [],
    minLength: 5,
    confirmLabel: "MMD Kaydet",
  });
  return reason ? reason.slice(0, MAX) : null;
}
