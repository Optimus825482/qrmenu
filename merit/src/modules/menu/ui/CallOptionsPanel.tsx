"use client";

import { useCallback, useEffect, useState } from "react";
import type { Result } from "@/lib/result";
import { confirm } from "@/shell/confirm";
import { Field } from "@/shell/ui/Field";
import { FormDialog, type FormValues } from "@/shell/ui/FormDialog";
import { useSse } from "@/shell/useSse";
import { CALL_LANGS, MAX_ACTIVE_OPTIONS, type CallLang } from "../callOptions";
import {
  listCallOptionsAction,
  removeCallOptionAction,
  reorderCallOptionsAction,
  saveCallOptionAction,
} from "../server/actions/callOptions";
import type { CallOptionRow } from "../server/callOptions";

const LANG_LABEL: Record<CallLang, string> = { en: "İngilizce", de: "Almanca", ru: "Rusça", ar: "Arapça" };
const TYPE_LABEL = { GARSON: "Garson", HESAP: "Hesap", DIGER: "Diğer" } as const;

type Dialog = { mode: "new" } | { mode: "edit"; row: CallOptionRow } | null;

function missingLangs(row: CallOptionRow): CallLang[] {
  return CALL_LANGS.filter((lang) => !row.translations[lang]?.trim());
}

