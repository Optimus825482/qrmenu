"use client";

import { mbFetch, useHotelHref } from "@/modules/minibar/ui/mbFetch";
import { MMD_REASONS, mmdConsumptionQuestion } from "@/modules/minibar/mmdReasons";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { askMmdReason } from "@/modules/minibar/ui/askMmdReason";
import { newRequestKey } from "@/modules/minibar/ui/requestKey";
import { MybarRoomCard } from "@/modules/mybar/ui/staff/MybarRoomCard";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";

/** Writes give up after this long; the same request key is sent again on the next tap. */
const WRITE_TIMEOUT_MS = 15_000;

const errorText = (e: unknown, fallback: string): string =>
  e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")
    ? "Sunucu zamanında yanıt vermedi. Lütfen tekrar deneyin."
    : e instanceof Error
      ? e.message
      : fallback;

interface RoomCheckItem {
  productId: string;
  productName: string;
  unit: string;
  groupName: string;
  setupQty: number;
  capacity: number;
  addedToday: number;
  allowedLeft: number;
  poolRemaining: number;
  targetQty: number;
  hotelStockQty: number;
  addedQty: number;
  replenishedToday: number;
}

interface RoomCheckSetup {
  setupId: string;
  setupName: string;
  isInsideCabinet: boolean;
  items: RoomCheckItem[];
}

interface RoomCheckData {
  room: {
    id: string;
    number: string;
    floorId: string;
    floorName: string;
    roomTypeName: string;
    cabinetCount: number;
  };
  guestStatus: {
    kind: string;
    arrivalTime: string | null;
    departureTime: string | null;
    note: string | null;
  };
  emptyRoomWarning: string | null;
  setups: RoomCheckSetup[];
  taskItem: {
    id: string;
    status: string;
    dndCount: number;
    lastDndAt: string | null;
    checkedAt: string | null;
    dndAllowed: boolean;
    dndWaitMinutes: number;
  } | null;
  mybar: {
    id: string;
    createdAt: string;
    notes: string | null;
    items: { productName: string; qty: number }[];
  } | null;
  requireQrForControl?: boolean;
  /** The server holds a fresh QR scan of this user for the room (the only source of the QR permission). */
  qrVerified?: boolean;
}

