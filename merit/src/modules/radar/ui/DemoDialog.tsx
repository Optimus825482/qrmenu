"use client";

import { useId, useRef, useState } from "react";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { DEMO_FOCUS_LABELS, type DemoFocus } from "./demo/demoScenario";

const FOCUS_ORDER: DemoFocus[] = ["MINIBAR", "OUTLET", "ROOM_SERVICE"];

export type DemoDialogProps = {
  hotels: { id: string; name: string }[];
  /** Preselected hotel (the one in view, else the first the user may see). */
  defaultHotelId: string;
  onStart(pick: { focus: DemoFocus; hotelId: string }): void;
  onCancel(): void;
};

/**
 * "Demo senaryosu": asks which module the demo is about (and, with several hotels, which hotel), then the radar
 * opens that module's view animated. A modal inside the radar window, closed by Vazgeç or Esc.
 */
export function DemoDialog({ hotels, defaultHotelId, onStart, onCancel }: DemoDialogProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState<DemoFocus>("MINIBAR");
  const [hotelId, setHotelId] = useState<string>(
    hotels.some((h) => h.id === defaultHotelId) ? defaultHotelId : (hotels[0]?.id ?? ""),
  );

  useDialogFocus(boxRef, onCancel, () => firstRef.current);

  return (
    <div className="rd-modal" data-testid="radar-demo-dialog">
      <div ref={boxRef} className="rd-modal-box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId} className="rd-modal-title">
          Demo senaryosu
        </h3>
        <p className="rd-modal-hint">Gösterilen veriler sentetiktir; kayıt oluşmaz. Hangi modülün akışı izlensin?</p>
        <fieldset className="rd-modal-group">
          <legend className="rd-modal-legend">Modül</legend>
          {FOCUS_ORDER.map((f, i) => (
            <label key={f} className="rd-modal-option">
              <input
                ref={i === 0 ? firstRef : undefined}
                type="radio"
                name="rd-demo-focus"
                value={f}
                checked={focus === f}
                onChange={() => setFocus(f)}
              />
              <span>{DEMO_FOCUS_LABELS[f]}</span>
            </label>
          ))}
        </fieldset>
        {hotels.length > 1 ? (
          <label className="rd-field">
            <span>Otel</span>
            <select
              className="rd-select"
              aria-label="Demo oteli"
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
            >
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="rd-modal-actions">
          <button type="button" className="rd-chip" data-testid="radar-demo-cancel" onClick={onCancel}>
            Vazgeç
          </button>
          <button
            type="button"
            className="rd-chip"
            data-primary=""
            data-testid="radar-demo-go"
            disabled={!hotelId}
            onClick={() => onStart({ focus, hotelId })}
          >
            Başlat
          </button>
        </div>
      </div>
    </div>
  );
}
