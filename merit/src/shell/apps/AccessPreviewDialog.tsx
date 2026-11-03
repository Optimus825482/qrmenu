"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccessSummaryView } from "@/components/guide/AccessSummaryView";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { previewAccessAction, type AccessPreview } from "@/modules/core/server/actions/accessPreview";

const NOTICE = "Bu bir önizlemedir; oturum açılmaz.";

/** Landing screen, bottom navigation and the screen cards of a loaded preview (read-only, shared by the user dialog and the role tab). */
export function AccessPreviewView({ preview }: { preview: AccessPreview }) {
  const { summary, nav } = preview;
  const landing = summary.modules.flatMap((m) => m.screens).find((s) => s.code === summary.landing.screenCode);
  const navLabels = [...nav.primary.filter((i) => i.id !== "more"), ...nav.more].map((i) => i.label);
  return (
    <div className="flex flex-col gap-4" data-testid="access-preview">
      <p className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-semibold text-muted" role="note">
        {NOTICE}
      </p>
      <dl className="grid gap-2 text-sm" data-testid="access-preview-landing">
        <div>
          <dt className="font-semibold text-muted">Giriş sonrası açılan ekran</dt>
          <dd data-testid="access-preview-landing-screen">
            {landing?.name ?? summary.landing.screenCode} <span className="text-muted">({summary.landing.path})</span>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">Alt gezinme</dt>
          <dd data-testid="access-preview-nav">{navLabels.length > 0 ? navLabels.join(" · ") : "Bu rol için alt gezinme yok"}</dd>
        </div>
      </dl>
      <AccessSummaryView summary={summary} mode="preview" />
    </div>
  );
}

type Props = {
  user: { id: string; fullName: string; username: string };
  hotelId: string;
  onClose: () => void;
};

/**
 * "Kullanıcıya göster": what the chosen user sees in the hotel. Modal XP panel, read-only: the
 * administrator's own session is never touched.
 */
export function AccessPreviewDialog({ user, hotelId, onClose }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<AccessPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void previewAccessAction({ userId: user.id, hotelId }).then((result) => {
      if (!live) return;
      if (result.ok) setPreview(result.data);
      else setError(result.error.message);
    });
    return () => {
      live = false;
    };
  }, [user.id, hotelId]);

  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialogRef, onClose, () => closeRef.current);

  const portalRoot = typeof document === "undefined" ? null : document.getElementById("xp-dialog-root");
  const panel = (
    <div className="xp-form-backdrop" onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="access-preview-dialog"
        className="xp-window xp-dialog xp-form-dialog"
        style={{ width: "min(720px, 94vw)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="xp-titlebar">
          <span id={titleId} className="xp-titlebar-text">
            Kullanıcıya göster: {user.fullName}
          </span>
          <button type="button" tabIndex={-1} className="xp-title-button is-close" aria-label="Kapat" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="overflow-auto p-4">
          {error ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {error}
            </p>
          ) : !preview ? (
            <p className="text-sm">Yükleniyor...</p>
          ) : (
            <AccessPreviewView preview={preview} />
          )}
        </div>
        <div className="xp-dialog-actions">
          <button ref={closeRef} type="button" className="xp-button" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
  return portalRoot ? createPortal(panel, portalRoot) : panel;
}
