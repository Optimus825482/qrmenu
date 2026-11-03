"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  approveRoomOrderAction,
  confirmRoomPhoneAction,
  cancelRoomOrderAction,
  markRoomReadyAction,
  markRoomOnWayAction,
  markRoomDeliveredAction,
} from "@/modules/order/server/actions/roomService";
import {
  listRoomServiceOrdersAction,
  type RoomOrderListItem,
  type RoomServiceStats,
} from "@/modules/order/server/actions/roomServiceRecords";
import { useSse } from "@/shell/useSse";
import { Icon, type IconName } from "@/components/icons/Icon";

const LIVE_EVENTS = [
  "order.created",
  "order.approved",
  "order.prep",
  "order.ready",
  "order.onway",
  "order.delivered",
  "order.cancelled",
  "order.sla",
] as const;

const STATUS_CONFIG: Record<
  string,
  { label: string; badge: string; border: string; bg: string; icon: IconName }
> = {
  TEYIT_BEKLIYOR: {
    label: "Telefon Teyidi Bekliyor",
    badge: "bg-amber-500 text-slate-950",
    border: "border-amber-400 ring-2 ring-amber-400/40",
    bg: "bg-amber-500/10",
    icon: "call",
  },
  GONDERILDI: {
    label: "Yeni Talep",
    badge: "bg-amber-600 text-white",
    border: "border-amber-500",
    bg: "bg-amber-500/10",
    icon: "bell",
  },
  ONAYLANDI: {
    label: "Mutfakta / Hazırlanıyor",
    badge: "bg-sky-600 text-white",
    border: "border-sky-500",
    bg: "bg-sky-500/10",
    icon: "flame",
  },
  HAZIR: {
    label: "Hazır / Servis Bekliyor",
    badge: "bg-emerald-600 text-white",
    border: "border-emerald-500",
    bg: "bg-emerald-500/10",
    icon: "utensils",
  },
  YOLDA: {
    label: "Yolda / Serviste",
    badge: "bg-indigo-600 text-white",
    border: "border-indigo-500",
    bg: "bg-indigo-500/10",
    icon: "walk",
  },
  TESLIM_EDILDI: {
    label: "Teslim Edildi",
    badge: "bg-emerald-700 text-white",
    border: "border-emerald-600/40",
    bg: "bg-surface",
    icon: "check",
  },
  IPTAL: {
    label: "İptal Edildi",
    badge: "bg-rose-700 text-white",
    border: "border-rose-400/40",
    bg: "bg-rose-500/5",
    icon: "close",
  },
  REDDEDILDI: {
    label: "Reddedildi",
    badge: "bg-rose-800 text-white",
    border: "border-rose-400/40",
    bg: "bg-rose-500/5",
    icon: "close",
  },
};

function playRoomServiceChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.setValueAtTime(987.77, now + 0.12);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  } catch {
    // ses izin verilmediyse sessiz geç
  }
}

type Props = {
  hotelId: string;
  hotelName: string;
  initialOrders: RoomOrderListItem[];
  initialStats: RoomServiceStats;
  canEdit: boolean;
  /** rs.slaMinutes of the hotel (read server-side). */
  slaMinutes: number;
};