/** Per-outlet waiter-call options: list, add / edit, order, switch on and off, delete. */
export function CallOptionsPanel({
  outletId,
  onChanged,
}: {
  outletId: string;
  onChanged(options: CallOptionRow[]): void;
}) {
  const [rows, setRows] = useState<CallOptionRow[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const apply = useCallback(
    (next: CallOptionRow[]) => {
      setRows(next);
      onChanged(next);
    },
    [onChanged],
  );

  const load = useCallback(async () => {
    if (!outletId) return;
    const result = await listCallOptionsAction({ outletId });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setCanWrite(result.data.canWrite);
    apply(result.data.options);
  }, [outletId, apply]);

  useEffect(() => {
    // Loading on mount / outlet change is a subscription to server data, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useSse((event) => {
    if (event.type === "realtime.resync") void load();
    else if (event.type === "menu.changed" && event.outletId === outletId) {
      const payload = event.payload as { op?: string } | undefined;
      if (payload?.op === "callOptions") void load();
    }
  }, ["menu.changed", "realtime.resync"]);

  const activeCount = rows.filter((row) => row.isActive).length;
  const full = activeCount >= MAX_ACTIVE_OPTIONS;

  async function persist(result: Result<unknown>) {
    if (!result.ok) setError(result.error.message);
    else setError(null);
    await load();
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const ordered = rows.map((row) => row.id);
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await persist(await reorderCallOptionsAction({ outletId, orderedIds: ordered }));
  }

  async function dropOn(targetId: string) {
    const from = dragging;
    setDragging(null);
    if (!from || from === targetId) return;
    const ordered = rows.map((row) => row.id).filter((id) => id !== from);
    ordered.splice(ordered.indexOf(targetId), 0, from);
    await persist(await reorderCallOptionsAction({ outletId, orderedIds: ordered }));
  }

  async function toggle(row: CallOptionRow) {
    await persist(
      await saveCallOptionAction({
        outletId,
        option: {
          id: row.id,
          label: row.label,
          translations: row.translations,
          callType: row.callType,
          isActive: !row.isActive,
        },
      }),
    );
  }

  async function remove(row: CallOptionRow) {
    const yes = await confirm({
      title: "Seçeneği sil",
      message: `“${row.label}” çağrı seçeneği silinsin mi?`,
      danger: true,
    });
    if (yes) await persist(await removeCallOptionAction({ id: row.id }));
  }

  async function submit(values: FormValues): Promise<Result<unknown>> {
    const translations: Record<string, string> = {};
    for (const lang of CALL_LANGS) translations[lang] = values[`t_${lang}`] ?? "";
    const result = await saveCallOptionAction({
      outletId,
      option: {
        ...(dialog?.mode === "edit" ? { id: dialog.row.id } : {}),
        label: values.label ?? "",
        translations,
        callType: values.callType ?? "GARSON",
        isActive: values.isActive === "on",
      },
    });
    if (result.ok) await load();
    return result;
  }

  const editing = dialog?.mode === "edit" ? dialog.row : undefined;

  return (
    <section className="xp-call-options" aria-label="Garson çağrı seçenekleri">
      <div className="xp-call-options-head">
        <div>
          <strong>Garson çağrı seçenekleri</strong>
          <p>
            Misafir “Garson çağır” düğmesine bastığında bu seçenekleri kendi dilinde görür ({activeCount}/
            {MAX_ACTIVE_OPTIONS} aktif).
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="xp-button"
            disabled={full}
            aria-describedby={full ? "xp-call-options-full" : undefined}
            onClick={() => setDialog({ mode: "new" })}
          >
            Ekle
          </button>
        ) : null}
      </div>
      {full && canWrite ? (
        <p id="xp-call-options-full" className="xp-call-options-note">
          En fazla {MAX_ACTIVE_OPTIONS} aktif seçenek olabilir; yeni eklemek için birini pasife alın.
        </p>
      ) : null}
      {!canWrite ? <p className="xp-call-options-note">Bu seçenekleri yalnızca görüntüleyebilirsiniz.</p> : null}
      {error ? (
        <p className="xp-design-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="xp-call-options-list">
        {rows.map((row, index) => {
          const missing = missingLangs(row);
          return (
            <li
              key={row.id}
              data-inactive={!row.isActive || undefined}
              draggable={canWrite}
              onDragStart={() => setDragging(row.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void dropOn(row.id)}
              onDragEnd={() => setDragging(null)}
            >
              <div className="xp-call-option-main">
                <strong>{row.label}</strong>
                <small>{TYPE_LABEL[row.callType]}</small>
                {missing.length > 0 ? (
                  <span className="xp-call-option-missing">
                    Eksik: {missing.map((lang) => LANG_LABEL[lang]).join(", ")}
                  </span>
                ) : null}
              </div>
              {canWrite ? (
                <div className="xp-call-option-actions">
                  <label className="xp-module-switch">
                    <input type="checkbox" checked={row.isActive} onChange={() => void toggle(row)} />
                    Aktif
                  </label>
                  <button type="button" className="xp-button" aria-label={`${row.label} yukarı taşı`} disabled={index === 0} onClick={() => void move(index, -1)}>
                    ↑
                  </button>
                  <button type="button" className="xp-button" aria-label={`${row.label} aşağı taşı`} disabled={index === rows.length - 1} onClick={() => void move(index, 1)}>
                    ↓
                  </button>
                  <button type="button" className="xp-button" onClick={() => setDialog({ mode: "edit", row })}>
                    Düzenle
                  </button>
                  <button type="button" className="xp-button" onClick={() => void remove(row)}>
                    Sil
                  </button>
                </div>
              ) : (
                <span className="xp-call-option-state">{row.isActive ? "Aktif" : "Pasif"}</span>
              )}
            </li>
          );
        })}
        <li className="xp-call-option-fixed" aria-label="Sabit seçenek">
          <div className="xp-call-option-main">
            <strong>Sadece çağır</strong>
            <small>Garson</small>
            <span className="xp-call-option-note">Her zaman en sonda; düzenlenemez.</span>
          </div>
        </li>
      </ul>
      <FormDialog
        title={editing ? "Çağrı seçeneğini düzenle" : "Yeni çağrı seçeneği"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSubmit={submit}
        submitText={editing ? "Kaydet" : "Ekle"}
      >
        <Field name="label" label="Türkçe etiket (zorunlu)">
          <input type="text" defaultValue={editing?.label ?? ""} maxLength={60} />
        </Field>
        {CALL_LANGS.map((lang) => (
          <Field key={lang} name={`t_${lang}`} label={`${LANG_LABEL[lang]} (isteğe bağlı)`}>
            <input type="text" defaultValue={editing?.translations[lang] ?? ""} maxLength={60} dir={lang === "ar" ? "rtl" : undefined} />
          </Field>
        ))}
        <Field name="callType" label="Çağrı tipi">
          <select defaultValue={editing?.callType ?? "GARSON"}>
            <option value="GARSON">Garson</option>
            <option value="HESAP">Hesap</option>
            <option value="DIGER">Diğer</option>
          </select>
        </Field>
        <label className="xp-module-switch">
          <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />
          Aktif
        </label>
        <p className="xp-call-options-note">Boş bırakılan dillerde misafire Türkçe etiket gösterilir.</p>
      </FormDialog>
    </section>
  );
}
