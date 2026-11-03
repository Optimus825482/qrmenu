"use client";

import { useState } from "react";
import type { AppProps } from "@/shell/registry";
import { OutletsPanel } from "@/shell/apps/definitions/panels/OutletsPanel";
import { TablesPanel } from "@/shell/apps/definitions/panels/TablesPanel";
import { Icon } from "@/components/icons/Icon";

export function OutletDefinitionsWindow({ hotelId, setStatus }: AppProps) {
  const [tab, setTab] = useState<"outlets" | "tables">("outlets");

  return (
    <div className="flex flex-col h-full bg-[#ece9d8] text-xs font-sans overflow-hidden">
      {/* Top Tab Bar */}
      <div className="bg-[#ece9d8] border-b border-[#7f9db9] p-1.5 flex gap-2 items-center">
        <button
          type="button"
          onClick={() => setTab("outlets")}
          className={`px-3 py-1 rounded font-bold transition-all ${
            tab === "outlets"
              ? "bg-white text-blue-900 border border-[#7f9db9] shadow-sm"
              : "bg-transparent text-gray-700 hover:bg-white/50"
          }`}
        >
          <Icon name="building" size={16} /> Outlet Tanımları & Alanlar
        </button>
        <button
          type="button"
          onClick={() => setTab("tables")}
          className={`px-3 py-1 rounded font-bold transition-all ${
            tab === "tables"
              ? "bg-white text-blue-900 border border-[#7f9db9] shadow-sm"
              : "bg-transparent text-gray-700 hover:bg-white/50"
          }`}
        >
          <Icon name="table" size={16} /> Masa Tanımları & Alan Bağlantıları
        </button>
      </div>

      {/* Main Content View */}
      <div className="flex-1 bg-white overflow-hidden">
        {!hotelId ? (
          <div className="p-8 text-center text-gray-500">
            Lütfen pencere başlığından bir otel seçin.
          </div>
        ) : tab === "outlets" ? (
          <OutletsPanel hotelId={hotelId} setStatus={setStatus} />
        ) : (
          <TablesPanel hotelId={hotelId} setStatus={setStatus} />
        )}
      </div>
    </div>
  );
}
