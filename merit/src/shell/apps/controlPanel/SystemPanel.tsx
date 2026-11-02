"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  clearSettingOverrideAction,
  listSettingsAction,
  setSettingAction,
  settingsScopesAction,
  testDeeplAction,
  testGeminiAction,
} from "@/modules/core/server/admin/actions/settingsAdmin";
import type {
  SettingGroupRow,
  SettingItem,
  SettingSource,
  SettingsScopes,
} from "@/modules/core/server/admin/settingsAdmin";
import type { SettingGroup } from "@/lib/settings-defs";
import { confirm } from "../../confirm";
import { notify } from "../../notify";
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
export function SystemPanel({
  setStatus,
  filterGroups,
  title,
  description,
}: {
  setStatus(text: string): void;
  filterGroups?: SettingGroup[];
  title?: string;
  description?: string;
}) {
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

  const panelTitle = title ?? "Sistem";
  const panelDesc =
    description ??
    "Sistem geneli değerler tüm otellere uygulanır; bir otel kendi değerini tanımlarsa o otelde onu kullanır.";

  const visibleGroups = filterGroups
    ? groups.filter((g) => filterGroups.includes(g.group))
    : groups;

  const showScopeSelector =
    scopes &&
    scopes.hotels.length > 0 &&
    visibleGroups.some((g) => g.items.some((i) => !i.meta.systemOnly));

  return (
    <>
      <h2 className="xp-cp-title">{panelTitle}</h2>
      <p className="xp-cp-note">{panelDesc}</p>
      {showScopeSelector ? (
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
      ) : null}
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
      {visibleGroups.map((g) => (
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = valueOf(item, draft);
  const dirty = meta.secret ? draft !== "" : draft !== initial;
  const canSave = dirty && next !== undefined && !(typeof next === "number" && Number.isNaN(next));

  const save = async (value: unknown = next) => {
    const approved = await confirm({
      title: "Ayarı kaydet",
      message: `${meta.label} ayarı kaydedilsin mi?`,
      danger: true, confirmLabel: "Onayla",
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
        notify.success(`${meta.label} ayarı kaydedildi.`);
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
      danger: true, confirmLabel: "Kaldır",
    });
    if (!yes || hotelId === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await clearSettingOverrideAction({ hotelId, key: item.key });
      if (result.ok) {
        notify.success(`${meta.label} otel değeri kaldırıldı.`);
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
      <select id={id} className="xp-system-select" value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)}>
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
        className="xp-system-input xp-system-input-sm"
        step={meta.step ?? 1}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  } else {
    const placeholder =
      meta.secret && item.source !== "default"
        ? "•••••••• (Kayıtlı — değiştirmek için yeni anahtarı yazın)"
        : meta.placeholder || (meta.secret ? "API anahtarını buraya yapıştırın…" : undefined);
    control = (
      <input
        id={id}
        type={meta.secret ? "password" : "text"}
        autoComplete={meta.secret ? "new-password" : "off"}
        placeholder={placeholder}
        value={draft}
        disabled={busy}
        className="xp-system-input"
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }

  return (
    <div role="group" aria-label={meta.label} className="xp-cp-choices" style={{ marginBottom: 10, alignItems: "center" }}>
      <label htmlFor={id} style={{ minWidth: 200, fontWeight: 600 }} title={meta.description}>
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
      {item.key === "translation.geminiModel" ? (
        <button
          type="button"
          className="xp-button"
          disabled={busy || testing}
          title="Seçili Gemini modeli ile Google AI Studio bağlantısını ve örnek çeviriyi test eder"
          style={{
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "#0055ea",
          }}
          onClick={async () => {
            setTesting(true);
            setTestResult(null);
            try {
              const res = await testGeminiAction({ model: draft });
              if (res.ok) {
                setTestResult({ ok: true, text: res.data.message });
                notify.success(`${res.data.message}`);
              } else {
                const message = res.error.message || "Gemini bağlantı testi başarısız oldu.";
                setTestResult({ ok: false, text: message });
                notify.error(message, { title: "Gemini Bağlantı Testi Başarısız" });
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              setTestResult({ ok: false, text: message });
              notify.error(message, { title: "Bağlantı Hatası" });
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "⏳ Test ediliyor..." : "⚡ Test Et"}
        </button>
      ) : null}
      {item.key === "translation.geminiKey" ? (
        <button
          type="button"
          className="xp-button"
          disabled={busy || testing}
          title="Google AI Studio API anahtarını test eder"
          style={{
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "#0055ea",
          }}
          onClick={async () => {
            setTesting(true);
            setTestResult(null);
            try {
              const res = await testGeminiAction({ apiKey: draft.trim() || undefined });
              if (res.ok) {
                setTestResult({ ok: true, text: res.data.message });
                notify.success(`${res.data.message}`);
              } else {
                const message = res.error.message || "Gemini bağlantı testi başarısız oldu.";
                setTestResult({ ok: false, text: message });
                notify.error(message, { title: "Gemini Bağlantı Testi Başarısız" });
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              setTestResult({ ok: false, text: message });
              notify.error(message, { title: "Bağlantı Hatası" });
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "⏳ Test ediliyor..." : "⚡ Test Et"}
        </button>
      ) : null}
      {item.key === "translation.deeplKey" ? (
        <button
          type="button"
          className="xp-button"
          disabled={busy || testing}
          title="DeepL API anahtarını ve bağlantısını test eder"
          style={{
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "#0055ea",
          }}
          onClick={async () => {
            setTesting(true);
            setTestResult(null);
            try {
              const res = await testDeeplAction({ apiKey: draft.trim() || undefined });
              if (res.ok) {
                setTestResult({ ok: true, text: res.data.message });
                notify.success(`${res.data.message}`);
              } else {
                const message = res.error.message || "DeepL bağlantı testi başarısız oldu.";
                setTestResult({ ok: false, text: message });
                notify.error(message, { title: "DeepL Bağlantı Testi Başarısız" });
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              setTestResult({ ok: false, text: message });
              notify.error(message, { title: "Bağlantı Hatası" });
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? "⏳ Test ediliyor..." : "⚡ Test Et"}
        </button>
      ) : null}
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
      <div className="xp-cp-note" style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
        <span>{meta.description}</span>
        {meta.helpLink ? (
          <a
            href={meta.helpLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="xp-system-help-link"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "#0055ea",
              fontWeight: 700,
              textDecoration: "underline",
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              background: "rgba(0, 85, 234, 0.08)",
            }}
          >
            🔑 {meta.helpLink.label} ↗
          </a>
        ) : null}
      </div>
      {testResult ? (
        <div
          role="status"
          style={{
            flexBasis: "100%",
            marginTop: 4,
            padding: "4px 8px",
            borderRadius: 3,
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            backgroundColor: testResult.ok ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${testResult.ok ? "#a7f3d0" : "#fecaca"}`,
            color: testResult.ok ? "#065f46" : "#991b1b",
          }}
        >
          <span>{testResult.ok ? "✅" : "⚠️"}</span>
          <span>{testResult.text}</span>
        </div>
      ) : null}
      {error ? (
        <span role="alert" className="xp-defs-error" style={{ flexBasis: "100%" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
