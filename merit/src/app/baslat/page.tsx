import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { resolveLanding } from "@/modules/core/server/landing";

export const dynamic = "force-dynamic";

/** Role-based landing: every successful login and every "home" link goes through here. */
export default async function BaslatPage() {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      redirect(`/giris?next=${encodeURIComponent("/baslat")}`);
    }
    throw error;
  }
  const landing = await resolveLanding(ctx);
  redirect(landing.path);
}
