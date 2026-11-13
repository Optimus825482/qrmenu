"use client";

import { mmdConsumptionQuestion } from "@/modules/minibar/mmdReasons";

/**
 * The question asked right after an MMD is recorded, drawn in place (the floor page's room dialog and the room
 * page): "Evet" opens the manual entry request, "Hayır" closes the question. Not a `confirm()`: a simple
 * question is answered "Evet" by itself on the staff pages, and this one must really be asked.
 */
export function MmdConsumptionAsk({
  roomNumber,
  reason,
  onYes,
  onNo,
}: {
  roomNumber: string;
  reason: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Tüketim kaydı" data-testid="mmd-soru" className="space-y-2 rounded-xl border-2 border-accent bg-bg p-3">
      <p className="text-sm font-bold text-text">{mmdConsumptionQuestion(roomNumber, reason)}</p>
      <p className="text-xs text-muted">Evet derseniz tüketim miktarlarını girersiniz; kayıt Minibar Yönetimi onayına gönderilir.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onYes}
          style={{ minHeight: "var(--tap-action)" }}
          className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white hover:opacity-90"
        >
          Evet
        </button>
        <button
          type="button"
          onClick={onNo}
          style={{ minHeight: "var(--tap-action)" }}
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-text hover:bg-bg"
        >
          Hayır
        </button>
      </div>
    </div>
  );
}
