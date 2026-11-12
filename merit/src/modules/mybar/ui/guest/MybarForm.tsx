"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";
import type { Locale } from "@/lib/i18n/locales";
import { MYBAR_NOTE_MAX, MYBAR_QTY_CAP } from "../../constants";
import type { RoomCatalog } from "../../server/catalog";
import { IntroDialog } from "./IntroDialog";
import { MybarStatus } from "./MybarStatus";
import { SelectionChips } from "./SelectionChips";
import { SwapPanel } from "./SwapPanel";
import { useMybarStatus, type MybarRequestView } from "./useMybarStatus";
import { useMybarSubmit, type GuestErrorKey } from "./useMybarSubmit";

type Qty = Record<string, number>;
const total = (q: Qty) => Object.values(q).reduce((n, v) => n + v, 0);

/**
 * Keeps the swap invariant after the removals changed: a product that is taken out cannot also be added, and the
 * additions never outnumber the removals (the most recently added products give way first).
 */
export function reconcileAdditions(removed: Qty, added: Qty): Qty {
  const next: Qty = {};
  for (const [id, v] of Object.entries(added)) if (v > 0 && !(removed[id] > 0)) next[id] = v;
  let excess = total(next) - total(removed);
  for (const id of Object.keys(next).reverse()) {
    if (excess <= 0) break;
    const cut = Math.min(next[id], excess);
    next[id] -= cut;
    excess -= cut;
    if (next[id] === 0) delete next[id];
  }
  return next;
}

/**
 * The room MyBar page body, a two-step personalisation: (1) the products the guest would rather not have, (2) the
 * ones they would like more of (never more than were taken out), then the note and send. After sending (or when
 * today's request exists) the live status screen shows. A short intro dialog opens once per session and room.
 */
