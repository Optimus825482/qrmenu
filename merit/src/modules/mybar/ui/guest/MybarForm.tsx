"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";
import type { Locale } from "@/lib/i18n/locales";
import { MYBAR_NOTE_MAX } from "../../constants";
import type { RoomCatalog } from "../../server/catalog";
import { GroupPills } from "./GroupPills";
import { MybarStatus } from "./MybarStatus";
import { ProductCard } from "./ProductCard";
import { SelectionChips } from "./SelectionChips";
import { useMybarStatus, type MybarRequestView } from "./useMybarStatus";
import { useMybarSubmit, type GuestErrorKey } from "./useMybarSubmit";

/**
 * The room MyBar page body: product groups, cards (stepper or tick box per the hotel setting), selected
 * chips, note with counter and send; after sending (or when today's request exists) the live status screen.
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
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<GuestErrorKey | null>(null);
  const [notice, setNotice] = useState<GuestErrorKey | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [activeGroup, setActiveGroup] = useState(catalog.groups[0]?.id ?? "");

  const quantityMode = catalog.quantityMode;
  const products = useMemo(() => catalog.groups.flatMap((g) => g.products), [catalog]);
  const chips = products.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ id: p.id, name: p.nameLocal, qty: qty[p.id] }));
  const noteLength = [...note].length;
  const tooLong = noteLength > MYBAR_NOTE_MAX;

  const setProductQty = (id: string, value: number) => {
    setError(null);
    setQty((prev) => {
      const next = { ...prev };
      if (value <= 0) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending || tooLong) return;
    const items = chips.map((c) => ({ productId: c.id, qty: c.qty }));
    if (items.length === 0 && note.trim() === "") {
      setError("validationEmpty");
      return;
    }
    setError(null);
    const result = await submit(items, note);
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
    setQty({});
    setNote("");
    setError(null);
    setNotice(null);
    setJustSent(false);
    setView("form");
  }

  if (view === "status" && request) {
    return <MybarStatus request={request} dailyLimit={dailyLimit} justSent={justSent} notice={notice} onNew={startNew} />;
  }

  const activeGroupData = catalog.groups.find((g) => g.id === activeGroup) ?? catalog.groups[0];
  return (
    <form className="mb-form" onSubmit={onSubmit} noValidate>
      {!activeGroupData ? (
        <p className="mb-empty" data-testid="mybar-no-setup">
          {t("noSetupMessage")}
        </p>
      ) : (
        <>
          <GroupPills
            groups={catalog.groups.map((g) => ({ id: g.id, label: g.nameLocal }))}
            active={activeGroupData.id}
            idPrefix={idPrefix}
            onSelect={setActiveGroup}
          />
          <div
            role="tabpanel"
            id={`${idPrefix}-panel-${activeGroupData.id}`}
            aria-labelledby={`${idPrefix}-tab-${activeGroupData.id}`}
          >
            <ul className="mb-products">
              {activeGroupData.products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  qty={qty[p.id] ?? 0}
                  mode={quantityMode}
                  onChange={(value) => setProductQty(p.id, value)}
                />
              ))}
            </ul>
          </div>
          <SelectionChips chips={chips} showQty={quantityMode === "QTY"} onRemove={(id) => setProductQty(id, 0)} />
        </>
      )}

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

      {error ? (
        <p className="mb-alert" role="alert">
          {t(error)}
        </p>
      ) : null}

      <button type="submit" className="mb-submit" disabled={sending || tooLong} aria-busy={sending || undefined}>
        <Icon name="concierge" size={20} />
        <span>{sending ? t("submitting") : t("submit")}</span>
      </button>
    </form>
  );
}
