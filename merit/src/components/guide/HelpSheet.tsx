"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { loadHelpAction } from "@/modules/core/server/helpActions";
import type { HelpContent } from "@/modules/core/server/helpData";
import "./guide.css";

export type HelpSheetProps = {
  code: string;
  open: boolean;
  onClose(): void;
  /** "Turu tekrar oynat": the host closes the sheet and starts the tour. */
  onReplay?(): void;
  /** Side panel on the XP desktop, bottom sheet on staff and POS screens. */
  variant?: "side" | "bottom";
};

type Load = { status: "loading" } | { status: "ready"; content: HelpContent | null } | { status: "error" };

/**
 * Contextual help of one screen: purpose, what the signed-in user can do here (only their own
 * actions), the permitted steps, common mistakes and the settings in force as sentences. Content is
 * fetched on every open so a changed setting shows up at once.
 */
export function HelpSheet(props: HelpSheetProps) {
  if (!props.open) return null;
  return <HelpSheetBody {...props} />;
}

function HelpSheetBody({ code, onClose, onReplay, variant = "bottom" }: HelpSheetProps) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useDialogFocus(boxRef, onClose, () => closeRef.current);

  useEffect(() => {
    let alive = true;
    void loadHelpAction(code)
      .then((result) => {
        if (alive) setLoad(result.ok ? { status: "ready", content: result.data } : { status: "error" });
      })
      .catch(() => {
        if (alive) setLoad({ status: "error" });
      });
    return () => {
      alive = false;
    };
  }, [code]);

  // Print only the sheet: the stylesheet hides everything else while this class is set.
  useEffect(() => {
    document.documentElement.classList.add("guide-help-open");
    return () => document.documentElement.classList.remove("guide-help-open");
  }, []);

  const content = load.status === "ready" ? load.content : null;

  return createPortal(
    <div className="guide-help-portal">
      <div className="guide-help-backdrop" data-variant={variant} data-sheet-backdrop="" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
        <div
          ref={boxRef}
          className="guide-help"
          data-variant={variant}
          data-testid="help-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="guide-help-head">
            <h2 id={titleId}>{content ? `Yardım: ${content.name}` : "Yardım"}</h2>
            <button ref={closeRef} type="button" className="guide-help-close" onClick={onClose}>
              Kapat
            </button>
          </div>
          <div className="guide-help-body" tabIndex={0} role="region" aria-label="Yardım içeriği">
            {load.status === "loading" ? <p>Yükleniyor...</p> : null}
            {load.status === "error" ? <p role="alert">Yardım şimdi yüklenemedi. Biraz sonra tekrar dene.</p> : null}
            {load.status === "ready" && !content ? <p>Bu ekran için yardım bulunamadı.</p> : null}
            {content ? (
              <>
                <h3>Bu ekran ne işe yarar</h3>
                <p>{content.purpose}</p>

                <h3>Burada yapabileceklerin</h3>
                <ul data-testid="help-abilities">
                  {content.abilities.map((sentence) => (
                    <li key={sentence}>{sentence}</li>
                  ))}
                </ul>

                <h3>Adım adım</h3>
                <ol data-testid="help-steps">
                  {content.steps.map((step) => (
                    <li key={step.title}>
                      <strong>{step.title}.</strong> {step.body}
                    </li>
                  ))}
                </ol>

                {content.mistakes.length > 0 ? (
                  <>
                    <h3>Sık yapılan hatalar</h3>
                    <ul>
                      {content.mistakes.map((mistake) => (
                        <li key={mistake}>{mistake}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {content.settings.length > 0 ? (
                  <>
                    <h3>Ayarlar</h3>
                    <ul data-testid="help-settings">
                      {content.settings.map((sentence) => (
                        <li key={sentence}>{sentence}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="guide-help-foot">
            {content && onReplay ? (
              <button type="button" className="guide-btn" data-primary="" onClick={onReplay}>
                Turu tekrar oynat
              </button>
            ) : null}
            <button type="button" className="guide-btn" disabled={!content} onClick={() => window.print()}>
              Yazdır
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
