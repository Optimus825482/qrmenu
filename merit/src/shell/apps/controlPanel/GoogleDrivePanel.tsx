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

const APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, status: "ready" })).setMimeType(ContentService.MimeType.JSON);
    }
    var folder = DriveApp.getRootFolder(); // Veya DriveApp.getFolderById("KLASOR_ID");
    var decoded = Utilities.base64Decode(data.base64Content);
    var blob = Utilities.newBlob(decoded, data.mimeType, data.filename);
    folder.createFile(blob);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, file: data.filename })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

export function GoogleDrivePanel({ setStatus }: { setStatus?(text: string): void }) {
  const uid = useId();
  const [config, setConfig] = useState<GoogleDriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNotice, setTestNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);

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
        notify.success("Google Drive ayarları kaydedildi.");
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
    if (config.authMethod === "WEBHOOK" && !config.webhookUrl) {
      notify.error("Lütfen önce Google Apps Script Webhook URL'sini girin");
      return;
    }
    if (config.authMethod === "SERVICE_ACCOUNT" && !config.credentialsJson) {
      notify.error("Lütfen önce Google Cloud Service Account JSON anahtarını yapıştırın");
      return;
    }

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
        notify.success("Bağlantı doğrulandı!");
        setStatus?.("Google Drive testi başarılı");
      } else {
        setTestNotice({ kind: "error", text: res.error.message });
        notify.error("Bağlantı testi başarısız oldu");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bağlantı testi sırasında hata oluştu.";
      setTestNotice({ kind: "error", text: msg });
      notify.error(msg);
    } finally {
      setTesting(false);
    }
  };

  const copyScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    notify.success("Apps Script kodu panoya kopyalandı!");
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

  const isConnected = config.lastTestStatus === "SUCCESS";

  return (
    <div className="p-6 max-w-3xl space-y-6 text-xs text-text">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <h2 className="text-base font-bold text-text flex items-center gap-2">
          <Icon name="folder" size={20} className="text-accent" />
          Google Drive Entegrasyonu & Bulut Depolama
        </h2>
        <p className="text-xs text-muted mt-1">
          Otomatik üretilen operasyonel raporların, günlük gün sonu ve tüketim tablolarının belirlenen Google Drive klasörünüze otomatik aktarılmasını sağlar.
        </p>
      </div>

      {/* Honest Status Banner */}
      <div
        className={`rounded-xl p-4 border flex items-start gap-3.5 transition shadow-sm ${
          isConnected
            ? "bg-[var(--success-bg)] border-success/40 text-success"
            : "bg-[var(--warn-bg)] border-warn/40 text-warn"
        }`}
      >
        <div className="mt-0.5">
          {isConnected ? (
            <Icon name="check" size={20} className="text-success" />
          ) : (
            <Icon name="warning" size={20} className="text-warn" />
          )}
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wide">
              {isConnected ? "Bağlantı Aktif & Doğrulandı" : "Yapılandırma Bekleniyor — Bağlantı Henüz Kurulmadı"}
            </span>
            {config.lastTestedAt ? (
              <span className="text-xs opacity-75">
                Son test: {new Date(config.lastTestedAt).toLocaleString("tr-TR")}
              </span>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed opacity-90">
            {isConnected
              ? config.lastTestMessage || "Google Drive bağlantısı doğrulandı. Dosyalar başarıyla hedefe yazılabilir."
              : "Henüz geçerli bir Google Drive bağlantısı tanımlanmadı. Lütfen aşağıdaki yöntemlerden birini seçip bilgilerinizi giriniz."}
          </p>
        </div>
      </div>

      {testNotice ? (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold border ${
            testNotice.kind === "ok"
              ? "bg-[var(--success-bg)] border-success/40 text-success"
              : "bg-[var(--danger-bg)] border-danger/40 text-danger"
          }`}
        >
          {testNotice.text}
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-6 bg-white p-6 rounded-xl border border-border shadow-sm">
        {/* Method Picker */}
        <div className="space-y-2">
          <label className="block font-bold text-text text-xs">
            Bağlantı ve Kimlik Doğrulama Yöntemi
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: "WEBHOOK" as const,
                title: "Google Apps Script",
                badge: "En Pratik / Önerilen",
                desc: "Drive klasörünüzde oluşturacağınız basit bir Webhook URL'si. Cloud Console gerektirmez.",
              },
              {
                id: "SERVICE_ACCOUNT" as const,
                title: "Google Service Account",
                badge: "Kurumsal (GCP)",
                desc: "Google Cloud Console üzerinden oluşturulan Service Account JSON anahtarı.",
              },
              {
                id: "FOLDER_LINK" as const,
                title: "Yalnızca Klasör Linki",
                badge: "Manuel Arşiv",
                desc: "Yalnızca Drive klasör linkini saklar ve e-postalarda inceleme butonu olarak sunar.",
              },
            ].map((m) => {
              const active = config.authMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setConfig({ ...config, authMethod: m.id })}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    active
                      ? "border-accent bg-accent/10 text-accent ring-1 ring-accent/30 font-semibold"
                      : "border-border bg-bg/60 text-text hover:bg-[var(--muted-bg)]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-xs">{m.title}</span>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-xs text-muted font-normal leading-relaxed">{m.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* METHOD 1: WEBHOOK */}
        {config.authMethod === "WEBHOOK" && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/40 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor={`${uid}-webhook`} className="block font-bold text-accent text-xs">
                Google Apps Script Web Uygulaması URL (Webhook)
              </label>
              <button
                type="button"
                onClick={() => setShowScriptModal(true)}
                className="text-xs text-accent font-bold hover:underline inline-flex items-center gap-1"
              >
                Nasıl Kurulur? (Kodu Gör)
              </button>
            </div>
            <input
              id={`${uid}-webhook`}
              type="url"
              value={config.webhookUrl || ""}
              onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
              placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-text focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-muted">
              Google Drive klasörünüzde <strong>Uzantılar &gt; Apps Script</strong> açıp verilen hazır kodu yapıştırarak 1 dakikada Web App URL&apos;si alabilirsiniz.
            </p>
          </div>
        )}

        {/* METHOD 2: SERVICE ACCOUNT */}
        {config.authMethod === "SERVICE_ACCOUNT" && (
          <div className="p-4 rounded-xl bg-bg border border-border space-y-3">
            <label htmlFor={`${uid}-creds`} className="block font-bold text-text text-xs">
              Google Cloud Service Account JSON Anahtar İçeriği
            </label>
            <textarea
              id={`${uid}-creds`}
              rows={5}
              value={config.credentialsJson || ""}
              onChange={(e) => setConfig({ ...config, credentialsJson: e.target.value })}
              placeholder='{ "type": "service_account", "project_id": "...", "private_key": "-----BEGIN RSA PRIVATE KEY...", "client_email": "..." }'
              className="w-full rounded-lg border border-border bg-white p-2.5 font-mono text-xs text-text focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-muted">
              Google Cloud Console &gt; IAM & Admin &gt; Service Accounts &gt; Keys bölümünden indirdiğiniz JSON anahtarını buraya yapıştırın.
            </p>
          </div>
        )}

        {/* Target Folder ID & Link */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-folderId`} className="block font-bold text-text text-xs">
              Google Drive Klasör ID veya Klasör Adı
            </label>
            <input
              id={`${uid}-folderId`}
              type="text"
              value={config.folderId}
              onChange={(e) => setConfig({ ...config, folderId: e.target.value })}
              placeholder="Örn: 1A2b3C4d5E... veya Merit_Raporlar"
              className="w-full rounded-lg border border-border bg-bg/50 px-3 py-2 text-xs text-text focus:bg-white focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${uid}-folderUrl`} className="block font-bold text-text text-xs">
              Google Drive Klasör Linki (Paylaşım Bağlantısı)
            </label>
            <input
              id={`${uid}-folderUrl`}
              type="url"
              value={config.folderUrl || ""}
              onChange={(e) => setConfig({ ...config, folderUrl: e.target.value })}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full rounded-lg border border-border bg-bg/50 px-3 py-2 text-xs text-text focus:bg-white focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Options Toggles */}
        <div className="space-y-3 pt-3 border-t border-border">
          <h3 className="font-bold text-text text-xs">Otomasyon Tercihleri</h3>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoSync}
              onChange={(e) => setConfig({ ...config, autoSync: e.target.checked })}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span className="font-medium text-text">
              Otomatik raporlar her üretildiğinde Google Drive klasörüne anında yükle
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.subfolderByHotel}
              onChange={(e) => setConfig({ ...config, subfolderByHotel: e.target.checked })}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span className="font-medium text-text">
              Raporları otel adına göre alt klasörlere ayır (Örn: /Merit_Royal, /Merit_Diamond)
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.subfolderByMonth}
              onChange={(e) => setConfig({ ...config, subfolderByMonth: e.target.checked })}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span className="font-medium text-text">
              Aylık arşiv klasörleri oluştur (Örn: /2026-11, /2026-12)
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-accent bg-accent/10 text-accent font-bold hover:bg-accent/15 disabled:opacity-50 transition shadow-sm"
          >
            <Icon name="refresh" size={14} className={testing ? "animate-spin" : ""} />
            {testing ? "Bağlantı Doğrulanıyor..." : "Bağlantıyı Doğrula & Test Et"}
          </button>

          <button
            type="submit"
            disabled={saving || testing}
            className="inline-flex items-center gap-1.5 px-6 py-2 rounded-lg bg-accent text-white font-bold hover:bg-accent/90 disabled:opacity-50 transition shadow-sm"
          >
            {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
          </button>
        </div>
      </form>

      {/* APPS SCRIPT HELP MODAL */}
      {showScriptModal ? (
        <div className="fixed inset-0 bg-brand/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-border w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-bg">
              <h3 className="font-bold text-sm text-text flex items-center gap-2">
                <Icon name="folder" size={18} className="text-accent" />
                Google Apps Script ile 1 Dakikada Drive Entegrasyonu
              </h3>
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="text-muted hover:text-muted font-bold p-1"
              >
                <Icon name="close" size={16} title="Kapat" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs leading-relaxed text-text">
              <ol className="list-decimal list-inside space-y-2 font-medium">
                <li>Google Drive&apos;ınızda raporların toplanmasını istediğiniz bir klasör açın.</li>
                <li>
                  Aynı Google hesabıyla <strong>script.google.com</strong> adresini açıp <strong>Yeni proje</strong>&apos;ye basın
                  (Drive&apos;dan: <strong>Yeni &gt; Diğer &gt; Google Apps Script</strong>).
                </li>
                <li>Açılan editördeki kodu silip aşağıdaki kodu yapıştırın:</li>
              </ol>

              <div className="relative">
                <pre className="p-3 bg-brand text-[var(--bg)] rounded-lg text-xs font-mono overflow-x-auto max-h-48">
                  {APPS_SCRIPT_TEMPLATE}
                </pre>
                <button
                  type="button"
                  onClick={copyScript}
                  className="absolute top-2 right-2 px-3 py-1 bg-accent text-white text-xs font-bold rounded shadow hover:bg-accent/90"
                >
                  Kodu Kopyala
                </button>
              </div>

              <ol start={4} className="list-decimal list-inside space-y-2 font-medium">
                <li>
                  Raporlar klasörünüze düşsün diye: klasörü Drive&apos;da açın, adres çubuğunda <strong>/folders/</strong>&apos;dan
                  sonraki kodu kopyalayın ve koddaki <strong>DriveApp.getRootFolder()</strong> yerine{" "}
                  <strong>DriveApp.getFolderById(&quot;KOPYALADIĞINIZ_KOD&quot;)</strong> yazın. Değiştirmezseniz dosyalar
                  Drive&apos;ın ana dizinine kaydedilir.
                </li>
                <li>Sağ üstteki <strong>Dağıt (Deploy) &gt; Yeni Dağıtım</strong> butonuna basın.</li>
                <li>Tür olarak <strong>Web Uygulaması (Web App)</strong> seçin.</li>
                <li>
                  <strong>Şu kullanıcı olarak yürüt: Ben</strong>, erişim yetkisini <strong>&ldquo;Herkes&rdquo; (Anyone)</strong> yapıp{" "}
                  <strong>Dağıt</strong>&apos;a tıklayın; Google&apos;ın istediği izni onaylayın.
                </li>
                <li>Verilen <strong>Web Uygulaması URL&apos;sini</strong> kopyalayıp buradaki alana yapıştırın.</li>
              </ol>
              <p className="text-muted">
                Bu adresi bilen herkes klasöre dosya yükleyebilir: parola gibi saklayın. Kodu sonradan değiştirirseniz{" "}
                <strong>Dağıt &gt; Dağıtımları yönet &gt; Düzenle &gt; Yeni sürüm</strong> demeniz gerekir.
              </p>
            </div>

            <div className="px-6 py-3 border-t border-border bg-bg flex justify-end">
              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="px-4 py-1.5 rounded-lg bg-accent text-white font-bold hover:bg-accent/90"
              >
                Anladım
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
