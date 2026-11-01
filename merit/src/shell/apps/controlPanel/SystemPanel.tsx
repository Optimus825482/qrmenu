"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  clearSettingOverrideAction,
  listSettingsAction,
  setSettingAction,
  settingsScopesAction,
} from "@/modules/core/server/admin/actions/settingsAdmin";
import type {
  SettingGroupRow,
  SettingItem,
  SettingSource,
  SettingsScopes,
} from "@/modules/core/server/admin/settingsAdmin";
import { alertDialog, confirm } from "../../confirm";
import { useSse } from "../../useSse";

const SOURCE_LABEL: Record<SettingSource, string> = {
  default: "varsayılan",
  system: "sistem",
  hotel: "otel",
};

const SSE_TYPES = ["settings.changed"] as const;
const SYSTEM_SCOPE = "";

type Notice = { kind: "ok" | "error"; text: string } | null;

/** Draft text of an item's editor (what the field shows before saving). */
function draftOf(item: SettingItem): string {
  if (item.meta.secret) return "";
  if (item.meta.type === "boolean") return item.value ? "true" : "false";
  return String(item.value ?? "");
}

/** The value to send for a draft; `undefined` when nothing can be sent yet. */
function valueOf(item: SettingItem, draft: string): unknown {
  switch (item.meta.type) {
    case "boolean":
      return draft === "true";
    case "number":
      return draft.trim() === "" ? undefined : Number(draft);
    case "enum":
      return item.meta.options?.find((o) => String(o.value) === draft)?.value;
    default:
      return draft;
  }
}

/** Denetim Masası → Sistem: settings of the system or of one hotel, grouped, edited field by field. */
export function SystemPanel({ setStatus }: { setStatus(text: string): void }) {
  const [scopes, setScopes] = useState<SettingsScopes | null>(null);
  const [scope, setScope] = useState<string | null>(null); // SYSTEM_SCOPE or a hotel id
  const [groups, setGroups] = useState<SettingGroupRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [tick, setTick] = useState(0);
  const id = useId();

  useEffect(() => {
    let current = true;
    settingsScopesAction()
      .then((r) => {
        if (!current) return;
        if (!r.ok) return setLoadError(r.error.message);
        setScopes(r.data);
        setScope(r.data.system ? SYSTEM_SCOPE : (r.data.hotels[0]?.id ?? null));
      })
      .catch(() => current && setLoadError("Kapsamlar yüklenemedi"));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (scope === null) return;
    let current = true;
    listSettingsAction({ hotelId: scope === SYSTEM_SCOPE ? null : scope })
      .then((r) => {
        if (!current) return;
        if (r.ok) {
          setGroups(r.data);
          setLoadError(null);
        } else {
          setLoadError(r.error.message);
        }
      })
      .catch(() => current && setLoadError("Ayarlar yüklenemedi"));
    return () => {
      current = false;
    };
  }, [scope, tick]);

  useSse(() => setTick((t) => t + 1), SSE_TYPES);

  const replace = useCallback((item: SettingItem) => {
    setGroups((current) =>
      current.map((g) => ({ ...g, items: g.items.map((i) => (i.key === item.key ? item : i)) })),
    );
  }, []);

  if (!scopes) {
    return loadError ? (
      <p role="alert" className="xp-defs-error">
        {loadError}
      </p>
    ) : (
      <p className="xp-defs-note">Yükleniyor…</p>
    );
  }

  const hotelId = scope === null || scope === SYSTEM_SCOPE ? null : scope;
  const scopeName =
    hotelId === null ? "Sistem geneli" : (scopes.hotels.find((h) => h.id === hotelId)?.name ?? "");

  return (
    <>
      <h2 className="xp-cp-title">Sistem</h2>
      <p className="xp-cp-note">
        Sistem geneli değerler tüm otellere uygulanır; bir otel kendi değerini tanımlarsa o
        otelde onu kullanır.
      </p>
      <div className="xp-cp-color">
        <label htmlFor={`${id}-scope`}>Kapsam</label>
        <select
          id={`${id}-scope`}
          value={scope ?? ""}
          onChange={(e) => {
            setScope(e.target.value);
            setNotice(null);
          }}
        >
          {scopes.system ? <option value={SYSTEM_SCOPE}>Sistem geneli</option> : null}
          {scopes.hotels.map((h) => (
            <option key={h.id} value={h.id}>
              Otel: {h.name}
            </option>
          ))}
        </select>
      </div>
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className="xp-defs-note">
          {notice.text}
        </p>
      ) : null}
      {loadError ? (
        <p role="alert" className="xp-defs-error">
          {loadError}
        </p>
      ) : null}
      {groups.map((g) => (
        <section key={g.group} className="xp-cp-section" aria-label={g.group}>
          <h3 className="xp-cp-heading">{g.group}</h3>
          {g.items.map((item) => (
            <SettingRow
              key={`${scope}:${item.key}:${item.source}:${JSON.stringify(item.value)}`}
              item={item}
              hotelId={hotelId}
              onChanged={(next, text) => {
                replace(next);
                setNotice({ kind: "ok", text });
                setStatus(`${scopeName}: ${text}`);
              }}
              onFailed={(text) => setNotice({ kind: "error", text })}
            />
          ))}
        </section>
      ))}
    </>
  );
}

