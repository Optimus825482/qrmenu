import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";

/**
 * Server-side guard of a staff page: no valid session -> /giris (back to the page afterwards),
 * session without the "view" permission on the screen for the session hotel -> /secim.
 * Used by one layout per route segment, so it runs whenever the segment is entered.
 */
export async function requireScreen(screen: string): Promise<void> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      const path = (await headers()).get("x-merit-current-path") ?? "/kat";
      redirect(`/giris?next=${encodeURIComponent(path)}`);
    }
    throw error;
  }
  if (!(await can(ctx, screen, "V", ctx.session.hotelId))) redirect("/secim");
}
