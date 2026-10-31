import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { KatHold } from "./KatHold";

/**
 * Floor-role landing (`/kat`) until the P3 floor shell exists. It stays signed in so a forced
 * logout's `session.closed` event can send the tab to /giris.
 */
export default async function KatPage() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof DomainError && err.code === "UNAUTHORIZED") redirect("/giris");
    throw err;
  }
  return <KatHold />;
}
