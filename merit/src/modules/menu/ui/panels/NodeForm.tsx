"use client";

import { type FormEvent, useRef, useState } from "react";
import type { FieldErrors } from "@/lib/result";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { FieldErrorsContext } from "@/shell/ui/formContext";
import { Field } from "@/shell/ui/Field";
import {
  ALLERGENS,
  ALLERGEN_INFO,
  ALLERGEN_PRESETS,
  inferAllergensForItem,
  shortenMenuDetail,
  type AllergenKey,
} from "../../allergens";
import { ITEM_TAGS } from "../../design";
import { autoTranslateMenuNodeAction, setMenuAvailabilityAction, updateMenuNodeAction } from "../../server/actions/menuTree";
import type { MenuTreeNode } from "../../server/menuTree";
import { ImageField } from "./ImageField";
import { KIND_LABEL } from "./TreePane";
import { TranslationsTab } from "./TranslationsTab";

const ALLERGEN_LABEL: Record<(typeof ALLERGENS)[number], string> = {
  gluten: "Gluten içeren tahıl",
  sut: "Süt",
  yumurta: "Yumurta",
  kuruyemis: "Sert kabuklu meyve",
  yerfistigi: "Yer fıstığı",
  deniz_urunu: "Kabuklu deniz ürünü",
  yumusakca: "Yumuşakça",
  balik: "Balık",
  alkol: "Alkol",
  soya: "Soya",
  susam: "Susam",
  kereviz: "Kereviz",
  hardal: "Hardal",
  sulfit: "Sülfit",
  acibakla: "Acı bakla",
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
  const [showAllergenGuide, setShowAllergenGuide] = useState(false);
  const [detailLen, setDetailLen] = useState((node.detail ?? "").length);
  const formRef = useRef<HTMLFormElement>(null);
  const isItem = node.kind === "OGE";

  const applyAllergenSelection = (keys: AllergenKey[]) => {
    const formEl = formRef.current;
    if (!formEl || !canEdit) return;
    const keySet = new Set<string>(keys);
    const inputs = formEl.querySelectorAll<HTMLInputElement>('input[name="allergens"]');
    inputs.forEach((inp) => {
      inp.checked = keySet.has(inp.value);
    });
    setDirty(true);
  };

  const handleSmartDetectAllergens = () => {
    const formEl = formRef.current;
    if (!formEl) return;
    const nameVal = (formEl.querySelector<HTMLInputElement>('input[name="name"]')?.value ?? node.name).trim();
    const detailVal = (formEl.querySelector<HTMLTextAreaElement>('textarea[name="detail"]')?.value ?? node.detail ?? "").trim();
    const inferred = inferAllergensForItem({ name: nameVal, detail: detailVal });
    applyAllergenSelection(inferred.allergens);
    if (inferred.allergens.length > 0) {
      notify.success(`Akıllı tespit: ${inferred.allergens.map((a) => ALLERGEN_LABEL[a]).join(", ")} (${inferred.reason})`);
    } else {
      notify.info(inferred.reason);
    }
  };

  const handleShortenDetailInForm = () => {
    const formEl = formRef.current;
    if (!formEl || !canEdit) return;
    const textarea = formEl.querySelector<HTMLTextAreaElement>('textarea[name="detail"]');
    if (!textarea) return;
    const shortened = shortenMenuDetail(textarea.value, 135);
    textarea.value = shortened;
    setDetailLen(shortened.length);
    setDirty(true);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // React clears currentTarget once the handler yields (the confirmation awaits).
    const formElement = e.currentTarget;
    const approved = await confirm({
      title: "Menü kaydını güncelle",
      message: `“${node.name}” kaydındaki değişiklikler kaydedilsin mi?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) return;
    const form = new FormData(formElement);
    const data: Record<string, unknown> = {
      name: String(form.get("name") ?? ""),
      detail: String(form.get("detail") ?? ""),
      isActive: form.get("isActive") === "on",
    };
    if (isItem) {
      const raw = String(form.get("price") ?? "").trim().replace(",", ".");
      data.price = raw === "" ? null : Number(raw);
      data.allergens = form.getAll("allergens").map(String);
      data.tags = form.getAll("tags").map(String);
    }
    setMessage(null);
    setErrors({});
    const result = await updateMenuNodeAction({ nodeId: node.id, data });
    if (result.ok) {
      const translations = await autoTranslateMenuNodeAction({ nodeId: node.id });
      setDirty(false);
      setMessage(translations.ok
        ? { ok: true, text: `Bilgiler kaydedildi; ${translations.data.languages.length} dilde otomatik çeviri oluşturuldu. Çevirileri yayından önce gözden geçirin.` }
        : { ok: false, text: `Bilgiler kaydedildi ancak çeviriler oluşturulamadı: ${translations.error.message}` });
      if (translations.ok) notify.success(`“${node.name}” bilgileri kaydedildi. ${translations.data.languages.length} dil için DeepL çevirisi oluşturuldu ve yanıtların eksiksiz olduğu doğrulandı. Menü terimlerini kullanmadan önce kontrol edin.`);
      onChanged();
    } else {
      setMessage({ ok: false, text: result.error.message });
      setErrors(result.error.fieldErrors ?? {});
    }
  };

  const toggleAvailable = async (soldOut: boolean) => {
    const approved = await confirm({
      title: "Menü durumunu güncelle",
      message: `“${node.name}” için tükenme durumu değiştirilsin mi?`,
      danger: true, confirmLabel: "Onayla",
    });
    if (!approved) return;
    const result = await setMenuAvailabilityAction({ nodeId: node.id, available: !soldOut });
    if (!result.ok) {
      setMessage({ ok: false, text: result.error.message });
      return;
    }
    notify.success(`“${node.name}” menü durumu güncellendi.`);
    onChanged();
  };

  return (
    <div className="xp-mm-detail">
      <div className="xp-mm-detail-head">
        <strong>{`${KIND_LABEL[node.kind]}: ${node.name}`}</strong>
        <label className="xp-module-switch" data-guide="satisa-ac-kapa">
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
          data-guide="ceviriler"
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
            ref={formRef}
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
                <textarea
                  rows={3}
                  defaultValue={node.detail ?? ""}
                  maxLength={1000}
                  readOnly={!canEdit}
                  onChange={(e) => setDetailLen(e.target.value.length)}
                />
              </Field>
              {isItem ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, marginTop: -2, marginBottom: 4 }}>
                  <span style={{ color: detailLen > 140 ? "#b45309" : "#555", fontWeight: detailLen > 140 ? 700 : 400 }}>
                    Açıklama uzunluğu: {detailLen} / 140 önerilen karakter
                  </span>
                  {canEdit && detailLen > 140 ? (
                    <button
                      type="button"
                      className="xp-button"
                      style={{ fontSize: 10, padding: "1px 6px" }}
                      onClick={handleShortenDetailInForm}
                    >
                      ✂️ 140 Karakter Altına Kısalt
                    </button>
                  ) : null}
                </div>
              ) : null}
              {isItem ? (
                <Field name="price" label={`Fiyat (${node.currency})`}>
                  <input type="text" inputMode="decimal" defaultValue={node.price ?? ""} readOnly={!canEdit} />
                </Field>
              ) : null}
            </FieldErrorsContext.Provider>
            {isItem ? (
              <fieldset className="xp-mm-allergens">
                <legend>Alerjenler</legend>
                {canEdit ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                      alignItems: "center",
                      marginBottom: 6,
                      paddingBottom: 6,
                      borderBottom: "1px solid #d0ccbb",
                    }}
                  >
                    <select
                      aria-label="Hazır alerjen şablonu seçin"
                      defaultValue=""
                      onChange={(e) => {
                        const preset = ALLERGEN_PRESETS.find((p) => p.id === e.target.value);
                        if (preset) {
                          applyAllergenSelection(preset.allergens);
                          e.target.value = "";
                        }
                      }}
                      style={{ fontSize: 11, padding: "2px 6px", maxWidth: 250 }}
                    >
                      <option value="">📋 Hazır Alerjen Şablonu Seçin...</option>
                      {ALLERGEN_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.category}] {p.label} ({p.allergens.map((a) => ALLERGEN_INFO[a].shortLabel).join(", ")})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="xp-button"
                      style={{ fontSize: 10, padding: "2px 7px", fontWeight: 600 }}
                      onClick={handleSmartDetectAllergens}
                      title="Ürünün adına ve açıklamasına göre içerdiği alerjenleri otomatik işaretler"
                    >
                      ✨ Ürüne Göre Akıllı Seç
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      style={{ fontSize: 10, padding: "2px 7px" }}
                      onClick={() => applyAllergenSelection([])}
                    >
                      Temizle
                    </button>
                    <button
                      type="button"
                      className="xp-button"
                      style={{ fontSize: 10, padding: "2px 7px" }}
                      onClick={() => setShowAllergenGuide((v) => !v)}
                    >
                      {showAllergenGuide ? "Rehberi Gizle" : "ℹ️ Alerjen Rehberi"}
                    </button>
                  </div>
                ) : null}
                {showAllergenGuide ? (
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      background: "#ffffff",
                      border: "1px solid #aca899",
                      borderRadius: 3,
                      padding: 6,
                      marginBottom: 6,
                      fontSize: 10,
                      maxHeight: 150,
                      overflowY: "auto",
                    }}
                  >
                    {ALLERGENS.map((a) => (
                      <div key={a} style={{ marginBottom: 3 }}>
                        <strong>{ALLERGEN_INFO[a].label}:</strong> {ALLERGEN_INFO[a].description}{" "}
                        <em style={{ color: "#555" }}>({ALLERGEN_INFO[a].examples})</em>
                      </div>
                    ))}
                  </div>
                ) : null}
                {ALLERGENS.map((a) => (
                  <label key={a} className="xp-module-switch" title={`${ALLERGEN_INFO[a].description} — Örn: ${ALLERGEN_INFO[a].examples}`}>
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
            {isItem ? (
              <fieldset className="xp-mm-allergens">
                <legend>Etiketler</legend>
                {ITEM_TAGS.map((tag) => (
                  <label key={tag.id} className="xp-module-switch">
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag.id}
                      defaultChecked={node.tags.includes(tag.id)}
                      disabled={!canEdit}
                    />
                    {tag.label}
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
