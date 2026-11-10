"use client";

import { useCallback, useEffect, useState } from "react";
import { confirm } from "@/shell/confirm";
import type { AppProps } from "@/shell/registry";
import {
  generateRoomQrAction,
  generateRoomQrBulkAction,
  listRoomQrAction,
  roomQrPrintSheetAction,
  setRoomGuestMessageAction,
} from "../server/actions/roomQr";
import type { RoomQrFilter, RoomQrPrintSheet as PrintData, RoomQrRow } from "../server/roomQr";
import { RoomQrPrintSheet } from "./RoomQrPrintSheet";

type BulkMode = "MISSING" | "LEGACY" | "ALL";

const BULK_LABEL: Record<BulkMode, string> = {
  MISSING: "Eksik olanlar",
  LEGACY: "Eski biçimliler",
  ALL: "Tümü (yenile)",
};
const FILTER_LABEL: Record<RoomQrFilter, string> = {
  ALL: "Tüm odalar",
  MISSING: "QR yok",
  LEGACY: "Eski biçim",
  SIGNED: "İmzalı",
};
const BADGE: Record<"YOK" | "ESKI" | "IMZALI", { text: string; cls: string }> = {
  YOK: { text: "Yok", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  ESKI: { text: "Eski biçim", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  IMZALI: { text: "İmzalı", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};
const PAGE_SIZE = 50;

export function RoomQrWindow({ hotelId, setStatus }: AppProps) {
  const [rows, setRows] = useState<RoomQrRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [floors, setFloors] = useState<{ id: string; name: string }[]>([]);
  const [floorId, setFloorId] = useState<string | undefined>();
  const [qr, setQr] = useState<RoomQrFilter>("ALL");
  const [search, setSearch] = useState("");
  const [bulkMode, setBulkMode] = useState<BulkMode>("MISSING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [printData, setPrintData] = useState<PrintData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!hotelId) return;
    setBusy(true);
    try {
      const res = await listRoomQrAction({
        hotelId,
        floorId,
        qr,
        q: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      if (res.ok) {
        setRows(res.data.items);
        setTotal(res.data.total);
        setError(null);
        setStatus?.(`${res.data.total} oda listelendi`);
        if (!floorId) {
          const seen = new Map<string, string>();
          for (const r of res.data.items) seen.set(r.floorId, r.floorName);
          setFloors((prev) => {
            const merged = new Map(prev.map((f) => [f.id, f.name]));
            for (const [id, name] of seen) merged.set(id, name);
            return [...merged].map(([id, name]) => ({ id, name }));
          });
        }
      } else {
        setError(res.error?.message ?? "Odalar listelenemedi");
      }
    } finally {
      setBusy(false);
    }
  }, [hotelId, floorId, qr, search, page, setStatus]);

  useEffect(() => {
    const timer = setTimeout(() => void loadRows(), 0);
    return () => clearTimeout(timer);
  }, [loadRows]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const generateOne = (row: RoomQrRow) =>
    run(async () => {
      if (!hotelId) return;
      if (row.hasQr) {
        const ok = await confirm({
          title: "QR kodunu yenile",
          message: `Oda ${row.number} için yeni QR kodu üretilecek. Basılı etiket geçersiz olur.`,
          danger: true,
          confirmLabel: "Yenile",
        });
        if (!ok) return;
      }
      const res = await generateRoomQrAction({ hotelId, roomId: row.id, regenerate: row.hasQr });
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? res.data : r)));
        setStatus?.(`Oda ${row.number} QR kodu ${row.hasQr ? "yenilendi" : "üretildi"}`);
        setError(null);
      } else {
        setError(res.error.message);
      }
    });

  const generateBulk = () =>
    run(async () => {
      if (!hotelId) return;
      const needsConfirm = bulkMode !== "MISSING";
      if (needsConfirm) {
        const ok = await confirm({
          title: "Toplu QR üretimi",
          message: `${BULK_LABEL[bulkMode]} için yeni QR kodları üretilecek. Eski QR kodları ve basılı etiketler geçersiz olacak.`,
          danger: true,
          confirmLabel: "Üret",
        });
        if (!ok) return;
      }
      const res = await generateRoomQrBulkAction({
        hotelId,
        mode: bulkMode,
        floorId,
        ...(needsConfirm ? { confirmInvalidate: true } : {}),
      });
      if (res.ok) {
        setStatus?.(`${res.data.count} odanın QR kodu üretildi`);
        await loadRows();
      } else {
        setError(res.error.message);
      }
    });

  const regenerateAllRooms = () =>
    run(async () => {
      if (!hotelId) return;
      const ok = await confirm({
        title: "Tüm QR'ları yenile",
        message:
          "Bu otelin BÜTÜN aktif odalarının QR kodları yenilenecek. Basılı tüm eski QR kodları ve etiketler geçersiz olur ve yeniden basılması gerekir.",
        danger: true,
        confirmLabel: "Tümünü yenile",
      });
      if (!ok) return;
      const res = await generateRoomQrBulkAction({ hotelId, mode: "ALL", confirmInvalidate: true });
      if (res.ok) {
        setStatus?.(`${res.data.count} odanın QR kodu yenilendi`);
        await loadRows();
      } else {
        setError(res.error.message);
      }
    });

  const saveMessage = () =>
    run(async () => {
      if (!hotelId || selected.size === 0) return;
      const res = await setRoomGuestMessageAction({
        hotelId,
        roomIds: [...selected],
        message: message.trim() ? message : null,
      });
      if (res.ok) {
        setStatus?.(`${res.data.count} odanın misafir mesajı kaydedildi`);
        setError(null);
        await loadRows();
      } else {
        setError(res.error.message);
      }
    });

  // Card sheet in a new tab (same templates as the table QR print); the selection wins over the floor filter.
  const cardPrintParams = new URLSearchParams();
  if (selected.size > 0) cardPrintParams.set("ids", [...selected].join(","));
  else if (floorId) cardPrintParams.set("floorId", floorId);
  const cardPrintQuery = cardPrintParams.toString();
  const cardPrintUrl = `/api/qr/hotel/${hotelId}/room-print${cardPrintQuery ? `?${cardPrintQuery}` : ""}`;

  const print = () =>
    run(async () => {
      if (!hotelId) return;
      const res = await roomQrPrintSheetAction({
        hotelId,
        floorId,
        ...(selected.size > 0 ? { roomIds: [...selected] } : {}),
      });
      if (res.ok) {
        setError(null);
        setPrintData(res.data);
      } else {
        setError(res.error.message);
      }
    });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const zipUrl = hotelId ? `/api/qr/hotel/${hotelId}/room-zip${floorId ? `?floorId=${floorId}` : ""}` : "#";
  const pdfUrl = hotelId ? `/api/qr/hotel/${hotelId}/room-pdf${floorId ? `?floorId=${floorId}` : ""}` : "#";

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden bg-[#ece9d8] p-2 font-sans text-xs" data-testid="room-qr-window">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#7f9db9] bg-[#f0f0f0] p-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 font-bold text-[#1f2937]">
            Kat
            <select
              value={floorId ?? "ALL"}
              onChange={(e) => {
                setFloorId(e.target.value === "ALL" ? undefined : e.target.value);
                setPage(1);
              }}
              className="rounded border border-[#7f9db9] bg-white px-2 py-1 text-xs font-medium"
            >
              <option value="ALL">Tüm katlar</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 font-bold text-[#1f2937]">
            Durum
            <select
              value={qr}
              onChange={(e) => {
                setQr(e.target.value as RoomQrFilter);
                setPage(1);
              }}
              className="rounded border border-[#7f9db9] bg-white px-2 py-1 text-xs font-medium"
              data-testid="room-qr-filter"
            >
              {(Object.keys(FILTER_LABEL) as RoomQrFilter[]).map((k) => (
                <option key={k} value={k}>
                  {FILTER_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <input
            type="search"
            value={search}
            placeholder="Oda no ara"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-28 rounded border border-[#7f9db9] bg-white px-2 py-1 text-xs"
          />
          <span className="rounded border border-[#b8cfe5] bg-white px-2.5 py-1 font-semibold text-[#1e3a8a]">
            {total} oda
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={bulkMode}
            onChange={(e) => setBulkMode(e.target.value as BulkMode)}
            className="rounded border border-[#7f9db9] bg-white px-2 py-1 text-xs"
            aria-label="Toplu üretim modu"
            data-testid="room-qr-bulk-mode"
          >
            {(Object.keys(BULK_LABEL) as BulkMode[]).map((k) => (
              <option key={k} value={k}>
                {BULK_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="xp-button px-2.5 py-1 text-xs font-bold"
            disabled={busy}
            onClick={() => void generateBulk()}
            data-testid="room-qr-bulk"
          >
            Toplu üret
          </button>
          <button
            type="button"
            className="xp-button px-2.5 py-1 text-xs font-bold"
            disabled={busy}
            onClick={() => void regenerateAllRooms()}
            title="Bu otelin bütün aktif odalarının QR kodlarını yeniler"
            data-testid="room-qr-regenerate-all"
          >
            Tüm QR&apos;ları Yenile
          </button>
          <button type="button" className="xp-button px-2.5 py-1 text-xs font-bold" disabled={busy} onClick={() => void print()}>
            Yazdır{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
          {hotelId ? (
            <>
            <a
              className="xp-button px-3 py-1 text-xs font-bold"
              href={cardPrintUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Masa QR baskısındaki stand / kart / etiket şablonlarıyla önizle ve yazdır"
              data-testid="room-qr-card-print"
            >
              Kart Yazdır{selected.size > 0 ? ` (${selected.size})` : ""}
            </a>
            <a className="xp-button px-3 py-1 text-xs font-bold" href={zipUrl} download>
              ZIP indir
            </a>
            <a
              className="xp-button px-3 py-1 text-xs font-bold"
              href={pdfUrl}
              download
              title="QR kartları (A4, sayfada 6 kart); kat seçiliyse yalnız o kat"
            >
              PDF indir
            </a>
            </>
          ) : null}
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-start gap-2 rounded border border-[#7f9db9] bg-[#f0f0f0] p-2">
          <label className="flex flex-1 flex-col gap-1 font-bold text-[#1f2937]">
            Misafir mesajı ({selected.size} oda; boş bırakırsanız silinir)
            <textarea
              value={message}
              maxLength={500}
              rows={2}
              onChange={(e) => setMessage(e.target.value)}
              className="rounded border border-[#7f9db9] bg-white p-1.5 text-xs font-normal"
              data-testid="room-qr-message"
            />
          </label>
          <button type="button" className="xp-button px-3 py-1 text-xs font-bold" disabled={busy} onClick={() => void saveMessage()}>
            Mesajı kaydet
          </button>
          <button type="button" className="xp-button px-3 py-1 text-xs" onClick={() => setSelected(new Set())}>
            Seçimi temizle
          </button>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded border border-rose-300 bg-rose-50 p-2 text-xs font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto rounded border border-[#7f9db9] bg-white">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-[#7f9db9] bg-[#ece9d8] text-[#1f2937]">
              <th className="w-8 p-2">
                <input
                  type="checkbox"
                  aria-label="Sayfadaki tüm odaları seç"
                  checked={allSelected}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const r of rows) {
                        if (allSelected) next.delete(r.id);
                        else next.add(r.id);
                      }
                      return next;
                    })
                  }
                />
              </th>
              <th className="p-2 font-bold">Oda</th>
              <th className="p-2 font-bold">Kat</th>
              <th className="p-2 font-bold">Oda tipi</th>
              <th className="p-2 text-center font-bold">QR durumu</th>
              <th className="p-2 font-bold">Son 4</th>
              <th className="p-2 font-bold">Mesaj</th>
              <th className="p-2 pr-4 text-right font-bold">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted">
                  Bu süzgece uyan oda yok.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const badge = BADGE[row.format ?? "YOK"];
              return (
                <tr key={row.id} className="border-b border-[#e5e5e5] hover:bg-[#f9fafb]" data-testid={`room-qr-row-${row.number}`}>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`Oda ${row.number} seç`}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  <td className="p-2 font-black text-text">
                    {row.number}
                    {row.isActive ? "" : " (pasif)"}
                  </td>
                  <td className="p-2 font-bold text-[#0c3276]">{row.floorName}</td>
                  <td className="p-2 text-muted">{row.roomTypeName ?? "Standart"}</td>
                  <td className="p-2 text-center">
                    <span className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.text}</span>
                  </td>
                  <td className="p-2 font-mono text-muted">{row.tokenTail ?? ""}</td>
                  <td className="max-w-40 truncate p-2 text-muted" title={row.guestMessage ?? undefined}>
                    {row.guestMessage ?? ""}
                  </td>
                  <td className="flex items-center justify-end gap-1.5 p-2 pr-3">
                    {row.hasQr ? (
                      <>
                        <a className="xp-button px-2 py-0.5 text-[11px] font-bold" href={`/api/qr/room/${row.id}?format=svg`} download>
                          SVG
                        </a>
                        <a className="xp-button px-2 py-0.5 text-[11px] font-bold" href={`/api/qr/room/${row.id}?format=png`} download>
                          PNG
                        </a>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="xp-button px-2 py-0.5 text-[11px] font-bold"
                      disabled={busy || !row.isActive}
                      onClick={() => void generateOne(row)}
                    >
                      {row.hasQr ? "Yenile" : "Üret"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="xp-button px-2 py-0.5" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Önceki
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button type="button" className="xp-button px-2 py-0.5" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Sonraki
          </button>
        </div>
      ) : null}

      {printData ? <RoomQrPrintSheet data={printData} onClose={() => setPrintData(null)} /> : null}
    </div>
  );
}
