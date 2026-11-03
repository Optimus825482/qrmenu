"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons/Icon";
import type { GuestErrorKey } from "./useMybarSubmit";
import type { MybarRequestView, MybarStatusKey } from "./useMybarStatus";

const ICONS: Record<MybarStatusKey, IconName> = {
  BEKLIYOR: "clock",
  GORULDU: "eye",
  KARSILANDI: "check-circle",
  IPTAL: "ban",
};

/** Request status screen: BEKLIYOR, GORULDU, KARSILANDI or IPTAL, live; plus the once-per-day message. */
export function MybarStatus({
  request,
  dailyLimit,
  justSent,
  notice,
  onNew,
}: {
  request: MybarRequestView;
  dailyLimit: boolean;
  /** The request was created from this page a moment ago: the success text leads. */
  justSent: boolean;
  /** A refusal carried over from the form (daily limit reached from another device). */
  notice: GuestErrorKey | null;
  onNew: () => void;
}) {
  const t = useTranslations("mybar");
  const status = request.status;
  const [announce, setAnnounce] = useState("");
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    setAnnounce(t("liveRegion", { status: t(`status.${status}`) }));
  }, [status, t]);

  const canStartNew = status === "IPTAL" || !dailyLimit;
  return (
    <section className="mb-status" data-status={status} aria-labelledby="mb-status-title">
      {notice ? (
        <p className="mb-alert" role="alert">
          {t(notice)}
        </p>
      ) : null}
      {justSent ? (
        <div className="mb-success">
          <h2 className="mb-status-heading">{t("successTitle")}</h2>
          <p className="mb-muted">{t("successDesc")}</p>
        </div>
      ) : null}
      <h2 id="mb-status-title" className="mb-label">
        {t("statusTitle")}
      </h2>
      <div className="mb-status-chip" data-status={status}>
        <Icon name={ICONS[status]} size={28} />
        <div>
          <p className="mb-status-name">{t(`status.${status}`)}</p>
          <p className="mb-muted">{t(`statusDesc.${status}`)}</p>
        </div>
      </div>
      <div className="mb-sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      <h3 className="mb-label">{t("requestedItems")}</h3>
      {request.items.length === 0 ? (
        <p className="mb-muted">{t("noteOnly")}</p>
      ) : (
        <ul className="mb-chips">
          {request.items.map((item, i) => (
            <li key={`${item.name}-${i}`} className="mb-chip">
              <span>
                {item.name}
                <bdi className="mb-chip-qty"> ×{item.qty}</bdi>
              </span>
            </li>
          ))}
        </ul>
      )}

      {dailyLimit && status !== "IPTAL" && !justSent ? (
        <div className="mb-limit" data-testid="mybar-daily-limit">
          <h3 className="mb-status-name">{t("dailyTitle")}</h3>
          <p className="mb-muted">{t("dailyDesc")}</p>
        </div>
      ) : null}

      {canStartNew ? (
        <button type="button" className="mb-submit mb-secondary" onClick={onNew}>
          {t("newRequest")}
        </button>
      ) : null}
    </section>
  );
}
