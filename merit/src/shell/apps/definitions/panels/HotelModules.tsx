"use client";

import { useEffect, useState } from "react";
import {
  listHotelModulesAction,
  setHotelModuleAction,
} from "@/modules/core/server/admin/actions/hotelModules";
import type { HotelModuleState } from "@/modules/core/server/admin/hotelModules";
import { alertDialog, confirm } from "@/shell/confirm";
import { useSse } from "@/shell/useSse";
import { MODULE_LABELS } from "./values";

const DEFINITION_EVENTS = ["definition.changed"] as const;

/** Modüller: per-hotel module switches; each switch saves at once (turning one off asks first). */
export function HotelModules({ hotelId }: { hotelId: string }) {
  const [modules, setModules] = useState<HotelModuleState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let current = true;
    listHotelModulesAction({ hotelId })
      .then((result) => {
        if (!current) return;
        if (result.ok) {
          setModules(result.data);
          setError(null);
        } else {
          setError(result.error.message);
        }
      })
      .catch(() => {
        if (current) setError("Modüller yüklenemedi");
      });
    return () => {
      current = false;
    };
  }, [hotelId, tick]);

  useSse((e) => {
    if ((e.payload as { entity?: unknown } | undefined)?.entity !== "hotelModule") return;
    if (e.hotelId === hotelId) setTick((t) => t + 1);
  }, DEFINITION_EVENTS);

  const toggle = async (item: HotelModuleState, enabled: boolean) => {
    const label = MODULE_LABELS[item.moduleKey];
    if (!enabled) {
      const yes = await confirm({
        title: `${label} modülünü kapat`,
        message: `${label} bu otelde kapatılsın mı? Modülü kullanan personel ve ekranlar erişimini kaybeder.`,
        danger: false,
      });
      if (!yes) return;
    }
    setBusy(item.moduleKey);
    try {
      const result = await setHotelModuleAction({ hotelId, moduleKey: item.moduleKey, enabled });
      if (result.ok) {
        setModules((current) =>
          current.map((m) => (m.moduleKey === item.moduleKey ? result.data : m)),
        );
      } else {
        void alertDialog({ title: "Modül değiştirilemedi", message: result.error.message });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <fieldset className="xp-group xp-hotel-modules" aria-label="Modüller">
      <legend>Modüller</legend>
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      {modules.map((item) => (
        <label key={item.moduleKey} className="xp-module-switch">
          <input
            type="checkbox"
            role="switch"
            checked={item.enabled}
            disabled={busy !== null}
            onChange={(e) => void toggle(item, e.target.checked)}
          />
          {MODULE_LABELS[item.moduleKey]}
        </label>
      ))}
    </fieldset>
  );
}