export function MybarForm({
  token,
  locale,
  catalog,
  dailyLimit,
  initialRequest,
}: {
  token: string;
  locale: Locale;
  catalog: RoomCatalog;
  dailyLimit: boolean;
  initialRequest: MybarRequestView | null;
}) {
  const t = useTranslations("mybar");
  const idPrefix = useId();
  const { request, refresh } = useMybarStatus(token, locale, initialRequest);
  const { submit, sending, reset } = useMybarSubmit(token, locale);

  const [view, setView] = useState<"form" | "status">(initialRequest ? "status" : "form");
  const [step, setStep] = useState<1 | 2>(1);
  const [removed, setRemoved] = useState<Qty>({});
  const [added, setAdded] = useState<Qty>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<GuestErrorKey | null>(null);
  const [notice, setNotice] = useState<GuestErrorKey | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [introReopen, setIntroReopen] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepMoved = useRef(false);

  const products = useMemo(() => catalog.groups.flatMap((g) => g.products), [catalog]);
  const hasProducts = products.length > 0;
  const toChips = (q: Qty) => products.filter((p) => (q[p.id] ?? 0) > 0).map((p) => ({ id: p.id, name: p.nameLocal, qty: q[p.id] }));
  const removedChips = toChips(removed);
  const addedChips = toChips(added);
  const removedTotal = total(removed);
  const addedTotal = total(added);
  const noteLength = [...note].length;
  const tooLong = noteLength > MYBAR_NOTE_MAX;
  // A tick-box room only ever records one of a product; the swap steps stay steppers but add at most one each.
  const addCap = catalog.quantityMode === "TICK" ? 1 : MYBAR_QTY_CAP;

  // Move focus to the new step's heading so screen readers announce it together with "Step n / 2".
  useEffect(() => {
    if (!stepMoved.current) return;
    headingRef.current?.focus();
  }, [step]);

  const setRemovedQty = (id: string, value: number) => {
    setError(null);
    const nextRemoved = { ...removed };
    if (value <= 0) delete nextRemoved[id];
    else nextRemoved[id] = value;
    setRemoved(nextRemoved);
    setAdded((prev) => reconcileAdditions(nextRemoved, prev));
  };
  const setAddedQty = (id: string, value: number) => {
    setError(null);
    setAdded((prev) => {
      const next = { ...prev };
      if (value <= 0) delete next[id];
      else next[id] = value;
      return next;
    });
  };
  const goTo = (target: 1 | 2) => {
    stepMoved.current = true;
    setStep(target);
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending || tooLong) return;
    const removals = removedChips.map((c) => ({ productId: c.id, qty: c.qty }));
    const items = addedChips.map((c) => ({ productId: c.id, qty: c.qty }));
    if (removals.length === 0 && items.length === 0 && note.trim() === "") {
      setError("validationEmpty");
      return;
    }
    setError(null);
    const result = await submit({ items, removals, note });
    if (result.ok) {
      await refresh();
      setNotice(null);
      setJustSent(true);
      setView("status");
      return;
    }
    if (result.error === "err409Daily") {
      // The day's request exists already (sent from another device): show it with the limit message.
      const existing = await refresh();
      if (existing) {
        setNotice("err409Daily");
        setJustSent(false);
        setView("status");
        return;
      }
    }
    setError(result.error);
  }

  function startNew() {
    reset();
    setRemoved({});
    setAdded({});
    setStep(1);
    stepMoved.current = false;
    setNote("");
    setError(null);
    setNotice(null);
    setJustSent(false);
    setView("form");
  }

  if (view === "status" && request) {
    return <MybarStatus request={request} dailyLimit={dailyLimit} justSent={justSent} notice={notice} onNew={startNew} />;
  }

  // Step 2 offers only products that stay in the minibar untouched (the server rejects a product on both lists).
  const addableGroups = catalog.groups
    .map((g) => ({ ...g, products: g.products.filter((p) => !(removed[p.id] > 0)) }))
    .filter((g) => g.products.length > 0);

  const noteField = (
    <div className="mb-note">
      <label className="mb-label" htmlFor={`${idPrefix}-note`}>
        {t("noteLabel")}
      </label>
      <textarea
        id={`${idPrefix}-note`}
        className="mb-textarea"
        rows={3}
        value={note}
        placeholder={t("notePlaceholder")}
        aria-describedby={`${idPrefix}-count`}
        aria-invalid={tooLong || undefined}
        onChange={(e) => {
          setNote(e.target.value);
          setError(null);
        }}
      />
      <p id={`${idPrefix}-count`} className={`mb-count${tooLong ? " is-over" : ""}`}>
        {t("noteCounter", { count: noteLength, max: MYBAR_NOTE_MAX })}
      </p>
    </div>
  );

  const alert = error ? (
    <p className="mb-alert" role="alert">
      {t(error)}
    </p>
  ) : null;

  const submitButton = (
    <button type="submit" className="mb-submit" disabled={sending || tooLong} aria-busy={sending || undefined}>
      <Icon name="concierge" size={20} />
      <span>{sending ? t("submitting") : t("submit")}</span>
    </button>
  );

  if (!hasProducts) {
    return (
      <form className="mb-form" onSubmit={onSubmit} noValidate>
        <p className="mb-empty" data-testid="mybar-no-setup">
          {t("noSetupMessage")}
        </p>
        {noteField}
        {alert}
        {submitButton}
      </form>
    );
  }

  return (
    <form className="mb-form" onSubmit={onSubmit} noValidate>
      <IntroDialog token={token} reopen={introReopen} />
      <button type="button" className="mb-how" onClick={() => setIntroReopen((n) => n + 1)}>
        <Icon name="help" size={18} />
        <span>{t("howItWorks")}</span>
      </button>

      <div className="mb-step-head">
        <p id={`${idPrefix}-step`} className="mb-step-indicator" aria-current="step">
          {t("stepIndicator", { current: step, total: 2 })}
        </p>
        <span className="mb-step-bar" aria-hidden="true">
          <span className="is-on" />
          <span className={step === 2 ? "is-on" : undefined} />
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="mb-step-title" aria-describedby={`${idPrefix}-step`}>
          {step === 1 ? t("step1Title") : t("step2Title")}
        </h2>
        <p className="mb-muted">{step === 1 ? t("step1Desc") : t("step2Desc")}</p>
      </div>

      {step === 1 ? (
        <>
          <SwapPanel
            key="remove"
            groups={catalog.groups}
            qty={removed}
            maxFor={(_id, setupQty) => setupQty}
            canIncrease
            hintFor={(setupQty) => t("inMinibar", { count: setupQty })}
            onChange={setRemovedQty}
          />
          <SelectionChips title={t("removedTotal", { count: removedTotal })} chips={removedChips} onRemove={(id) => setRemovedQty(id, 0)} />
          <button type="button" className="mb-submit" disabled={removedTotal === 0} onClick={() => goTo(2)}>
            <span>{t("continue")}</span>
            <Icon name="arrow-right" size={20} className="mb-flip" />
          </button>
        </>
      ) : (
        <>
          {addableGroups.length === 0 ? (
            <p className="mb-empty">{t("step2NoProducts")}</p>
          ) : (
            <>
              <p className="mb-balance">
                <span>{t("swapCounterLabel")}</span>
                <bdi className="mb-balance-value">{t("swapCounter", { used: addedTotal, total: removedTotal })}</bdi>
              </p>
              <SwapPanel
                key="add"
                groups={addableGroups}
                qty={added}
                maxFor={() => addCap}
                canIncrease={addedTotal < removedTotal}
                onChange={setAddedQty}
              />
              <SelectionChips title={t("additionsTitle")} chips={addedChips} onRemove={(id) => setAddedQty(id, 0)} />
            </>
          )}
          {noteField}
          {alert}
          {submitButton}
          <button type="button" className="mb-submit mb-secondary" onClick={() => goTo(1)}>
            <Icon name="arrow-left" size={20} className="mb-flip" />
            <span>{t("back")}</span>
          </button>
        </>
      )}
    </form>
  );
}
