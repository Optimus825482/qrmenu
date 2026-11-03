import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { GuideProvider } from "@/components/guide/GuideProvider";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { loadGuideState } from "@/modules/core/server/guideState";

export const dynamic = "force-dynamic";

/** Erişimim lives outside every module layout: it needs a session but no screen permission. */
export default async function ErisimimLayout({ children }: { children: ReactNode }) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      redirect(`/giris?next=${encodeURIComponent("/erisimim")}`);
    }
    throw error;
  }
  const { summary, prefs, welcomeOk } = await loadGuideState(ctx);
  const actions = Object.fromEntries(
    summary.modules.flatMap((m) => m.screens.map((s) => [s.code, s.actions] as const)),
  );
  return (
    <GuideProvider value={{ actionsByScreen: actions, seen: prefs.seen, welcomeOk }}>{children}</GuideProvider>
  );
}
