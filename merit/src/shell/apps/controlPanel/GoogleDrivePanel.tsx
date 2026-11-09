"use client";

import { useEffect, useId, useState } from "react";
import {
  getGoogleDriveConfigAction,
  saveGoogleDriveConfigAction,
  testGoogleDriveConnectionAction,
  type GoogleDriveConfig,
} from "@/modules/reporting/server/actions/automatedReports";
import { notify } from "@/shell/notify";
import { Icon } from "@/components/icons/Icon";

export function GoogleDrivePanel({ setStatus }: { setStatus?(text: string): void }) {
  const uid = useId();
  const [config, setConfig] = useState<GoogleDriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNotice, setTestNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getGoogleDriveConfigAction()
      .then((r) => {
        if (!active) return;
        if (r.ok) setConfig(r.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setTestNotice(null);
    try {
      const res = await saveGoogleDriveConfigAction(config);
      if (res.ok) {
        setConfig(res.data);
        notify.success("Google Drive ayarları başarıyla kaydedildi.");
        setStatus?.("Google Drive ayarları güncellendi");
      } else {
        notify.error(res.error.message);
      }
    } catch {
      notify.error("Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config) return;
    setTesting(true);
    setTestNotice(null);
    try {
      const res = await testGoogleDriveConnectionAction(config);
      if (res.ok) {
        setTestNotice({ kind: "ok", text: res.data.message });
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                lastTestedAt: res.data.timestamp,
                lastTestStatus: "SUCCESS",
                lastTestMessage: res.data.message,
              }
            : null,
        );
        notify.success("Google Drive bağlantısı doğrulandı!");
        setStatus?.("Google Drive bağlantı testi başarılı");
      } else {
        setTestNotice({ kind: "error", text: res.error.message });
        notify.error("Bağlantı testi başarısız oldu");
      }
    } catch {
      setTestNotice({ kind: "error", text: "Bağlantı testi sırasında sunucu hatası oluştu." });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-muted">
        Google Drive ayarları yükleniyor...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-8 text-center text-xs text-danger">
        Google Drive yapılandırması alınamadı.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6 text-xs text-slate-800">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Icon name="folder" size={20} className="text-blue-600" />
          Google Drive Entegrasyonu & Bulut Depolama
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Operasyonel raporların, günlük/haftalık gün sonu ve tüketim verilerinin belirlenen Google Drive klasörüne otomatik yüklenmesini yapılandırın.
        </p>
      </div>

      {/* Status banner */}
      <div
        className={`rounded-xl p-4 border flex items-start gap-3 ${
          config.lastTestStatus === "SUCCESS"
            ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
            : "bg-amber-50/80 border-amber-200 text-amber-900"
        }`}
      >
        <div className="mt-0.5">
          {config.lastTestStatus === "SUCCESS" ? (
            <Icon name="check" size={18} className="text-emerald-600" />
          ) : (
            <Icon name="warning" size={18} className="text-amber-600" />
          )}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wide">
              {config.lastTestStatus === "SUCCESS" ? "Bağlantı Aktif & Hazır" : "Yapılandırma Bekleniyor"}
            </span>
            {config.lastTestedAt ? (
              <span className="text-[11px] opacity-75">
                Son test: {new Date(config.lastTestedAt).toLocaleString("tr-TR")}
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed">
            {config.lastTestMessage || "Klasör ID ve yetki ayarlarını girip bağlantıyı test edin."}
          </p>
        </div>
      </div>

      {testNotice ? (
        <div
          className={`p-3 rounded-lg text-xs font-semibold ${
            testNotice.kind === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
          }`}
        >
          {testNotice.text}
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        {/* Folder ID */}
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-folderId`} className="block font-bold text-slate-700">
            Google Drive Hedef Klasör Kimliği (Folder ID veya Klasör Adı)
          </label>
          <input
            id={`${uid}-folderId`}
            type="text"
            required
            value={config.folderId}
            onChange={(e) => setConfig({ ...config, folderId: e.target.value })}
            placeholder="Örn: 1MeritHotels_Reports_Cloud_Archive_2026"
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500">
            Google Drive'da oluşturduğunuz ve raporların aktarılacağı ana hedef klasörün kimliği.
          </p>
        </div>

        {/* Folder URL */}
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-folderUrl`} className="block font-bold text-slate-700">
            Google Drive Klasör Doğrudan Bağlantı URL (İsteğe Bağlı)
          </label>
          <input
            id={`${uid}-folderUrl`}
            type="url"
            value={config.folderUrl || ""}
            onChange={(e) => setConfig({ ...config, folderUrl: e.target.value })}
            placeholder="https://drive.google.com/drive/folders/..."
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Service Account Email */}
        <div className="space-y-1.5">
          <label htmlFor={`${uid}-saEmail`} className="block font-bold text-slate-700">
            Google Cloud Servis Hesabı E-postası (Service Account)
          </label>
          <input
            id={`${uid}-saEmail`}
            type="text"
            value={config.serviceAccountEmail || ""}
            onChange={(e) => setConfig({ ...config, serviceAccountEmail: e.target.value })}
            placeholder="merit-reports-service@merithotels-automation.iam.gserviceaccount.com"
            className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500">
            Drive klasörünüze "Düzenleyici (Editor)" yetkisiyle eklediğiniz Google Servis Hesabı.
          </p>
        </div>

        {/* Options Toggles */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <h3 className="font-bold text-slate-800 text-xs">Otomasyon ve Dizinleme Tercihleri</h3>
          
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoSync}
              onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-slate-700">
              Otomatik raporlar üretildiğinde Google Drive klasörüne anında yükle
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.subfolderByHotel}
              onChange={(e) => setConfig({ ...config, subfolderByHotel: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-slate-700">
              Raporları otel koduna göre alt dizinlere ayır (Örn: /Merit_Royal, /Merit_Diamond)
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.subfolderByMonth}
              onChange={(e) => setConfig({ ...config, subfolderByMonth: e.target.checked })}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-slate-700">
              Aylık arşiv klasörleri oluştur (Örn: /2026-11, /2026-12)
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 disabled:opacity-50 transition"
          >
            <Icon name="refresh" size={14} className={testing ? "animate-spin" : ""} />
            {testing ? "Test Ediliyor..." : "⚡ Bağlantıyı Test Et"}
          </button>

          <button
            type="submit"
            disabled={saving || testing}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50 transition shadow-sm"
          >
            {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
