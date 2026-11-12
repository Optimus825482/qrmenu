"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons/Icon";

type Floor = { id: string; name: string; rooms: { id: string; number: string }[] };
type Line = { productId: string; name: string; groupName: string; unit: string; max: number };
type Status = "BEKLIYOR" | "ONAYLANDI" | "REDDEDILDI";
type RequestRow = {
  id: string;
  hotelName: string;
  roomNumber: string;
  floorName: string;
  reason: string;
  status: Status;
  requestedById: string;
  requestedByName: string;
  decidedByName: string | null;
  rejectReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  totalQty: number;
  items: { productId: string; productName: string; qty: number }[];
};
type Overview = { floors: Floor[]; canCreate: boolean; canDecide: boolean; userId: string; requests: RequestRow[] };

const STATUS_LABEL: Record<Status, string> = { BEKLIYOR: "Onay bekliyor", ONAYLANDI: "Onaylandı", REDDEDILDI: "Reddedildi" };
const STATUS_CLASS: Record<Status, string> = {
  BEKLIYOR: "border-warn/50 bg-warn/10 text-warn",
  ONAYLANDI: "border-success/50 bg-success/10 text-success",
  REDDEDILDI: "border-danger/50 bg-danger/10 text-danger",
};
const REASON_MIN = 10;

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Nicosia",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  return json?.error ?? "İşlem tamamlanamadı";
}

/**
 * Manuel kayıt talebi: the room QR could not be read, so the attendant picks the floor and the room, enters the
 * consumption found, explains why and sends it to the minibar system manager. Managers decide on the same page.
 */
