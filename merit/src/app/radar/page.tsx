import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Canlı Radar (CR-RAD) route. The window and the wall mode arrive with radar Tasks 8-11; until then the
 * route only anchors the catalogue path (signed-in users are sent to the desktop, where the screen opens).
 */
export default async function RadarPage() {
  await requireUser();
  redirect("/admin");
}
