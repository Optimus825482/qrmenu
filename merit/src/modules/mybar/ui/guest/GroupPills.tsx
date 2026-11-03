"use client";

import { useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

/** Product group tabs: arrow keys move between them, the selected group's panel is shown by the caller. */
export function GroupPills({
  groups,
  active,
  idPrefix,
  onSelect,
}: {
  groups: { id: string; label: string }[];
  active: string;
  idPrefix: string;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("mybar");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (event: KeyboardEvent, index: number) => {
    const rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let next = -1;
    if (event.key === forward) next = (index + 1) % groups.length;
    else if (event.key === back) next = (index - 1 + groups.length) % groups.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = groups.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onSelect(groups[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="mb-pills" role="tablist" aria-label={t("groups")}>
      {groups.map((g, i) => (
        <button
          key={g.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${g.id}`}
          aria-selected={g.id === active}
          aria-controls={`${idPrefix}-panel-${g.id}`}
          tabIndex={g.id === active ? 0 : -1}
          className={`mb-pill${g.id === active ? " is-active" : ""}`}
          onClick={() => onSelect(g.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
