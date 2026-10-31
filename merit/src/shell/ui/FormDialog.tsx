"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { FieldErrors, Result } from "@/lib/result";
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
};

const FOCUSABLE =
  'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const FIELDS =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';
const UNEXPECTED = "Beklenmeyen bir hata oluştu";

/**
 * Modal XP panel drawn inside the window body (not a browser dialog): it covers the window's
 * content, keeps Tab focus inside, closes on Esc and puts focus back where it was. Mounted only
 * while open, so every opening starts with empty errors and fresh field state.
 */
export function FormDialog(props: Props) {
  return props.open ? <Panel {...props} /> : null;
}

function Panel({ title, onClose, onSubmit, children, submitText }: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
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
      const result = await onSubmit(values);
      if (result.ok) {
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
        <div className="xp-titlebar">
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
