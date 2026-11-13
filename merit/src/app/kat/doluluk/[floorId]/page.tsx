"use client";

import { mbFetch } from "@/modules/minibar/ui/mbFetch";
import { MMD_REASONS } from "@/modules/minibar/mmdReasons";
import { askMmdReason } from "@/modules/minibar/ui/askMmdReason";
import { MmdConsumptionAsk } from "@/modules/minibar/ui/MmdConsumptionAsk";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { BackLink } from "@/components/staff/BackLink";
import { useCanView, useCanViewPath } from "@/components/staff/StaffScreens";
import { useBackCloses } from "@/shell/useBackCloses";
import type { RoomCardData } from "@/modules/minibar/server/minibarTypes";
import { newRequestKey } from "@/modules/minibar/ui/requestKey";
import { notify } from "@/shell/notify";

interface DndCheckHistoryItem {
  no: number;
  at: string;
  userName: string;
  note: string | null;
}

interface DndDayHistory {
  date: string;
  count: number;
  status: string;
  lastAt: string;
  checks: DndCheckHistoryItem[];
}

interface RoomDndDetailResponse {
  room: {
    id: string;
    number: string;
    floorName: string;
    roomTypeName: string;
  };
  currentDnd: {
    id: string;
    count: number;
    status: string;
    firstAt: string;
    lastAt: string;
    checks: DndCheckHistoryItem[];
  } | null;
  history: DndDayHistory[];
  settings: {
    minChecks: number;
    recheckMinutes: number;
    requireQrForControl: boolean;
  };
}

interface FloorResponse {
  floor: { id: string; number: number; name: string; hotelId: string; hotelName?: string };
  today: string;
  rooms: RoomCardData[];
  stats: {
    total: number;
    occupied: number;
    empty: number;
    arrival: number;
    departure: number;
    completed: number;
    dnd: number;
    mybar: number;
    mybarUnapproved?: number;
  };
  settings?: {
    dndRecheckMinutes: number;
    requireQrForControl: boolean;
  };
}

type FilterKey = "all" | "occupied" | "empty" | "arrival" | "departure" | "dnd" | "mybar";

/** Computes arrival inspection deadline (1 hour before guest arrival) and remaining time */
function getArrivalInspectionStatus(arrivalTimeStr: string | null | undefined, nowMs: number) {
  const timeStr = arrivalTimeStr?.trim() || "14:00";
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h)) return null;
  const arrivalDate = new Date(nowMs);
  arrivalDate.setHours(h, m || 0, 0, 0);

  // Target deadline is 1 hour before arrival
  const targetDate = new Date(arrivalDate.getTime() - 60 * 60_000);
  const diffMinutes = Math.ceil((targetDate.getTime() - nowMs) / 60_000);
  const targetTimeStr = `${String(targetDate.getHours()).padStart(2, "0")}:${String(targetDate.getMinutes()).padStart(2, "0")}`;

  return {
    arrivalTimeStr: timeStr,
    targetTimeStr,
    diffMinutes,
    isOverdue: diffMinutes <= 0,
    isUrgent: diffMinutes <= 30,
  };
}

/** Computes DND re-check remaining time */
function getDndRecheckStatus(lastDndAtStr: string | null | undefined, recheckMinutes: number, nowMs: number) {
  if (!lastDndAtStr) return null;
  const lastDndTime = new Date(lastDndAtStr).getTime();
  if (isNaN(lastDndTime)) return null;
  const recheckAt = lastDndTime + recheckMinutes * 60_000;
  const diffMinutes = Math.ceil((recheckAt - nowMs) / 60_000);
  const targetTime = new Date(recheckAt);
  const targetTimeStr = `${String(targetTime.getHours()).padStart(2, "0")}:${String(targetTime.getMinutes()).padStart(2, "0")}`;

  return {
    diffMinutes,
    targetTimeStr,
    isDue: diffMinutes <= 0,
  };
}

type MmdRow = { id: string; at: string; reason: string; by: string };

