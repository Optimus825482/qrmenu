import { redirect } from "next/navigation";
import { currentUser, permits } from "@/app/(admin)/admin/guard";
import { YaziciKuyrugu } from "./YaziciKuyrugu";
import { denyScreen } from "@/modules/minibar/server/pageGuard";

export const dynamic = "force-dynamic";

/**
 * Fiş Yazıcı Kuyruğu (QS-FIS) of the session hotel: today's print jobs, reprints and test
 * receipts. Runs inside the POS shell (UX T6).
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <YaziciKuyrugu hotelId={ctx.session.hotelId} canTestPrint={canTestPrint} canReprint={canReprint} />
    </div>
  );
}
