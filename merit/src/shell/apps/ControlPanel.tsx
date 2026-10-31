"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { XpIcon } from "../icons";
import type { AppProps } from "../registry";
import { AppearancePanel } from "./controlPanel/AppearancePanel";
import { InstallPanel } from "./controlPanel/InstallPanel";

type Category = "gorunum" | "uygulama";

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "gorunum", label: "Görünüm", icon: "pencere" },
  { id: "uygulama", label: "Uygulama", icon: "komuta" },
];

/** Denetim Masası (core.ayarlar): categories on the left, the chosen panel on the right. */
export function ControlPanel({ setStatus }: AppProps) {
  const [current, setCurrent] = useState<Category>("gorunum");
  const id = useId();
  const tabId = (c: Category) => `${id}-tab-${c}`;
  const panelId = `${id}-panel`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = CATEGORIES.findIndex((c) => c.id === current);
    let next = index;
    if (e.key === "ArrowDown") next = (index + 1) % CATEGORIES.length;
    else if (e.key === "ArrowUp") next = (index - 1 + CATEGORIES.length) % CATEGORIES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = CATEGORIES.length - 1;
    else return;
    e.preventDefault();
    setCurrent(CATEGORIES[next].id);
    document.getElementById(tabId(CATEGORIES[next].id))?.focus();
  };

  return (
    <div className="xp-cp">
      <nav className="xp-cp-nav" aria-label="Denetim Masası">
        <div
          role="tablist"
          aria-label="Kategoriler"
          aria-orientation="vertical"
          className="xp-cp-tabs"
          onKeyDown={onKeyDown}
        >
          {CATEGORIES.map((c) => {
            const selected = c.id === current;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                id={tabId(c.id)}
                aria-selected={selected}
                aria-controls={selected ? panelId : undefined}
                tabIndex={selected ? 0 : -1}
                className="xp-cp-tab"
                onClick={() => setCurrent(c.id)}
              >
                <XpIcon name={c.icon} size={20} />
                {c.label}
              </button>
            );
          })}
        </div>
      </nav>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(current)}
        className="xp-cp-main"
      >
        {current === "gorunum" ? <AppearancePanel /> : <InstallPanel setStatus={setStatus} />}
      </div>
    </div>
  );
}
