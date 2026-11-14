"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { BackLink } from "@/components/staff/BackLink";
import { useCanViewPath } from "@/components/staff/StaffScreens";
import { useLeaveGuard } from "@/shell/useLeaveGuard";
import { newRequestKey } from "@/modules/minibar/ui/requestKey";
import { MybarRoomCard } from "@/modules/mybar/ui/staff/MybarRoomCard";
import { confirm } from "@/shell/confirm";
import { notify } from "@/shell/notify";
import { noConsumptionBlockedReason, type RoomBadgeKind } from "@/modules/minibar/ui/roomCheckRules";

/** Writes give up after this long; the same request key is sent again on the next tap. */
const WRITE_TIMEOUT_MS = 15_000;

/** Most numbered buttons a product row can show after the "+" icon is pressed. */
const EXTRA_BUTTON_MAX = 20;

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
  /** Part of `addedToday` left above the setup at the guest's request ("ilave talep"). */
  extraToday: number;
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
  /** Today's state of the room: checked (a replacement), "Sarfiyat Yok", DND or waiting. */
  badge: { kind: RoomBadgeKind; at?: string };
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

const TASK_STATUS_LABEL: Record<string, string> = {
  BEKLIYOR: "Bekliyor",
  DEVAM: "Devam ediyor",
  DND_BEKLIYOR: "DND bekliyor",
  TAMAMLANDI: "Tamamlandı",
};

const timeOf = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Nicosia" }) : "";

