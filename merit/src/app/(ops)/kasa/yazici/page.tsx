import { redirect } from "next/navigation";
import { currentUser, permits } from "@/app/(admin)/admin/guard";
import { YaziciKuyrugu } from "./YaziciKuyrugu";
import { denyScreen } from "@/modules/minibar/server/pageGuard";

export const dynamic = "force-dynamic";

/**
 * Fiş Yazıcı Kuyruğu (QS-FIS) of the session hotel: today's print jobs, reprints and test
 * receipts. Plain page for now; Task 11 moves it into the (ops) shell without changing content.
 */
export default async function KasaYaziciPage() {
  const ctx = await currentUser();
  if (!ctx) redirect("/giris?next=%2Fkasa%2Fyazici");
  if (!(await permits(ctx, "QS-FIS", "V"))) denyScreen("QS-FIS");
  const [canTestPrint, canReprint] = await Promise.all([
    permits(ctx, "QS-FIS", "D"),
    permits(ctx, "QS-FIS", "O"),
  ]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-4 p-4">
      <YaziciKuyrugu hotelId={ctx.session.hotelId} canTestPrint={canTestPrint} canReprint={canReprint} />
    </main>
  );
}
