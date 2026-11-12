"use client";

import { useEffect, useState, useTransition } from "react";
import { notify } from "@/shell/notify";
import { confirm } from "@/shell/confirm";
import { Toolbar } from "@/shell/ui/Toolbar";
import { Field } from "@/shell/ui/Field";
import { DataGrid, type Column } from "@/shell/ui/DataGrid";
import type { PageSize, SortSpec } from "@/modules/core/server/admin/listQuery";
import type { AppProps } from "@/shell/registry";
import {
  clearResolvedIncidentsAction,
  getSystemHealthAction,
  listDiagnosticIncidentsAction,
  resolveDiagnosticIncidentAction,
  sendTestDiagnosticAlertAction,
  triggerManualDiagnosticAction,
} from "@/modules/core/server/diagnostic/actions";
import type {
  DiagnosticIncidentData,
  DiagnosticIncidentRow,
  DiagnosticSeverity,
  SystemHealthReport,
} from "@/modules/core/server/diagnostic/types";
import { ServerResourcesPanel } from "./ServerResourcesPanel";
import { listSettingsAction, setSettingAction } from "@/modules/core/server/admin/actions/settingsAdmin";

type Tab = "resources" | "probes" | "incidents" | "settings";

export function DiagnosticWindow({ setStatus }: Pick<AppProps, "setStatus">) {
  const [tab, setTab] = useState<Tab>("resources");
  const [health, setHealth] = useState<SystemHealthReport | null>(null);
  const [incidents, setIncidents] = useState<DiagnosticIncidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState<DiagnosticIncidentRow | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [incidentPage, setIncidentPage] = useState(1);
  const [incidentPageSize, setIncidentPageSize] = useState<PageSize>(20);
  const [incidentSort, setIncidentSort] = useState<SortSpec | undefined>();
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | undefined>();
  const [developerEmail, setDeveloperEmail] = useState("");
  const [autoNotify, setAutoNotify] = useState(true);
  const [minSeverity, setMinSeverity] = useState<DiagnosticSeverity>("HIGH");
  const [savingSettings, setSavingSettings] = useState(false);
  const [isPending, startTransition] = useTransition();

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [healthRes, incRes] = await Promise.all([
        getSystemHealthAction(),
        listDiagnosticIncidentsAction({}),
      ]);

      if (healthRes.ok) {
        setHealth(healthRes.data);
        setStatus(`Sistem Sağlığı: %${healthRes.data.healthScore} (${healthRes.data.overallStatus})`);
      }
      if (incRes.ok) {
        setIncidents(incRes.data);
      }
    } catch {
      notify.error("Diagnostik verileri yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // The stored notification settings fill the form once; without this a reopened window showed the
  // built-in defaults and looked as if nothing had been saved.
  useEffect(() => {
    let live = true;
    void listSettingsAction({ hotelId: null }).then((res) => {
      if (!live || !res.ok) return;
      const stored = new Map(res.data.flatMap((group) => group.items).map((item) => [item.key as string, item.value]));
      const email = stored.get("diagnostic.developerEmail");
      const auto = stored.get("diagnostic.autoNotify");
      const severity = stored.get("diagnostic.minSeverity");
      if (typeof email === "string") setDeveloperEmail(email);
      if (typeof auto === "boolean") setAutoNotify(auto);
      if (typeof severity === "string") setMinSeverity(severity as DiagnosticSeverity);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    // The first load runs outside the effect body (it sets the loading state).
    const first = setTimeout(() => void loadData(), 0);
    const interval = setInterval(() => void loadData(true), 30000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  const handleRunDiagnostics = () => {
    startTransition(async () => {
      const res = await triggerManualDiagnosticAction();
      if (res.ok) {
        setHealth(res.data);
        notify.success(`Diagnostik tanı tamamlandı. Sağlık Skoru: %${res.data.healthScore}`);
      } else {
        notify.error("Tanı çalıştırılamadı: " + res.error.message);
      }
    });
  };

  const handleSendTestAlert = async () => {
    const res = await sendTestDiagnosticAlertAction({ email: developerEmail || undefined });
    if (res.ok && res.data.sent) {
      notify.success(
        `Test bildirimi posta sunucusuna teslim edildi${res.data.recipient ? ` (alıcı: ${res.data.recipient})` : ""}. ` +
          "Gelen kutusunda yoksa gereksiz (spam) klasörüne bakın.",
      );
    } else {
      notify.error(res.ok ? (res.data.error || "Mail iletilemedi") : res.error.message);
    }
  };

  const handleResolveIncident = async (row: DiagnosticIncidentRow) => {
    const res = await resolveDiagnosticIncidentAction({ id: row.id, note: "Yönetici tarafından incelendi." });
    if (res.ok) {
      notify.success("Hata olayı çözüldü olarak işaretlendi.");
      setInspecting(null);
      void loadData(true);
    } else {
      notify.error(res.error.message);
    }
  };

  const handleClearResolved = async () => {
    const ok = await confirm({
      title: "Eski Logları Temizle",
      message: "7 günden eski çözülmüş tüm diagnostik log kayıtları silinsin mi?",
    });
    if (!ok) return;

    const res = await clearResolvedIncidentsAction();
    if (res.ok) {
      notify.success(`${res.data} eski diagnostik kaydı temizlendi.`);
      void loadData(true);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const email = developerEmail.trim();
      // Server actions report a refusal in their result, they do not throw: every result is checked.
      const results = await Promise.all([
        setSettingAction({ hotelId: null, key: "diagnostic.developerEmail", value: email }),
        setSettingAction({ hotelId: null, key: "diagnostic.autoNotify", value: autoNotify }),
        setSettingAction({ hotelId: null, key: "diagnostic.minSeverity", value: minSeverity }),
      ]);
      const failed = results.find((res) => !res.ok);
      if (failed && !failed.ok) {
        notify.error(failed.error.message, { title: "Ayarlar kaydedilemedi" });
        return;
      }
      setDeveloperEmail(email);
      notify.success("Geliştirici tanı bildirim ayarları kaydedildi.");
    } catch {
      notify.error("Ayarlar kaydedilemedi.");
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredIncidents = incidents.filter((row) => {
    if (filterSeverity && row.data.severity !== filterSeverity) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        row.data.module.toLowerCase().includes(q) ||
        row.data.errorMessage.toLowerCase().includes(q) ||
        row.data.rootCause.toLowerCase().includes(q) ||
        row.data.errorId.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const severityRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const incidentValue = (row: DiagnosticIncidentRow, field: string): string | number => {
    switch (field) {
      case "createdAt":
        return new Date(row.createdAt).getTime();
      case "module":
        return row.data.module;
      case "severity":
        return severityRank[row.data.severity] ?? 0;
      case "message":
        return row.data.errorMessage;
      case "mailSent":
        return row.data.mailSent ? 1 : 0;
      case "resolved":
        return row.data.resolved ? 1 : 0;
      default:
        return 0;
    }
  };
  const sortedIncidents = incidentSort
    ? [...filteredIncidents].sort((a, b) => {
        const x = incidentValue(a, incidentSort.field);
        const y = incidentValue(b, incidentSort.field);
        const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "tr");
        return incidentSort.dir === "asc" ? result : -result;
      })
    : filteredIncidents;
  const shownPage = Math.min(incidentPage, Math.max(1, Math.ceil(sortedIncidents.length / incidentPageSize)));
  const pagedIncidents = sortedIncidents.slice((shownPage - 1) * incidentPageSize, shownPage * incidentPageSize);

  const incidentColumns: Column<DiagnosticIncidentRow>[] = [
    {
      key: "createdAt",
      title: "Zaman",
      width: 150,
      sortable: true,
      render: (row) => new Date(row.createdAt).toLocaleString("tr-TR"),
    },
    { key: "module", title: "Modül", width: 110, sortable: true, render: (row) => row.data.module },
    {
      key: "severity",
      title: "Şiddet",
      width: 90,
      sortable: true,
      render: (row) => (
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-bold ${
            row.data.severity === "CRITICAL"
              ? "bg-[var(--danger-bg)] text-danger"
              : row.data.severity === "HIGH"
                ? "bg-[var(--warn-bg)] text-warn"
                : "bg-accent/15 text-accent"
          }`}
        >
          {row.data.severity}
        </span>
      ),
    },
    {
      key: "message",
      title: "Hata & Kök Neden Teşhisi",
      width: "minmax(260px, 1fr)",
      sortable: true,
      render: (row) => `${row.data.errorMessage} — ${row.data.rootCause}`,
    },
    {
      key: "mailSent",
      title: "E-posta",
      width: 190,
      sortable: true,
      // "Gönderildi" = the mail server accepted it for this address; delivery (spam, wrong address) is beyond that.
      render: (row) =>
        row.data.mailSent ? (
          <span title={row.data.mailTo ? `Alıcı: ${row.data.mailTo}` : "Posta sunucusu kabul etti"}>
            Gönderildi{row.data.mailTo ? ` → ${row.data.mailTo}` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "resolved",
      title: "Durum",
      width: 90,
      sortable: true,
      render: (row) => (row.data.resolved ? "Çözüldü" : "● Açık"),
    },
    {
      key: "inspect",
      title: "İncele",
      width: 84,
      sortable: false,
      render: (row) => (
        <button
          type="button"
          className="xp-button text-xs font-bold"
          onClick={(e) => {
            e.stopPropagation();
            setInspecting(row);
          }}
        >
          Rapor
        </button>
      ),
    },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 90) return "var(--success)";
    if (score >= 70) return "var(--warn)";
    return "var(--danger)";
  };

  return (
    <div className="xp-defs flex flex-col h-full bg-[var(--xp-body)] select-none text-xs font-sans overflow-auto">
      {/* Top Header Card */}
      <div className="bg-white border-b border-border p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-md transition-all"
            style={{ backgroundColor: getScoreColor(health?.healthScore ?? 100) }}
          >
            %{health?.healthScore ?? "—"}
          </div>
          <div>
            <h2 className="font-bold text-sm text-text flex items-center gap-2">
              Sistem Hata Denetimi &amp; Kendi Kendini Teşhis Merkezi
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: getScoreColor(health?.healthScore ?? 100) }}
              >
                {health?.overallStatus === "HEALTHY"
                  ? "Sistem Kararlı"
                  : health?.overallStatus === "DEGRADED"
                    ? "Dikkat Gerekli"
                    : "Kritik Durum"}
              </span>
            </h2>
            <p className="text-xs text-muted">
              Çalışma Süresi: <strong>{health?.uptimeFormatted ?? "—"}</strong> · Veritabanı Gecikmesi:{" "}
              <strong>{health?.dbLatencyMs ?? 0} ms</strong> · Canlı Oturumlar:{" "}
              <strong>{health?.activeOnlineSessions ?? 0}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="xp-button font-bold text-accent"
            disabled={isPending || loading}
            onClick={handleRunDiagnostics}
          >
            {isPending ? "Denetleniyor..." : "Şimdi Tanı Çalıştır"}
          </button>
          <button
            type="button"
            className="xp-button"
            disabled={loading}
            onClick={() => void loadData()}
          >
            Yenile
          </button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-bg border-b border-border">
        <div className="bg-white p-2.5 rounded-lg border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted uppercase block">Bellek (Heap Kullanımı)</span>
          <span className="text-base font-bold text-text">
            {health?.memory.heapUsedMb ?? 0} MB
            <span className="text-xs font-normal text-muted"> / {health?.memory.heapLimitMb ?? 0} MB</span>
          </span>
          <div className="w-full bg-[var(--muted-bg)] h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${health?.memory.heapUsagePct ?? 0}%`,
                backgroundColor: (health?.memory.heapUsagePct ?? 0) > 80 ? "var(--danger)" : "var(--accent)",
              }}
            />
          </div>
        </div>

        <div className="bg-white p-2.5 rounded-lg border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted uppercase block">Veritabanı Yanıt Süresi</span>
          <span className="text-base font-bold text-text">
            {health?.dbLatencyMs ?? 0} <span className="text-xs font-normal text-muted">ms</span>
          </span>
          <span className="text-xs block text-success font-medium mt-1">
            {(health?.dbLatencyMs ?? 0) < 50 ? "Mükemmel Tepki Süresi" : "Normal Bağlantı"}
          </span>
        </div>

        <div className="bg-white p-2.5 rounded-lg border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted uppercase block">Kayıtlı Hata / Teşhis Olayları</span>
          <span className="text-base font-bold text-text">{incidents.length}</span>
          <span className="text-xs block text-muted font-medium mt-1">
            {incidents.filter((i) => !i.data.resolved).length} çözülmemiş olay
          </span>
        </div>

        <div className="bg-white p-2.5 rounded-lg border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted uppercase block">Geliştirici Bildirim Kanalı</span>
          <span className="text-xs font-bold text-accent block truncate mt-0.5">
            {autoNotify ? "Aktif (Otomatik E-posta)" : "Devre Dışı"}
          </span>
          <button
            type="button"
            className="text-xs text-accent hover:underline font-semibold mt-1 inline-block"
            onClick={() => void handleSendTestAlert()}
          >
            Test Maili Gönder
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex shrink-0 overflow-x-auto border-b border-border bg-[var(--muted-bg)] px-3 pt-2 gap-1 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          type="button"
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition-colors ${
            tab === "resources"
              ? "bg-white text-accent border-t-2 border-t-accent border-x border-border"
              : "text-muted hover:bg-border"
          }`}
          onClick={() => setTab("resources")}
        >
          Sunucu Kaynakları
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition-colors ${
            tab === "probes"
              ? "bg-white text-accent border-t-2 border-t-accent border-x border-border"
              : "text-muted hover:bg-border"
          }`}
          onClick={() => setTab("probes")}
        >
          Sistem Sağlık Probları ({health?.probes.length ?? 0})
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition-colors ${
            tab === "incidents"
              ? "bg-white text-accent border-t-2 border-t-accent border-x border-border"
              : "text-muted hover:bg-border"
          }`}
          onClick={() => setTab("incidents")}
        >
          Hata Günlüğü &amp; Teşhis Raporları ({incidents.length})
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition-colors ${
            tab === "settings"
              ? "bg-white text-accent border-t-2 border-t-accent border-x border-border"
              : "text-muted hover:bg-border"
          }`}
          onClick={() => setTab("settings")}
        >
          Geliştirici Bildirim Ayarları
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-h-[320px] bg-white p-3.5 overflow-auto">
        {tab === "resources" && <ServerResourcesPanel />}

        {/* TAB 1: HEALTH PROBES */}
        {tab === "probes" && (
          <div className="flex flex-col gap-2.5">
            <p className="text-xs text-muted">
              Kendi kendini denetleme motoru arka planda veritabanı, bellek, e-posta ve bulut servislerini sürekli test eder.
            </p>

            <div className="grid grid-cols-1 gap-2">
              {(health?.probes ?? []).map((probe, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between p-3 rounded-lg border border-border bg-bg hover:bg-[var(--muted-bg)] transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-bold uppercase mt-0.5 ${
                        probe.status === "PASS"
                          ? "bg-[var(--success-bg)] text-success"
                          : probe.status === "WARN"
                            ? "bg-[var(--warn-bg)] text-warn"
                            : "bg-[var(--danger-bg)] text-danger"
                      }`}
                    >
                      {probe.status === "PASS" ? "BAŞARILI" : probe.status === "WARN" ? "UYARI" : "HATA"}
                    </span>
                    <div>
                      <h4 className="font-bold text-xs text-text">{probe.name}</h4>
                      <p className="text-xs text-muted mt-0.5">{probe.message}</p>
                      {probe.recommendation ? (
                        <p className="text-xs text-accent font-medium mt-1 bg-accent/10 p-1.5 rounded border border-accent/40">
                          <strong>Öneri:</strong> {probe.recommendation}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {probe.latencyMs !== undefined ? (
                    <span className="text-xs font-mono text-muted bg-white px-2 py-1 rounded border border-border">
                      {probe.latencyMs} ms
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: INCIDENTS & ROOT CAUSE LOGS */}
        {tab === "incidents" && (
          <div className="flex flex-col h-full min-h-[360px]">
            <DataGrid
              columns={incidentColumns}
              rows={pagedIncidents}
              total={sortedIncidents.length}
              page={shownPage}
              pageSize={incidentPageSize}
              onPage={setIncidentPage}
              onPageSize={(size) => {
                setIncidentPageSize(size);
                setIncidentPage(1);
              }}
              sort={incidentSort}
              onSort={(next) => {
                setIncidentSort(next);
                setIncidentPage(1);
              }}
              q={searchQuery}
              onSearch={(next) => {
                setSearchQuery(next);
                setIncidentPage(1);
              }}
              selectedId={selectedIncidentId}
              onSelect={(row) => setSelectedIncidentId(row.id)}
              onActivate={(row) => setInspecting(row)}
              emptyText={loading ? "Yükleniyor…" : "Kayıtlı sistem hatası bulunamadı."}
              toolbar={
                <div className="xp-grid-toolbar">
                  <label className="xp-user-filter">
                    Şiddet
                    <select
                      aria-label="Şiddet süzgeci"
                      value={filterSeverity}
                      onChange={(e) => {
                        setFilterSeverity(e.target.value);
                        setIncidentPage(1);
                      }}
                    >
                      <option value="">Tüm Şiddet Seviyeleri</option>
                      <option value="CRITICAL">Kritik</option>
                      <option value="HIGH">Yüksek</option>
                      <option value="MEDIUM">Orta</option>
                      <option value="LOW">Düşük</option>
                    </select>
                  </label>
                  <button type="button" className="xp-button" onClick={() => void handleClearResolved()}>
                    Çözülenleri Temizle
                  </button>
                </div>
              }
            />
          </div>
        )}

        {/* TAB 3: SETTINGS */}
        {tab === "settings" && (
          <div className="max-w-xl flex flex-col gap-3.5">
            <p className="text-xs text-muted">
              Sistemde beklenmeyen bir çalışma zamanı hatası veya modül arızası meydana geldiğinde, diagnostik motoru
              otomatik olarak hatayı analiz eder ve bu adrese bildirim gönderir.
            </p>

            <Field name="developerEmail" label="Sistem Geliştiricisi / Uyarı E-postası">
              <input
                type="email"
                placeholder="gelistirici@merithotels.com"
                value={developerEmail}
                onChange={(e) => setDeveloperEmail(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs"
              />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-xs text-text">
              <input
                type="checkbox"
                checked={autoNotify}
                onChange={(e) => setAutoNotify(e.target.checked)}
              />
              Kritik sistem hatalarında geliştiriciye otomatik e-posta gönderilsin
            </label>

            <Field name="minSeverity" label="Asgari Bildirim Şiddeti Eşiği">
              <select
                value={minSeverity}
                onChange={(e) => setMinSeverity(e.target.value as DiagnosticSeverity)}
                className="w-full px-2.5 py-1.5 text-xs"
              >
                <option value="CRITICAL">Yalnızca Kritik Hatalar</option>
                <option value="HIGH">Yüksek ve Kritik (Önerilen)</option>
                <option value="MEDIUM">Orta, Yüksek ve Kritik</option>
                <option value="LOW">Tüm Seviyeler (Hata ve Uyarılar)</option>
              </select>
            </Field>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                className="xp-button font-bold text-accent"
                disabled={savingSettings}
                onClick={() => void handleSaveSettings()}
              >
                {savingSettings ? "Kaydediliyor..." : "Ayarları Kaydet"}
              </button>
              <button
                type="button"
                className="xp-button"
                onClick={() => void handleSendTestAlert()}
              >
                Test Bildirimi Gönder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* INSPECT INCIDENT MODAL */}
      {inspecting && (
        <div className="xp-form-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            className="xp-window xp-dialog xp-form-dialog"
            style={{ width: "min(680px, calc(100% - 24px))", maxHeight: "calc(100% - 24px)" }}
          >
            <header className="xp-titlebar">
              <span className="xp-titlebar-text">
                Diagnostik Teşhis Raporu · #{inspecting.data.errorId} ({inspecting.data.module})
              </span>
              <button
                type="button"
                className="xp-title-button is-close"
                aria-label="Kapat"
                onClick={() => setInspecting(null)}
              >
                ×
              </button>
            </header>

            <div className="xp-form-fields flex flex-col gap-2.5 overflow-auto max-h-[70vh] p-4">
              <div className="flex items-center justify-between p-2.5 bg-bg border border-border rounded">
                <div>
                  <span className="text-xs text-muted block font-semibold uppercase">Hata Zamanı</span>
                  <strong className="text-xs">{new Date(inspecting.createdAt).toLocaleString("tr-TR")}</strong>
                </div>
                <div>
                  <span className="text-xs text-muted block font-semibold uppercase">Modül</span>
                  <strong className="text-xs text-accent">{inspecting.data.module}</strong>
                </div>
                <div>
                  <span className="text-xs text-muted block font-semibold uppercase">Şiddet</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      inspecting.data.severity === "CRITICAL"
                        ? "bg-[var(--danger-bg)] text-danger"
                        : inspecting.data.severity === "HIGH"
                          ? "bg-[var(--warn-bg)] text-warn"
                          : "bg-accent/15 text-accent"
                    }`}
                  >
                    {inspecting.data.severity}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-muted uppercase block mb-1">Hata Mesajı</span>
                <div className="p-2.5 bg-[var(--danger-bg)] text-danger border border-danger/40 rounded font-mono text-xs">
                  {inspecting.data.errorMessage}
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-muted uppercase block mb-1">Kök Neden Teşhisi</span>
                <div className="p-2.5 bg-[var(--warn-bg)] text-warn border border-warn/40 rounded text-xs">
                  {inspecting.data.rootCause}
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-muted uppercase block mb-1">Önerilen Çözüm</span>
                <div className="p-2.5 bg-accent/10 text-accent border border-accent/40 rounded text-xs">
                  {inspecting.data.recommendation}
                </div>
              </div>

              {inspecting.data.stackTrace ? (
                <div>
                  <span className="text-xs font-bold text-muted uppercase block mb-1">
                    Teknik Hata Yığını (Stack Trace)
                  </span>
                  <pre className="p-2.5 bg-brand text-[var(--bg)] rounded font-mono text-xs overflow-auto max-h-40 leading-relaxed">
                    {inspecting.data.stackTrace}
                  </pre>
                </div>
              ) : null}

              {inspecting.data.context ? (
                <div>
                  <span className="text-xs font-bold text-muted uppercase block mb-1">Olay Bağlamı</span>
                  <pre className="p-2 bg-bg border border-border rounded font-mono text-xs overflow-auto max-h-24">
                    {JSON.stringify(inspecting.data.context, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>

            <footer className="xp-dialog-actions justify-between">
              <div>
                {!inspecting.data.resolved ? (
                  <button
                    type="button"
                    className="xp-button font-bold text-success"
                    onClick={() => void handleResolveIncident(inspecting)}
                  >
                    Çözüldü Olarak İşaretle
                  </button>
                ) : (
                  <span className="text-success text-xs font-bold">Bu olay çözüldü</span>
                )}
              </div>
              <button type="button" className="xp-button" onClick={() => setInspecting(null)}>
                Kapat
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
