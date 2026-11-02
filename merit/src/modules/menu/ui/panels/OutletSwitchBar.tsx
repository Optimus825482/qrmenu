"use client";

import { useState } from "react";
import { alertDialog, confirm } from "@/shell/confirm";
import type { MenuOutletInfo } from "../../server/menuContext";
import {
  setOutletOrderingEnabledAction,
  setOutletPriceDisplayAction,
} from "../../server/actions/outletSwitches";

const PRICE_LABELS = { SHOW: "Açık (Gösterilir)", HIDE: "Kapalı (Gizlenir)", INHERIT: "Menü şablonuna göre" } as const;

type Props = {
  outlet: MenuOutletInfo;
  canSwitch: boolean;
  onChanged(): void;
};

/** Ordering on/off switch and price display select of the chosen outlet (guest pages follow at once). */
export function OutletSwitchBar({ outlet, canSwitch, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  const setOrdering = async (enabled: boolean) => {
    const yes = await confirm({
      title: enabled ? "Siparişi aç" : "Siparişi kapat",
      message: enabled
        ? `"${outlet.name}" için masa siparişi açılsın mı?`
        : `"${outlet.name}" için masa siparişi kapatılsın mı? Misafirler menüyü görmeye devam eder.`,
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    const result = await setOutletOrderingEnabledAction({ id: outlet.id, enabled });
    setBusy(false);
    if (!result.ok) {
      void alertDialog({ title: "Sipariş durumu değiştirilemedi", message: result.error.message });
      return;
    }
    await alertDialog({ title: "İşlem tamamlandı", message: `“${outlet.name}” sipariş durumu güncellendi.` });
    onChanged();
  };

  const setPrice = async (value: keyof typeof PRICE_LABELS) => {
    const yes = await confirm({
      title: "Fiyat gösterimi",
      message: `"${outlet.name}" için fiyat gösterimi "${PRICE_LABELS[value]}" olarak değiştirilsin mi?`,
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    const result = await setOutletPriceDisplayAction({ id: outlet.id, value });
    setBusy(false);
    if (!result.ok) {
      void alertDialog({ title: "Fiyat gösterimi değiştirilemedi", message: result.error.message });
      return;
    }
    await alertDialog({ title: "İşlem tamamlandı", message: `“${outlet.name}” fiyat gösterimi güncellendi.` });
    onChanged();
  };

  return (
    <div className="xp-mm-switches">
      {outlet.hasOrdering ? (
        <>
          <label className="xp-module-switch">
            <input
              type="checkbox"
              role="switch"
              checked={outlet.orderingEnabled}
              disabled={!canSwitch || busy}
              onChange={(e) => void setOrdering(e.target.checked)}
            />
            QR sipariş açık
          </label>
          <span className="xp-badge" data-on={outlet.orderingEnabled}>
            {outlet.orderingEnabled ? "QR siparişe açık" : "QR sipariş kapalı"}
          </span>
        </>
      ) : (
        <span className="xp-badge">sipariş modülü pasif</span>
      )}
      <label className="xp-module-switch" style={{ gap: 6, fontWeight: 600 }}>
        <span>Fiyat gösterimi:</span>
        <select
          className="xp-system-select"
          style={{
            height: 26,
            padding: "2px 8px",
            border: "1px solid #7f9db9",
            borderRadius: 3,
            backgroundColor: "#ffffff",
            color: "#111827",
            fontWeight: 500,
            fontSize: 12,
            cursor: "pointer",
            boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.12)",
          }}
          value={outlet.priceDisplay}
          disabled={!canSwitch || busy}
          onChange={(e) => void setPrice(e.target.value as keyof typeof PRICE_LABELS)}
        >
          {Object.entries(PRICE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
