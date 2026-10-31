import { redirect } from "next/navigation";
import { logoutAction } from "@/modules/core/server/loginAction";

/** Signs out (closes the UserSession, clears the cookie) and returns to the login page. */
export async function GET() {
  await logoutAction();
  redirect("/giris");
}
