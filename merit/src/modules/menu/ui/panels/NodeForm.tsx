"use client";

import { type FormEvent, useState } from "react";
import type { FieldErrors } from "@/lib/result";
import { FieldErrorsContext } from "@/shell/ui/formContext";
import { Field } from "@/shell/ui/Field";
import { ALLERGENS } from "../../allergens";
import { setMenuAvailabilityAction, updateMenuNodeAction } from "../../server/actions/menuTree";
import type { MenuTreeNode } from "../../server/menuTree";
import { ImageField } from "./ImageField";
import { KIND_LABEL } from "./TreePane";
import { TranslationsTab } from "./TranslationsTab";

const ALLERGEN_LABEL: Record<(typeof ALLERGENS)[number], string> = {
  gluten: "Gluten",
  sut: "Süt",
  yumurta: "Yumurta",
  kuruyemis: "Kuruyemiş",
  deniz_urunu: "Deniz ürünü",
  alkol: "Alkol",
  soya: "Soya",
  susam: "Susam",
};

type Props = {
  node: MenuTreeNode;
  canEdit: boolean;
  setDirty(dirty: boolean): void;
  onChanged(): void;
};

/** Edit form of the selected node: fields, availability switch, photo and translations. */
export function NodeForm({ node, canEdit, setDirty, onChanged }: Props) {
  const [tab, setTab] = useState<"bilgi" | "ceviri">("bilgi");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const isItem = node.kind === "OGE";

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {
      name: String(form.get("name") ?? ""),
      detail: String(form.get("detail") ?? ""),
      isActive: form.get("isActive") === "on",
    };
    if (isItem) {
      const raw = String(form.get("price") ?? "").trim().replace(",", ".");
      data.price = raw === "" ? null : Number(raw);
      data.allergens = form.getAll("allergens").map(String);
    }
    setMessage(null);
    setErrors({});
    const result = await updateMenuNodeAction({ nodeId: node.id, data });
    if (result.ok) {
      setDirty(false);
      setMessage({ ok: true, text: "Kaydedildi" });
      onChanged();
    } else {
      setMessage({ ok: false, text: result.error.message });
      setErrors(result.error.fieldErrors ?? {});
    }
  };

  const toggleAvailable = async (soldOut: boolean) => {
    const result = await setMenuAvailabilityAction({ nodeId: node.id, available: !soldOut });
    if (!result.ok) setMessage({ ok: false, text: result.error.message });
    onChanged();
  };

  return (
    <div className="xp-mm-detail">
      <div className="xp-mm-detail-head">
        <strong>{`${KIND_LABEL[node.kind]}: ${node.name}`}</strong>
        <label className="xp-module-switch">
          <input
            type="checkbox"
            role="switch"
            checked={!node.isAvailable}
            disabled={!canEdit}
            onChange={(e) => void toggleAvailable(e.target.checked)}
          />
          Tükendi
        </label>
      </div>
      <div role="tablist" aria-label="Öğe bölümleri" className="xp-mm-langs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "bilgi"}
          className="xp-button"
          data-selected={tab === "bilgi" || undefined}
          onClick={() => setTab("bilgi")}
        >
          Bilgiler
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ceviri"}
          className="xp-button"
          data-selected={tab === "ceviri" || undefined}
          onClick={() => setTab("ceviri")}
        >
          Çeviriler
        </button>
      </div>
      {tab === "ceviri" ? (
        <TranslationsTab node={node} canEdit={canEdit} onChanged={onChanged} />
      ) : (
        <>
          <form
            key={node.id}
            className="xp-form xp-mm-form"
            noValidate
            onChange={() => canEdit && setDirty(true)}
            onSubmit={(e) => void submit(e)}
          >
            {message ? (
              <p role={message.ok ? "status" : "alert"} className={message.ok ? "xp-defs-note" : "xp-form-banner"}>
                {message.text}
              </p>
            ) : null}
            <FieldErrorsContext.Provider value={errors}>
              <Field name="name" label="Ad">
                <input type="text" defaultValue={node.name} maxLength={120} readOnly={!canEdit} />
              </Field>
              <Field name="detail" label="Açıklama">
                <textarea rows={3} defaultValue={node.detail ?? ""} maxLength={1000} readOnly={!canEdit} />
              </Field>
              {isItem ? (
                <Field name="price" label={`Fiyat (${node.currency})`}>
                  <input type="text" inputMode="decimal" defaultValue={node.price ?? ""} readOnly={!canEdit} />
                </Field>
              ) : null}
            </FieldErrorsContext.Provider>
            {isItem ? (
              <fieldset className="xp-mm-allergens">
                <legend>Alerjenler</legend>
                {ALLERGENS.map((a) => (
                  <label key={a} className="xp-module-switch">
                    <input
                      type="checkbox"
                      name="allergens"
                      value={a}
                      defaultChecked={node.allergens.includes(a)}
                      disabled={!canEdit}
                    />
                    {ALLERGEN_LABEL[a]}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="xp-module-switch">
              <input type="checkbox" name="isActive" defaultChecked={node.isActive} disabled={!canEdit} />
              Aktif
            </label>
            {canEdit ? (
              <div className="xp-dialog-actions">
                <button type="submit" className="xp-button">
                  Kaydet
                </button>
              </div>
            ) : null}
          </form>
          {isItem ? <ImageField node={node} canEdit={canEdit} onChanged={onChanged} /> : null}
        </>
      )}
    </div>
  );
}