export default function KatDolulukDetailPage() {
  const params = useParams<{ floorId: string }>();
  const router = useRouter();
  const floorId = params?.floorId;

  const [data, setData] = useState<FloorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // Room Action / DND Dialog state
  const [selectedRoom, setSelectedRoom] = useState<RoomCardData | null>(null);
  const [roomDndData, setRoomDndData] = useState<RoomDndDetailResponse | null>(null);
  const [loadingDnd, setLoadingDnd] = useState(false);
  const [dndNote, setDndNote] = useState("");
  const [submittingDnd, setSubmittingDnd] = useState(false);
  // Idempotency key of the DND mark: the same until it succeeds (a retried tap is not a second mark).
  const [dndKey, setDndKey] = useState(newRequestKey);
  // MMD (misafir müsait değil): the reason list, then the "tüketim var mı?" question for the recorded reason.
  const [mmdOpen, setMmdOpen] = useState(false);
  const [mmdAsk, setMmdAsk] = useState<string | null>(null);
  const [roomMmds, setRoomMmds] = useState<MmdRow[]>([]);



  // Periodic clock update for live countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const loadFloor = useCallback(async () => {
    if (!floorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await mbFetch(`/api/minibar/floor/${floorId}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Kat odaları alınamadı.");
      }
      const json = (await res.json()) as FloorResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, [floorId]);

  useEffect(() => {
    const t = setTimeout(() => void loadFloor(), 0);
    return () => clearTimeout(t);
  }, [loadFloor]);

  // Load DND details when selectedRoom changes
  const loadRoomMmd = useCallback(async (roomId: string) => {
    setRoomMmds([]);
    try {
      const res = await mbFetch(`/api/minibar/room/${roomId}/mmd`);
      if (res.ok) setRoomMmds(((await res.json()) as { rows: MmdRow[] }).rows);
    } catch {
      // The list is informative; the dialog works without it.
    }
  }, []);

  const loadRoomDnd = useCallback(async (roomId: string) => {
    setLoadingDnd(true);
    setRoomDndData(null);
    try {
      const res = await mbFetch(`/api/minibar/room/${roomId}/dnd`);
      if (res.ok) {
        const json = (await res.json()) as RoomDndDetailResponse;
        setRoomDndData(json);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDnd(false);
    }
  }, []);

  // Only today's earlier checks matter while deciding on the room; older days are in the reports.
  const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Nicosia" });
  const todaysDnd = (roomDndData?.history ?? []).filter((h) => h.date === today);

  // Opening a room card resets the dialog and loads its DND details (event handler, not an effect).
  // Empty rooms have no DND action, so their history is not loaded.
  const openRoom = (room: RoomCardData | null) => {
    setSelectedRoom(room);
    setDndKey(newRequestKey());
    setMmdOpen(false);
    setMmdAsk(null);
    if (room && room.status !== "empty") {
      setDndNote("");
      void loadRoomDnd(room.id);
      void loadRoomMmd(room.id);
    } else {
      setRoomDndData(null);
      setRoomMmds([]);
    }
  };

  /** MMD is its own record (not a DND): no QR, no effect on the room's DND count or tasks. */
  const handleMmd = async (reason: string) => {
    if (!selectedRoom) return;
    setMmdOpen(false);
    setSubmittingDnd(true);
    try {
      const res = await mbFetch(`/api/minibar/room/${selectedRoom.id}/mmd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, clientRequestId: dndKey }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "MMD kaydedilemedi.");
      notify.success(`Oda ${selectedRoom.number} MMD kaydedildi: ${reason}`);
      // The guest may have handed over products at the door: ask whether there is consumption to record.
      setMmdAsk(reason);
      setDndKey(newRequestKey());
      await loadRoomMmd(selectedRoom.id);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "MMD hatası");
    } finally {
      setSubmittingDnd(false);
    }
  };

  const handleMarkDndFromDialog = async () => {
    if (!selectedRoom) return;
    setMmdOpen(false);
    setSubmittingDnd(true);
    try {
      const res = await mbFetch(`/api/minibar/room/${selectedRoom.id}/dnd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: dndNote.trim() || undefined, clientRequestId: dndKey }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json()) as { message?: string; error?: string; count?: number };
      if (!res.ok) throw new Error(json.error ?? "DND kaydedilemedi.");
      notify.success(json.message ?? `Oda ${selectedRoom.number} DND olarak işaretlendi.`);
      setDndNote("");
      setDndKey(newRequestKey());
      await loadRoomDnd(selectedRoom.id);
      await loadFloor();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "DND hatası");
    } finally {
      setSubmittingDnd(false);
    }
  };

  // The room dialog closes on the phone's back button; a page opened from it takes the dialog's entry over (D6).
  const dialogNavigate = useBackCloses(selectedRoom !== null, () => openRoom(null));
  // Screens are granted one by one (E1): with the floor plan alone the floor is read-only.
  const canView = useCanViewPath();
  const canRecord = useCanView("MB-TUK");
  const canCheck = (roomId: string) => canView(`/kat/oda-kontrol/${roomId}`);
  const qrHref = "/kat/qr";

  const handleControlClick = (room: RoomCardData, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!data?.settings?.requireQrForControl && canCheck(room.id)) {
      router.push(`/kat/oda-kontrol/${room.id}`);
    }
  };

  const filteredRooms = (data?.rooms ?? []).filter((rm) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchNum = rm.number.toLowerCase().includes(q);
      const matchGuest = (rm.guestName ?? "").toLowerCase().includes(q);
      if (!matchNum && !matchGuest) return false;
    }
    switch (filter) {
      case "occupied":
        return rm.status !== "empty";
      case "empty":
        return rm.status === "empty";
      case "arrival":
        return rm.status === "arrival" || rm.status === "clash";
      case "departure":
        return rm.status === "departure" || rm.status === "clash";
      case "dnd":
        return rm.checkStatus === "dnd" || rm.dndCount > 0;
      case "mybar":
        return rm.hasMybarRequest;
      default:
        return true;
    }
  });

  const recheckMinutes = data?.settings?.dndRecheckMinutes ?? 120;

  // "Geri" names the hotel of the floor on screen: the list it opens is that hotel's, whatever the session's
  // hotel is and whether or not the address still carries the window's `?hotelId=`.
  const floorHotelId = data?.floor.hotelId ?? "";
  const floorsHref = floorHotelId ? `/kat?hotelId=${encodeURIComponent(floorHotelId)}` : undefined;

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-[var(--staff-head-h,0px)] z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BackLink parent={floorsHref} testId="katlar-geri" />
            <div className="min-w-0">
              {data?.floor.hotelName ? (
                <p data-testid="kat-otel-adi" className="text-sm font-bold uppercase tracking-wide text-accent">
                  {data.floor.hotelName}
                </p>
              ) : null}
              <h1 className="text-lg font-bold">
                {data ? `${data.floor.name} — Oda Doluluk Planı` : "Kat Odaları"}
              </h1>
              <p className="text-xs text-muted">
                Odaya dokunarak detayları ve DND işlemlerini görüntüleyebilirsiniz
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Oda veya misafir ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minHeight: "var(--tap-action)" }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void loadFloor()}
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="refresh" size={16} />
              Yenile
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">
            Oda listesi yükleniyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
            {error}
          </div>
        ) : data ? (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", `Tümü (${data.stats.total})`],
                  ["occupied", `Dolu (${data.stats.occupied})`],
                  ["empty", `Boş (${data.stats.empty})`],
                  ["arrival", `Giriş (${data.stats.arrival})`],
                  ["departure", `Çıkış (${data.stats.departure})`],
                  ["dnd", `DND (${data.stats.dnd})`],
                  [
                    "mybar",
                    `MyBar Talebi (${data.stats.mybar}${data.stats.mybarUnapproved ? ` · ${data.stats.mybarUnapproved} onay bekliyor` : ""})`,
                  ],
                ] as [FilterKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  style={{ minHeight: "var(--tap-action)" }}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                    filter === key
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-surface text-text hover:bg-bg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredRooms.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
                Seçilen filtreye uygun oda bulunamadı.
              </div>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {filteredRooms.map((room) => {
                  const isCompleted = room.checkStatus === "completed";
                  const isDndActive = room.checkStatus === "dnd" || room.dndCount > 0;
                  const dndStatus = isDndActive ? getDndRecheckStatus(room.lastDndAt, recheckMinutes, now) : null;

                  const hasUpcomingArrival = room.status === "arrival" || room.status === "clash" || Boolean(room.arrivalTime);
                  const arrivalInspection = hasUpcomingArrival && !isCompleted
                    ? getArrivalInspectionStatus(room.arrivalTime, now)
                    : null;

                  const isPriorityArrival = Boolean(arrivalInspection && (arrivalInspection.isUrgent || arrivalInspection.isOverdue));
                  const isPriorityDnd = Boolean(dndStatus && dndStatus.isDue);
                  const isPriorityMybar = Boolean(room.hasMybarRequest);
                  // Approved ("Gördüm") but not completed yet: still marked, in the calmer warning tone.
                  const mybarApproved = Boolean(room.mybarDetails?.approvedAt);
                  const isPriority = isPriorityArrival || isPriorityDnd || isPriorityMybar;

                  // Kontrol edilen, kontrol bekleyen ve DND odalar için belirgin renk tonları
                  let cardTone = "border-border bg-surface";
                  if (isPriority) {
                    cardTone = "border-danger/80 bg-danger/10 ring-2 ring-danger/30";
                  } else if (isCompleted) {
                    cardTone = "border-ok/60 bg-ok/10";
                  } else if (isDndActive) {
                    cardTone = "border-warn/60 bg-warn/10";
                  } else if (room.status === "arrival") {
                    cardTone = "border-accent/60 bg-accent/10";
                  } else if (room.status === "departure") {
                    cardTone = "border-warn/50 bg-warn/5";
                  } else if (room.status === "in_house") {
                    cardTone = "border-accent/30 bg-accent/5";
                  } else {
                    cardTone = "border-border/80 bg-surface/80";
                  }

                  const badgeTone =
                    room.status === "clash"
                      ? "bg-danger/20 text-danger border border-danger/40"
                      : room.status === "arrival"
                        ? "bg-accent/20 text-accent border border-accent/40"
                        : room.status === "departure"
                          ? "bg-warn/20 text-warn border border-warn/40"
                          : room.status === "in_house"
                            ? "bg-ok/20 text-ok border border-ok/40"
                            : "bg-bg text-muted border border-border";

                  return (
                    <div
                      key={room.id}
                      onClick={() => openRoom(room)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openRoom(room);
                        }
                      }}
                      className={`group flex flex-col justify-between rounded-2xl border p-4 transition hover:border-accent hover:shadow-md cursor-pointer text-left ${cardTone}`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xl font-bold text-text group-hover:text-accent transition tabular-nums">
                              Oda {room.number}
                            </span>
                            <p className="text-xs text-muted">{room.roomTypeName}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {/* Öncelikli kontrol yanıp sönen rozet */}
                            {isPriorityArrival ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger text-white px-2.5 py-0.5 text-xs font-bold shadow-sm">
                                <Icon name="warning" size={12} />
                                Öncelikli Giriş
                              </span>
                            ) : isPriorityDnd ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger text-white px-2.5 py-0.5 text-xs font-bold shadow-sm">
                                <Icon name="warning" size={12} />
                                DND Kontrolü!
                              </span>
                            ) : isPriorityMybar ? (
                              <span
                                data-testid="mybar-stage-badge"
                                data-approved={mybarApproved ? "true" : "false"}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold shadow-sm ${
                                  mybarApproved ? "border border-warn bg-warn/20 text-text" : "bg-danger text-white"
                                }`}
                              >
                                <Icon name="bell" size={12} />
                                {mybarApproved ? "MyBar: Onaylandı" : "MyBar: Onay bekliyor"}
                              </span>
                            ) : null}

                            <div className="flex items-center gap-1">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeTone}`}>
                                {room.statusLabel}
                              </span>
                              {isDndActive ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-warn/20 border border-warn/40 px-2 py-0.5 text-xs font-bold text-warn">
                                  <Icon name="moon" size={11} />
                                  DND ({room.dndCount})
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {room.guestName ? (
                          <p className="mt-2 truncate text-xs font-medium text-text">
                            {room.guestName}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                          {room.departureTime ? <span>Çıkış: {room.departureTime}</span> : null}
                          {room.arrivalTime ? <span>Giriş: {room.arrivalTime}</span> : null}
                        </div>

                        {/* Guest Arrival inspection countdown (1 hour before arrival target) */}
                        {arrivalInspection ? (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              openRoom(room);
                            }}
                            className={`mt-2.5 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold border transition ${
                              arrivalInspection.isOverdue
                                ? "border-danger/50 bg-danger/15 text-danger font-bold"
                                : arrivalInspection.isUrgent
                                  ? "border-warn/50 bg-warn/15 text-warn font-bold"
                                  : "border-accent/40 bg-accent/10 text-accent"
                            }`}
                            title={`Misafir Giriş Zamanı: ${arrivalInspection.arrivalTimeStr} · Kontrol Zamanı: 1 saat önce (${arrivalInspection.targetTimeStr})`}
                          >
                            <Icon name={arrivalInspection.isOverdue ? "warning" : "clock"} size={13} />
                            <span>
                              {arrivalInspection.isOverdue
                                ? `Girişe Az Kaldı (${arrivalInspection.arrivalTimeStr})`
                                : `Giriş Öncesi Kontrol: ${arrivalInspection.diffMinutes} dk`}
                            </span>
                          </div>
                        ) : null}

                        {/* DND Re-check countdown */}
                        {dndStatus ? (
                          <div
                            className={`mt-2 inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold border ${
                              dndStatus.isDue
                                ? "border-danger/50 bg-danger/15 text-danger font-bold"
                                : "border-warn/40 bg-warn/10 text-warn"
                            }`}
                          >
                            <Icon name={dndStatus.isDue ? "warning" : "clock"} size={13} />
                            <span>
                              {dndStatus.isDue
                                ? "Tekrar Kontrol Zamanı Geldi!"
                                : `Tekrar Kontrol: ${dndStatus.diffMinutes} dk (${dndStatus.targetTimeStr})`}
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border/80 pt-2.5 text-xs">
                        <div>
                          {room.checkStatus === "completed" ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-ok">
                              <Icon name="check" size={15} />
                              Kontrol Edildi
                            </span>
                          ) : room.checkStatus === "dnd" ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-warn">
                              <Icon name="moon" size={15} />
                              DND Bekliyor
                            </span>
                          ) : (
                            <span className="text-muted font-medium">Kontrol Bekliyor</span>
                          )}
                        </div>

                        {room.hasMybarRequest ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                              mybarApproved ? "border border-warn bg-warn/20 text-text" : "bg-danger text-white"
                            }`}
                            title={mybarApproved ? "MyBar talebi onaylandı, tamamlanmayı bekliyor" : "MyBar talebi onay bekliyor"}
                          >
                            MyBar{mybarApproved ? <Icon name="check" size={12} /> : "!"}
                          </span>
                        ) : data?.settings?.requireQrForControl || !canCheck(room.id) ? (
                          // QR zorunluluğu aktifse (ya da oda kontrolü kullanıcıya açık değilse) Kontrol linki yok.
                          null
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleControlClick(room, e)}
                            className="text-accent font-semibold hover:underline group-hover:translate-x-0.5 transition inline-flex items-center gap-1"
                          >
                            Kontrol →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </main>

      {/* Room Detail & DND Dialog */}
      {selectedRoom ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface text-text p-5 space-y-4 shadow-2xl my-8">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <h2 id="room-detail-title" className="text-lg font-bold text-text">
                  Oda {selectedRoom.number} — {selectedRoom.status === "empty" ? "Oda Detayı" : "Detay ve İşlemler"}
                </h2>
                <p className="text-xs text-muted">
                  {selectedRoom.floorName} · {selectedRoom.roomTypeName}
                </p>
              </div>
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => openRoom(null)}
                style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                className="rounded-xl border border-border bg-bg p-2 text-muted hover:text-text hover:bg-surface"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* Room Status Info */}
            <div className="rounded-xl border border-border bg-bg p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted">Durum:</span>
                <span className="font-bold text-text">{selectedRoom.statusLabel}</span>
              </div>
              {selectedRoom.guestName ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-muted">Misafir:</span>
                  <span className="font-medium text-text">{selectedRoom.guestName}</span>
                </div>
              ) : null}
              {selectedRoom.arrivalTime ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-muted">Giriş Zamanı:</span>
                  <span className="font-bold text-accent">{selectedRoom.arrivalTime}</span>
                </div>
              ) : null}
              {selectedRoom.arrivalTime ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-muted">Giriş Öncesi Kontrol Hedefi:</span>
                  <span className="font-bold text-ok">
                    Girişten 1 saat önce ({getArrivalInspectionStatus(selectedRoom.arrivalTime, now)?.targetTimeStr})
                  </span>
                </div>
              ) : null}
              {selectedRoom.departureTime ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-muted">Çıkış Zamanı:</span>
                  <span className="font-medium text-text">{selectedRoom.departureTime}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted">Minibar Kontrolü:</span>
                <span className="font-medium text-text">
                  {selectedRoom.checkStatus === "completed"
                    ? "Kontrol Edildi"
                    : selectedRoom.checkStatus === "dnd"
                      ? "DND Bekliyor"
                      : "Bekliyor"}
                </span>
              </div>
            </div>

            {/* DND Section */}
            {selectedRoom.status !== "empty" ? (
              <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-warn flex items-center gap-1.5">
                    <Icon name="moon" size={16} />
                    Rahatsız Etmeyin (DND) İşlemi
                  </h3>
                  {selectedRoom.dndCount > 0 ? (
                    <span className="rounded-full bg-warn/20 px-2.5 py-0.5 text-xs font-bold text-warn">
                      {selectedRoom.dndCount}. Kontrol
                    </span>
                  ) : null}
                </div>

                {canRecord ? (
                <div className="space-y-2">
                  <label htmlFor="dnd-note-input" className="block text-xs font-semibold text-muted">
                    DND Açıklaması / Not (İsteğe bağlı)
                  </label>
                  <input
                    id="dnd-note-input"
                    type="text"
                    placeholder="Örn: Kapıda DND kartı asılıydı..."
                    value={dndNote}
                    onChange={(e) => setDndNote(e.target.value)}
                    className="w-full rounded-xl border border-border bg-bg px-3 py-2 text-xs text-text placeholder:text-muted focus:border-warn focus:outline-none"
                  />
                  <button
                    type="button"
                    data-mutates=""
                    onClick={() => void handleMarkDndFromDialog()}
                    disabled={submittingDnd}
                    style={{ minHeight: "var(--tap-action)" }}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-warn px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 transition"
                  >
                    <Icon name="moon" size={16} />
                    {submittingDnd ? "Kaydediliyor..." : "Odayı DND Olarak İşaretle"}
                  </button>
                  <button
                    type="button"
                    data-testid="mmd-button"
                    aria-expanded={mmdOpen}
                    onClick={() => setMmdOpen((v) => !v)}
                    disabled={submittingDnd}
                    style={{ minHeight: "var(--tap-action)" }}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-yellow-500 bg-yellow-400 px-4 py-2.5 text-xs font-bold text-black hover:bg-yellow-300 disabled:opacity-40 transition"
                  >
                    MMD · Misafir Müsait Değil
                  </button>
                  {mmdOpen ? (
                    <div data-testid="mmd-options" className="flex flex-wrap gap-2" role="group" aria-label="MMD nedeni">
                      {MMD_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          data-mutates=""
                          onClick={() => void handleMmd(reason)}
                          disabled={submittingDnd}
                          style={{ minHeight: "var(--tap-action)" }}
                          className="rounded-xl border border-yellow-500/60 bg-yellow-400/20 px-3 py-2 text-xs font-semibold text-text hover:bg-yellow-400/35 disabled:opacity-50"
                        >
                          {reason}
                        </button>
                      ))}
                <button
                  type="button"
                  data-testid="mmd-custom"
                  onClick={() => {
                    void askMmdReason(selectedRoom.number).then((typed) => {
                      if (typed) void handleMmd(typed);
                    });
                  }}
                  disabled={submittingDnd}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="rounded-xl border border-dashed border-yellow-600 bg-surface px-3.5 py-2.5 text-xs font-bold text-text hover:bg-yellow-400/20 disabled:opacity-50"
                >
                  Diğer sebep (elle yaz)
                </button>
                    </div>
                  ) : null}
                  {mmdAsk ? (
                    <MmdConsumptionAsk
                      roomNumber={selectedRoom.number}
                      reason={mmdAsk}
                      // `kat`: the request's "Geri" returns to this floor, not into a room check (D3).
                      onYes={() =>
                        dialogNavigate(
                          `/kat/manuel-kayit?oda=${encodeURIComponent(selectedRoom.id)}&mmd=${encodeURIComponent(mmdAsk)}&kat=${encodeURIComponent(selectedRoom.floorId)}`,
                        )
                      }
                      onNo={() => setMmdAsk(null)}
                    />
                  ) : null}
                </div>
                ) : null}

                {roomMmds.length > 0 ? (
                  <div data-testid="mmd-liste" className="pt-2 border-t border-warn/20">
                    <h4 className="text-xs font-bold text-text mb-2">Bugünkü MMD Kayıtları</h4>
                    <ul className="space-y-1">
                      {roomMmds.map((m) => (
                        <li key={m.id} className="text-xs text-text">
                          <span className="font-semibold tabular-nums">
                            {new Date(m.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Nicosia" })}
                          </span>{" "}
                          · {m.reason} <span className="text-muted">({m.by})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* DND History */}
                <div className="pt-2 border-t border-warn/20">
                  <h4 className="text-xs font-bold text-text mb-2">Bugünkü DND Kayıtları</h4>
                  {loadingDnd ? (
                    <p className="text-xs text-muted italic">DND kayıtları yükleniyor...</p>
                  ) : todaysDnd.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {todaysDnd.map((h, idx) => (
                        <div key={idx} className="rounded-lg border border-border bg-bg p-2 text-xs space-y-1">
                          <div className="flex items-center justify-between text-muted">
                            <span className="font-semibold text-text">{h.date}</span>
                            <span>Toplam {h.count} kontrol · Durum: {h.status}</span>
                          </div>
                          {h.checks.map((c, cIdx) => (
                            <div key={cIdx} className="flex items-center justify-between text-muted text-xs pl-2 border-l-2 border-warn/40">
                              <span>
                                {c.no}. Kontrol: {c.userName} ({new Date(c.at).toLocaleTimeString("tr-TR")})
                              </span>
                              {c.note ? <span className="italic text-text">&ldquo;{c.note}&rdquo;</span> : null}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted italic">Bu odada bugün DND kaydı yok.</p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Room Control / QR Action Button */}
            <div className="pt-2 border-t border-border flex flex-col gap-2 empty:hidden">
              {data?.settings?.requireQrForControl ? (
                canView(qrHref) ? (
                <button
                  type="button"
                  onClick={() => dialogNavigate(qrHref)}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition"
                >
                  <Icon name="camera" size={16} />
                  QR Okut
                </button>
                ) : null
              ) : canCheck(selectedRoom.id) ? (
                <button
                  type="button"
                  onClick={() => dialogNavigate(`/kat/oda-kontrol/${selectedRoom.id}`)}
                  style={{ minHeight: "var(--tap-action)" }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition"
                >
                  <Icon name="check" size={16} />
                  Minibar Kontrol Ekranını Aç →
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