export default function OdaKontrolPage() {
  const hotelHref = useHotelHref();
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params?.roomId;

  const [data, setData] = useState<RoomCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  // Idempotency keys: each stays the same until its request succeeds, so a retry is not a second record.
  const [saveKey, setSaveKey] = useState(newRequestKey);
  const [dndKey, setDndKey] = useState(newRequestKey);
  const [mmdOpen, setMmdOpen] = useState(false);
  const quickKeys = useRef<Record<string, string>>({});

  const loadRoom = useCallback(async (showSpinner = false) => {
    if (!roomId) return;
    if (showSpinner) setLoading(true);
    try {
      const res = await mbFetch(`/api/minibar/room/${roomId}`);
      const json = (await res.json()) as RoomCheckData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Oda bilgisi yüklenemedi.");
      setData(json);
      setQuantities((prev) => {
        const next: Record<string, number> = {};
        for (const s of json.setups) {
          for (const it of s.items) {
            next[it.productId] = prev[it.productId] ?? 0;
          }
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    void mbFetch(`/api/minibar/room/${roomId}/start`, { method: "POST" }).catch(() => undefined);
    const t = setTimeout(() => void loadRoom(true), 0);
    return () => clearTimeout(t);
  }, [roomId, loadRoom]);

  const handleQuickAdd = async (setupId: string, item: RoomCheckItem, n: number) => {
    if (!data || submitting || addingProductId) return;
    setAddingProductId(item.productId);
    const quickId = `${setupId}:${item.productId}:${n}`;
    const clientRequestId = (quickKeys.current[quickId] ??= newRequestKey());
    try {
      const res = await mbFetch(`/api/minibar/room/${data.room.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: item.productId, setupId, qty: n }],
          clientRequestId,
        }),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      const json = (await res.json()) as {
        transactionId?: string;
        added?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        notify.error(json.error ?? json.message ?? "İkame kaydedilemedi.");
        return;
      }
      delete quickKeys.current[quickId];
      await loadRoom(false);
      const txId = json.transactionId;
      notify.success(
        `+${n} eklendi (${item.productName})`,
        txId
          ? {
              undo: async () => {
                const delRes = await mbFetch(`/api/minibar/my-checks/${txId}`, { method: "DELETE" });
                if (!delRes.ok) {
                  const delJson = (await delRes.json().catch(() => ({}))) as { error?: string };
                  notify.error(delJson.error ?? "Geri alma başarısız.");
                  return;
                }
                await loadRoom(false);
                notify.info("İşlem geri alındı.");
              },
            }
          : undefined,
      );
    } catch (e) {
      notify.error(errorText(e, "Bağlantı hatası"));
    } finally {
      setAddingProductId(null);
    }
  };

  const handleQtyChange = (productId: string, delta: number, maxAllowed: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 0;
      const next = Math.max(0, Math.min(maxAllowed, current + delta));
      return { ...prev, [productId]: next };
    });
  };

  const handleSetAllMax = () => {
    if (!data) return;
    const next: Record<string, number> = {};
    for (const s of data.setups) {
      for (const it of s.items) {
        next[it.productId] = Math.min(it.allowedLeft, it.poolRemaining);
      }
    }
    setQuantities(next);
  };

  const handleResetAll = () => {
    if (!data) return;
    const next: Record<string, number> = {};
    for (const s of data.setups) {
      for (const it of s.items) {
        next[it.productId] = 0;
      }
    }
    setQuantities(next);
  };

  const handleSaveCheck = async (noConsumption = false) => {
    if (!data) return;
    const nothingSelected = Object.values(quantities).every((q) => q <= 0);
    if (!noConsumption && nothingSelected) {
      // "Kaydet" without a selection is a "Sarfiyat Yok" record: ask explicitly instead of saving silently.
      const ok = await confirm({
        title: "Sarfiyat yok",
        message: "Hiç ürün seçmediniz. Bu odada sarfiyat yok olarak kaydedilsin mi?",
        danger: true,
        confirmLabel: "Sarfiyat Yok Kaydet",
        cancelLabel: "Vazgeç",
      });
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const consumedItems = noConsumption
        ? []
        : Object.entries(quantities)
            .filter(([, qty]) => qty > 0)
            .map(([productId, qty]) => ({ productId, qty }));

      const res = await mbFetch(`/api/minibar/room/${data.room.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumedItems,
          note: note.trim() || undefined,
          clientRequestId: saveKey,
        }),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      const json = (await res.json()) as {
        replenishedCount?: number;
        added?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.error ?? json.message ?? "Kaydedilemedi.");
      setSaveKey(newRequestKey());

      const count = json.replenishedCount ?? json.added ?? 0;
      notify.success(
        noConsumption || count === 0
          ? "Sarfiyat Yok olarak kaydedildi"
          : `${count} ürün ikame edilerek kontrol kaydedildi`,
      );
      await loadRoom(false);
      setQuantities((prev) => {
        const cleared: Record<string, number> = {};
        for (const k of Object.keys(prev)) cleared[k] = 0;
        return cleared;
      });
    } catch (e) {
      notify.error(errorText(e, "Kayıt hatası"));
    } finally {
      setSubmitting(false);
    }
  };

  /** MMD is its own record (not a DND): no QR, no effect on the room's DND count or tasks. */
  const handleMmd = async (reason: string) => {
    if (!data) return;
    setMmdOpen(false);
    setSubmitting(true);
    try {
      const res = await mbFetch(`/api/minibar/room/${data.room.id}/mmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, clientRequestId: dndKey }),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "MMD kaydedilemedi.");
      setDndKey(newRequestKey());
      notify.success(`MMD kaydedildi: ${reason}`);
      // The guest may have handed over products at the door: the consumption goes to the manager as a manual entry request.
      const wants = await confirm({
        title: "Tüketim kaydı",
        message: mmdConsumptionQuestion(data.room.number, reason),
        confirmLabel: "Evet",
        cancelLabel: "Hayır",
      });
      if (wants) router.push(`/kat/manuel-kayit?oda=${encodeURIComponent(data.room.id)}&mmd=${encodeURIComponent(reason)}`);
    } catch (e) {
      notify.error(errorText(e, "MMD hatası"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDnd = async () => {
    if (!data) return;
    setMmdOpen(false);
    setSubmitting(true);
    try {
      const res = await mbFetch(`/api/minibar/room/${data.room.id}/dnd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined, clientRequestId: dndKey }),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      const json = (await res.json()) as { message?: string; error?: string; count?: number };
      if (!res.ok) throw new Error(json.error ?? "DND kaydedilemedi.");
      setDndKey(newRequestKey());
      notify.success(json.message ?? `DND kaydedildi (${json.count ?? 1}. kontrol).`);
      await loadRoom(false);
    } catch (e) {
      notify.error(errorText(e, "DND hatası"));
    } finally {
      setSubmitting(false);
    }
  };

  const totalSelected = Object.values(quantities).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-bg text-text pb-36">

      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Always the floor of the room: `router.back()` returned to the QR camera after a scan and left the
                app when the room was the first page of the window. */}
            <Link
              href={hotelHref(data ? `/kat/doluluk/${data.room.floorId}` : "/kat")}
              data-testid="oda-geri"
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="arrow-left" size={16} />
              Geri
            </Link>
            <div>
              <h1 className="text-lg font-bold">
                Oda {data?.room.number ?? "..."} — Minibar Kontrol
              </h1>
              {data ? (
                <p className="text-xs text-muted">
                  {data.room.floorName} · {data.room.roomTypeName} · {data.room.cabinetCount} Dolap
                </p>
              ) : null}
            </div>
          </div>

          <Link
            href="/kat"
            style={{ minHeight: "var(--tap-action)" }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
          >
            <Icon name="home" size={16} />
            Ana Sayfa
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5 space-y-5">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">
            Oda kontrol ekranı yükleniyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
            {error}
          </div>
        ) : data?.requireQrForControl && !data.qrVerified ? (
          <div className="rounded-2xl border border-warn/40 bg-warn/10 p-8 text-center space-y-4 max-w-lg mx-auto">
            <div className="flex items-center justify-center text-warn">
              <Icon name="warning" size={36} />
            </div>
            <h2 className="text-base font-bold text-text">Oda Kontrolü İçin QR Okutulmalıdır</h2>
            <p className="text-xs text-muted leading-relaxed">
              Bu otelde oda kontrol sayfasına doğrudan erişim güvenlik gereği kapatılmıştır. Lütfen oda kapısındaki veya dolabındaki QR kodu okutunuz.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => router.push("/kat/qr")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white hover:opacity-90 shadow transition"
              >
                <Icon name="camera" size={18} />
                QR Okut
              </button>
            </div>
          </div>
        ) : data ? (
          <>
            {data.emptyRoomWarning ? (
              <div className="rounded-2xl border border-warn/50 bg-warn/15 p-4 text-sm text-text">
                <div className="flex items-center gap-2 font-bold text-warn">
                  <Icon name="warning" size={20} />
                  <span>Boş Oda Uyarısı</span>
                </div>
                <p className="mt-1 text-xs text-muted">{data.emptyRoomWarning}</p>
              </div>
            ) : null}

            {data.mybar ? (
              <MybarRoomCard requestId={data.mybar.id} onChanged={() => void loadRoom(false)} />
            ) : null}

            {data.taskItem ? (
              <div className="rounded-2xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-text">
                    Günlük Görev Durumu:{" "}
                    <span
                      className={
                        data.taskItem.status === "TAMAMLANDI"
                          ? "text-ok"
                          : data.taskItem.status === "DND_BEKLIYOR"
                            ? "text-warn"
                            : "text-accent"
                      }
                    >
                      {data.taskItem.status}
                    </span>
                  </p>
                  {data.taskItem.dndCount > 0 ? (
                    <p className="text-muted">
                      DND Sayısı: {data.taskItem.dndCount}
                      {!data.taskItem.dndAllowed
                        ? ` · Yeni DND için ${data.taskItem.dndWaitMinutes} dk beklenmeli`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-mutates=""
                    onClick={() => void handleSaveCheck(true)}
                    disabled={submitting}
                    style={{ minHeight: "var(--tap-action)" }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-xs font-bold text-ok hover:bg-ok/20 disabled:opacity-50 transition"
                  >
                    <Icon name="check-circle" size={16} />
                    Sarfiyat Yok
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    style={{ minHeight: "var(--tap-action)" }}
                    className="rounded-xl border border-border bg-bg px-3 py-2 text-xs font-semibold text-muted hover:bg-surface"
                  >
                    Sıfırla
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  data-mutates=""
                  onClick={() => void handleSaveCheck(true)}
                  disabled={submitting}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-xs font-bold text-ok hover:bg-ok/20 disabled:opacity-50 transition"
                >
                  <Icon name="check-circle" size={16} />
                  Sarfiyat Yok
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted hover:bg-bg"
                >
                  Sıfırla
                </button>
              </div>
            )}

            {data.setups.map((setup, setupIdx) => (
              <section
                key={setup.setupId}
                data-guide={setupIdx === 0 ? "urun-listesi" : undefined}
                className="rounded-2xl border border-border bg-surface overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-3">
                  <div>
                    <h2 className="text-sm font-bold text-text">{setup.setupName}</h2>
                    <p className="text-xs text-muted">
                      {setup.isInsideCabinet ? "Dolap İçi Setup" : "Dolap Dışı Setup"}
                    </p>
                  </div>
                  <span className="rounded-full bg-surface border border-border px-2.5 py-1 text-xs font-medium text-muted">
                    {setup.items.length} ürün
                  </span>
                </div>

                <div className="divide-y divide-border">
                  {setup.items.map((item) => {
                    const selected = quantities[item.productId] ?? 0;
                    const maxAllowed = Math.min(item.allowedLeft, item.poolRemaining);
                    const buttonCap = Math.min(Math.max(item.setupQty, 1), 4);
                    const quickNumbers = Array.from({ length: buttonCap }, (_, i) => i + 1);
                    const poolShortReason =
                      item.poolRemaining < buttonCap
                        ? "Otel deposunda yeterli stok yok"
                        : item.allowedLeft === 0
                          ? "Günlük setup sınırı doldu"
                          : null;

                    return (
                      <div
                        key={item.productId}
                        data-testid={`product-row-${item.productName}`}
                        className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text">{item.productName}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span>Setup hedef: {item.targetQty} {item.unit}</span>
                            <span>·</span>
                            <span
                              className={
                                item.poolRemaining <= 0
                                  ? "text-danger font-semibold"
                                  : "text-muted"
                              }
                            >
                              Havuz stok: {item.poolRemaining}
                            </span>
                            <span>·</span>
                            <span
                              data-testid={`added-today-${item.productName}`}
                              className={item.addedToday > 0 ? "text-ok font-semibold" : "text-muted"}
                            >
                              Bugün eklenen: {item.addedToday}
                            </span>
                          </div>
                          {poolShortReason ? (
                            <p className="mt-1 text-xs font-medium text-warn">{poolShortReason}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2" role="group" aria-label={`${item.productName} hızlı ikame`}>
                            {quickNumbers.map((n) => {
                              const outOfPool = item.poolRemaining < n;
                              const overCap = item.allowedLeft < n;
                              const disabled = outOfPool || overCap || addingProductId === item.productId || submitting;
                              const reason = outOfPool
                                ? "Otel deposunda yeterli stok yok"
                                : overCap
                                  ? "Günlük setup sınırı doldu"
                                  : undefined;

                              return (
                                <button
                                  key={n}
                                  type="button"
                                  data-mutates=""
                                  aria-label={`${item.productName} +${n}`}
                                  aria-disabled={disabled ? "true" : undefined}
                                  title={reason}
                                  onClick={() => {
                                    if (disabled) return;
                                    void handleQuickAdd(setup.setupId, item, n);
                                  }}
                                  style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                                  className={`inline-flex items-center justify-center rounded-xl border px-3 text-sm font-bold tabular-nums transition ${
                                    disabled
                                      ? "cursor-not-allowed border-border bg-bg text-muted opacity-55"
                                      : "border-accent/40 bg-accent/10 text-accent hover:bg-accent hover:text-white"
                                  }`}
                                >
                                  +{n}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-1.5 border-l border-border pl-2">
                            <button
                              type="button"
                              aria-label={`${item.productName} azalt`}
                              onClick={() => handleQtyChange(item.productId, -1, maxAllowed)}
                              disabled={selected <= 0}
                              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                              className="inline-flex items-center justify-center rounded-xl border border-border bg-bg text-base font-bold text-text hover:bg-surface disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-bold tabular-nums text-text">
                              {selected}
                            </span>
                            <button
                              type="button"
                              aria-label={`${item.productName} artır`}
                              onClick={() => handleQtyChange(item.productId, 1, maxAllowed)}
                              disabled={selected >= maxAllowed}
                              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                              className="inline-flex items-center justify-center rounded-xl border border-border bg-bg text-base font-bold text-text hover:bg-surface disabled:opacity-30"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="rounded-2xl border border-border bg-surface p-4">
              <label htmlFor="oda-kontrol-not" className="block text-xs font-semibold text-muted mb-2">
                Açıklama / Not (İsteğe bağlı)
              </label>
              <input
                id="oda-kontrol-not"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ minHeight: "var(--tap-min)" }}
                placeholder="Örn: Su şişesi kapağı açık bulundu, yenilendi..."
                className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </>
        ) : null}
      </main>

      {/* MMD and DND stay reachable without a scan: they are recorded when the room could not be entered. */}
      {data ? (
        <div className="staff-action-bar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur p-3">
          {mmdOpen ? (
            <div data-testid="mmd-options" className="mx-auto mb-2 flex max-w-4xl flex-wrap gap-2" role="group" aria-label="MMD nedeni">
              {MMD_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  data-mutates=""
                  onClick={() => void handleMmd(reason)}
                  disabled={submitting}
                  style={{ minHeight: "var(--tap-primary)" }}
                  className="rounded-xl border border-yellow-500/60 bg-yellow-400/20 px-3.5 py-2.5 text-xs font-semibold text-text hover:bg-yellow-400/35 disabled:opacity-50"
                >
                  {reason}
                </button>
              ))}
                <button
                  type="button"
                  data-testid="mmd-custom"
                  onClick={() => {
                    void askMmdReason(data.room.number).then((typed) => {
                      if (typed) void handleMmd(typed);
                    });
                  }}
                  disabled={submitting}
                  style={{ minHeight: "var(--tap-primary)" }}
                  className="rounded-xl border border-dashed border-yellow-600 bg-surface px-3.5 py-2.5 text-xs font-bold text-text hover:bg-yellow-400/20 disabled:opacity-50"
                >
                  Diğer sebep (elle yaz)
                </button>
            </div>
          ) : null}
          <div data-guide="eksik-ozeti" className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!data.emptyRoomWarning && data.guestStatus.kind !== "EMPTY" ? (
                <button
                  type="button"
                  data-testid="mmd-button"
                  aria-expanded={mmdOpen}
                  onClick={() => setMmdOpen((v) => !v)}
                  disabled={submitting}
                  style={{ minHeight: "var(--tap-primary)" }}
                  className="inline-flex items-center justify-center rounded-xl border border-yellow-500 bg-yellow-400 px-4 py-3 text-xs font-bold text-black hover:bg-yellow-300 disabled:opacity-40"
                >
                  MMD
                </button>
              ) : null}
              {!data.requireQrForControl || data.qrVerified ? (
                <button
                  type="button"
                  data-mutates=""
                  onClick={() => void handleSaveCheck(true)}
                  disabled={submitting}
                  style={{ minHeight: "var(--tap-primary)" }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 text-xs font-semibold text-text hover:bg-bg disabled:opacity-50"
                >
                  <Icon name="check-circle" size={18} />
                  Sarfiyat Yok
                </button>
              ) : null}

              {!data.emptyRoomWarning && data.guestStatus.kind !== "EMPTY" ? (
                <button
                  type="button"
                  data-mutates=""
                  data-guide="dnd-bildir"
                  onClick={() => void handleMarkDnd()}
                  disabled={submitting || (data.taskItem ? !data.taskItem.dndAllowed : false)}
                  style={{ minHeight: "var(--tap-primary)" }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-warn/50 bg-warn/15 px-4 py-3 text-xs font-semibold text-warn hover:bg-warn/25 disabled:opacity-40"
                >
                  <Icon name="moon" size={18} />
                  DND İşaretle
                </button>
              ) : null}
            </div>

            {!data.requireQrForControl || data.qrVerified ? (
              <button
                type="button"
                data-primary=""
                data-mutates=""
                data-guide="kaydet"
                onClick={() => void handleSaveCheck(false)}
                disabled={submitting}
                style={{ minHeight: "var(--tap-primary)" }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
              >
                <Icon name="check" size={20} />
                {submitting
                  ? "Kaydediliyor..."
                  : totalSelected > 0
                    ? `Kaydet (${totalSelected} ürün ikame)`
                    : "Kaydet (Sarfiyat Yok)"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
