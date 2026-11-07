import { headers } from "next/headers";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/locales";
import { DomainError } from "@/lib/result";
import { guestMeta } from "@/modules/menu/server/guestToken";
import { OrderStatus } from "@/modules/menu/ui/guest/OrderStatus";
import { guestOrder } from "@/modules/order/server/guestOrder";
import { roomOrder } from "@/modules/order/server/roomService/roomOrder";
import { getGuestTarget } from "../../guestTarget";

export const dynamic = "force-dynamic";

/**
 * One order's status, rendered on the server (a reload shows the same state) and kept live by the
 * client component. Works while ordering is switched off: only the table or room token matters.
 */
export default async function OrderStatusPage({ params }: { params: Promise<{ token: string; orderId: string }> }) {
  const { token, orderId } = await params;
  const target = await getGuestTarget(token);
  if (target.kind !== "TABLE" && target.kind !== "ROOM") return null; // the layout already shows the unavailable page

  const [locale, t] = await Promise.all([getLocale(), getTranslations("guest")]);
  // A room token only ever reads orders of its own room (another room's order is "not found").
  const read = target.kind === "ROOM" ? roomOrder.get : guestOrder.get;
  const order = await read(token, orderId, guestMeta(await headers())).catch((error: unknown) => {
    if (error instanceof DomainError) return null;
    throw error;
  });
  if (!order) {
    return (
      <main className="g-status">
        <p className="g-empty">{t("selections.notFound")}</p>
        <Link className="g-button" href={`/q/${encodeURIComponent(token)}`}>
          {t("selections.backToMenu")}
        </Link>
      </main>
    );
  }
  return <OrderStatus token={token} locale={locale as Locale} order={order} />;
}
