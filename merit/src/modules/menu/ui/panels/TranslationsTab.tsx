"use client";

import { useState } from "react";
import { notify } from "@/shell/notify";
import { autoTranslateMenuNodeAction } from "../../server/actions/menuTree";
import type { MenuTreeNode } from "../../server/menuTree";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "ru", label: "RU" },
  { code: "ar", label: "AR" },
  { code: "fr", label: "FR" },
  { code: "el", label: "EL" },
  { code: "it", label: "IT" },
] as const;

type Props = { node: MenuTreeNode; canEdit: boolean; onChanged(): void };

/**
 * Per-language name / detail of a node, read-only: translations are produced automatically from the
 * Turkish base record (and again whenever it changes); they are not edited by hand.
 */
export function TranslationsTab({ node, canEdit, onChanged }: Props) {
  const [lang, setLang] = useState<(typeof LANGS)[number]["code"]>("en");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const existing = node.translations.find((t) => t.lang === lang);

  const regenerate = async () => {
    setBusy(true);
    setMessage({ ok: true, text: "7 dil için çeviriler otomatik oluşturuluyor..." });
    const res = await autoTranslateMenuNodeAction({ nodeId: node.id });
    setBusy(false);
    if (res.ok) {
      notify.success(`“${node.name}” için ${res.data.languages.length} dil çevirisi otomatik oluşturuldu.`);
      setMessage({ ok: true, text: `${res.data.languages.length} dil çevirisi otomatik oluşturuldu.` });
      onChanged();
    } else {
      setMessage({ ok: false, text: res.error.message });
    }
  };

  return (
    <div className="xp-mm-translations">
      <div role="tablist" aria-label="Çeviri dili" className="xp-mm-langs">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            role="tab"
            aria-selected={l.code === lang}
            className="xp-button"
            data-selected={l.code === lang || undefined}
            onClick={() => {
              setLang(l.code);
              setMessage(null);
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="xp-form xp-mm-form">
        <p className="xp-defs-note">{`Türkçe: ${node.name}`}</p>
        <p role="status" className="xp-defs-note">
          {existing
            ? "Otomatik çeviri · Türkçe metin değişince yeniden oluşturulur"
            : "Çeviri henüz oluşturulmadı · misafir menüsünde Türkçe metin gösterilir"}
        </p>
        <div className="xp-field">
          <span className="xp-field-label">{`Ad (${current.label})`}</span>
          <p dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
            {existing?.name ?? "—"}
          </p>
        </div>
        <div className="xp-field">
          <span className="xp-field-label">{`Açıklama (${current.label})`}</span>
          <p dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
            {existing?.detail ?? "—"}
          </p>
        </div>
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? "xp-defs-note" : "xp-field-error"}>
            {message.text}
          </p>
        ) : null}
        {canEdit ? (
          <div className="xp-dialog-actions">
            <button type="button" className="xp-button" disabled={busy} onClick={() => void regenerate()}>
              7 Dilde Otomatik Yeniden Oluştur
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
