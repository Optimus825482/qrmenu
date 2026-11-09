"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { notify } from "@/shell/notify";
import {
  listAutomatedReportsAction,
  saveAutomatedReportAction,
  deleteAutomatedReportAction,
  toggleAutomatedReportAction,
  triggerAutomatedReportAction,
  type AutomatedReportSchedule,
} from "../server/actions/automatedReports";

type Props = {
  hotels?: { id: string; name: string }[];
  initialPreFill?: { name: string; module: string; format: "pdf" | "xlsx" | "csv" } | null;
  setStatus?: (status: string) => void;
};

const FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "Günlük",
  WEEKLY: "Haftalık (Pazartesi)",
  MONTHLY: "Aylık (Ayın 1'i)",
};

const FORMAT_BADGE: Record<string, { label: string; color: string }> = {
  pdf: { label: "PDF Belgesi", color: "bg-rose-100 text-rose-800 border-rose-300" },
  xlsx: { label: "Excel Tablosu (XLSX)", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  csv: { label: "CSV Veri Dosyası", color: "bg-blue-100 text-blue-800 border-blue-300" },
};

const STANDARD_REPORT_OPTIONS = [
  { key: "minibar.tuketim", title: "Minibar Tüketim Raporu" },
  { key: "minibar.gunSonu", title: "Minibar Gün Sonu Özeti" },
  { key: "minibar.zimmetDurum", title: "Personel Zimmet Durumu" },
  { key: "minibar.gorevPerformans", title: "Kat Görevlisi Performansı" },
  { key: "minibar.dnd", title: "DND (Rahatsız Etmeyin) Analizi" },
  { key: "menu.siparisOzet", title: "Outlet Sipariş Özeti" },
  { key: "menu.siparisUrun", title: "Ürün Satış ve Ciro Raporu" },
  { key: "menu.rsSla", title: "Oda Servisi SLA & Teslimat" },
  { key: "merkezOzet", title: "Merkez Konsolide Yönetim Raporu" },
];

export function AutomatedReportsPanel({ hotels = [], initialPreFill, setStatus }: Props) {
  const [schedules, setSchedules] = useState<AutomatedReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AutomatedReportSchedule | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formReportKey, setFormReportKey] = useState("minibar.tuketim");
  const [formReportTitle, setFormReportTitle] = useState("Minibar Tüketim Raporu");
  const [formFrequency, setFormFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [formTimeOfDay, setFormTimeOfDay] = useState("08:00");
  const [formFormat, setFormFormat] = useState<"pdf" | "xlsx" | "csv">("pdf");
  const [formSendEmail, setFormSendEmail] = useState(true);
  const [formRecipientsText, setFormRecipientsText] = useState("muhasebe@merithotels.com");
  const [formDriveSync, setFormDriveSync] = useState(true);
  const [formDriveFolder, setFormDriveFolder] = useState("Merit_Otomasyon_Raporlar");
  const [formHotels, setFormHotels] = useState<string[]>([]);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const res = await listAutomatedReportsAction();
      if (res.ok) {
        setSchedules(res.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSchedules();
  }, []);

  useEffect(() => {
    if (initialPreFill) {
      setFormName(initialPreFill.name);
      setFormFormat(initialPreFill.format);
      setModalOpen(true);
    }
  }, [initialPreFill]);

  const openNewModal = () => {
    setEditingItem(null);
    setFormName("");
    setFormReportKey("minibar.tuketim");
    setFormReportTitle("Minibar Tüketim Raporu");
    setFormFrequency("DAILY");
    setFormTimeOfDay("08:00");
    setFormFormat("pdf");
    setFormSendEmail(true);
    setFormRecipientsText("muhasebe@merithotels.com");
    setFormDriveSync(true);
    setFormDriveFolder("Merit_Otomasyon_Raporlar");
    setFormHotels([]);
    setModalOpen(true);
  };

  const openEditModal = (item: AutomatedReportSchedule) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormReportKey(item.reportKey);
    setFormReportTitle(item.reportTitle);
    setFormFrequency(item.frequency);
    setFormTimeOfDay(item.timeOfDay);
    setFormFormat(item.format);
    setFormSendEmail(item.sendEmail);
    setFormRecipientsText(item.recipients.join(", "));
    setFormDriveSync(item.googleDriveSync);
    setFormDriveFolder(item.googleDriveFolder || "");
    setFormHotels(item.hotelIds);
    setModalOpen(true);
  };

  const handleToggle = async (item: AutomatedReportSchedule) => {
    const next = !item.isActive;
    try {
      const res = await toggleAutomatedReportAction(item.id, next);
      if (res.ok) {
        setSchedules((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, isActive: next } : s)),
        );
        notify.success(next ? `"${item.name}" aktif edildi.` : `"${item.name}" durduruldu.`);
      }
    } catch {
      notify.error("Durum güncellenemedi");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" otomatik rapor planını silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await deleteAutomatedReportAction(id);
      if (res.ok) {
        setSchedules((prev) => prev.filter((s) => s.id !== id));
        notify.success("Otomatik rapor planı silindi.");
      }
    } catch {
      notify.error("Plan silinemedi");
    }
  };

  const handleTriggerNow = async (item: AutomatedReportSchedule) => {
    setTriggeringId(item.id);
    setStatus?.(`"${item.name}" çalıştırılıyor...`);
    try {
      const res = await triggerAutomatedReportAction(item.id);
      if (res.ok) {
        notify.success(res.data.message);
        setStatus?.(res.data.message);
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === item.id
              ? {
                  ...s,
                  lastRunAt: res.data.timestamp,
                  lastRunStatus: "SUCCESS",
                  lastRunMessage: res.data.message,
                }
              : s,
          ),
        );
      } else {
        notify.error(res.error.message);
      }
    } catch {
      notify.error("Rapor tetiklenirken hata oluştu");
    } finally {
      setTriggeringId(null);
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      notify.error("Lütfen rapor planı için bir isim girin");
      return;
    }

    const recipients = formRecipientsText
      .split(",")
      .map((r) => r.trim())
      .filter((r) => r.length > 0 && r.includes("@"));

    if (formSendEmail && recipients.length === 0) {
      notify.error("Lütfen en az bir geçerli e-posta adresi yazın");
      return;
    }

    const item: AutomatedReportSchedule = {
      id: editingItem ? editingItem.id : `auto-${Date.now()}`,
      name: formName.trim(),
      reportKey: formReportKey,
      reportTitle: formReportTitle,
      hotelIds: formHotels,
      frequency: formFrequency,
      timeOfDay: formTimeOfDay,
      format: formFormat,
      recipients,
      sendEmail: formSendEmail,
      googleDriveSync: formDriveSync,
      googleDriveFolder: formDriveFolder.trim(),
      isActive: editingItem ? editingItem.isActive : true,
      lastRunAt: editingItem?.lastRunAt || null,
      lastRunStatus: editingItem?.lastRunStatus || null,
      lastRunMessage: editingItem?.lastRunMessage || null,
      createdAt: editingItem?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await saveAutomatedReportAction(item);
      if (res.ok) {
        notify.success(`"${item.name}" planı kaydedildi.`);
        setModalOpen(false);
        void loadSchedules();
      } else {
        notify.error(res.error.message);
      }
    } catch {
      notify.error("Kayıt işlemi başarısız");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800 text-xs overflow-hidden select-none">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Icon name="clock" size={20} className="text-purple-600" />
            Otomatik Raporlar & Zamanlanmış Dağıtım
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Belirlenen operasyonel raporların düzenli sıklıkta otomatik üretilmesini, e-posta ile yöneticilere ulaştırılmasını ve Google Drive bulut arşivine yüklenmesini yönetin.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-sm inline-flex items-center gap-1.5"
        >
          <Icon name="plus" size={16} />
          Yeni Otomatik Rapor Planla
        </button>
      </div>

      {/* Schedules List Area */}
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <Icon name="refresh" size={24} className="animate-spin mx-auto mb-2 text-blue-500" />
            Otomatik rapor planları yükleniyor...
          </div>
        ) : schedules.length === 0 ? (
          <div className="p-16 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
            Tanımlı otomatik rapor planı bulunamadı. Yeni bir plan oluşturmak için yukarıdaki butona tıklayın.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {schedules.map((item) => {
              const formatInfo = FORMAT_BADGE[item.format] || { label: item.format, color: "bg-slate-100 text-slate-700" };
              const isRunning = triggeringId === item.id;

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border transition shadow-sm p-5 space-y-4 ${
                    item.isActive ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50/50"
                  }`}
                >
                  {/* Item Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-sm text-slate-900">{item.name}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${formatInfo.color}`}>
                          {formatInfo.label}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          {FREQUENCY_LABEL[item.frequency] || item.frequency} · Saat {item.timeOfDay}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        <strong>Rapor Formatı:</strong> {item.reportTitle}
                        {item.hotelIds.length > 0 ? ` · ${item.hotelIds.length} Otel Seçili` : " · Tüm Oteller"}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Active Toggle */}
                      <button
                        type="button"
                        onClick={() => void handleToggle(item)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition border ${
                          item.isActive
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
                            : "bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300"
                        }`}
                      >
                        {item.isActive ? "Aktif" : "Durduruldu"}
                      </button>

                      {/* Trigger Now */}
                      <button
                        type="button"
                        onClick={() => void handleTriggerNow(item)}
                        disabled={isRunning}
                        className="px-3 py-1.5 rounded-lg border border-blue-600 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 disabled:opacity-40 transition inline-flex items-center gap-1"
                      >
                        <Icon name="refresh" size={14} className={isRunning ? "animate-spin" : ""} />
                        {isRunning ? "Çalışıyor..." : "⚡ Şimdi Çalıştır"}
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 transition"
                      >
                        Düzenle
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id, item.name)}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 font-bold hover:bg-rose-50 transition"
                      >
                        Sil
                      </button>
                    </div>
                  </div>

                  {/* Distribution Targets */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-[11px]">
                    {/* Email Target */}
                    <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg">
                      <Icon name="bell" size={16} className={item.sendEmail ? "text-blue-600" : "text-slate-400"} />
                      <div>
                        <div className="font-bold text-slate-700">
                          E-posta İletimi: {item.sendEmail ? "Aktif" : "Kapalı"}
                        </div>
                        {item.sendEmail && item.recipients.length > 0 ? (
                          <div className="text-slate-600 mt-0.5 truncate max-w-sm">
                            {item.recipients.join(", ")}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Alıcı tanımlanmamış</span>
                        )}
                      </div>
                    </div>

                    {/* Google Drive Target */}
                    <div className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg">
                      <Icon name="folder" size={16} className={item.googleDriveSync ? "text-emerald-600" : "text-slate-400"} />
                      <div>
                        <div className="font-bold text-slate-700">
                          Google Drive Senkronizasyonu: {item.googleDriveSync ? "Aktif" : "Kapalı"}
                        </div>
                        {item.googleDriveSync ? (
                          <div className="text-slate-600 mt-0.5">
                            Hedef Klasör: <span className="font-semibold text-emerald-800">{item.googleDriveFolder || "Varsayılan Klasör"}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Bulut aktarımı pasif</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Last Run Info */}
                  {item.lastRunAt ? (
                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 text-slate-500">
                      <span>Son çalışma: {new Date(item.lastRunAt).toLocaleString("tr-TR")}</span>
                      <span className="text-emerald-700 font-semibold">{item.lastRunMessage || "Başarıyla tamamlandı"}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DIALOG: NEW / EDIT AUTOMATED REPORT */}
      {modalOpen ? (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Icon name="clock" size={18} className="text-blue-600" />
                {editingItem ? "Otomatik Rapor Planını Düzenle" : "Yeni Otomatik Rapor Planla"}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Plan Name */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-xs">Plan Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Günlük Minibar ve F&B Tüketim Raporu"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Report Format Selection */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-xs">Oluşturulacak Rapor Formatı</label>
                <select
                  value={formReportKey}
                  onChange={(e) => {
                    setFormReportKey(e.target.value);
                    const opt = STANDARD_REPORT_OPTIONS.find((o) => o.key === e.target.value);
                    if (opt) setFormReportTitle(opt.title);
                  }}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                >
                  {STANDARD_REPORT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Frequency and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 text-xs">Gönderim Sıklığı</label>
                  <select
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value as "DAILY" | "WEEKLY" | "MONTHLY")}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="DAILY">Her Gün (Günlük)</option>
                    <option value="WEEKLY">Her Hafta (Pazartesi)</option>
                    <option value="MONTHLY">Her Ay (Ayın 1'inde)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700 text-xs">Çalışma Saati</label>
                  <input
                    type="time"
                    value={formTimeOfDay}
                    onChange={(e) => setFormTimeOfDay(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Output Format */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-700 text-xs">Çıktı Belge Formatı</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "pdf", label: "PDF Dosyası" },
                    { id: "xlsx", label: "Excel (XLSX)" },
                    { id: "csv", label: "CSV Dosyası" },
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setFormFormat(fmt.id as "pdf" | "xlsx" | "csv")}
                      className={`p-2.5 rounded-lg border text-center font-bold text-xs transition ${
                        formFormat === fmt.id
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email Distribution */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formSendEmail}
                    onChange={(e) => setFormSendEmail(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-bold text-slate-800 text-xs">E-posta ile Otomatik Gönder</span>
                </label>
                {formSendEmail ? (
                  <div className="pl-6 space-y-1">
                    <input
                      type="text"
                      placeholder="muhasebe@merithotels.com, fnb@merithotels.com (virgülle ayırın)"
                      value={formRecipientsText}
                      onChange={(e) => setFormRecipientsText(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      Rapor hazırlandığında ekli belge (PDF/Excel) olarak bu adreslere postalanır.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Google Drive Distribution */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formDriveSync}
                    onChange={(e) => setFormDriveSync(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-bold text-slate-800 text-xs">Google Drive Klasörüne Otomatik Yükle</span>
                </label>
                {formDriveSync ? (
                  <div className="pl-6 space-y-1">
                    <input
                      type="text"
                      placeholder="Hedef Klasör Adı veya ID (Örn: Merit_Gunluk_Raporlar)"
                      value={formDriveFolder}
                      onChange={(e) => setFormDriveFolder(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      Google Drive bağlantı parametreleri Denetim Masası → Google Drive ayarlarından yönetilir.
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 transition shadow-sm"
                >
                  {editingItem ? "Güncelle" : "Planı Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
