"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

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
    if (!window.confirm(`${item.code} yüklemesi silinsin mi? Bekleyen görev kalemleri de kaldırılır.`)) return;
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
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-40 bg-slate-900/90 border-b border-slate-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white">Günlük Doluluk Yükleme (Excel)</h1>
            <p className="text-xs text-slate-400">In House, Arrivals ve Departures dosyaları</p>
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
                className="bg-slate-800 text-amber-400 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            )}
            <Link href="/kat/tavsiye-is-plani" className="px-3 py-1.5 border border-slate-700 rounded-lg text-xs text-slate-300">
              Tavsiye İş Planı
            </Link>
            <Link href="/depo/stok" className="px-3 py-1.5 border border-slate-700 rounded-lg text-xs text-slate-300">
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
                ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
                : "bg-amber-950/40 border-amber-800/60 text-amber-200"
            }`}
          >
            {schedule.message}
          </div>
        )}

        {error && (
          <div role="alert" data-testid="occupancy-error" className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 text-sm">
            {error}
          </div>
        )}
        {message && (
          <div role="status" data-testid="occupancy-message" className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-200 text-sm">
            {message}
          </div>
        )}

        {result && (
          <div data-testid="occupancy-result" className="p-5 bg-slate-900 border border-emerald-500/40 rounded-2xl space-y-3">
            <h3 className="font-bold text-white">Doluluk dosyası işlendi</h3>
            <p className="text-xs font-mono text-slate-400">Kod: {result.code}</p>
            <p className="text-sm text-slate-300">
              {result.totalRows} satır: {result.okRows} kaydedildi, {result.errorRows} hatalı.
              {result.tasksGenerated ? " Günlük görevler oluşturuldu." : " Görevler üç dosya da yüklenince oluşturulur."}
            </p>
            {result.errors.length > 0 && (
              <ul className="text-xs text-rose-300 space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Satır {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">1. Dosyayı seçin</h2>
            <p className="text-xs text-slate-400 mt-1">Standart veya P4001 biçiminde .xlsx dosyası (en fazla 10 MB).</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <input
              ref={fileRef}
              data-testid="occupancy-file"
              type="file"
              accept=".xlsx"
              onChange={onFile}
              className="text-xs text-slate-300"
            />
            <label className="text-xs text-slate-400 flex flex-col gap-1">
              Dosya türü
              <select
                data-testid="occupancy-kind"
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as Kind | "";
                  setKind(next);
                  if (preview) void runPreview(next);
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200"
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
              className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
            >
              {busy && !preview ? "İnceleniyor..." : "Önizle"}
            </button>
          </div>
        </section>

        {preview && (
          <section data-testid="occupancy-preview-panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">2. Önizleme ve onay</h2>
            <p className="text-sm text-slate-300">
              Biçim: {preview.format === "P4001" ? "P4001" : "Standart"} - Tür: {KIND_LABEL[kind || preview.detectedKind]}
              {preview.reportDate ? ` - Rapor tarihi: ${preview.reportDate}` : ""}
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-800/60 rounded-xl">
                <span className="text-xs text-slate-400">Toplam satır</span>
                <p className="text-lg font-bold text-white">{preview.totalRows}</p>
              </div>
              <div className="p-3 bg-emerald-950/40 rounded-xl">
                <span className="text-xs text-emerald-300">Kaydedilecek</span>
                <p className="text-lg font-bold text-emerald-400">{preview.okRows}</p>
              </div>
              <div className="p-3 bg-rose-950/40 rounded-xl">
                <span className="text-xs text-rose-300">Hatalı</span>
                <p className="text-lg font-bold text-rose-400">{preview.errorRows}</p>
              </div>
            </div>
            {preview.warnings.length > 0 && (
              <ul data-testid="occupancy-warnings" className="text-xs text-amber-300 space-y-0.5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {preview.errors.length > 0 && (
              <ul data-testid="occupancy-errors" className="text-xs text-rose-300 space-y-0.5 max-h-48 overflow-y-auto">
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
                    <tr className="text-slate-400 border-b border-slate-800">
                      <th className="py-2 px-2">Satır</th>
                      <th className="py-2 px-2">Oda</th>
                      <th className="py-2 px-2">Giriş</th>
                      <th className="py-2 px-2">Çıkış</th>
                      <th className="py-2 px-2">Kişi</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {preview.sample.map((s) => (
                      <tr key={s.row} className="border-b border-slate-800/60">
                        <td className="py-1.5 px-2">{s.row}</td>
                        <td className="py-1.5 px-2 font-semibold text-white">{s.roomNumber}</td>
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
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                data-testid="occupancy-commit"
                onClick={() => void commit()}
                disabled={busy || preview.okRows === 0}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                {busy ? "Yükleniyor..." : `${preview.okRows} satırı yükle`}
              </button>
            </div>
          </section>
        )}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-white">Yükleme geçmişi</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="occupancy-regenerate"
                onClick={() => void regenerate()}
                disabled={busy}
                className="px-3 py-1.5 border border-slate-700 rounded-lg text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Görevleri yeniden üret
              </button>
              <button type="button" onClick={() => void load(hotelId)} className="text-xs text-slate-400 hover:text-white">
                Yenile
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-slate-500 text-sm">Yükleme geçmişi yükleniyor...</div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">Henüz bu otel için bir doluluk dosyası yüklenmemiş.</div>
          ) : (
            <div className="overflow-x-auto">
              <table data-testid="occupancy-history" className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
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
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3 px-3 font-mono text-slate-400">
                        {new Date(item.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="py-3 px-3 font-mono">{item.code}</td>
                      <td className="py-3 px-3 text-white">{item.fileName}</td>
                      <td className="py-3 px-3">{KIND_LABEL[item.kind as Kind] ?? item.kind}</td>
                      <td className="py-3 px-3 text-slate-400">{item.userName}</td>
                      <td className="py-3 px-3 text-center">{item.totalRows}</td>
                      <td className="py-3 px-3 text-center text-emerald-400">{item.okRows}</td>
                      <td className="py-3 px-3 text-center text-rose-400">{item.errorRows}</td>
                      <td className="py-3 px-3">{STATUS_LABEL[item.status] ?? item.status}</td>
                      <td className="py-3 px-3 text-right">
                        {item.status !== "SILINDI" && (
                          <button
                            type="button"
                            data-testid={`occupancy-delete-${item.code}`}
                            onClick={() => void remove(item)}
                            disabled={busy}
                            className="px-2.5 py-1 border border-rose-800 text-rose-300 rounded-lg hover:bg-rose-950/40 disabled:opacity-50"
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
