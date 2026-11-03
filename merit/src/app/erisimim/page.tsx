import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessSummaryView } from "@/components/guide/AccessSummaryView";
import { WelcomeGate } from "@/components/guide/WelcomeGate";
import { requireUser } from "@/lib/auth";
import { loadGuideState } from "@/modules/core/server/guideState";

export const dynamic = "force-dynamic";

/**
 * "Erişimim". With `?hos-geldin=1` (first login or a changed permission set) it is the mandatory
 * single screen: no navigation, one "Anladım" button. Otherwise a plain read-only page.
 */
export default async function ErisimimPage({
  searchParams,
}: {
  searchParams: Promise<{ "hos-geldin"?: string | string[] }>;
}) {
  const ctx = await requireUser();
  const { summary, welcomeOk } = await loadGuideState(ctx);
  const mandatory = (await searchParams)["hos-geldin"] === "1";
  // Already acknowledged (back button, second tab): the mandatory page has nothing left to ask.
  if (mandatory && welcomeOk) redirect("/baslat");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-6" data-mandatory={mandatory ? "" : undefined}>
      <h1 className="text-2xl font-bold text-text">Erişimim</h1>
      <AccessSummaryView summary={summary} mode="self" />
      {mandatory ? (
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface px-4 py-3">
          <WelcomeGate hash={summary.hash} />
        </div>
      ) : (
        <Link
          href="/baslat"
          className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text"
        >
          Geri dön
        </Link>
      )}
    </main>
  );
}
