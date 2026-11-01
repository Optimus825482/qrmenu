"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import type { FieldErrors, Result } from "@/lib/result";
import { alertDialog, confirm } from "../confirm";
import { FieldErrorsContext } from "./formContext";

/** Field values by `name`, as text (an unchecked checkbox is absent, a checked one is "on"). */
export type FormValues = Record<string, string>;

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  /** A failed Result keeps the dialog open: its message goes to the banner, `fieldErrors` under the fields. */
  onSubmit: (values: FormValues) => Promise<Result<unknown>>;
  children: ReactNode;
  submitText: string;
  /** Require an explicit approval before saving an existing record. */
  confirmBeforeSubmit?: boolean;
};

const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const FIELDS =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';
const UNEXPECTED = "Beklenmeyen bir hata oluştu";

/**
 * Modal XP panel portaled above the shell windows: it covers the owning window's title bar too,
 * keeps Tab focus inside, closes on Esc and restores focus when closed. Mounted only while open,
 * so every opening starts with empty errors and fresh field state.
 */
export function FormDialog(props: Props) {
  if (!props.open) return null;
  // Looked up when the dialog opens (always after mount, in a client event): no effect or state needed.
  const portalRoot = typeof document === "undefined" ? null : document.getElementById("xp-dialog-root");
  const panel: ReactElement = <Panel {...props} />;
  // Standalone previews without a shell keep rendering the dialog in place.
  return portalRoot ? createPortal(panel, portalRoot) : panel;
}

function Panel({ title, onClose, onSubmit, children, submitText, confirmBeforeSubmit }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (
      dialog?.querySelector<HTMLElement>(FIELDS) ?? dialog?.querySelector<HTMLElement>(FOCUSABLE)
    )?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const close = () => {
    if (!busy.current) onClose();
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    e.preventDefault();
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const start = { px: e.clientX, py: e.clientY, ...dragOffset.current };
    let next = { x: start.x, y: start.y };
    const onMove = (event: PointerEvent) => {
      const x = start.x + event.clientX - start.px;
      const y = start.y + event.clientY - start.py;
      next = { x, y };
      dialog.style.transform = `translate(${x}px, ${y}px)`;
    };
    const onUp = () => {
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      dragOffset.current = next;
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage(null);
    setFieldErrors({});
    const values: FormValues = {};
    for (const [key, value] of new FormData(e.currentTarget)) {
      if (typeof value === "string") values[key] = value;
    }
    try {
      if (confirmBeforeSubmit) {
        const approved = await confirm({
          title: "Değişikliği onayla",
          message: `“${title}” için yaptığınız değişiklikler kaydedilsin mi?`,
          danger: true,
        });
        if (!approved) return;
      }
      const result = await onSubmit(values);
      if (result.ok) {
        await alertDialog({
          title: "İşlem tamamlandı",
          message: `“${title}” işlemi başarıyla tamamlandı.`,
        });
        busy.current = false;
        onClose();
      } else {
        setMessage(result.error.message);
        setFieldErrors(result.error.fieldErrors ?? {});
      }
    } catch {
      setMessage(UNEXPECTED);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <div
      className="xp-form-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && e.preventDefault()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="xp-window xp-dialog xp-form-dialog"
        onKeyDown={onKeyDown}
      >
        <div className="xp-titlebar" onPointerDown={startDrag}>
          <span id={titleId} className="xp-titlebar-text">
            {title}
          </span>
          <button
            type="button"
            tabIndex={-1}
            className="xp-title-button is-close"
            aria-label="Kapat"
            onClick={close}
          >
            ×
          </button>
        </div>
        <form className="xp-form" noValidate onSubmit={submit}>
          {message ? (
            <p role="alert" className="xp-form-banner">
              {message}
            </p>
          ) : null}
          <FieldErrorsContext.Provider value={fieldErrors}>
            <div className="xp-form-fields">{children}</div>
          </FieldErrorsContext.Provider>
          <div className="xp-dialog-actions">
            <button type="submit" className="xp-button" aria-busy={pending || undefined}>
              {submitText}
            </button>
            <button type="button" className="xp-button" onClick={close}>
              Vazgeç
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