function SettingRow({
  item,
  hotelId,
  onChanged,
  onFailed,
}: {
  item: SettingItem;
  hotelId: string | null;
  onChanged(next: SettingItem, text: string): void;
  onFailed(text: string): void;
}) {
  const { meta } = item;
  const id = useId();
  const initial = draftOf(item);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = valueOf(item, draft);
  const dirty = meta.secret ? draft !== "" : draft !== initial;
  const canSave = dirty && next !== undefined && !(typeof next === "number" && Number.isNaN(next));

  const save = async (value: unknown = next) => {
    const approved = await confirm({
      title: "Ayarı kaydet",
      message: `${meta.label} ayarı kaydedilsin mi?`,
      danger: true,
    });
    if (!approved) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setSettingAction({ hotelId, key: item.key, value });
      if (result.ok) {
        // A saved secret comes back masked, so the row's identity does not change and it would
        // not remount: empty the field here or the clear text stays on screen.
        if (meta.secret) setDraft("");
        await alertDialog({ title: "İşlem tamamlandı", message: `${meta.label} ayarı kaydedildi.` });
        onChanged(result.data, `${meta.label} kaydedildi`);
      } else {
        const message = result.error.fieldErrors?.value?.[0] ?? result.error.message;
        setError(message);
        onFailed(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    const yes = await confirm({
      title: "Otel değerini kaldır",
      message: `${meta.label} için bu otele özel değer kaldırılsın mı? Sistem geneli (ya da varsayılan) değer uygulanır.`,
      danger: true,
    });
    if (!yes || hotelId === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await clearSettingOverrideAction({ hotelId, key: item.key });
      if (result.ok) {
        await alertDialog({ title: "İşlem tamamlandı", message: `${meta.label} otel değeri kaldırıldı.` });
        onChanged(result.data, `${meta.label} otel değeri kaldırıldı`);
      }
      else {
        setError(result.error.message);
        onFailed(result.error.message);
      }
    } finally {
      setBusy(false);
    }
  };

  let control;
  if (meta.type === "boolean") {
    control = (
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={draft === "true"}
        disabled={busy}
        onChange={(e) => setDraft(e.target.checked ? "true" : "false")}
      />
    );
  } else if (meta.type === "enum") {
    control = (
      <select id={id} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)}>
        {meta.options?.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (meta.type === "number") {
    control = (
      <input
        id={id}
        type="number"
        step={meta.step ?? 1}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  } else {
    control = (
      <input
        id={id}
        type={meta.secret ? "password" : "text"}
        autoComplete={meta.secret ? "new-password" : "off"}
        placeholder={meta.secret && item.source !== "default" ? "Kayıtlı (değiştirmek için yazın)" : undefined}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }

  return (
    <div role="group" aria-label={meta.label} className="xp-cp-choices" style={{ marginBottom: 6 }}>
      <label htmlFor={id} style={{ minWidth: 200 }} title={meta.description}>
        {meta.label}
      </label>
      {control}
      {meta.unit ? <span className="xp-cp-note">{meta.unit}</span> : null}
      <span className="xp-badge" data-source={item.source}>
        {SOURCE_LABEL[item.source]}
      </span>
      <button type="button" className="xp-button" disabled={busy || !canSave} onClick={() => void save()}>
        Kaydet
      </button>
      {meta.secret && item.source !== "default" ? (
        <button type="button" className="xp-button" disabled={busy} onClick={() => void save("")}>
          Değeri temizle
        </button>
      ) : null}
      {hotelId !== null && item.source === "hotel" ? (
        <button type="button" className="xp-button" disabled={busy} onClick={() => void clear()}>
          Otel değerini kaldır
        </button>
      ) : null}
      <span className="xp-cp-note" style={{ flexBasis: "100%" }}>
        {meta.description}
      </span>
      {error ? (
        <span role="alert" className="xp-defs-error" style={{ flexBasis: "100%" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
