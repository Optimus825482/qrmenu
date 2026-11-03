import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { visibleScreens } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { resolveLanding } from "@/modules/core/server/landing";
import { loadGuideState } from "@/modules/core/server/guideState";
import { allowedShells, parseShellQuery } from "@/shell/resolveShell";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

/**
 * Role-based landing: every successful login and every "home" link goes through here. The installed
 * apps start here too (`?kabuk=personel|pos`, `?ekran=kds`): the requested shell only steers the landing
 * screen, and only when the role may use that shell (the server still enforces every screen's permission).
 */
export default async function BaslatPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  let ctx;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      const params = toParams(raw);
      const qs = params.toString();
      redirect(`/giris?next=${encodeURIComponent(qs ? `/baslat?${qs}` : "/baslat")}`);
    }
    throw error;
  }
  const visible = await visibleScreens(ctx);
  const canUsePos = visible.includes("QS-KAS") || visible.includes("QS-KDS");
  const requested = parseShellQuery(toParams(raw));
  const shell = requested && allowedShells(ctx.user.roleKind, canUsePos).includes(requested) ? requested : undefined;
  const wantsKitchen = shell === "pos" && toParams(raw).get("ekran") === "kds" && visible.includes("QS-KDS");
  const landing = await resolveLanding(ctx, shell ? { shell } : undefined);
  const path = wantsKitchen ? "/kds" : landing.path;
  // First login or a changed permission set: the access summary is shown (and acknowledged) first.
  // The desktop (/admin) shows it as a window itself, so the gate does not apply there.
  if (path !== "/admin") {
    const { welcomeOk } = await loadGuideState(ctx);
    if (!welcomeOk) redirect("/erisimim?hos-geldin=1");
  }
  redirect(path);
}