export default function ManuelKayitPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [floorId, setFloorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [linesError, setLinesError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  /** MMD reason carried over from the room detail (guest unavailable but took the products at the door). */
  const [mmd, setMmd] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/minibar/manual-requests");
      if (!res.ok) throw new Error(await readError(res));
      setData((await res.json()) as Overview);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Talepler alınamadı");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const floor = useMemo(() => data?.floors.find((f) => f.id === floorId) ?? null, [data, floorId]);
  const room = useMemo(() => floor?.rooms.find((r) => r.id === roomId) ?? null, [floor, roomId]);

  const pickRoom = useCallback(async (id: string) => {
    setRoomId(id);
    setLines(null);
    setLinesError(null);
    setQty({});
    if (!id) return;
    try {
      const res = await fetch(`/api/minibar/manual-requests?roomId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(await readError(res));
      setLines(((await res.json()) as { lines: Line[] }).lines);
    } catch (error) {
      setLinesError(error instanceof Error ? error.message : "Oda ürünleri alınamadı");
    }
  }, []);

  // Opened from an MMD: `?oda=<roomId>&mmd=<reason>` picks the room and starts the explanation.
  useEffect(() => {
    if (!data || !data.canCreate) return;
    const query = new URLSearchParams(window.location.search);
    const wanted = query.get("oda");
    const reasonText = query.get("mmd");
    if (!wanted) return;
    const owner = data.floors.find((f) => f.rooms.some((r) => r.id === wanted));
    if (!owner) return;
    window.history.replaceState(null, "", window.location.pathname);
    const first = setTimeout(() => {
      setFloorId(owner.id);
      void pickRoom(wanted);
      if (reasonText) {
        setMmd(reasonText.slice(0, 200));
        setReason(`MMD: ${reasonText.slice(0, 200)}. `);
      }
    }, 0);
    return () => clearTimeout(first);
  }, [data, pickRoom]);

  const chosen = Object.entries(qty).filter(([, value]) => value > 0);
  const total = chosen.reduce((sum, [, value]) => sum + value, 0);
  const reasonOk = reason.trim().length >= REASON_MIN;
  const canSend = !!room && chosen.length > 0 && reasonOk && !busy;

  const step = (line: Line, delta: number) =>
    setQty((prev) => ({ ...prev, [line.productId]: Math.min(line.max, Math.max(0, (prev[line.productId] ?? 0) + delta)) }));

  const send = async () => {
    if (!room || !canSend) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/minibar/manual-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id, reason: reason.trim(), items: chosen.map(([productId, value]) => ({ productId, qty: value })) }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { message: string };
      setMessage({ tone: "ok", text: json.message });
      setRoomId("");
      setLines(null);
      setQty({});
      setReason("");
      setMmd(null);
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Talep gönderilemedi" });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, approved: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/minibar/manual-requests/${encodeURIComponent(id)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, ...(approved ? {} : { rejectReason: rejectReason.trim() || undefined }) }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const json = (await res.json()) as { message: string };
      setMessage({ tone: "ok", text: json.message });
      setRejecting(null);
      setRejectReason("");
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Karar kaydedilemedi" });
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border border-border bg-bg px-3 py-3 text-sm text-text focus:border-accent focus:outline-none";
  const waiting = data?.requests.filter((r) => r.status === "BEKLIYOR").length ?? 0;

  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href="/kat"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg px-3 py-2 text-sm font-semibold text-text hover:bg-surface"
          >
            <Icon name="arrow-left" size={16} />
            Geri
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text">Manuel Kayıt Talebi</h1>
            <p className="text-xs text-muted">
              Oda QR kodu okutulamadığında tüketimi buradan onaya gönderin. Onaylanınca odaya işlenir.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {loadError ? (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {loadError}
          </div>
        ) : null}
        {message ? (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            className={`rounded-xl border p-3 text-sm ${
              message.tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-success/40 bg-success/10 text-success"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {data?.canCreate ? (
          <section className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            {mmd ? (
              <div className="rounded-xl border border-yellow-500/60 bg-yellow-400/20 p-3 text-sm text-text">
                <span className="font-bold">MMD · Misafir müsait değil:</span> {mmd}. Oda ve açıklama dolduruldu; tüketim miktarlarını girin.
              </div>
            ) : null}
            <h2 className="text-sm font-bold text-text">1. Kat ve oda</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-muted">
                Kat
                <select
                  className={`${field} mt-1`}
                  value={floorId}
                  onChange={(e) => {
                    setFloorId(e.target.value);
                    void pickRoom("");
                  }}
                >
                  <option value="">Kat seçin</option>
                  {data.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold text-muted">
                Oda
                <select className={`${field} mt-1`} value={roomId} disabled={!floor} onChange={(e) => void pickRoom(e.target.value)}>
                  <option value="">{floor ? "Oda seçin" : "Önce kat seçin"}</option>
                  {floor?.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.number}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {room ? (
              <>
                <h2 className="text-sm font-bold text-text">2. Oda {room.number} tüketim kayıtları</h2>
                {linesError ? (
                  <p role="alert" className="text-sm text-danger">
                    {linesError}
                  </p>
                ) : null}
                {lines === null && !linesError ? <p className="text-sm text-muted">Oda ürünleri yükleniyor…</p> : null}
                {lines && lines.length === 0 ? <p className="text-sm text-muted">Bu oda için tanımlı minibar ürünü yok.</p> : null}
                {lines && lines.length > 0 ? (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {lines.map((line) => {
                      const value = qty[line.productId] ?? 0;
                      return (
                        <li key={line.productId} className="flex items-center gap-3 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-text">{line.name}</div>
                            <div className="text-xs text-muted">
                              {line.groupName} · {line.max > 0 ? `en fazla ${line.max}` : "bugün tamamlanmış"}
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label={`${line.name} azalt`}
                            disabled={value === 0}
                            onClick={() => step(line, -1)}
                            className="h-11 w-11 rounded-xl border border-border bg-bg text-lg font-bold text-text disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-base font-bold tabular-nums" aria-live="polite">
                            {value}
                          </span>
                          <button
                            type="button"
                            aria-label={`${line.name} artır`}
                            disabled={value >= line.max}
                            onClick={() => step(line, 1)}
                            className="h-11 w-11 rounded-xl border border-border bg-bg text-lg font-bold text-text disabled:opacity-40"
                          >
                            +
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <h2 className="text-sm font-bold text-text">3. Açıklama</h2>
                <label className="block text-xs font-semibold text-muted">
                  QR kodu neden okutulamadı? (en az {REASON_MIN} karakter)
                  <textarea
                    className={`${field} mt-1`}
                    rows={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Örn: QR etiketi yırtılmış, kamera okumuyor"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-muted">
                    {chosen.length} ürün · toplam {total} adet
                  </span>
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={() => void send()}
                    style={{ minHeight: "var(--tap-primary)" }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Icon name="arrow-right" size={18} />
                    {busy ? "Gönderiliyor…" : "Onaya gönder"}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-text">{data?.canDecide ? "Manuel kayıt talepleri" : "Taleplerim"}</h2>
            {waiting > 0 ? <span className="text-xs font-bold text-warn">{waiting} talep onay bekliyor</span> : null}
          </div>
          {data && data.requests.length === 0 ? <p className="text-sm text-muted">Henüz manuel kayıt talebi yok.</p> : null}
          <ul className="space-y-3">
            {data?.requests.map((r) => {
              const mayDecide = data.canDecide && r.status === "BEKLIYOR" && r.requestedById !== data.userId;
              return (
                <li key={r.id} className="space-y-2 rounded-xl border border-border bg-bg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold text-text">
                      Oda {r.roomNumber} <span className="font-normal text-muted">· {r.floorName} · {r.hotelName}</span>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {r.requestedByName} · {stamp(r.createdAt)}
                  </div>
                  <p className="text-sm text-text">{r.reason}</p>
                  <p className="text-sm text-text">
                    <span className="font-semibold">Tüketim ({r.totalQty} adet):</span>{" "}
                    {r.items.map((item) => `${item.productName} x${item.qty}`).join(", ")}
                  </p>
                  {r.status !== "BEKLIYOR" ? (
                    <p className="text-xs text-muted">
                      {r.decidedByName ?? "Yönetici"} · {r.resolvedAt ? stamp(r.resolvedAt) : ""}
                      {r.rejectReason ? ` · ${r.rejectReason}` : ""}
                    </p>
                  ) : null}
                  {mayDecide ? (
                    rejecting === r.id ? (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-muted">
                          Ret nedeni
                          <input className={`${field} mt-1`} maxLength={500} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void decide(r.id, false)}
                            className="min-h-11 rounded-xl bg-danger px-4 text-sm font-bold text-white disabled:opacity-50"
                          >
                            Reddet
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setRejecting(null)}
                            className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text"
                          >
                            Vazgeç
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void decide(r.id, true)}
                          className="min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-50"
                        >
                          Onayla ve odaya işle
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRejecting(r.id);
                            setRejectReason("");
                          }}
                          className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text"
                        >
                          Reddet
                        </button>
                      </div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
