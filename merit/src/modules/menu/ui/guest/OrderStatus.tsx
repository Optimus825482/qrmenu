"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { GuestOrderView } from "@/modules/order/server/guestOrder";
import { priceFormatter } from "./priceFormat";
import { useGuestEvents } from "./useGuestEvents";
import { Icon } from "@/components/icons/Icon";
import { RoomOrderStatus } from "@/modules/order/ui/guest/RoomOrderStatus";

const STEPS = ["GONDERILDI", "ONAYLANDI", "HAZIR", "SERVIS_EDILDI"] as const;
type Step = (typeof STEPS)[number];

/** Status page of one order: step indicator, items, and live refresh when the order changes. */
export function OrderStatus({ token, locale, order }: { token: string; locale: Locale; order: GuestOrderView }) {
  const t = useTranslations("guest");
  const router = useRouter();
  const orderIds = useMemo(() => [order.orderId], [order.orderId]);
  const { connected } = useGuestEvents(
    token,
    orderIds,
    useCallback(
      (event) => {
        if (event.type.startsWith("order.")) router.refresh();
      },
      [router],
    ),
  );
  const format = priceFormatter(locale, order.currency);
  const stopped = order.status === "REDDEDILDI" || order.status === "IPTAL";
  const room = order.kind === "ODA_SERVISI";
  const current = STEPS.indexOf(order.status as Step);

  return (
    <main className="g-status">
      {!connected ? (
        <p className="g-banner g-banner-warn" role="status">
          {t("common.offline")}
        </p>
      ) : null}
      <h2>{t("order.number", { no: `#${order.orderNo}` })}</h2>
      {room ? <RoomOrderStatus token={token} order={order} /> : null}
      {!room && order.status === "GONDERILDI" ? <p className="g-detail">{t("order.thanks")}</p> : null}

      {room ? null : stopped ? (
        <div className="g-banner g-banner-warn" role="status" data-status={order.status}>
          <strong>{order.status === "REDDEDILDI" ? t("order.rejected") : t("order.status.IPTAL")}</strong>
          {order.rejectReason ? <p>{t("selections.reason", { reason: order.rejectReason })}</p> : null}
        </div>
      ) : (
        <ol className="g-steps">
          {STEPS.map((step, index) => (
            <li
              key={step}
              data-state={index < current ? "done" : index === current ? "current" : "todo"}
              aria-current={index === current ? "step" : undefined}
            >
              <span className="g-step-dot" aria-hidden="true">
                {index <= current ? <Icon name="check" size={16} /> : index + 1}
              </span>
              <span>{t(`order.status.${step}`)}</span>
            </li>
          ))}
        </ol>
      )}

      <section aria-label={t("selections.items")}>
        <h3>{t("selections.items")}</h3>
        <ul className="g-lines">
          {order.items.map((item, index) => (
            <li key={index} className="g-line">
              <div className="g-line-head">
                <span className="g-name">
                  {item.qty} × {item.name}
                </span>
                {order.pricesShown && item.lineTotal ? <span className="g-price">{format(item.lineTotal)}</span> : null}
              </div>
              {item.note ? <p className="g-detail">{item.note}</p> : null}
            </li>
          ))}
        </ul>
        {order.pricesShown && order.subtotal ? (
          <p className="g-total">
            <span>{t("cart.total")}</span> <strong>{format(order.subtotal)}</strong>
          </p>
        ) : null}
      </section>

      <Link className="g-button" href={`/q/${encodeURIComponent(token)}`}>
        {t("selections.backToMenu")}
      </Link>
    </main>
  );
}
