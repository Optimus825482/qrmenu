import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { pageHotelCtx } from "./selectedHotel";

/**
 * Server-side guard of a staff page: no valid session -> /giris (back to the page afterwards),
 * session without the "view" permission on the screen for the session hotel -> /yetkisiz (the
 * "Bu ekran sana atanmadı" page).
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
  // The hotel the window shows (`?hotelId=`), else the session's: the permission is checked where the data is.
  const shown = await pageHotelCtx(ctx);
  if (!(await can(shown, screen, "V", shown.session.hotelId))) denyScreen(screen);
}

/** Sends a signed-in user who may not view `code` to the explanation page (never into a loop). */
export function denyScreen(code: string): never {
  redirect(`/yetkisiz?ekran=${encodeURIComponent(code)}`);
}