export default function OdaServisiClient({
  hotelId,
  hotelName,
  initialOrders,
  initialStats,
  canEdit,
  slaMinutes,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("sekme") || "talepler";

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const [orders, setOrders] = useState<RoomOrderListItem[]>(initialOrders);
  const [stats, setStats] = useState<RoomServiceStats>(initialStats);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Telefon teyit modalı
  const [confirmModal, setConfirmModal] = useState<RoomOrderListItem | null>(null);
  const [confirmNote, setConfirmNote] = useState("");

  // İptal modalı
  const [cancelModal, setCancelModal] = useState<RoomOrderListItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const refresh = useCallback(async () => {
    const res = await listRoomServiceOrdersAction({
      hotelId,
      search: search.trim() || undefined,
      limit: 100,
    });
    if (res.ok) {
      setOrders(res.data.orders);
      setStats(res.data.stats);
    }
  }, [hotelId, search]);

  useSse((event) => {
    if (event.hotelId === hotelId || !event.hotelId) {
      if (event.type === "order.created") {
        playRoomServiceChime();
      }
      void refresh();
    }
  }, LIVE_EVENTS);

  const act = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    if (!canEdit || pending) return;
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error?.message ?? "İşlem gerçekleştirilemedi");
        return;
      }
      setError("");
      await refresh();
    });
  };

  const handlePhoneConfirm = () => {
    if (!confirmModal) return;
    const orderId = confirmModal.id;
    const note = confirmNote.trim() || undefined;
    setConfirmModal(null);
    setConfirmNote("");
    act(() => confirmRoomPhoneAction({ orderId, note }));
  };

  const handleCancel = () => {
    if (!cancelModal) return;
    const orderId = cancelModal.id;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setError("İptal sebebi en az 3 karakter olmalıdır");
      return;
    }
    setCancelModal(null);
    setCancelReason("");
    act(() => cancelRoomOrderAction({ orderId, reason }));
  };

  // Sekmeye göre filtrele
  const filteredOrders = orders.filter((order) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchRoom = order.roomNumber.toLowerCase().includes(q);
      const matchOrder = order.orderNo.toLowerCase().includes(q);
      const matchItems = order.itemsSummary.toLowerCase().includes(q);
      if (!matchRoom && !matchOrder && !matchItems) return false;
    }

    if (tab === "teyit") {
      return order.status === "TEYIT_BEKLIYOR";
    }
    if (tab === "teslim") {
      return (
        order.status === "ONAYLANDI" ||
        order.status === "HAZIR" ||
        order.status === "YOLDA"
      );
    }
    if (tab === "gecmis") {
      return (
        order.status === "TESLIM_EDILDI" ||
        order.status === "IPTAL" ||
        order.status === "REDDEDILDI"
      );
    }
    // "talepler" varsayılan: açık ve bekleyen tüm operasyon siparişleri
    return (
      order.status !== "TESLIM_EDILDI" &&
      order.status !== "IPTAL" &&
      order.status !== "REDDEDILDI"
    );
  });

  return (
    <section aria-label="Oda servisi operasyon paneli" className="space-y-4">
      {/* Üst Kiosk / Tablet Kontrol Barı */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div>
          <h1 className="text-xl font-black tracking-tight text-text flex items-center gap-2">
            <span><Icon name="concierge" size={20} /> Oda Servisi Operasyon Paneli</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-bold">
              {hotelName}
            </span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Canlı oda siparişleri, mutfak hazırlık, telefon teyidi ve SLA takibi
          </p>
        </div>

        {/* Hızlı Arama */}
        <div className="relative min-w-[200px] w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Oda no veya sipariş ara..."
            className="w-full h-10 rounded-xl border border-border bg-surface-sunken px-3 pl-8 text-xs font-medium placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <Icon name="search" size={16} className="absolute left-2.5 top-2.5 text-muted pointer-events-none" />
          {search ? (
            <button aria-label="Kapat"
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 h-5 w-5 rounded-full bg-border text-xs flex items-center justify-center text-muted hover:text-text"
            >
              <Icon name="close" size={20} />
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5 shadow-2xs">
          <Icon name="clipboard" size={24} />
          <div>
            <p className="text-[11px] font-medium text-muted">Toplam Sipariş</p>
            <p className="text-lg font-black text-text">{stats.total}</p>
          </div>
        </div>

        <div
          className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 shadow-2xs ${
            stats.pending > 0
              ? "bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-100"
              : "border-border bg-surface text-text"
          }`}
        >
          <Icon name="call" size={24} />
          <div>
            <p className="text-[11px] font-medium text-muted">Teyit Bekleyen</p>
            <p className="text-lg font-black">{stats.pending}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5 shadow-2xs">
          <Icon name="flame" size={24} />
          <div>
            <p className="text-[11px] font-medium text-muted">Mutfakta / Hazırlık</p>
            <p className="text-lg font-black text-text">{stats.approved}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5 shadow-2xs">
          <Icon name="walk" size={24} />
          <div>
            <p className="text-[11px] font-medium text-muted">Yolda / Serviste</p>
            <p className="text-lg font-black text-text">{stats.onWay}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5 shadow-2xs">
          <Icon name="check" size={24} />
          <div>
            <p className="text-[11px] font-medium text-muted">Teslim Edildi</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              {stats.delivered}
            </p>
          </div>
        </div>
      </div>

      {/* Dokunmatik Tablet Navigasyon Sekmeleri */}
      <nav className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => router.push("/oda-servisi")}
          className={`min-h-[48px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
            tab === "talepler"
              ? "bg-accent text-white shadow-sm"
              : "bg-surface border border-border text-text hover:bg-surface-sunken"
          }`}
        >
          <span><Icon name="concierge" size={20} /> Açık Talepler</span>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-black">
            {orders.filter((o) => o.status !== "TESLIM_EDILDI" && o.status !== "IPTAL" && o.status !== "REDDEDILDI").length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/oda-servisi?sekme=teyit")}
          className={`min-h-[48px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
            tab === "teyit"
              ? "bg-amber-600 text-white shadow-sm"
              : "bg-surface border border-border text-text hover:bg-surface-sunken"
          }`}
        >
          <span><Icon name="call" size={20} /> Telefon Teyidi</span>
          {stats.pending > 0 ? (
            <span className="rounded-full bg-amber-400 text-slate-950 px-2 py-0.5 text-xs font-black">
              {stats.pending}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => router.push("/oda-servisi?sekme=teslim")}
          className={`min-h-[48px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
            tab === "teslim"
              ? "bg-accent text-white shadow-sm"
              : "bg-surface border border-border text-text hover:bg-surface-sunken"
          }`}
        >
          <span><Icon name="clock" size={20} /> Teslimat &amp; SLA</span>
        </button>

        <button
          type="button"
          onClick={() => router.push("/oda-servisi?sekme=gecmis")}
          className={`min-h-[48px] shrink-0 px-4 py-2 rounded-2xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
            tab === "gecmis"
              ? "bg-accent text-white shadow-sm"
              : "bg-surface border border-border text-text hover:bg-surface-sunken"
          }`}
        >
          <span><Icon name="list" size={20} /> Sipariş Geçmişi</span>
        </button>
      </nav>

      {/* Hata Uyarısı */}
      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 text-sm text-rose-700 dark:text-rose-300 font-semibold"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-xs underline">
            Kapat
          </button>
        </div>
      ) : null}

      {/* Sipariş Kartları Grid */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {filteredOrders.length === 0 ? (
          <div className="col-span-full py-16 text-center text-muted border border-dashed border-border rounded-2xl bg-surface">
            <Icon name="concierge" size={32} className="block mb-2" />
            <p className="text-base font-semibold">Bu görünümde bekleyen sipariş bulunmuyor.</p>
            <p className="text-xs mt-1">Misafirlerden yeni oda servisi talebi geldiğinde anında burada listelenir.</p>
          </div>
        ) : null}

        {filteredOrders.map((order) => {
          const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.GONDERILDI;
          const orderDate = new Date(order.createdAt);
          const elapsedMin = Math.max(0, Math.floor((now - orderDate.getTime()) / 60000));
          const isOverdue = elapsedMin > slaMinutes && order.status !== "TESLIM_EDILDI" && order.status !== "IPTAL";

          return (
            <article
              key={order.id}
              className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all bg-surface ${cfg.border} ${
                isOverdue ? "ring-2 ring-rose-500 bg-rose-500/5" : ""
              }`}
            >
              <div>
                {/* Kart Başlığı */}
                <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-text">Oda #{order.roomNumber}</span>
                      <span className="text-xs font-mono font-bold text-muted">
                        #{order.orderNo}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">
                      {orderDate.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} &bull; {elapsedMin} dk önce
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black tracking-wide ${cfg.badge}`}
                  >
                    <Icon name={cfg.icon} size={20} />
                    <span>{cfg.label}</span>
                  </span>
                </div>

                {/* SLA Uyarı Çubuğu */}
                {order.status !== "TESLIM_EDILDI" && order.status !== "IPTAL" ? (
                  <div className="mt-2.5 flex items-center justify-between text-xs rounded-xl p-2 bg-surface-sunken border border-border/50">
                    <span className="text-muted font-medium">SLA Hedefi ({slaMinutes} dk):</span>
                    <span
                      className={`font-black ${
                        isOverdue
                          ? "text-rose-600 dark:text-rose-400"
                          : elapsedMin > 20
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {elapsedMin} / {slaMinutes} dk {isOverdue ? "GECİKTİ" : ""}
                    </span>
                  </div>
                ) : null}

                {/* Ürün Özeti */}
                <div className="mt-3">
                  <p className="text-xs font-bold text-muted mb-1">Seçilen Ürünler ({order.itemCount} adet):</p>
                  <p className="text-sm font-semibold text-text leading-snug">
                    {order.itemsSummary}
                  </p>
                </div>

                {/* Varsa Misafir Notu */}
                {order.note ? (
                  <div className="mt-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-900 dark:text-amber-200">
                    <strong>Misafir Notu:</strong> {order.note}
                  </div>
                ) : null}

                {/* Telefon Teyidi Bilgisi */}
                {order.phoneConfirmedAt ? (
                  <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
                    <span><Icon name="check" size={20} /> Telefon teyidi alındı:</span>
                    <span>
                      {new Date(order.phoneConfirmedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                ) : null}
              </div>

              {/* Dokunmatik Aksiyon Butonları (SLA Adımları) */}
              <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap gap-2">
                {/* 1. Telefon Teyidi */}
                {order.status === "TEYIT_BEKLIYOR" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setConfirmModal(order);
                      setConfirmNote("");
                    }}
                    className="flex-1 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Icon name="call" size={20} /> Telefonla Teyit Et
                  </button>
                ) : null}

                {/* 2. Mutfak Onayı / Hazırlığa Başla */}
                {order.status === "GONDERILDI" || order.status === "TEYIT_BEKLIYOR" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => approveRoomOrderAction({ orderId: order.id }))}
                    className="flex-1 min-h-[48px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs sm:text-sm shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Icon name="flame" size={20} /> Mutfakta Hazırla
                  </button>
                ) : null}

                {/* 3. Hazırlandı */}
                {order.status === "ONAYLANDI" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => markRoomReadyAction({ orderId: order.id }))}
                    className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Icon name="utensils" size={20} /> Hazırlandı (Servise Ver)
                  </button>
                ) : null}

                {/* 4. Yola Çıktı */}
                {order.status === "HAZIR" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => markRoomOnWayAction({ orderId: order.id }))}
                    className="flex-1 min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs sm:text-sm shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Icon name="walk" size={20} /> Odaya Çıkar (Yolda)
                  </button>
                ) : null}

                {/* 5. Teslim Edildi */}
                {order.status === "YOLDA" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => markRoomDeliveredAction({ orderId: order.id }))}
                    className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Icon name="check" size={20} /> Odaya Teslim Edildi
                  </button>
                ) : null}

                {/* İptal Butonu */}
                {order.status !== "TESLIM_EDILDI" && order.status !== "IPTAL" && order.status !== "REDDEDILDI" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setCancelModal(order);
                      setCancelReason("");
                    }}
                    className="min-h-[48px] px-3.5 rounded-xl border border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 text-xs font-bold transition active:scale-95"
                  >
                    İptal / Ret
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {/* Telefon Teyit Modalı */}
      {confirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-black text-text">
              <Icon name="call" size={20} /> Oda #{confirmModal.roomNumber} Telefon Teyidi
            </h2>
            <p className="text-xs text-muted mt-1">
              Sipariş #{confirmModal.orderNo} için misafir arandı ve teyit alındı. İsteğe bağlı not ekleyebilirsiniz:
            </p>

            <textarea
              value={confirmNote}
              onChange={(e) => setConfirmNote(e.target.value)}
              placeholder="Örn: Misafir buz ve ekstra bardak rica etti..."
              rows={3}
              className="w-full mt-3 rounded-xl border border-border bg-surface-sunken p-3 text-xs focus:border-accent focus:outline-none"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-border text-xs font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={handlePhoneConfirm}
                className="flex-1 min-h-[44px] rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400"
              >
                Teyidi Kaydet &amp; Onayla
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* İptal Modalı */}
      {cancelModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h2 className="text-lg font-black text-rose-700 dark:text-rose-400">
              <Icon name="close" size={20} /> Siparişi İptal Et / Reddet
            </h2>
            <p className="text-xs text-muted mt-1">
              Oda #{cancelModal.roomNumber} - Sipariş #{cancelModal.orderNo} iptal edilecek. Lütfen gerekçe belirtin:
            </p>

            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Örn: Misafir iptal etti / Mutfakta stok kalmadı"
              className="w-full mt-3 h-10 rounded-xl border border-border bg-surface-sunken px-3 text-xs focus:border-accent focus:outline-none"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCancelModal(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-border text-xs font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={pending || cancelReason.trim().length < 3}
                onClick={handleCancel}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 text-white font-black text-xs hover:bg-rose-500 disabled:opacity-50"
              >
                İptali Kesinleştir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
