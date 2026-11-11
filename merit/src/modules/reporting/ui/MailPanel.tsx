"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { listEmailLogAction, mailScopesAction, retryEmailLogAction, sendTestMailAction } from "@/modules/reporting/server/actions/mail";
import type { MailLogRow, MailPanelData, MailScopes } from "@/modules/reporting/server/mail/panel";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { DataGrid, type Column } from "@/shell/ui/DataGrid";
import { useSse } from "@/shell/useSse";
import { HotelBadges } from "@/components/ui/HotelBadge";

const SSE_TYPES = ["mail.failed"] as const;
const SYSTEM = "";

export const STATUS_LABEL: Record<MailLogRow["status"], string> = {
  GONDERILDI: "Gönderildi",
  BEKLEMEDE: "Bekliyor",
  HATA: "Hata",
  IPTAL: "İptal",
};

const TEMPLATE_LABEL: Record<string, string> = {
  GOREV: "Görev raporu",
  SARFIYAT: "Sarfiyat raporu",
  YUKLEME_UYARI: "Yükleme uyarısı",
  TEST: "Test",
};

const SOURCE_LABEL: Record<string, string> = {
  hotel: "Otel ayarı",
  system: "Sistem ayarı",
  env: "Ortam değişkeni (.env)",
};

