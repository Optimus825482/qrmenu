"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { settingsScopesAction } from "@/modules/core/server/admin/actions/settingsAdmin";
import { XpIcon } from "../icons";
import type { AppProps } from "../registry";
import { AppearancePanel } from "./controlPanel/AppearancePanel";
import { InstallPanel } from "./controlPanel/InstallPanel";
import { SystemPanel } from "./controlPanel/SystemPanel";

type Category = "gorunum" | "uygulama" | "sistem";

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "gorunum", label: "Görünüm", icon: "pencere" },
  { id: "uygulama", label: "Uygulama", icon: "komuta" },
  { id: "sistem", label: "Sistem", icon: "ayarlar" },
];

/** Denetim Masası (core.ayarlar): categories on the left, the chosen panel on the right. */
export function ControlPanel({ setStatus }: AppProps) {
  const [current, setCurrent] = useState<Category>("gorunum");
  // "Sistem" needs edit permission on CR-SYS (system scope or at least one hotel).
  const [canSystem, setCanSystem] = useState(false);
  useEffect(() => {
    let live = true;
    settingsScopesAction()
      .then((r) => {
        if (live && r.ok) setCanSystem(r.data.system || r.data.hotels.length > 0);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const categories = CATEGORIES.filter((c) => c.id !== "sistem" || canSystem);
  const id = useId();
  const tabId = (c: Category) => `${id}-tab-${c}`;
  const panelId = `${id}-panel`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = categories.findIndex((c) => c.id === current);
    let next = index;
    if (e.key === "ArrowDown") next = (index + 1) % categories.length;
    else if (e.key === "ArrowUp") next = (index - 1 + categories.length) % categories.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = categories.length - 1;
    else return;
    e.preventDefault();
    setCurrent(categories[next].id);
    document.getElementById(tabId(categories[next].id))?.focus();
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
          {categories.map((c) => {
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
        {current === "gorunum" ? (
          <AppearancePanel />
        ) : current === "sistem" ? (
          <SystemPanel setStatus={setStatus} />
        ) : (
          <InstallPanel setStatus={setStatus} />
        )}
      </div>
    </div>
  );
}
