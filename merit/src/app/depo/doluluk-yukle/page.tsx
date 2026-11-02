"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface ScheduleInfo {
  isWithinWindow: boolean;
  currentTimeStr: string;
  message: string;
}

interface UploadHistoryItem {
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
}

interface HotelItem {
  id: string;
  name: string;
  code: string;
}

interface UploadResult {
  success: boolean;
  code: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  tasksCreated: {
    inhouse: number;
    arrivals: number;
    departures: number;
    clashes: number;
  };
  errors: string[];
  warning?: string;
}

export default function DolulukYuklePage() {
  const [hotels, setHotels] = useState<HotelItem[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (hotelId?: string) => {
    try {
      setIsLoading(true);
      const url = hotelId
        ? `/api/minibar/occupancy/history?hotelId=${encodeURIComponent(hotelId)}`
        : "/api/minibar/occupancy/history";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Doluluk verileri alınamadı.");
      const data = await res.json();
      setSchedule(data.schedule);
      setHistory(data.history || []);
      setHotels(data.hotels || []);
      if (!hotelId && data.selectedHotelId) {
        setSelectedHotelId(data.selectedHotelId);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Bağlantı hatası.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleHotelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedHotelId(id);
    void loadData(id);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadResult(null);
      setErrorMsg(null);
    }
  };

  const handleUpload = async (forceOverride = false) => {
    if (!selectedFile) {
      setErrorMsg("Lütfen önce bir Excel dosyası seçiniz.");
      return;
    }

    try {
      setIsUploading(true);
      setErrorMsg(null);

      const formData = new FormData();
      formData.append("file", selectedFile);
      if (selectedHotelId) formData.append("hotelId", selectedHotelId);
      if (forceOverride) formData.append("forceOverride", "true");

      const res = await fetch("/api/minibar/occupancy/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Yükleme başarısız oldu.");
      }

      setUploadResult(data);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void loadData(selectedHotelId);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Yükleme sırasında hata oluştu.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Üst Navigasyon */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
              title="Kat Sorumlusu Dashboard"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <span>📊 Günlük Otel Doluluk Girişi (Excel)</span>
              </h1>
              <p className="text-xs text-slate-400">
                Depo Sorumlusu & Sistem Yöneticisi • Standart Saat: 09:00 - 10:00
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {hotels.length > 0 && (
              <select
                value={selectedHotelId}
                onChange={handleHotelChange}
                className="bg-slate-800 text-amber-400 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-amber-500"
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
              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <span>💡 Tavsiye İş Planı</span>
            </Link>

            <Link
              href="/depo/stok"
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <span>📦 Zimmet Havuzu</span>
            </Link>

            <Link
              href="/depo/raporlar"
              className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <span>📈 Raporlar</span>
            </Link>

            <Link
              href="/depo/tanimlar"
              className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
            >
              <span>⚙️ Tanımlamalar</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Saat Penceresi Bilgilendirme Kartı */}
        {schedule && (
          <div
            className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
              schedule.isWithinWindow
                ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
                : "bg-amber-950/40 border-amber-800/60 text-amber-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{schedule.isWithinWindow ? "🟢" : "⏰"}</span>
              <div>
                <p className="font-semibold text-sm">{schedule.message}</p>
                <p className="text-xs opacity-80">
                  Otele giriş yapacak misafirlerin odalarındaki minibar setup&apos;ları, varıştan 1 saat önce hazır edilmelidir.
                </p>
              </div>
            </div>
            <div className="text-xs font-mono px-3 py-1 rounded bg-black/40 border border-white/10 shrink-0">
              Sistem Saati: {schedule.currentTimeStr}
            </div>
          </div>
        )}

        {/* Hata Mesajı */}
        {errorMsg && (
          <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-200 text-sm flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">{errorMsg}</div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs text-rose-400 hover:text-rose-200 underline"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Başarılı Yükleme Sonuç Özeti */}
        {uploadResult && (
          <div className="p-5 bg-slate-900 border border-emerald-500/40 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xl font-bold">✓</span>
                <h3 className="font-bold text-white text-base">Excel Doluluk Dosyası Başarıyla İşlendi!</h3>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2.5 py-1 rounded">
                Kod: {uploadResult.code}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-xs text-slate-400">Toplam Satır</span>
                <p className="text-lg font-bold text-white mt-1">{uploadResult.totalRows}</p>
              </div>

              <div className="p-3 bg-red-950/40 rounded-xl border border-red-800/40">
                <span className="text-xs text-red-300 font-semibold">1. Öncelik (Çıkış+Giriş)</span>
                <p className="text-lg font-bold text-red-400 mt-1">
                  {uploadResult.tasksCreated.clashes} Oda
                </p>
              </div>

              <div className="p-3 bg-amber-950/40 rounded-xl border border-amber-800/40">
                <span className="text-xs text-amber-300 font-semibold">2. Öncelik (Yeni Giriş)</span>
                <p className="text-lg font-bold text-amber-400 mt-1">
                  {uploadResult.tasksCreated.arrivals} Oda
                </p>
              </div>

              <div className="p-3 bg-blue-950/40 rounded-xl border border-blue-800/40">
                <span className="text-xs text-blue-300 font-semibold">3. Öncelik (In-House)</span>
                <p className="text-lg font-bold text-blue-400 mt-1">
                  {uploadResult.tasksCreated.inhouse} Oda
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-xs text-slate-400">
                Akıllı tavsiye planı otomatik oluşturuldu. Kat sorumluları öncelik sıralamasıyla yönlendirilecektir.
              </p>
              <Link
                href="/kat/tavsiye-is-plani"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-2"
              >
                <span>💡 Tavsiye İş Planını Görüntüle</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        )}

        {/* Dosya Yükleme Kutusu */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>📤 Standart Doluluk Dosyası Yükle</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              In-House, Departures ve Arrivals misafir bilgilerini içeren standart Excel dosyasını (.xlsx, en fazla 10 MB) seçiniz.
            </p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-amber-500/70 bg-slate-950/50 hover:bg-slate-950 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>

            <div>
              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-amber-400">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400">
                    {(selectedFile.size / 1024).toFixed(1)} KB • Değiştirmek için tıklayınız
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-300">
                    Excel dosyasını buraya sürükleyin veya dosya seçmek için tıklayın
                  </p>
                  <p className="text-xs text-slate-500">Desteklenen format: .xlsx (en fazla 10 MB)</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-400">
              {schedule && !schedule.isWithinWindow && (
                <span className="text-amber-400 font-medium">
                  ⚠️ 09:00 - 10:00 saat aralığı dışındasınız. Yönetici olarak devam edebilirsiniz.
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isUploading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  İptal
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleUpload(true)}
                disabled={!selectedFile || isUploading}
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin w-4 h-4 text-slate-950" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Excel İşleniyor...</span>
                  </>
                ) : (
                  <>
                    <span>🚀 Doluluk Girişini Tamamla</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Geçmiş Yüklemeler Tablosu */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>📋 Yükleme Geçmişi</span>
            </h2>
            <button
              onClick={() => void loadData(selectedHotelId)}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Yenile</span>
            </button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-slate-500 text-sm">Yükleme geçmişi yükleniyor...</div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Henüz bu otel için bir doluluk dosyası yüklenmemiş.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-3">Tarih / Saat</th>
                    <th className="py-3 px-3">İşlem Kodu</th>
                    <th className="py-3 px-3">Dosya Adı</th>
                    <th className="py-3 px-3">Yükleyen</th>
                    <th className="py-3 px-3 text-center">Toplam Satır</th>
                    <th className="py-3 px-3 text-center">Başarılı</th>
                    <th className="py-3 px-3 text-right">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono text-slate-400">
                        {new Date(item.createdAt).toLocaleString("tr-TR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">{item.code}</td>
                      <td className="py-3 px-3 font-medium text-white">{item.fileName}</td>
                      <td className="py-3 px-3 text-slate-400">{item.userName}</td>
                      <td className="py-3 px-3 text-center font-bold text-white">{item.totalRows}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-400">{item.okRows}</td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === "TAMAMLANDI"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