const SECURITY_LABEL: Record<string, string> = { NONE: "Şifresiz", STARTTLS: "STARTTLS", SSL: "SSL/TLS" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Nicosia", dateStyle: "short", timeStyle: "medium" });

type Banner = { kind: "ok" | "error"; text: string } | null;

/** Denetim Masası → E-posta (CR-SYS): SMTP source, test mail, last 50 log rows, retry for failed rows. */
export function MailPanel({ setStatus, onOpenSettings }: { setStatus?(text: string): void; onOpenSettings?(): void }) {
  const id = useId();
  const [scopes, setScopes] = useState<MailScopes | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [data, setData] = useState<MailPanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [templateFilter, setTemplateFilter] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    mailScopesAction()
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setError(r.error.message);
        setScopes(r.data);
        setScope(r.data.system ? SYSTEM : (r.data.hotels[0]?.id ?? null));
      })
      .catch(() => live && setError("Kapsamlar yüklenemedi"));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (scope === null) return;
    let live = true;
    listEmailLogAction(scope === SYSTEM ? null : scope)
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setData(r.data);
          setError(null);
        } else setError(r.error.message);
      })
      .catch(() => live && setError("E-posta kayıtları yüklenemedi"));
    return () => {
      live = false;
    };
  }, [scope, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  useSse(reload, SSE_TYPES);

  const hotelId = scope === null || scope === SYSTEM ? null : scope;

  const sendTest = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const r = await sendTestMailAction(hotelId);
      if (!r.ok) setBanner({ kind: "error", text: r.error.message });
      else if (r.data.ok) {
        setBanner({ kind: "ok", text: `Test e-postası ${r.data.to} adresine gönderildi (${r.data.smtp.host}:${r.data.smtp.port}).` });
        setStatus?.("Test e-postası gönderildi");
      } else setBanner({ kind: "error", text: r.data.message });
    } catch {
      setBanner({ kind: "error", text: "Test e-postası gönderilemedi" });
    } finally {
      setBusy(false);
      reload();
    }
  };

  const retry = useCallback(
    async (row: MailLogRow) => {
      const yes = await confirm({
        title: "Tekrar kuyruğa al",
        message: `${row.to} adresine giden "${row.subject}" iletisi tekrar kuyruğa alınsın mı?`,
        confirmLabel: "Kuyruğa al",
      });
      if (!yes) return;
      setBusy(true);
      try {
        const r = await retryEmailLogAction(row.id);
        if (r.ok) {
          notify.success("E-posta tekrar kuyruğa alındı.");
          setStatus?.("E-posta tekrar kuyruğa alındı");
        } else setBanner({ kind: "error", text: r.error.message });
      } catch {
        setBanner({ kind: "error", text: "Kayıt tekrar kuyruğa alınamadı" });
      } finally {
        setBusy(false);
        reload();
      }
    },
    [reload, setStatus],
  );

  const columns = useMemo<Column<MailLogRow>[]>(
    () => [
      { key: "createdAt", title: "Zaman", width: 140, sortable: true, render: (r) => fmt(r.createdAt) },
      { key: "to", title: "Alıcı", width: 170, sortable: true },
      { key: "template", title: "Tür", width: 110, render: (r) => TEMPLATE_LABEL[r.template ?? ""] ?? r.kind },
      { key: "hotelName", title: "Otel", width: 120, render: (r) => <HotelBadges names={[r.hotelName]} empty="Sistem" /> },
      { key: "subject", title: "Konu" },
      {
        key: "status",
        title: "Durum",
        width: 90,
        sortable: true,
        render: (r) => (
          <span className="xp-badge xp-mail-badge" data-status={r.status}>
            {STATUS_LABEL[r.status]}
          </span>
        ),
      },
      { key: "attempts", title: "Deneme", width: 62, sortable: true },
      { key: "error", title: "Hata", width: 190 },
      {
        key: "actions",
        title: "",
        width: 130,
        render: (r) =>
          r.canRetry ? (
            <button type="button" className="xp-button" disabled={busy} onClick={() => void retry(r)}>
              Tekrar kuyruğa al
            </button>
          ) : null,
      },
    ],
    [busy, retry],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return (data?.logs ?? []).filter(
      (r) =>
        (!statusFilter || r.status === statusFilter) &&
        (!templateFilter || r.template === templateFilter) &&
        (!needle || `${r.to} ${r.subject} ${r.error ?? ""}`.toLocaleLowerCase("tr").includes(needle)),
    );
  }, [data, statusFilter, templateFilter, q]);

  if (!scopes) {
    return error ? (
      <p role="alert" className="xp-defs-error">
        {error}
      </p>
    ) : (
      <p className="xp-defs-note">Yükleniyor…</p>
    );
  }
  if (scope === null) return <p className="xp-defs-note">E-posta kayıtlarını görme yetkiniz yok.</p>;

  const smtp = data?.smtp ?? null;
  return (
    <div className="xp-mail">
      <h2 className="xp-cp-title">E-posta</h2>
      <p className="xp-cp-note">SMTP kaynağı, gönderim günlüğü ve hatalı iletilerin yeniden denenmesi.</p>
      <div className="xp-cp-color">
        <label htmlFor={`${id}-scope`}>Kapsam</label>
        <select
          id={`${id}-scope`}
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setBanner(null);
            setData(null);
          }}
        >
          {scopes.system ? <option value={SYSTEM}>Tüm oteller (sistem)</option> : null}
          {scopes.hotels.map((h) => (
            <option key={h.id} value={h.id}>
              Otel: {h.name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="xp-defs-error">
          {error}
        </p>
      ) : null}
      <section className="xp-cp-section" aria-label="SMTP">
        <h3 className="xp-cp-heading">SMTP</h3>
        {data === null ? (
          <p className="xp-defs-note">Yükleniyor…</p>
        ) : smtp ? (
          <dl className="xp-cp-facts" data-testid="mail-smtp">
            <dt>Kaynak</dt>
            <dd>{SOURCE_LABEL[smtp.source] ?? smtp.source}</dd>
            <dt>Sunucu</dt>
            <dd>
              {smtp.host}:{smtp.port} · {SECURITY_LABEL[smtp.security] ?? smtp.security}
            </dd>
            <dt>Kullanıcı</dt>
            <dd>{smtp.user || "—"}</dd>
            <dt>Gönderen</dt>
            <dd>{smtp.fromEmail}</dd>
          </dl>
        ) : (
          <p role="alert" className="xp-defs-error" data-testid="mail-smtp-missing">
            SMTP ayarları yapılmamış; e-posta gönderilemez.{" "}
            {onOpenSettings ? (
              <button type="button" className="xp-button" onClick={onOpenSettings}>
                Ayarlar → Sistem → E-posta
              </button>
            ) : null}
          </p>
        )}
        <p>
          {data?.canAct ? (
            <>
              <button type="button" className="xp-button" disabled={busy} onClick={() => void sendTest()}>
                Test gönder
              </button>{" "}
            </>
          ) : null}
          <button type="button" className="xp-button" disabled={busy} onClick={reload}>
            Yenile
          </button>
        </p>
        {banner ? (
          <p role={banner.kind === "error" ? "alert" : "status"} className={banner.kind === "error" ? "xp-defs-error" : "xp-defs-note"}>
            {banner.text}
          </p>
        ) : null}
      </section>
      <section className="xp-cp-section" aria-label="Gönderim günlüğü">
        <h3 className="xp-cp-heading">Gönderim günlüğü (son 50)</h3>
        <div className="xp-defs-filters">
          <label>
            Durum{" "}
            <select aria-label="Durum" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tümü</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tür{" "}
            <select aria-label="Tür" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
              <option value="">Tümü</option>
              {Object.entries(TEMPLATE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DataGrid
          className="xp-mail-grid"
          columns={columns}
          rows={rows}
          total={rows.length}
          page={1}
          pageSize={50}
          onPage={() => undefined}
          onSort={() => undefined}
          onSearch={setQ}
          q={q}
          onSelect={() => undefined}
          emptyText="E-posta kaydı yok"
        />
      </section>
    </div>
  );
}
