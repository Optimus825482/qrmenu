"use client";

import { useState, useTransition } from "react";
import { setOutletTableOccupancyAction } from "@/modules/menu/server/actions/outletSwitches";
import { notify } from "@/shell/notify";
import { Icon } from "@/components/icons/Icon";

const PRESET_MINUTES = [
  { value: 0, label: "Kapalı", desc: "Otomatik doluluk kapalı" },
  { value: 10, label: "10 dk" },
  { value: 15, label: "15 dk" },
  { value: 20, label: "20 dk" },
  { value: 25, label: "25 dk" },
  { value: 30, label: "30 dk" },
  { value: 35, label: "35 dk" },
  { value: 40, label: "40 dk", desc: "Varsayılan" },
  { value: 45, label: "45 dk" },
  { value: 50, label: "50 dk" },
  { value: 55, label: "55 dk" },
  { value: 60, label: "60 dk" },
];

export default function TableSettingsDialog({
  outletId,
  outletName,
  currentMinutes,
  canEdit,
  onClose,
  onSaved,
}: {
  outletId: string;
  outletName: string;
  currentMinutes: number | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (minutes: number | null) => void;
}) {
  const initial = currentMinutes === null || currentMinutes === undefined ? 40 : currentMinutes;
  const [selectedMinutes, setSelectedMinutes] = useState<number>(initial);
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      setError("");
      const val = selectedMinutes === 0 ? null : selectedMinutes;
      const res = await setOutletTableOccupancyAction({ id: outletId, minutes: val });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      notify.success(
        val === null
          ? "Otomatik masa doluluk kuralı kapatıldı."
          : `Masa otomatik doluluk süresi ${val} dakika olarak ayarlandı.`,
      );
      onSaved(val);
      onClose();
    });
  };

  const title = `Masa Ayarları · ${outletName}`;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-xl bg-surface p-5 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Icon name="settings" size={22} />
            <h2 className="text-lg font-bold">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="pos-btn">
            ×
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-[var(--radius-m)] border border-border bg-[var(--surface-sunken)] p-3 text-sm text-muted">
            <p className="font-semibold text-foreground">Otomatik Masa Doluluk / Boşaltma Kuralı</p>
            <p className="mt-1">
              QR okutulan, sipariş verilen veya garson çağrılan masa otomatik olarak <strong>Dolu</strong> durumuna geçer.
              Seçilen süre boyunca yeni bir aktivite (yeni QR okutma, sipariş veya çağrı) olmazsa masa otomatik olarak <strong>Boş</strong> durumuna geçer.
            </p>
            <p className="mt-1">
              Dolu masalar garson veya kasa ekranından dilediğiniz an manuel olarak da boşaltılabilir.
            </p>
          </div>

          <div>
            <label htmlFor="occupancy-select" className="block text-sm font-semibold">
              Masa Aktivite / Doluluk Zaman Aşımı:
            </label>
            <select
              id="occupancy-select"
              value={selectedMinutes}
              disabled={!canEdit || pending}
              onChange={(e) => setSelectedMinutes(Number(e.target.value))}
              className="mt-1.5 w-full rounded-[var(--radius-m)] border border-border bg-surface px-3 py-2 text-base font-medium"
              style={{ minHeight: "var(--tap-action)" }}
            >
              <option value={0}>Kapalı (Otomatik doluluk devre dışı)</option>
              <option value={10}>10 dakika</option>
              <option value={15}>15 dakika</option>
              <option value={20}>20 dakika</option>
              <option value={25}>25 dakika</option>
              <option value={30}>30 dakika</option>
              <option value={35}>35 dakika</option>
              <option value={40}>40 dakika (Varsayılan)</option>
              <option value={45}>45 dakika</option>
              <option value={50}>50 dakika</option>
              <option value={55}>55 dakika</option>
              <option value={60}>60 dakika</option>
            </select>
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Hızlı Seçim</span>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {PRESET_MINUTES.map((p) => {
                const isSelected = selectedMinutes === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    disabled={!canEdit || pending}
                    onClick={() => setSelectedMinutes(p.value)}
                    className="flex flex-col items-center justify-center rounded-[var(--radius-m)] border p-2 text-center transition"
                    style={{
                      borderColor: isSelected ? "var(--accent)" : "var(--border)",
                      background: isSelected ? "var(--accent-bg)" : "var(--surface)",
                      fontWeight: isSelected ? 700 : 500,
                    }}
                  >
                    <span className="text-sm">{p.label}</span>
                    {p.desc ? <span className="text-[10px] text-muted">{p.desc}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-sm font-semibold" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onClose} disabled={pending} className="pos-btn">
            Vazgeç
          </button>
          <button
            type="button"
            disabled={!canEdit || pending}
            onClick={handleSave}
            className="pos-btn"
            data-primary
          >
            {pending ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
