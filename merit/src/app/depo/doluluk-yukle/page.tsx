"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { confirm } from "@/shell/confirm";

type Kind = "IN_HOUSE" | "ARRIVAL" | "DEPARTURE";

const KIND_LABEL: Record<Kind, string> = {
  IN_HOUSE: "In House",
  ARRIVAL: "Arrivals",
  DEPARTURE: "Departures",
};

const STATUS_LABEL: Record<string, string> = {
  YUKLENDI: "Yüklendi",
  ISLENIYOR: "İşleniyor",
  TAMAMLANDI: "Tamamlandı",
  HATA: "Hata",
  SILINDI: "Silindi",
  BEKLIYOR: "Bekliyor",
};

type ScheduleInfo = { isWithinWindow: boolean; currentTimeStr: string; message: string };
type HistoryItem = {
  id: string;
  code: string;
  fileName: string;
  kind: string;
  status: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  userName: string;
  createdAt: string;
};
type HotelItem = { id: string; name: string; code: string };
type RowError = { row: number; message: string };
type Preview = {
  format: "STANDARD" | "P4001";
  detectedKind: Kind;
  reportDate?: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  errors: RowError[];
  warnings: string[];
  unknownRooms: string[];
  sample: {
    row: number;
    roomNumber: string;
    arrivalDate: string;
    departureDate: string;
    arrivalTime?: string;
    departureTime?: string;
    guestCount: number;
  }[];
  hotelMatch?: { label: string; matches: boolean };
};
type CommitResult = {
  code: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  errors: RowError[];
  tasksGenerated: boolean;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function DolulukYuklePage() {
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind | "">("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (selected?: string) => {
    try {
      setLoading(true);
      const url = selected
        ? `/api/minibar/occupancy/history?hotelId=${encodeURIComponent(selected)}`
        : "/api/minibar/occupancy/history";
      const res = await fetch(url);
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data.error ?? "Doluluk verileri alınamadı."));
      setSchedule(data.schedule as ScheduleInfo);
      setHistory((data.history as HistoryItem[]) ?? []);
      setHotels((data.hotels as HotelItem[]) ?? []);
      if (!selected && typeof data.selectedHotelId === "string") setHotelId(data.selectedHotelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const form = (): FormData => {
    const fd = new FormData();
    if (file) fd.append("file", file);
    if (hotelId) fd.append("hotelId", hotelId);
    if (kind) fd.append("kind", kind);
    return fd;
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setPreview(null);
    setResult(null);
    setError(null);
    setMessage(null);
  };

  const runPreview = async (nextKind?: Kind | "") => {
    if (!file) {
      setError("Lütfen önce bir Excel dosyası (.xlsx) seçiniz.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = form();
      if (nextKind !== undefined) {
        fd.delete("kind");
        if (nextKind) fd.append("kind", nextKind);
      }
      const res = await fetch("/api/minibar/occupancy/preview", { method: "POST", body: fd });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data.error ?? "Önizleme başarısız oldu."));
      setPreview(data as unknown as Preview);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Önizleme sırasında hata oluştu.");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!file || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const fd = form();
      fd.delete("kind");
      fd.append("kind", kind || preview.detectedKind);
      const res = await fetch("/api/minibar/occupancy/upload", { method: "POST", body: fd });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data.error ?? "Yükleme başarısız oldu."));
      setResult(data as unknown as CommitResult);
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      void load(hotelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yükleme sırasında hata oluştu.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: HistoryItem) => {
    if (
      !(await confirm({
        title: `${item.code} yüklemesi silinsin mi?`,
        message: "Bekleyen görev kalemleri de kaldırılır.",
        danger: true,
        confirmLabel: "Sil",
      }))
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/minibar/occupancy/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data.error ?? "Yükleme silinemedi."));
      const kept = Number(data.keptCompletedItems ?? 0);
      setMessage(kept > 0 ? `Yükleme silindi. ${kept} tamamlanmış görev kalemi korundu.` : "Yükleme silindi.");
      void load(hotelId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silme sırasında hata oluştu.");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/minibar/tasks/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data.error ?? "Görevler yeniden üretilemedi."));
      setMessage("Günlük görevler doluluk kayıtlarından yeniden üretildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görevler yeniden üretilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <header className="sticky top-0 z-40 bg-bg/95 border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-text">Günlük Doluluk Yükleme (Excel)</h1>
            <p className="text-xs text-muted">In House, Arrivals ve Departures dosyaları</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hotels.length > 1 && (
              <select
                data-testid="occupancy-hotel"
                value={hotelId}
                onChange={(e) => {
                  setHotelId(e.target.value);
                  setPreview(null);
                  void load(e.target.value);
                }}
                style={{ minHeight: "var(--tap-action)" }}
                className="bg-surface text-accent border border-border rounded-xl px-3 py-1.5 text-xs font-semibold"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}
            <Link
              href="/kat/tavsiye-is-plani"
              style={{ minHeight: "var(--tap-action)" }}
              className="inline-flex items-center px-3 py-1.5 border border-border bg-surface rounded-xl text-xs font-semibold text-text hover:bg-bg"
            >
              Tavsiye İş Planı
            </Link>
            <Link
              href="/depo/stok"
              style={{ minHeight: "var(--tap-action)" }}
              className="inline-flex items-center px-3 py-1.5 border border-border bg-surface rounded-xl text-xs font-semibold text-text hover:bg-bg"
            >
              Zimmet Havuzu
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {schedule && (
          <div
            data-testid="occupancy-schedule"
            className={`p-4 rounded-xl border text-sm ${
              schedule.isWithinWindow
                ? "bg-ok/15 border-ok/40 text-ok"
                : "bg-warn/15 border-warn/40 text-warn"
            }`}
          >
            {schedule.message}
          </div>
        )}

        {error && (
          <div
            role="alert"
            data-testid="occupancy-error"
            className="p-4 bg-danger/15 border border-danger/40 rounded-xl text-danger text-sm"
          >
            {error}
          </div>
        )}
        {message && (
          <div
            role="status"
            data-testid="occupancy-message"
            className="p-4 bg-ok/15 border border-ok/40 rounded-xl text-ok text-sm"
          >
            {message}
          </div>
        )}

        {result && (
          <div
            data-testid="occupancy-result"
            className="p-5 bg-surface border border-ok/40 rounded-2xl space-y-3"
          >
            <h3 className="font-bold text-text">Doluluk dosyası işlendi</h3>
            <p className="text-xs font-mono text-muted">Kod: {result.code}</p>
            <p className="text-sm text-text">
              {result.totalRows} satır: {result.okRows} kaydedildi, {result.errorRows} hatalı.
              {result.tasksGenerated
                ? " Günlük görevler oluşturuldu."
                : " Görevler üç dosya da yüklenince oluşturulur."}
            </p>
            {result.errors.length > 0 && (
              <ul className="text-xs text-danger space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Satır {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <section className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-text">1. Dosyayı seçin</h2>
            <p className="text-xs text-muted mt-1">
              Standart veya P4001 biçiminde .xlsx dosyası (en fazla 10 MB).
            </p>
          </div>
          <div data-guide="dosya-sec" className="flex flex-wrap items-end gap-3">
            <input
              ref={fileRef}
              data-testid="occupancy-file"
              type="file"
              accept=".xlsx"
              onChange={onFile}
              className="text-xs text-text"
            />
            <label className="text-xs text-muted flex flex-col gap-1">
              Dosya türü
              <select
                data-testid="occupancy-kind"
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as Kind | "";
                  setKind(next);
                  if (preview) void runPreview(next);
                }}
                style={{ minHeight: "var(--tap-action)" }}
                className="bg-bg border border-border rounded-xl px-3 py-1.5 text-xs text-text"
              >
                <option value="">Otomatik algıla</option>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              data-testid="occupancy-preview"
              onClick={() => void runPreview()}
              disabled={!file || busy}
              style={{ minHeight: "var(--tap-action)" }}
              className="px-5 py-2 bg-bg border border-border hover:bg-surface text-text rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {busy && !preview ? "İnceleniyor..." : "Önizle"}
            </button>
          </div>
        </section>

        {preview && (
          <section
            data-guide="onizleme"
            data-testid="occupancy-preview-panel"
            className="bg-surface border border-border rounded-2xl p-6 space-y-4"
          >
            <h2 className="text-base font-bold text-text">2. Önizleme ve onay</h2>
            <p className="text-sm text-text">
              Biçim: {preview.format === "P4001" ? "P4001" : "Standart"} - Tür:{" "}
              {KIND_LABEL[kind || preview.detectedKind]}
              {preview.reportDate ? ` - Rapor tarihi: ${preview.reportDate}` : ""}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-bg border border-border rounded-xl">
                <span className="text-xs text-muted">Toplam satır</span>
                <p className="text-lg font-bold text-text">{preview.totalRows}</p>
              </div>
              <div className="p-3 bg-ok/15 border border-ok/30 rounded-xl">
                <span className="text-xs text-ok">Kaydedilecek</span>
                <p className="text-lg font-bold text-ok">{preview.okRows}</p>
              </div>
              <div className="p-3 bg-danger/15 border border-danger/30 rounded-xl">
                <span className="text-xs text-danger">Hatalı</span>
                <p className="text-lg font-bold text-danger">{preview.errorRows}</p>
              </div>
            </div>
            {preview.warnings.length > 0 && (
              <ul data-testid="occupancy-warnings" className="text-xs text-warn space-y-0.5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {preview.errors.length > 0 && (
              <ul data-testid="occupancy-errors" className="text-xs text-danger space-y-0.5 max-h-48 overflow-y-auto">
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    Satır {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {preview.sample.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border">
                      <th className="py-2 px-2">Satır</th>
                      <th className="py-2 px-2">Oda</th>
                      <th className="py-2 px-2">Giriş</th>
                      <th className="py-2 px-2">Çıkış</th>
                      <th className="py-2 px-2">Kişi</th>
                    </tr>
                  </thead>
                  <tbody className="text-text">
                    {preview.sample.map((s) => (
                      <tr key={s.row} className="border-b border-border/60">
                        <td className="py-1.5 px-2">{s.row}</td>
                        <td className="py-1.5 px-2 font-semibold text-text">{s.roomNumber}</td>
                        <td className="py-1.5 px-2">
                          {s.arrivalDate}
                          {s.arrivalTime ? ` ${s.arrivalTime}` : ""}
                        </td>
                        <td className="py-1.5 px-2">
                          {s.departureDate}
                          {s.departureTime ? ` ${s.departureTime}` : ""}
                        </td>
                        <td className="py-1.5 px-2">{s.guestCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={busy}
                style={{ minHeight: "var(--tap-action)" }}
                className="px-4 py-2 bg-bg border border-border hover:bg-surface text-text rounded-xl text-xs font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                data-primary=""
                data-mutates=""
                data-guide="yukle"
                data-testid="occupancy-commit"
                onClick={() => void commit()}
                disabled={busy || preview.okRows === 0}
                style={{ minHeight: "var(--tap-primary)" }}
                className="px-6 py-2.5 bg-accent hover:opacity-95 text-white rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {busy ? "Yükleniyor..." : `${preview.okRows} satırı yükle`}
              </button>
            </div>
          </section>
        )}

        <section data-guide="gecmis" className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-text">Yükleme geçmişi</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-mutates=""
                data-testid="occupancy-regenerate"
                onClick={() => void regenerate()}
                disabled={busy}
                style={{ minHeight: "var(--tap-action)" }}
                className="px-3 py-1.5 border border-border bg-bg rounded-xl text-xs font-semibold text-text hover:bg-surface disabled:opacity-50"
              >
                Görevleri yeniden üret
              </button>
              <button
                type="button"
                onClick={() => void load(hotelId)}
                style={{ minHeight: "var(--tap-action)" }}
                className="px-3 py-1.5 text-xs font-semibold text-muted hover:text-text"
              >
                Yenile
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-muted text-sm">Yükleme geçmişi yükleniyor...</div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-muted text-sm">
              Henüz bu otel için bir doluluk dosyası yüklenmemiş.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table data-testid="occupancy-history" className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted uppercase tracking-wider">
                    <th className="py-3 px-3">Tarih / Saat</th>
                    <th className="py-3 px-3">Kod</th>
                    <th className="py-3 px-3">Dosya</th>
                    <th className="py-3 px-3">Tür</th>
                    <th className="py-3 px-3">Yükleyen</th>
                    <th className="py-3 px-3 text-center">Satır</th>
                    <th className="py-3 px-3 text-center">Kaydedilen</th>
                    <th className="py-3 px-3 text-center">Hatalı</th>
                    <th className="py-3 px-3">Durum</th>
                    <th className="py-3 px-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-text">
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 px-3 font-mono text-muted">
                        {new Date(item.createdAt).toLocaleString("tr-TR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3 px-3 font-mono">{item.code}</td>
                      <td className="py-3 px-3 text-text">{item.fileName}</td>
                      <td className="py-3 px-3">{KIND_LABEL[item.kind as Kind] ?? item.kind}</td>
                      <td className="py-3 px-3 text-muted">{item.userName}</td>
                      <td className="py-3 px-3 text-center">{item.totalRows}</td>
                      <td className="py-3 px-3 text-center text-ok">{item.okRows}</td>
                      <td className="py-3 px-3 text-center text-danger">{item.errorRows}</td>
                      <td className="py-3 px-3">{STATUS_LABEL[item.status] ?? item.status}</td>
                      <td className="py-3 px-3 text-right">
                        {item.status !== "SILINDI" && (
                          <button
                            type="button"
                            data-mutates=""
                            data-testid={`occupancy-delete-${item.code}`}
                            onClick={() => void remove(item)}
                            disabled={busy}
                            style={{ minHeight: "var(--tap-action)" }}
                            className="px-3 py-1.5 border border-danger/40 text-danger rounded-xl hover:bg-danger/15 disabled:opacity-50"
                          >
                            Sil
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
