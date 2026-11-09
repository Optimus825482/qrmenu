"use client";

import { useState } from "react";
import type { AppProps } from "@/shell/registry";
import { ReportCenter } from "./ReportCenter";
import { ReportWizard } from "./ReportWizard";
import { AutomatedReportsPanel } from "./AutomatedReportsPanel";
import { Icon } from "@/components/icons/Icon";

type Tab = "catalogue" | "wizard" | "automated";

/**
 * Raporlar & Rapor Merkezi (core.rapor, CR-RAP):
 * - Operasyonel Raporlar: F&B, Outlet, Minibar, Oda Servisi ve Merkez hazır rapor formatları
 * - Rapor Oluşturma Sihirbazı: Sistem yöneticisi adım adım istediği raporu filtreleyip hazırlar
 * - Otomatik Raporlar: Zamanlanmış rapor üretimi, e-posta gönderimi ve Google Drive bulut arşivleme
 */
export function ReportCenterWindow({ initialPanel, setStatus, hotelId }: AppProps) {
  const [activeTab, setActiveTab] = useState<Tab>("catalogue");
  const [preFillSchedule, setPreFillSchedule] = useState<{
    name: string;
    module: string;
    format: "pdf" | "xlsx" | "csv";
  } | null>(null);

  const handleScheduleFromOtherTab = (info: {
    name: string;
    module: string;
    format: "pdf" | "xlsx" | "csv";
  }) => {
    setPreFillSchedule(info);
    setActiveTab("automated");
  };

  return (
    <div className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden select-none">
      {/* Top Navigation Tabs Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white px-5 py-2.5 flex items-center justify-between border-b border-slate-700/80 shadow-md flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("catalogue")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "catalogue"
                ? "bg-blue-600 text-white shadow-md ring-1 ring-blue-400/50"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Icon name="folder" size={16} />
            Operasyon Raporları
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("wizard")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "wizard"
                ? "bg-blue-600 text-white shadow-md ring-1 ring-blue-400/50"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Icon name="search" size={16} />
            Rapor Oluşturma Sihirbazı
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("automated")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === "automated"
                ? "bg-blue-600 text-white shadow-md ring-1 ring-blue-400/50"
                : "text-slate-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Icon name="clock" size={16} />
            Otomatik Raporlar (Zamanlanmış)
          </button>
        </div>

        <div className="text-[11px] text-slate-300 font-medium hidden sm:flex items-center gap-1.5 opacity-80">
          <Icon name="check" size={13} className="text-emerald-400" />
          <span>Google Drive & E-posta Entegrasyonu Aktif</span>
        </div>
      </div>

      {/* Main Tab View */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "catalogue" && (
          <div className="h-full rc-window">
            <ReportCenter
              variant="window"
              initialKey={initialPanel}
              setStatus={setStatus}
              onScheduleReport={(report) =>
                handleScheduleFromOtherTab({
                  name: `Otomatik - ${report.title}`,
                  module: report.group,
                  format: "pdf",
                })
              }
            />
          </div>
        )}

        {activeTab === "wizard" && (
          <ReportWizard
            setStatus={setStatus}
            onScheduleReport={handleScheduleFromOtherTab}
          />
        )}

        {activeTab === "automated" && (
          <AutomatedReportsPanel
            setStatus={setStatus}
            initialPreFill={preFillSchedule}
          />
        )}
      </div>
    </div>
  );
}
