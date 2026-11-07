"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { GuestOrderView } from "../../server/guestOrder";
import { useModalFocusTrap } from "@/modules/menu/ui/guest/useModalFocusTrap";

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
const CANCELLABLE = new Set(["GONDERILDI", "TEYIT_BEKLIYOR"]);
const ETA_STATUSES = new Set(["ONAYLANDI", "HAZIR", "YOLDA"]);

function CancelDialog({ token, orderId, onClose }: { token: string; orderId: string; onClose: () => void }) {
  const t = useTranslations("guest");
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap({ active: true, onClose, initialFocusRef: keepRef, containerRef: dialogRef });

  async function cancel() {
    if (sending) return;
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/q/${encodeURIComponent(token)}/order/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = (await response.json()) as { ok: boolean };
      if (result.ok) {
        onClose();
        router.refresh();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="g-sheet-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="g-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("rs.order.cancel")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="g-sheet-body">
          <p>{t("rs.order.cancelConfirm")}</p>
          {failed ? (
            <p className="g-banner g-banner-warn" role="alert">
              {t("selections.failed")}
            </p>
          ) : null}
          <button ref={keepRef} type="button" className="g-button" onClick={onClose}>
            {t("rs.order.keep")}
          </button>
          <button type="button" className="g-button" onClick={cancel} disabled={sending}>
            {t("rs.order.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Progress part of a room-service order: steps, hints, estimate and the cancel button. */
export function RoomOrderStatus({ token, order }: { token: string; order: GuestOrderView }) {
  const t = useTranslations("guest");
  const [confirming, setConfirming] = useState(false);
  const status = order.status;
  const steps: Step[] =
    order.roomService?.confirmRequired || status === "TEYIT_BEKLIYOR"
      ? ["GONDERILDI", "TEYIT_BEKLIYOR", "ONAYLANDI", "YOLDA", "TESLIM_EDILDI"]
      : ["GONDERILDI", "ONAYLANDI", "YOLDA", "TESLIM_EDILDI"];

  if (status === "IPTAL" || status === "REDDEDILDI") {
    return (
      <div className="g-banner g-banner-warn" role="status" data-status={status}>
        <strong>{status === "IPTAL" ? t("rs.order.cancelled") : t("order.rejected")}</strong>
        {order.rejectReason ? <p>{t("selections.reason", { reason: order.rejectReason })}</p> : null}
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
      {CANCELLABLE.has(status) ? (
        <button type="button" className="g-button" onClick={() => setConfirming(true)}>
          {t("rs.order.cancel")}
        </button>
      ) : null}
      {confirming ? <CancelDialog token={token} orderId={order.orderId} onClose={() => setConfirming(false)} /> : null}
    </>
  );
}
