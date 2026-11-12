"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { DataGrid, type Column } from "@/shell/ui/DataGrid";
import { notify } from "@/shell/notify";
import {
  runWizardReportAction,
  saveWizardTemplateAction,
  type WizardQueryResult,
  type WizardTemplate,
} from "../server/actions/automatedReports";
import { PRESET_LABELS, presetRange, type Preset } from "./datePresets";

type Step = 1 | 2 | 3 | 4 | 5;

type GridRow = { id: string; cells: Record<string, unknown> };

const MODULE_OPTIONS = [
  {
    id: "MINIBAR" as const,
    title: "Minibar Operasyonları",
    desc: "Oda tüketimleri, iadeler, ürün bazlı sarfiyat ve minibar gelirleri",
    icon: "minibar",
    color: "from-accent to-[var(--accent-royal)]",
  },
  {
    id: "OUTLET" as const,
    title: "Outlet & Restoran Satışları",
    desc: "Masa siparişleri, F&B ürün satışları, adisyonlar ve ciro analizi",
    icon: "menu",
    color: "from-warn to-gold",
  },
  {
    id: "ROOM_SERVICE" as const,
    title: "Oda Servisi Operasyonları",
    desc: "Oda siparişleri, menü talepleri ve oda servisi teslimatları",
    icon: "servis",
    color: "from-success to-info",
  },
  {
    id: "DEPO" as const,
    title: "Depo & Stok Hareketleri",
    desc: "Giriş/çıkış, otel deposu ve kritik stok hareketleri",
    icon: "otel",
    color: "from-info to-brand",
  },
  {
    id: "CHECK" as const,
    title: "Kat Görevleri & Oda Kontrol",
    desc: "Personel oda kontrolleri, tamamlanma süreleri ve oda durumları",
    icon: "kullanicilar",
    color: "from-danger to-warn",
  },
];

type Props = {
  hotels?: { id: string; name: string }[];
  onScheduleReport?: (wizardSummary: { name: string; module: string; format: "pdf" | "xlsx" | "csv" }) => void;
  setStatus?: (status: string) => void;
};

