"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { Result } from "@/lib/result";
import { MAX_QUANTITY, NOTE_MAX } from "./ItemSheet";
import type { GuestMenuMode } from "./MenuView";
import { priceFormatter } from "./priceFormat";
import { useSelectionStore } from "./selectionStore";
import { useModalFocusTrap } from "./useModalFocusTrap";

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const onlineNow = () => navigator.onLine;
const onlineOnServer = () => true;

type Sent = { orderId: string; orderNo: number };
type Problem = { kind: "closed" } | { kind: "failed" } | { kind: "unavailable"; names: string[] };

/**
 * The guest's selections: quantity, per-item note, remove, optional total (only while prices are
 * shown), a general note and the send button. The server decides whether ordering is open: a CONFLICT
 * answer shows the closed notice and keeps every selection; the idempotency key survives a failure so a
 * retry cannot create a second order.
 */
export function SelectionsDrawer({
  token,
  locale,
  pricesShown,
  currency,
  orderingOpen,
  mode = "table",
  onClose,
}: {
  token: string;
  locale: Locale;
  pricesShown: boolean;
  currency: string;
  orderingOpen: boolean;
  mode?: GuestMenuMode;
  onClose: () => void;
}) {
  const t = useTranslations("guest");
  const router = useRouter();
  const store = useSelectionStore(token);
  const items = store((s) => s.items);
  const note = store((s) => s.note);
  const { setQty, setItemNote, remove, setNote, clear, ensureIdempotencyKey, rememberOrder } = store.getState();
  const online = useSyncExternalStore(subscribeOnline, onlineNow, onlineOnServer);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useModalFocusTrap({
    active: true,
    onClose,
    initialFocusRef: closeRef,
    containerRef: drawerRef,
  });

  const format = priceFormatter(locale, currency);
  const total = items.reduce((sum, i) => sum + (i.unitPrice ? Number(i.unitPrice) * i.qty : 0), 0);
  const unavailable = problem?.kind === "unavailable" ? problem.names : [];
  const closed = problem?.kind === "closed" || !orderingOpen;
  const submitDisabled = items.length === 0 || !online || sending || (mode === "room" && !orderingOpen);

  async function submit() {
    if (submitDisabled) return;
    setSending(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/q/${encodeURIComponent(token)}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: ensureIdempotencyKey(),
          items: items.map((i) => ({ menuNodeId: i.menuNodeId, qty: i.qty, ...(i.note ? { note: i.note } : {}) })),
          note,
          locale,
        }),
      });
      const result = (await response.json()) as Result<Sent>;
      if (result.ok) {
        clear();
        rememberOrder(result.data.orderId, result.data.orderNo);
        onClose();
        router.push(`/q/${encodeURIComponent(token)}/siparis/${encodeURIComponent(result.data.orderId)}`);
        return;
      }
      const { code, fieldErrors } = result.error;
      if (code === "VALIDATION" && fieldErrors?.items?.length) setProblem({ kind: "unavailable", names: fieldErrors.items });
      else if (code === "CONFLICT") setProblem({ kind: "closed" });
      else setProblem({ kind: "failed" });
    } catch {
      setProblem({ kind: "failed" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="g-sheet-backdrop" onClick={onClose}>
      <div
        ref={drawerRef}
        className="g-sheet g-selections"
        role="dialog"
        aria-modal="true"
        aria-label={t("cart.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="g-sheet-close" onClick={onClose} aria-label={t("common.close")}>
          <span aria-hidden="true">×</span>
        </button>
        <div className="g-sheet-body">
          <h2>{t("cart.title")}</h2>
          {closed ? (
            <p className="g-banner g-banner-warn" role="alert">
              {t("menu.orderingClosed")}
            </p>
          ) : null}
          {problem?.kind === "failed" ? (
            <p className="g-banner g-banner-warn" role="alert">
              {t("selections.failed")}
            </p>
          ) : null}
          {unavailable.length > 0 ? (
            <div className="g-banner g-banner-warn" role="alert">
              <strong>{t("cart.unavailableItems")}</strong>
              <ul>
                {unavailable.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {!online ? (
            <p className="g-banner g-banner-warn" role="status">
              {t("common.offline")}
            </p>
          ) : null}

          {items.length === 0 ? (
            <p className="g-empty">{t("cart.empty")}</p>
          ) : (
            <ul className="g-lines">
              {items.map((item) => (
                <li
                  key={`${item.menuNodeId}:${item.note ?? ""}`}
                  className="g-line"
                  data-unavailable={unavailable.includes(item.name) ? "true" : "false"}
                >
                  <div className="g-line-head">
                    <span className="g-name">{item.name}</span>
                    {pricesShown && item.unitPrice ? (
                      <span className="g-price">{format((Number(item.unitPrice) * item.qty).toFixed(2))}</span>
                    ) : null}
                  </div>
                  <div className="g-line-controls">
                    <div className="g-qty" role="group" aria-label={`${t("cart.quantity")}: ${item.name}`}>
                      <button
                        type="button"
                        onClick={() => setQty(item.menuNodeId, item.qty - 1)}
                        disabled={item.qty <= 1}
                        aria-label="−"
                      >
                        −
                      </button>
                      <output>{item.qty}</output>
                      <button
                        type="button"
                        onClick={() => setQty(item.menuNodeId, item.qty + 1)}
                        disabled={item.qty >= MAX_QUANTITY}
                        aria-label="+"
                      >
                        +
                      </button>
                    </div>
                    <button type="button" className="g-link" onClick={() => remove(item.menuNodeId)}>
                      {t("selections.remove")}
                    </button>
                  </div>
                  <label className="g-note">
                    <span>{t("cart.note")}</span>
                    <input
                      type="text"
                      value={item.note ?? ""}
                      maxLength={200}
                      onChange={(event) => setItemNote(item.menuNodeId, event.target.value)}
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 ? (
            <>
              <label className="g-note">
                <span>{t("selections.generalNote")}</span>
                <textarea value={note} maxLength={NOTE_MAX} rows={2} onChange={(event) => setNote(event.target.value)} />
              </label>
              {pricesShown && total > 0 ? (
                <p className="g-total">
                  <span>{t("cart.total")}</span> <strong>{format(total.toFixed(2))}</strong>
                </p>
              ) : null}
            </>
          ) : null}
          <button type="button" className="g-button" disabled={submitDisabled} onClick={submit}>
            {sending ? t("selections.sending") : t(mode === "room" ? "rs.selections.submit" : "cart.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
