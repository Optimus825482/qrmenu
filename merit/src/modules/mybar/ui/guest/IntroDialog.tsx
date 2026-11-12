"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";
import { MYBAR_SERVICE_HOURS } from "../../constants";

const introKey = (token: string) => `mybar-intro:${token}`;

function show(dialog: HTMLDialogElement) {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

/**
 * "What is MyBar" note in a native modal dialog. It opens itself once per browser session and room (sessionStorage,
 * optional) and again whenever `reopen` grows; Esc, the close button, the start button and a click on the backdrop
 * close it. The open state lives in the DOM element only.
 */
export function IntroDialog({ token, reopen }: { token: string; reopen: number }) {
  const t = useTranslations("mybar");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(introKey(token)) === "1";
      if (!seen) window.sessionStorage.setItem(introKey(token), "1");
    } catch {
      // Storage blocked: the intro shows on every visit of the form, which is harmless.
    }
    if (!seen) show(dialog);
  }, [token]);

  useEffect(() => {
    if (reopen > 0 && ref.current) show(ref.current);
  }, [reopen]);

  const onClose = () => {
    const dialog = ref.current;
    if (!dialog || !dialog.open) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };

  return (
    <dialog
      ref={ref}
      className="mb-dialog"
      data-testid="mybar-intro"
      aria-labelledby="mb-intro-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // The padding lives on the inner box, so a hit on the dialog element itself is a hit on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mb-dialog-box">
        <button type="button" className="mb-dialog-x" aria-label={t("introClose")} onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        <h2 id="mb-intro-title" className="mb-dialog-title">
          {t("introTitle")}
        </h2>
        <p className="mb-dialog-text">{t("introBody")}</p>
        <p className="mb-dialog-hours">{t("introHours", MYBAR_SERVICE_HOURS)}</p>
        <button type="button" className="mb-submit" onClick={onClose}>
          {t("introStart")}
        </button>
      </div>
    </dialog>
  );
}