export default function OdaKontrolPage() {
  const canView = useCanViewPath();
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const roomId = params?.roomId;

  const [data, setData] = useState<RoomCheckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  // Idempotency keys: each stays the same until its request succeeds, so a retry is not a second record.
  const [noUseKey, setNoUseKey] = useState(newRequestKey);
  const [dndKey, setDndKey] = useState(newRequestKey);
  const quickKeys = useRef<Record<string, string>>({});
  // Extra numbered buttons revealed beyond the normal +1..+setup ones, per product (staff leaving more than the setup).
  const [extraCounts, setExtraCounts] = useState<Record<string, number>>({});
  // The action bar is fixed: the page keeps room for it under the last row.
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  const hasBar = data !== null;
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const apply = () => setBarHeight(bar.getBoundingClientRect().height);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [hasBar]);

  const loadRoom = useCallback(async (showSpinner = false) => {
    if (!roomId) return;
    if (showSpinner) setLoading(true);
    try {
      const res = await mbFetch(`/api/minibar/room/${roomId}`);
      const json = (await res.json()) as RoomCheckData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Oda bilgisi yüklenemedi.");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    // Idempotent on the server: re-entering the page keeps the open check (and its start time).
    void mbFetch(`/api/minibar/room/${roomId}/start`, { method: "POST" }).catch(() => undefined);
    const t = setTimeout(() => void loadRoom(true), 0);
    return () => clearTimeout(t);
  }, [roomId, loadRoom]);

  const busy = submitting || addingProductId !== null;

  /** +N saves at once: the product is put back and recorded in one tap; the toast offers "Geri al". */
  const handleQuickAdd = async (setupId: string, item: RoomCheckItem, n: number, overSetup = false) => {
    if (!data || busy) return;
    setAddingProductId(item.productId);
    const quickId = `${setupId}:${item.productId}:${n}${overSetup ? ":over" : ""}`;
    const clientRequestId = (quickKeys.current[quickId] ??= newRequestKey());
    const typedNote = note.trim();
    try {
      const res = await mbFetch(`/api/minibar/room/${data.room.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productId: item.productId, setupId, qty: n, ...(overSetup ? { overSetup: true } : {}) }],
          clientRequestId,
          ...(typedNote ? { note: typedNote } : {}),
        }),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      const json = (await res.json()) as { transactionId?: string; extra?: number; error?: string; message?: string };
      if (!res.ok) {
        notify.error(json.error ?? json.message ?? "İkame kaydedilemedi.");
        // The refusal may mean the QR proof ran out or the room changed meanwhile: show the room as it is now.
        await loadRoom(false);
        return;
      }
      delete quickKeys.current[quickId];
      // The note went with this record.
      if (typedNote) setNote("");
      await loadRoom(false);
      const txId = json.transactionId;
      const extra = json.extra ?? 0;
      notify.success(
        extra > 0
          ? `+${n} eklendi (${item.productName}) — ${extra} adet ilave talep olarak kaydedildi`
          : `+${n} eklendi (${item.productName})`,
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

  const handleNoConsumption = async () => {
    if (!data || busy || noConsumptionBlockedReason(data)) return;
    const ok = await confirm({
      title: "Sarfiyat yok",
      message: `Oda ${data.room.number} minibarı tam; sarfiyat yok olarak kaydedilsin mi?`,
      confirmLabel: "Sarfiyat Yok Kaydet",
      cancelLabel: "Vazgeç",
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await mbFetch(`/api/minibar/room/${data.room.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumedItems: [], note: note.trim() || undefined, clientRequestId: noUseKey }),
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error ?? json.message ?? "Kaydedilemedi.");
      setNoUseKey(newRequestKey());
      setNote("");
      notify.success("Sarfiyat Yok olarak kaydedildi");
      await loadRoom(false);
    } catch (e) {
      notify.error(errorText(e, "Kayıt hatası"));
      // The server may know better (another attendant, an addition): show its current state.
      await loadRoom(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDnd = async () => {
    if (!data || busy) return;
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
      setNote("");
      notify.success(json.message ?? `DND kaydedildi (${json.count ?? 1}. kontrol).`);
      await loadRoom(false);
    } catch (e) {
      notify.error(errorText(e, "DND hatası"));
    } finally {
      setSubmitting(false);
    }
  };

  // A note typed but not saved yet: leaving asks first (D4). +N records are saved at once.
  const guard = useLeaveGuard(note.trim() !== "");
  const qrHref = "/kat/qr";
  const canControl = data ? !data.requireQrForControl || Boolean(data.qrVerified) : false;
  const noUseBlocked = data ? noConsumptionBlockedReason(data) : null;
  const roomChecked = data ? data.badge.kind === "KONTROL_EDILDI" || data.badge.kind === "SARFIYAT_YOK" : false;
  const showDnd = data ? !data.emptyRoomWarning && data.guestStatus.kind !== "EMPTY" : false;
  const dndBlocked = !data || roomChecked || (data.taskItem ? !data.taskItem.dndAllowed : false);

  return (
    <div
      className="min-h-screen bg-bg text-text"
      style={{ paddingBottom: `calc(${Math.ceil(barHeight)}px + var(--space-6, 32px))` }}
    >
      <header className="sticky top-[var(--staff-head-h,0px)] z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          {/* Always the floor of the room (D3): `router.back()` returned to the QR camera after a scan and left the
              app when the room was the first page of the window. */}
          <BackLink parent={data ? `/kat/doluluk/${data.room.floorId}` : undefined} guard={guard} testId="oda-geri" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">
              Oda {data?.room.number ?? "..."} — Minibar Kontrol
            </h1>
            {data ? (
              <p className="truncate text-xs text-muted">
                {data.room.floorName} · {data.room.roomTypeName} · {data.room.cabinetCount} Dolap
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5 space-y-5">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">
            Oda kontrol ekranı yükleniyor...
          </div>
        ) : error && !data ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-sm text-danger space-y-3">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadRoom(true)}
              style={{ minHeight: "var(--tap-action)" }}
              className="rounded-xl border border-danger/40 bg-surface px-4 py-2 text-xs font-bold text-danger hover:bg-danger/10"
            >
              Tekrar dene
            </button>
          </div>
        ) : data && !canControl ? (
          <div className="rounded-2xl border border-warn/40 bg-warn/10 p-8 text-center space-y-4 max-w-lg mx-auto">
            <div className="flex items-center justify-center text-warn">
              <Icon name="warning" size={36} />
            </div>
            <h2 className="text-base font-bold text-text">Oda Kontrolü İçin QR Okutulmalıdır</h2>
            <p className="text-xs text-muted leading-relaxed">
              Bu otelde oda kontrol sayfasına doğrudan erişim güvenlik gereği kapatılmıştır. Lütfen oda kapısındaki veya dolabındaki QR kodu okutunuz.
            </p>
            {canView(qrHref) ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => router.push(qrHref)}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white hover:opacity-90 shadow transition"
                >
                  <Icon name="camera" size={18} />
                  QR Okut
                </button>
              </div>
            ) : null}
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

            <div
              data-testid="oda-durum"
              className="rounded-2xl border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <p className="font-semibold text-text">
                Bugün:{" "}
                {data.badge.kind === "SARFIYAT_YOK" ? (
                  <span className="text-ok">Sarfiyat Yok kaydedildi {timeOf(data.badge.at)}</span>
                ) : data.badge.kind === "KONTROL_EDILDI" ? (
                  <span className="text-ok">Kontrol edildi {timeOf(data.badge.at)}</span>
                ) : data.badge.kind === "DND" ? (
                  <span className="text-warn">DND</span>
                ) : (
                  <span className="text-accent">Kontrol bekliyor</span>
                )}
              </p>
              {data.taskItem ? (
                <p className="text-muted">
                  Görev:{" "}
                  <span className={data.taskItem.status === "TAMAMLANDI" ? "text-ok font-semibold" : "font-semibold"}>
                    {TASK_STATUS_LABEL[data.taskItem.status] ?? data.taskItem.status}
                  </span>
                  {data.taskItem.dndCount > 0 ? ` · DND sayısı: ${data.taskItem.dndCount}` : ""}
                  {data.taskItem.dndCount > 0 && !data.taskItem.dndAllowed && data.taskItem.dndWaitMinutes > 0
                    ? ` · Yeni DND için ${data.taskItem.dndWaitMinutes} dk beklenmeli`
                    : ""}
                </p>
              ) : null}
            </div>

            <p className="text-xs text-muted">
              Eksik ürünü yerine koyun ve adedine basın (+1, +2 …): kayıt hemen yapılır; yanlış basarsanız bildirimdeki
              &quot;Geri al&quot; ile düzeltin. Misafir setup adedinden fazlasını isterse ürün adının yanındaki + ile daha
              büyük bir adet düğmesi açın; setup üstü kısım ilave talep olarak kaydedilir. Hiçbir ürün eksik değilse
              alttaki &quot;Sarfiyat Yok&quot; düğmesini kullanın.
            </p>

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
                    const buttonCap = Math.min(Math.max(item.setupQty, 1), 4);
                    const extraCount = Math.min(extraCounts[item.productId] ?? 0, EXTRA_BUTTON_MAX - buttonCap);
                    const quickNumbers = Array.from({ length: buttonCap + extraCount }, (_, i) => i + 1);
                    // The + icon was pressed for this product: quantities above the setup may be recorded.
                    const unlocked = (extraCounts[item.productId] ?? 0) > 0;
                    const limitReason =
                      item.allowedLeft === 0
                        ? "Günlük setup sınırı doldu — fazlası için ürün adının yanındaki + düğmesini kullanın"
                        : item.poolRemaining <= 0
                          ? "Otel deposunda stok yok"
                          : item.poolRemaining < buttonCap
                            ? "Otel deposunda yeterli stok yok"
                            : null;
                    const saving = addingProductId === item.productId;

                    return (
                      <div
                        key={item.productId}
                        data-testid={`product-row-${item.productName}`}
                        className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-text">{item.productName}</p>
                            {buttonCap + extraCount < EXTRA_BUTTON_MAX ? (
                              <button
                                type="button"
                                aria-label={`${item.productName} için ek adet düğmesi ekle`}
                                title="Setup miktarından fazla bırakmak için bir sayı düğmesi daha ekle"
                                onClick={() =>
                                  setExtraCounts((prev) => ({ ...prev, [item.productId]: (prev[item.productId] ?? 0) + 1 }))
                                }
                                data-testid={`extra-plus-${item.productName}`}
                                style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                                className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent/10 text-accent transition hover:bg-accent hover:text-white"
                              >
                                <Icon name="plus" size={20} />
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span>Setup hedef: {item.targetQty} {item.unit}</span>
                            <span>·</span>
                            <span className={item.poolRemaining <= 0 ? "text-danger font-semibold" : "text-muted"}>
                              Havuz stok: {item.poolRemaining}
                            </span>
                            <span>·</span>
                            <span
                              data-testid={`added-today-${item.productName}`}
                              className={item.addedToday > 0 ? "text-ok font-semibold" : "text-muted"}
                            >
                              Bugün eklenen: {item.addedToday}
                            </span>
                            {item.extraToday > 0 ? (
                              <>
                                <span>·</span>
                                <span data-testid={`extra-today-${item.productName}`} className="font-semibold text-warn">
                                  İlave talep: {item.extraToday}
                                </span>
                              </>
                            ) : null}
                          </div>
                          {limitReason ? <p className="mt-1 text-xs font-medium text-warn">{limitReason}</p> : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${item.productName} hızlı ikame`}>
                          {quickNumbers.map((n) => {
                            const outOfPool = item.poolRemaining < n;
                            // Above what the setup still allows today: an "ilave talep". It needs the + icon pressed
                            // for this product first (then +1 works too, once the setup is full); the server splits
                            // the setup part from the extra part.
                            const overSetup = n > item.allowedLeft;
                            const overCap = overSetup && !unlocked;
                            const isExtra = overSetup && unlocked;
                            const disabled = outOfPool || overCap || busy;
                            const reason = overCap
                              ? "Günlük setup sınırı doldu"
                              : outOfPool
                                ? "Otel deposunda yeterli stok yok"
                                : undefined;

                            return (
                              <button
                                key={n}
                                type="button"
                                data-mutates=""
                                aria-label={`${item.productName} +${n}${isExtra ? " (ilave talep)" : ""}`}
                                data-extra={isExtra ? "" : undefined}
                                aria-disabled={disabled ? "true" : undefined}
                                aria-busy={saving ? "true" : undefined}
                                title={reason ?? (isExtra ? `${n - item.allowedLeft} adedi ilave talep olarak kaydedilir` : undefined)}
                                onClick={() => {
                                  if (disabled) return;
                                  void handleQuickAdd(setup.setupId, item, n, isExtra);
                                }}
                                style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                                className={`inline-flex flex-col items-center justify-center rounded-xl border px-3 text-sm font-bold leading-tight tabular-nums transition ${
                                  disabled
                                    ? "cursor-not-allowed border-border bg-bg text-muted opacity-55"
                                    : isExtra
                                      ? "border-warn/60 bg-warn/15 text-warn hover:bg-warn hover:text-white"
                                      : "border-accent/40 bg-accent/10 text-accent hover:bg-accent hover:text-white"
                                }`}
                              >
                                +{n}
                                {isExtra ? <span className="text-[10px] font-semibold uppercase tracking-wide">ilave</span> : null}
                              </button>
                            );
                          })}
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
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
                style={{ minHeight: "var(--tap-min)" }}
                placeholder="Örn: Su şişesi kapağı açık bulundu, yenilendi..."
                className="w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-muted">Not, bir sonraki kayıtla (+N, Sarfiyat Yok veya DND) birlikte kaydedilir.</p>
            </div>
          </>
        ) : null}
      </main>

      {/* DND stays reachable without a scan: it is recorded when the room could not be entered. MMD is on the floor page. */}
      {data && (canControl || showDnd) ? (
        <div ref={barRef} className="staff-action-bar fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 backdrop-blur p-3">
          {canControl && noUseBlocked ? (
            <p data-testid="sarfiyat-yok-kilit" className="mx-auto mb-2 max-w-4xl text-xs text-muted">
              {noUseBlocked}
            </p>
          ) : null}
          <div data-guide="eksik-ozeti" className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
            {canControl ? (
              <button
                type="button"
                data-primary=""
                data-mutates=""
                data-guide="kaydet"
                data-testid="sarfiyat-yok"
                onClick={() => void handleNoConsumption()}
                disabled={busy || noUseBlocked !== null}
                style={{ minHeight: "var(--tap-primary)" }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl border border-ok/50 bg-ok/15 px-5 py-3 text-sm font-bold text-ok hover:bg-ok/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="check-circle" size={20} />
                {submitting ? "Kaydediliyor..." : "Sarfiyat Yok"}
              </button>
            ) : null}

            {showDnd ? (
              <button
                type="button"
                data-mutates=""
                data-guide="dnd-bildir"
                onClick={() => void handleMarkDnd()}
                disabled={busy || dndBlocked}
                title={roomChecked ? "Oda bugün kontrol edildi" : undefined}
                style={{ minHeight: "var(--tap-primary)" }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-warn/50 bg-warn/15 px-4 py-3 text-xs font-semibold text-warn hover:bg-warn/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="moon" size={18} />
                DND İşaretle
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