export function ReportWizard({ hotels = [], onScheduleReport, setStatus }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [module, setModule] = useState<"OUTLET" | "ROOM_SERVICE" | "MINIBAR" | "DEPO" | "CHECK">("MINIBAR");
  const [selectedHotels, setSelectedHotels] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<Preset | "ozel">("buAy");
  const [dateFrom, setDateFrom] = useState(() => presetRange("buAy").from);
  const [dateTo, setDateTo] = useState(() => presetRange("buAy").to);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    "date",
    "hotel",
    "room",
    "product",
    "qty",
    "price",
    "amount",
    "staff",
  ]);
  const [groupBy, setGroupBy] = useState<string>("none");
  const [sortBy, setSortBy] = useState<string>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Query Result
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WizardQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gridQuery, setGridQuery] = useState("");
  const [gridPage, setGridPage] = useState(1);
  const [gridPageSize, setGridPageSize] = useState(25);

  // Client-side search and paging over the fetched result
  const gridColumns = useMemo<Column<GridRow>[]>(
    () =>
      (result?.columns ?? []).map((c) => ({
        key: c.key,
        title: c.title,
        width: c.type === "number" || c.type === "currency" ? 130 : 160,
        render: (row: GridRow) =>
          c.type === "badge" ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-accent/15 text-accent">
              {String(row.cells[c.key] ?? "")}
            </span>
          ) : c.type === "number" || c.type === "currency" ? (
            <span className="tabular-nums">{String(row.cells[c.key] ?? "—")}</span>
          ) : (
            String(row.cells[c.key] ?? "—")
          ),
      })),
    [result],
  );
  const gridRows = useMemo<GridRow[]>(() => {
    const all = (result?.rows ?? []).map((cells, i) => ({ id: String(i), cells }));
    const q = gridQuery.trim().toLocaleLowerCase("tr");
    if (!q) return all;
    return all.filter((r) => Object.values(r.cells).some((v) => String(v ?? "").toLocaleLowerCase("tr").includes(q)));
  }, [result, gridQuery]);
  const safePage = Math.min(gridPage, Math.max(1, Math.ceil(gridRows.length / gridPageSize)));
  const pagedRows = gridRows.slice((safePage - 1) * gridPageSize, safePage * gridPageSize);

  // Template Save Dialog
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const applyPreset = (p: Preset) => {
    setDatePreset(p);
    const r = presetRange(p);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const toggleHotel = (hId: string) => {
    setSelectedHotels((prev) =>
      prev.includes(hId) ? prev.filter((id) => id !== hId) : [...prev, hId],
    );
  };

  const handleRunReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runWizardReportAction({
        module,
        hotelIds: selectedHotels,
        from: dateFrom,
        to: dateTo,
        selectedColumns,
        groupBy,
        sortBy,
        sortOrder,
      });

      if (res.ok) {
        setResult(res.data);
        setStatus?.(`${res.data.rows.length} satır hazırlandı`);
      } else {
        setError(res.error.message);
        notify.error("Rapor oluşturulamadı");
      }
    } catch {
      setError("Sunucu hatası nedeniyle rapor oluşturulamadı");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      notify.error("Lütfen şablon için bir isim girin");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await saveWizardTemplateAction({
        id: `wiz-${Date.now()}`,
        name: templateName.trim(),
        module,
        hotelIds: selectedHotels,
        datePreset,
        dateFrom,
        dateTo,
        selectedColumns,
        groupBy,
        sortBy,
        sortOrder,
        createdAt: new Date().toISOString(),
      });
      if (res.ok) {
        notify.success(`"${templateName}" şablonu başarıyla kaydedildi!`);
        setTemplateName("");
      } else {
        notify.error(res.error.message);
      }
    } catch {
      notify.error("Şablon kaydedilemedi");
    } finally {
      setSavingTemplate(false);
    }
  };

  const downloadCsv = () => {
    if (!result || result.rows.length === 0) return;
    const header = result.columns.map((c) => `"${c.title.replace(/"/g, '""')}"`).join(";");
    const lines = result.rows.map((r) =>
      result.columns.map((c) => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(";"),
    );
    const content = "\uFEFF" + header + "\n" + lines.join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sihirbaz-rapor-${module.toLowerCase()}-${dateFrom}-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    notify.success("CSV raporu indirildi");
  };

  return (
    <div className="flex flex-col h-full bg-bg text-text text-xs overflow-hidden select-none">
      {/* Wizard Step Bar */}
      <div className="bg-white border-b border-border px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-sm shadow-sm">
            {step}
          </div>
          <div>
            <h2 className="font-bold text-sm text-text">
              {step === 1 && "Adım 1: Operasyon ve Modül Seçimi"}
              {step === 2 && "Adım 2: Otel & Tarih Kapsamı"}
              {step === 3 && "Adım 3: Sütun & Metrik Tercihleri"}
              {step === 4 && "Adım 4: Gruplama ve Sıralama"}
              {step === 5 && "Adım 5: Canlı Önizleme & Dışa Aktarma"}
            </h2>
            <p className="text-xs text-muted">
              {step === 1 && "Raporunu hazırlamak istediğiniz operasyonel veri alanını seçin."}
              {step === 2 && "Raporun kapsayacağı otelleri ve analiz tarih aralığını belirleyin."}
              {step === 3 && "Çıktıda görünmesini istediğiniz kolonları özelleştirin."}
              {step === 4 && "Verilerin nasıl gruplanacağını ve sıralanacağını yapılandırın."}
              {step === 5 && "Sorguyu çalıştırın, tabloyu inceleyin ve Excel/PDF/CSV olarak indirin."}
            </p>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setStep(s as Step);
                if (s === 5 && !result) void handleRunReport();
              }}
              className={`w-7 h-7 rounded-full text-xs font-bold transition flex items-center justify-center ${
                step === s
                  ? "bg-accent text-white shadow"
                  : step > s
                  ? "bg-accent/15 text-accent hover:bg-accent/30"
                  : "bg-[var(--muted-bg)] text-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Wizard Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {/* STEP 1: MODULE SELECTION */}
        {step === 1 && (
          <div className="max-w-4xl mx-auto space-y-4">
            <h3 className="font-bold text-text text-sm">Hangi operasyonel modülün raporunu hazırlamak istiyorsunuz?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MODULE_OPTIONS.map((opt) => {
                const active = module === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setModule(opt.id)}
                    className={`flex items-start gap-4 p-5 rounded-xl border text-left transition cursor-pointer ${
                      active
                        ? "border-accent bg-accent/10 shadow-md ring-2 ring-accent/20"
                        : "border-border bg-white hover:border-border hover:bg-bg shadow-sm"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${opt.color} text-white flex items-center justify-center shadow-md flex-shrink-0`}
                    >
                      <Icon name="folder" size={24} />
                    </div>
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-text flex items-center gap-2">
                        {opt.title}
                        {active ? <Icon name="check" size={16} className="text-accent" /> : null}
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: SCOPE & DATE */}
        {step === 2 && (
          <div className="max-w-3xl mx-auto space-y-6 bg-white p-6 rounded-xl border border-border shadow-sm">
            {/* Hotel Scope */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-text">Kapsamdaki Oteller</label>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedHotels(selectedHotels.length === hotels.length ? [] : hotels.map((h) => h.id))
                  }
                  className="text-xs text-accent hover:underline font-semibold"
                >
                  {selectedHotels.length === hotels.length ? "Seçimi Temizle" : "Tüm Otelleri Seç"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {hotels.map((h) => {
                  const sel = selectedHotels.includes(h.id);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => toggleHotel(h.id)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        sel
                          ? "border-accent bg-accent text-white shadow-sm"
                          : "border-border bg-bg text-text hover:bg-[var(--muted-bg)]"
                      }`}
                    >
                      {h.name}
                    </button>
                  );
                })}
                {hotels.length === 0 ? (
                  <span className="text-muted italic">Kayıtlı otel bulunamadı</span>
                ) : null}
              </div>
              <p className="text-xs text-muted">
                Hiçbir otel seçilmezse yetkili olunan tüm oteller otomatik rapora dahil edilir.
              </p>
            </div>

            {/* Date Presets */}
            <div className="space-y-3 pt-4 border-t border-border">
              <label className="font-bold text-text">Tarih Aralığı</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_LABELS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                      datePreset === p.id
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-bg text-text hover:bg-[var(--muted-bg)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDatePreset("ozel")}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                    datePreset === "ozel"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-bg text-text hover:bg-[var(--muted-bg)]"
                  }`}
                >
                  Özel Aralık
                </button>
              </div>

              {/* Custom Date Inputs */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDatePreset("ozel");
                      setDateFrom(e.target.value);
                    }}
                    className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Bitiş Tarihi</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDatePreset("ozel");
                      setDateTo(e.target.value);
                    }}
                    className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: COLUMN SELECTION */}
        {step === 3 && (
          <div className="max-w-3xl mx-auto space-y-4 bg-white p-6 rounded-xl border border-border shadow-sm">
            <h3 className="font-bold text-text text-sm">Raporda Yer Alacak Sütunlar ve Veri Alanları</h3>
            <p className="text-xs text-muted">
              İhtiyaç duyduğunuz alanları işaretleyerek rapor çıktısını sadeleştirebilir veya detaylandırabilirsiniz.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {[
                { id: "date", label: "İşlem Tarihi" },
                { id: "time", label: "İşlem Saati" },
                { id: "hotel", label: "Otel Adı" },
                { id: "room", label: "Oda / Masa No" },
                { id: "floor", label: "Kat Bilgisi" },
                { id: "product", label: "Ürün / Hizmet Adı" },
                { id: "qty", label: "Adet / Miktar" },
                { id: "price", label: "Birim Fiyat" },
                { id: "amount", label: "Toplam Tutar" },
                { id: "staff", label: "Personel / Görevli" },
                { id: "type", label: "İşlem / Hareket Türü" },
                { id: "status", label: "İşlem Durumu" },
              ].map((col) => {
                const checked = selectedColumns.includes(col.id);
                return (
                  <label
                    key={col.id}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      checked
                        ? "border-accent/40 bg-accent/10 text-accent font-semibold"
                        : "border-border bg-bg/50 text-text hover:bg-[var(--muted-bg)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedColumns([...selectedColumns, col.id]);
                        else setSelectedColumns(selectedColumns.filter((id) => id !== col.id));
                      }}
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                    <span>{col.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 4: GROUPING & SORTING */}
        {step === 4 && (
          <div className="max-w-3xl mx-auto space-y-6 bg-white p-6 rounded-xl border border-border shadow-sm">
            <div className="space-y-3">
              <label className="font-bold text-text text-sm">Veri Gruplama Tercihi</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: "none", label: "Düz Liste (Gruplama Yok)", desc: "Tüm satırlar kronolojik ayrıntılı liste olarak listelenir." },
                  { id: "hotel", label: "Otele Göre Grupla", desc: "Veriler otel başlıkları altında ayrı ayrı toplanır." },
                  { id: "product", label: "Ürüne Göre Grupla", desc: "Ürün bazlı toplam adet ve cirolar konsolide edilir." },
                  { id: "staff", label: "Personele Göre Grupla", desc: "İşlem yapan personel bazında performans gruplanır." },
                ].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGroupBy(g.id)}
                    className={`p-4 rounded-xl border text-left transition ${
                      groupBy === g.id
                        ? "border-accent bg-accent/10 font-semibold text-accent"
                        : "border-border bg-bg/50 text-text hover:bg-[var(--muted-bg)]"
                    }`}
                  >
                    <div className="text-xs font-bold">{g.label}</div>
                    <p className="text-xs text-muted mt-1">{g.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <label className="font-bold text-text text-sm">Sıralama Düzeni</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Sıralama Alanı</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-border bg-bg p-2 text-xs text-text focus:border-accent focus:outline-none"
                  >
                    <option value="date">Tarih</option>
                    <option value="amount">Toplam Tutar</option>
                    <option value="qty">Miktar / Adet</option>
                    <option value="product">Ürün Adı</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Yön</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                    className="min-h-11 w-full rounded-xl border border-border bg-bg p-2 text-xs text-text focus:border-accent focus:outline-none"
                  >
                    <option value="desc">Yeniden Eskiye / En Yüksekten En Düşüğe</option>
                    <option value="asc">Eskiden Yeniye / En Düşükten En Yükseğe</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: PREVIEW & OUTPUT */}
        {step === 5 && (
          <div className="space-y-4 max-w-6xl mx-auto">
            {/* Header / Action Bar */}
            <div className="bg-white p-4 rounded-xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRunReport}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-accent text-white font-bold hover:bg-accent/90 disabled:opacity-50 transition shadow-sm inline-flex items-center gap-1.5"
                >
                  <Icon name="refresh" size={14} className={loading ? "animate-spin" : ""} />
                  {loading ? "Sorgulanıyor..." : "Raporu Yeniden Çalıştır"}
                </button>

                {result ? (
                  <span className="text-xs text-muted font-semibold">
                    Toplam {result.totalCount} satır bulundu ({dateFrom} — {dateTo})
                  </span>
                ) : null}
              </div>

              {/* Downloads & Scheduling */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={!result || result.rows.length === 0}
                  className="px-3 py-1.5 rounded-lg border border-border bg-white text-text font-bold hover:bg-bg disabled:opacity-40 transition"
                >
                  CSV İndir
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={!result || result.rows.length === 0}
                  className="px-3 py-1.5 rounded-lg border border-success bg-[var(--success-bg)] text-success font-bold hover:bg-[var(--success-bg)] disabled:opacity-40 transition"
                >
                  Excel (XLSX)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  disabled={!result || result.rows.length === 0}
                  className="px-3 py-1.5 rounded-lg border border-danger bg-[var(--danger-bg)] text-danger font-bold hover:bg-[var(--danger-bg)] disabled:opacity-40 transition"
                >
                  PDF Yazdır
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onScheduleReport?.({
                      name: `Sihirbaz - ${module} (${datePreset})`,
                      module,
                      format: "xlsx",
                    })
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-info text-white font-bold hover:bg-info/90 transition shadow-sm inline-flex items-center gap-1"
                >
                  <Icon name="clock" size={14} />
                  Otomatik Rapor Yap
                </button>
              </div>
            </div>

            {/* Save as Template Bar */}
            <div className="bg-bg p-3 rounded-xl border border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Bu rapor tanımını şablon olarak kaydet (Örn: Haftalık Minibar Özeti)..."
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !templateName.trim()}
                  className="px-4 py-1.5 rounded-lg bg-brand text-white font-bold hover:bg-brand/90 disabled:opacity-40 transition flex-shrink-0"
                >
                  {savingTemplate ? "Kaydediliyor..." : "Şablonu Kaydet"}
                </button>
              </div>
              <span className="text-xs text-muted">
                Kaydettiğiniz şablonlar daha sonra tek tıkla yeniden çalıştırılabilir.
              </span>
            </div>

            {/* Summary KPI Chips */}
            {result?.summary?.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {result.summary.map((s, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-border shadow-sm">
                    <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                      {s.label}
                    </span>
                    <div className="text-base font-bold text-text mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Error view */}
            {error ? (
              <div className="p-4 rounded-xl bg-[var(--danger-bg)] border border-danger/40 text-danger text-xs font-semibold">
                {error}
              </div>
            ) : null}

            {/* Table Grid */}
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden min-h-[300px]">
              {loading ? (
                <div className="p-16 text-center text-muted">
                  <Icon name="refresh" size={24} className="animate-spin mx-auto mb-2 text-accent" />
                  Rapor verileri hazırlanıyor...
                </div>
              ) : !result || result.rows.length === 0 ? (
                <div className="p-16 text-center text-muted">
                  Bu kriterlere uygun kayıt bulunamadı. Filtreleri değiştirip tekrar deneyin.
                </div>
              ) : (
                <div className="h-[420px]">
                  <DataGrid<GridRow>
                    columns={gridColumns}
                    rows={pagedRows}
                    total={gridRows.length}
                    page={safePage}
                    pageSize={gridPageSize}
                    onPage={setGridPage}
                    onSort={() => {}}
                    onSearch={(q) => {
                      setGridQuery(q);
                      setGridPage(1);
                    }}
                    q={gridQuery}
                    onSelect={() => {}}
                    onPageSize={(size) => {
                      setGridPageSize(size);
                      setGridPage(1);
                    }}
                    pageSizes={[25, 50, 100]}
                    emptyText="Aramaya uyan kayıt yok."
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Wizard Footer Navigation */}
      <div className="bg-white border-t border-border px-6 py-3.5 flex items-center justify-between shadow-sm">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
          disabled={step === 1}
          className="px-4 py-2 rounded-lg border border-border text-text font-bold hover:bg-bg disabled:opacity-40 transition"
        >
          ← Önceki Adım
        </button>

        <div className="flex items-center gap-3">
          {step < 5 ? (
            <button
              type="button"
              onClick={() => {
                const next = (step + 1) as Step;
                setStep(next);
                if (next === 5) void handleRunReport();
              }}
              className="px-6 py-2 rounded-lg bg-accent text-white font-bold hover:bg-accent/90 transition shadow-sm"
            >
              Sonraki Adım →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-5 py-2 rounded-lg border border-border bg-bg text-text font-bold hover:bg-[var(--muted-bg)] transition"
            >
              Başa Dön / Yeni Rapor
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
