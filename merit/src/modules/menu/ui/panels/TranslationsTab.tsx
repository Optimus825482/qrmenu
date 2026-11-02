"use client";

import { useState } from "react";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { removeTranslationAction, setTranslationAction, verifyTranslationAction } from "../../server/actions/menuTree";
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

/** Per-language name / detail of a node (Turkish is the base record). */
export function TranslationsTab({ node, canEdit, onChanged }: Props) {
  const [lang, setLang] = useState<(typeof LANGS)[number]["code"]>("en");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const existing = node.translations.find((t) => t.lang === lang);

  const save = async (form: HTMLFormElement) => {
    const approved = await confirm({
      title: "Çeviriyi kaydet",
      message: `${current.label} dili için “${node.name}” çevirisi kaydedilsin mi?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) return;
    const values = new FormData(form);
    const result = await setTranslationAction({
      nodeId: node.id,
      lang,
      data: { name: String(values.get("name") ?? ""), detail: String(values.get("detail") ?? "") },
    });
    if (result.ok) {
      notify.success(`${current.label} çevirisi güncellendi.`);
      setMessage({ ok: true, text: `${current.label} çevirisi kaydedildi` });
      onChanged();
    } else {
      setMessage({ ok: false, text: result.error.fieldErrors?.name?.[0] ?? result.error.message });
    }
  };

  const remove = async () => {
    const approved = await confirm({
      title: "Çeviriyi sil",
      message: `${current.label} dilindeki “${node.name}” çevirisi silinsin mi?`,
      danger: true, confirmLabel: "Sil",
    });
    if (!approved) return;
    const result = await removeTranslationAction({ nodeId: node.id, lang });
    if (result.ok) {
      notify.success(`${current.label} çevirisi silindi.`);
    }
    setMessage(
      result.ok
        ? { ok: true, text: `${current.label} çevirisi silindi` }
        : { ok: false, text: result.error.message },
    );
    if (result.ok) onChanged();
  };

  const verify = async () => {
    const approved = await confirm({ title: "Çeviriyi onayla", message: `${current.label} çevirisini kontrol ettiniz mi? Onaylanan çeviri misafir menüsünde gösterilir.`, danger: true, confirmLabel: "Onayla" });
    if (!approved) return;
    const result = await verifyTranslationAction({ nodeId: node.id, lang });
    setMessage(result.ok ? { ok: true, text: `${current.label} çevirisi onaylandı ve misafir menüsünde gösterilecek.` } : { ok: false, text: result.error.message });
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
        {existing ? <p role="status" className="xp-defs-note">{existing.isVerified ? "Onaylı çeviri · misafir menüsünde gösteriliyor" : "Otomatik çeviri · kontrol ve onay bekliyor; misafir menüsünde gösterilmiyor"}</p> : null}
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
              Düzenle ve onayla
            </button>
            {existing ? (
              <button type="button" className="xp-button" disabled={existing.isVerified} onClick={() => void verify()}>
                Çeviriyi onayla
              </button>
            ) : null}
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
