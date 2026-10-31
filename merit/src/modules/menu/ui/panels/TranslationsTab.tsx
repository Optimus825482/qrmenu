"use client";

import { useState } from "react";
import { removeTranslationAction, setTranslationAction } from "../../server/actions/menuTree";
import type { MenuTreeNode } from "../../server/menuTree";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "ru", label: "RU" },
  { code: "ar", label: "AR" },
] as const;

type Props = { node: MenuTreeNode; canEdit: boolean; onChanged(): void };

/** Per-language name / detail of a node (Turkish is the base record). */
export function TranslationsTab({ node, canEdit, onChanged }: Props) {
  const [lang, setLang] = useState<(typeof LANGS)[number]["code"]>("en");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const existing = node.translations.find((t) => t.lang === lang);

  const save = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    const result = await setTranslationAction({
      nodeId: node.id,
      lang,
      data: { name: String(values.get("name") ?? ""), detail: String(values.get("detail") ?? "") },
    });
    if (result.ok) {
      setMessage({ ok: true, text: `${current.label} çevirisi kaydedildi` });
      onChanged();
    } else {
      setMessage({ ok: false, text: result.error.fieldErrors?.name?.[0] ?? result.error.message });
    }
  };

  const remove = async () => {
    const result = await removeTranslationAction({ nodeId: node.id, lang });
    setMessage(
      result.ok
        ? { ok: true, text: `${current.label} çevirisi silindi` }
        : { ok: false, text: result.error.message },
    );
    if (result.ok) onChanged();
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
      <form
        key={`${node.id}-${lang}-${existing?.name ?? ""}-${existing?.detail ?? ""}`}
        className="xp-form xp-mm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
      >
        <p className="xp-defs-note">{`Türkçe: ${node.name}`}</p>
        <div className="xp-field">
          <label className="xp-field-label" htmlFor={`tr-name-${lang}`}>
            {`Ad (${current.label})`}
          </label>
          <input
            id={`tr-name-${lang}`}
            name="name"
            type="text"
            maxLength={120}
            dir={lang === "ar" ? "rtl" : "ltr"}
            lang={lang}
            defaultValue={existing?.name ?? ""}
            readOnly={!canEdit}
          />
        </div>
        <div className="xp-field">
          <label className="xp-field-label" htmlFor={`tr-detail-${lang}`}>
            {`Açıklama (${current.label})`}
          </label>
          <textarea
            id={`tr-detail-${lang}`}
            name="detail"
            rows={3}
            maxLength={1000}
            dir={lang === "ar" ? "rtl" : "ltr"}
            lang={lang}
            defaultValue={existing?.detail ?? ""}
            readOnly={!canEdit}
          />
        </div>
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? "xp-defs-note" : "xp-field-error"}>
            {message.text}
          </p>
        ) : null}
        {canEdit ? (
          <div className="xp-dialog-actions">
            <button type="submit" className="xp-button">
              Çeviriyi kaydet
            </button>
            {existing ? (
              <button type="button" className="xp-button" onClick={() => void remove()}>
                Çeviriyi sil
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  );
}
