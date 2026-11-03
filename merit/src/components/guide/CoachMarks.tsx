"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { placeCard, tourKey, type Box } from "./tourModel";
import "./guide.css";

export type CoachStep = { el: HTMLElement; title: string; body: string };

export type CoachMarksProps = {
  steps: CoachStep[];
  onFinish(reason: "done" | "skip"): void;
  /** Density of the surface the tour runs on (button size: xp 24 px, personel 56 px, pos 64 px). */
  density?: "xp" | "personel" | "pos";
};

/** Rectangle of `el` in the top window's viewport, also when `el` lives inside a same-origin iframe. */
function viewportBox(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  let top = r.top;
  let left = r.left;
  let win: Window | null = el.ownerDocument.defaultView;
  while (win && win !== win.parent) {
    const frame = win.frameElement as HTMLElement | null;
    if (!frame) break;
    const fr = frame.getBoundingClientRect();
    top += fr.top;
    left += fr.left;
    win = win.parent;
  }
  return { top, left, width: r.width, height: r.height };
}

/**
 * Screen tour overlay: dimmed backdrop with a cut-out around the target, a card with title, text,
 * "2/4" counter and Geri / İleri / Turu kapat. Esc closes, arrows move, Tab stays inside the card and
 * focus returns to the element that had it before the tour. A target that disappears is skipped.
 */
export function CoachMarks({ steps: initial, onFinish, density = "personel" }: CoachMarksProps) {
  const [steps, setSteps] = useState(initial);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ width: 340, height: 180 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);

  const finish = useCallback(
    (reason: "done" | "skip") => {
      if (finished.current) return;
      finished.current = true;
      onFinish(reason);
    },
    [onFinish],
  );

  useDialogFocus(
    cardRef,
    () => finish("skip"),
    () => nextRef.current,
  );

  const step = steps[index];
  const last = index >= steps.length - 1;

  const go = useCallback(
    (delta: 1 | -1) => {
      const alive = steps.filter((s) => s.el.isConnected);
      const current = steps[index];
      const at = alive.indexOf(current);
      const before = steps.slice(0, index).filter((s) => s.el.isConnected).length;
      // Current step still on the page: move from it; gone: the next alive one sits at `before`.
      const target = at >= 0 ? at + delta : delta > 0 ? before : before - 1;
      if (target >= alive.length) {
        finish("done");
        return;
      }
      setSteps(alive);
      setIndex(Math.max(0, target));
    },
    [steps, index, finish],
  );

  // Keep the target in view (instant, no animation) and the spotlight on it.
  const measure = useCallback(() => {
    const el = steps[index]?.el;
    if (!el || !el.isConnected) {
      setBox(null);
      return;
    }
    setBox(viewportBox(el));
    if (cardRef.current) {
      const { width, height } = cardRef.current.getBoundingClientRect();
      setCardSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    }
  }, [steps, index]);

  useLayoutEffect(() => {
    steps[index]?.el.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [steps, index, measure]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // A target that left the page mid-step is skipped.
        if (steps[index] && !steps[index].el.isConnected) go(1);
        else measure();
      });
    };
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [steps, index, measure, go]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = tourKey(event.key);
      if (action === "next") {
        event.preventDefault();
        go(1);
      } else if (action === "back") {
        event.preventDefault();
        go(-1);
      }
      // Escape is handled by useDialogFocus (skip).
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  useEffect(() => {
    if (initial.length === 0) finish("skip");
  }, [initial.length, finish]);

  if (!step || typeof document === "undefined") return null;

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const pad = 6;
  const spot = box
    ? { top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }
    : null;
  const place = spot ? placeCard(spot, viewport, cardSize) : { top: 80, left: 16 };

  return createPortal(
    <div className="guide-tour-layer" data-density={density} data-testid="coach-marks">
      {spot ? (
        <div
          className="guide-tour-spot"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
          data-testid="coach-spot"
        />
      ) : null}
      <div
        ref={cardRef}
        className="guide-tour-card"
        role="dialog"
        aria-modal="true"
        aria-label="Ekran turu"
        style={{ top: place.top, left: place.left }}
      >
        <div className="guide-tour-count" aria-live="polite">
          {index + 1}/{steps.length}
        </div>
        <h2 className="guide-tour-title">{step.title}</h2>
        <p className="guide-tour-body">{step.body}</p>
        <div className="guide-tour-actions">
          <button type="button" className="guide-btn" disabled={index === 0} onClick={() => go(-1)}>
            Geri
          </button>
          <button ref={nextRef} type="button" className="guide-btn" data-primary="" onClick={() => go(1)}>
            {last ? "Bitir" : "İleri"}
          </button>
          <button type="button" className="guide-btn" data-quiet="" onClick={() => finish("skip")}>
            Turu kapat
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
