"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";
import type { GuestOrderView } from "../../server/guestOrder";

type Step = "GONDERILDI" | "TEYIT_BEKLIYOR" | "ONAYLANDI" | "YOLDA" | "TESLIM_EDILDI";

/** Room-service order progress. HAZIR (kitchen done, not yet on its way) stays on the "being prepared" step. */
const STEP_OF: Record<string, Step> = {
  GONDERILDI: "GONDERILDI",
  TEYIT_BEKLIYOR: "TEYIT_BEKLIYOR",
  ONAYLANDI: "ONAYLANDI",
  HAZIR: "ONAYLANDI",
  YOLDA: "YOLDA",
  TESLIM_EDILDI: "TESLIM_EDILDI",
};
/** While the order is on its way to the room the guest is told how to change or cancel it: by phone. */
const OPEN_STATUSES = new Set(["GONDERILDI", "TEYIT_BEKLIYOR", "ONAYLANDI", "HAZIR", "YOLDA"]);
const ETA_STATUSES = new Set(["ONAYLANDI", "HAZIR", "YOLDA"]);

/**
 * Progress part of a room-service order: steps, hints and estimate. The guest cannot cancel here; a note asks
 * them to call Room Service from the room phone (staff cancel with a written reason).
 */
export function RoomOrderStatus({ order }: { token: string; order: GuestOrderView }) {
  const t = useTranslations("guest");
  const status = order.status;
  const steps: Step[] =
    order.roomService?.confirmRequired || status === "TEYIT_BEKLIYOR"
      ? ["GONDERILDI", "TEYIT_BEKLIYOR", "ONAYLANDI", "YOLDA", "TESLIM_EDILDI"]
      : ["GONDERILDI", "ONAYLANDI", "YOLDA", "TESLIM_EDILDI"];

  if (status === "IPTAL" || status === "REDDEDILDI") {
    return (
      <div className="g-banner g-banner-warn" role="status" data-status={status}>
        <strong>{status === "IPTAL" ? t("rs.order.cancelled") : t("order.rejected")}</strong>
        {/* The staff reason is internal and Turkish; the guest gets a translated pointer instead. */}
        <p>{t("rs.order.cancelledHint")}</p>
      </div>
    );
  }

  const current = steps.indexOf(STEP_OF[status] ?? "GONDERILDI");
  return (
    <>
      {status === "TEYIT_BEKLIYOR" ? <p className="g-detail">{t("rs.order.confirmHint")}</p> : null}
      {status === "GONDERILDI" ? <p className="g-detail">{t("order.thanks")}</p> : null}
      {status === "TESLIM_EDILDI" ? <p className="g-detail">{t("order.thanks")}</p> : null}
      <ol className="g-steps">
        {steps.map((step, index) => (
          <li
            key={step}
            data-state={index < current ? "done" : index === current ? "current" : "todo"}
            aria-current={index === current ? "step" : undefined}
          >
            <span className="g-step-dot" aria-hidden="true">
              {index <= current ? <Icon name="check" size={16} /> : index + 1}
            </span>
            <span>{step === "GONDERILDI" ? t("order.status.GONDERILDI") : t(`rs.order.status.${step}`)}</span>
          </li>
        ))}
      </ol>
      {ETA_STATUSES.has(status) && order.roomService ? (
        <p className="g-detail">{t("rs.order.eta", { min: order.roomService.slaMinutes })}</p>
      ) : null}
      {OPEN_STATUSES.has(status) ? (
        <p className="g-detail" data-testid="rs-cancel-by-phone">
          {t("rs.order.cancelByPhone")}
        </p>
      ) : null}
    </>
  );
}
