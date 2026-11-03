import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { resolveLanding } from "@/modules/core/server/landing";
import { loadGuideState } from "@/modules/core/server/guideState";

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
  // First login or a changed permission set: the access summary is shown (and acknowledged) first.
  // The desktop (/admin) shows it as a window itself, so the gate does not apply there.
  if (landing.path !== "/admin") {
    const { welcomeOk } = await loadGuideState(ctx);
    if (!welcomeOk) redirect("/erisimim?hos-geldin=1");
  }
  redirect(landing.path);
}
