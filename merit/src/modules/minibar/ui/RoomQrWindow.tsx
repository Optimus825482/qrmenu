"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppProps } from "@/shell/registry";
import {
  listRoomQrAction,
  regenerateRoomQrAction,
  regenerateAllRoomQrAction,
} from "../server/actions/roomQr";
import type { RoomQrRow } from "../server/roomQr";

export function RoomQrWindow({ hotelId, setStatus }: AppProps) {
  const [rows, setRows] = useState<RoomQrRow[]>([]);
  const [floors, setFloors] = useState<{ id: string; number: number }[]>([]);
  const [floorId, setFloorId] = useState<string | undefined>();
  const [onlyUnsigned, setOnlyUnsigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!hotelId) return;
    setBusy(true);
    try {
      const res = await listRoomQrAction({ hotelId, floorId });
      if (res.ok) {
        setRows(res.data);
        setError(null);
        setStatus?.(`${res.data.length} oda QR kodu listelendi`);

        // Derive unique floors
        const floorMap = new Map<string, number>();
        for (const r of res.data) {
          if (r.floorId && !floorMap.has(r.floorId)) {
            floorMap.set(r.floorId, r.floorNumber);
          }
        }
        setFloors(
          Array.from(floorMap.entries())
            .map(([id, number]) => ({ id, number }))
            .sort((a, b) => a.number - b.number),
        );
      } else {
        setError(res.error?.message ?? "Odalar listelenemedi");
      }
    } finally {
      setBusy(false);
    }
  }, [hotelId, floorId, setStatus]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        void loadRows();
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loadRows]);

  const regenerateOne = async (row: RoomQrRow) => {
    setBusy(true);
    try {
      const res = await regenerateRoomQrAction({ roomId: row.id });
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? res.data : r)));
        setStatus?.(`Oda ${row.number} QR kodu yenilendi`);
      } else {
        setError(res.error?.message ?? "QR yenilenemedi");
      }
    } finally {
      setBusy(false);
    }
  };

  const regenerateAll = async () => {
    if (!hotelId) return;
    setBusy(true);
    try {
      const res = await regenerateAllRoomQrAction({ hotelId, floorId, onlyUnsigned });
      if (res.ok) {
        await loadRows();
        setStatus?.(`${res.data.count} odanın QR kodu üretildi/yenilendi`);
      } else {
        setError(res.error?.message ?? "Toplu QR üretilemedi");
      }
    } finally {
      setBusy(false);
    }
  };

  const signedCount = rows.filter((r) => r.signed).length;
  const zipUrl = hotelId
    ? `/api/qr/hotel/${hotelId}/room-zip${floorId ? `?floorId=${floorId}` : ""}`
    : "#";

  return (
    <div className="flex flex-col h-full bg-[#ece9d8] text-xs font-sans select-none overflow-hidden p-2 gap-2">
      {/* Üst Araç Çubuğu */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f0f0f0] p-2.5 rounded border border-[#7f9db9] shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {floors.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[#1f2937]">Kat Filtresi:</span>
              <select
                value={floorId ?? "ALL"}
                onChange={(e) => setFloorId(e.target.value === "ALL" ? undefined : e.target.value)}
                className="border border-[#7f9db9] px-2 py-1 rounded bg-white text-xs font-medium"
              >
                <option value="ALL">Tüm Katlar ({rows.length} oda)</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    Kat {f.number}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* İmzalı QR Sayacı */}
          <div className="px-2.5 py-1 rounded bg-white border border-[#b8cfe5] font-semibold text-[#1e3a8a] flex items-center gap-1.5">
            <span>🚪 <strong>{rows.length}</strong> oda</span>
            <span>&bull;</span>
            <span style={{ color: signedCount === rows.length && rows.length > 0 ? "#15803d" : "#b45309" }}>
              {signedCount} İmzalı HMAC QR
            </span>
          </div>

          <label className="flex items-center gap-1 cursor-pointer font-medium ml-1">
            <input
              type="checkbox"
              checked={onlyUnsigned}
              onChange={(e) => setOnlyUnsigned(e.target.checked)}
              className="cursor-pointer"
            />
            <span>Yalnız imzasızları</span>
          </label>

          <button
            type="button"
            className="xp-button text-xs px-2.5 py-1 font-bold"
            disabled={busy || rows.length === 0}
            onClick={() => void regenerateAll()}
          >
            Toplu Üret / Yenile
          </button>
        </div>

        {hotelId ? (
          <a
            className="xp-button text-xs px-3 py-1 font-black text-blue-900 bg-blue-50 hover:bg-blue-100 border-blue-400 flex items-center gap-1"
            href={zipUrl}
            download
          >
            <span>📦</span> Toplu ZIP İndir
          </a>
        ) : null}
      </div>

      {error ? (
        <div className="p-2 rounded bg-rose-50 border border-rose-300 text-rose-700 text-xs font-bold">
          {error}
        </div>
      ) : null}

      {/* Tablo Grid */}
      <div className="flex-1 bg-white border border-[#7f9db9] rounded overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#ece9d8] border-b border-[#7f9db9] text-[#1f2937] sticky top-0 z-10">
              <th className="p-2 font-bold">Oda No</th>
              <th className="p-2 font-bold">Kat</th>
              <th className="p-2 font-bold">Oda Tipi</th>
              <th className="p-2 font-bold text-center">HMAC İmzalı QR</th>
              <th className="p-2 font-bold text-right pr-4">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-muted">
                  Kayıtlı oda bulunamadı.
                </td>
              </tr>
            ) : null}

            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[#e5e5e5] hover:bg-[#f9fafb]">
                <td className="p-2 font-black text-text">Oda {row.number}</td>
                <td className="p-2 font-bold text-[#0c3276]">Kat {row.floorNumber}</td>
                <td className="p-2 text-muted">{row.roomTypeName ?? "Standart"}</td>
                <td className="p-2 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      row.signed
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    }`}
                  >
                    {row.signed ? "✓ İmzalı" : "İmzasız / Eski"}
                  </span>
                </td>
                <td className="p-2 text-right pr-3 flex items-center justify-end gap-1.5">
                  <a
                    className="xp-button text-[11px] px-2 py-0.5 font-bold"
                    href={`/api/qr/room/${row.id}?format=svg`}
                    download
                    title="Vektör SVG formatında indir"
                  >
                    SVG
                  </a>
                  <a
                    className="xp-button text-[11px] px-2 py-0.5 font-bold"
                    href={`/api/qr/room/${row.id}?format=png`}
                    download
                    title="Yüksek çözünürlüklü PNG indir"
                  >
                    PNG
                  </a>
                  <button
                    type="button"
                    className="xp-button text-[11px] px-2 py-0.5 font-bold"
                    disabled={busy}
                    onClick={() => void regenerateOne(row)}
                  >
                    Yenile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
