"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PriorityRouteModal } from "@/app/kat/components/PriorityRouteModal";
import { Icon } from "@/components/icons/Icon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";
import { formatDayTr } from "@/lib/time";
import { blockStyle, defaultLayout, type Layout, visibleBlocks, visibleItems } from "@/modules/core/screenLayouts";
import type { FloorSummary } from "@/modules/minibar/server/minibarTypes";

export type KatFilter = "mybar" | "dnd" | null;

const FILTER_LABEL: Record<Exclude<KatFilter, null>, string> = {
  mybar: "MyBar talebi olan katlar",
  dnd: "DND kaydı olan katlar",
};

export interface KatDashboardLinks {
  occupancy?: boolean;
  definitions?: boolean;
  stock?: boolean;
  reports?: boolean;
}

interface DashboardState {
  hotel: { id: string; name: string; code: string } | null;
  today: string;
  taskSummary: {
    total: number;
    completed: number;
    pending: number;
    dnd: number;
    completionRate: number;
    clashCount: number;
  };
  criticalStockCount: number;
  floors: FloorSummary[];
  activeMybarCount: number;
}

interface HotelOption {
  id: string;
  name: string;
  code: string;
}

const DEFAULT_LAYOUT = defaultLayout("kat");

/** Summary boxes by layout item id. */
const KPI: Record<string, { label: string; box: string; text: string; value(t: DashboardState["taskSummary"]): number }> = {
  toplam: { label: "Toplam Görev", box: "border-border bg-bg", text: "text-muted", value: (t) => t.total },
  tamamlanan: { label: "Tamamlanan", box: "border-ok/30 bg-ok/10", text: "text-ok", value: (t) => t.completed },
  bekleyen: { label: "Bekleyen", box: "border-warn/30 bg-warn/10", text: "text-warn", value: (t) => t.pending },
  dnd: { label: "DND Bekleyen", box: "border-accent/30 bg-accent/10", text: "text-accent", value: (t) => t.dnd },
  cakisma: { label: "Kritik Çakışma", box: "border-danger/30 bg-danger/10", text: "text-danger", value: (t) => t.clashCount },
};

export function KatDashboard({
  hotels = [],
  initialHotelId = "",
  canSwitchHotel = false,
  filter = null,
  layout = DEFAULT_LAYOUT,
}: {
  hotels?: HotelOption[];
  initialHotelId?: string;
  canSwitchHotel?: boolean;
  filter?: KatFilter;
  links?: KatDashboardLinks;
  /** Role layout from Kullanıcı Yönetimi → Ekranlar; the built-in screen when omitted. */
  layout?: Layout;
}) {
  const [selectedHotelId, setSelectedHotelId] = useState(initialHotelId);
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPriorityModal, setShowPriorityModal] = useState(false);

  // A new `initialHotelId` from the server page re-selects that hotel (state adjusted while rendering, no effect).
  const [seenInitialHotelId, setSeenInitialHotelId] = useState(initialHotelId);
  if (initialHotelId !== seenInitialHotelId) {
    setSeenInitialHotelId(initialHotelId);
    if (initialHotelId) setSelectedHotelId(initialHotelId);
  }

  // Only the latest request may fill the screen: a slow answer for the hotel left behind is dropped.
  const requestSeq = useRef(0);
  const fetchDashboard = useCallback(async (hotelId: string) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const url = hotelId
        ? `/api/minibar/dashboard?hotelId=${encodeURIComponent(hotelId)}`
        : "/api/minibar/dashboard";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Kat paneli verisi alınamadı.");
      }
      const json = (await res.json()) as DashboardState;
      if (seq === requestSeq.current) setData(json);
    } catch (e) {
      if (seq === requestSeq.current) setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void fetchDashboard(selectedHotelId), 0);
    return () => clearTimeout(t);
  }, [selectedHotelId, fetchDashboard]);

  // `?filtre=` (MB-PERS / MB-DND shortcuts): only floors with an open MyBar request or a DND record.
  const floors = (data?.floors ?? []).filter((floor) =>
    filter === "mybar" ? floor.mybarCount > 0 : filter === "dnd" ? floor.dndCount > 0 : true,
  );

  // Links name the hotel whose floors are on screen (the answer's hotel, not the selector's state), so the
  // way into a floor and back never depends on the session's hotel or on the address being carried along.
  const shownHotelId = data?.hotel?.id ?? selectedHotelId;
  const hotelQuery = shownHotelId ? `?hotelId=${encodeURIComponent(shownHotelId)}` : "";

  // Summary and progress stay inside the header card while they lead the screen; elsewhere each is its own card.
  const blocks = visibleBlocks(layout).map((b) => b.id);
  let lead = 0;
  while (blocks[lead] === "ozet" || blocks[lead] === "ilerleme") lead++;
  const kpiIds = visibleItems(layout, "ozet").filter((id) => KPI[id]);
  const strip = blockStyle(layout, "ozet") === "serit";
  const compactFloors = blockStyle(layout, "katlar") === "liste";

  const renderBlock = (id: string, d: DashboardState, standalone: boolean) => {
    const card = standalone ? "rounded-2xl border border-border bg-surface p-5" : "";
    if (id === "ozet") {
      return strip ? (
        <div key={id} data-guide="durum-filtresi" className={`flex flex-wrap gap-2 ${card}`}>
          {kpiIds.map((k) => (
            <span key={k} className={`inline-flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 ${KPI[k]!.box}`}>
              <span className={`text-xs uppercase tracking-wider ${KPI[k]!.text}`}>{KPI[k]!.label}</span>
              <span className={`text-base font-bold tabular-nums ${k === "toplam" ? "text-text" : KPI[k]!.text}`}>{KPI[k]!.value(d.taskSummary)}</span>
            </span>
          ))}
        </div>
      ) : (
        <div key={id} data-guide="durum-filtresi" className={`grid grid-cols-2 gap-3 ${kpiIds.length >= 5 ? "sm:grid-cols-5" : kpiIds.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"} ${card}`}>
          {kpiIds.map((k, i) => (
            <div key={k} className={`rounded-xl border p-3.5 ${KPI[k]!.box} ${kpiIds.length % 2 === 1 && i === kpiIds.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
              <p className={`text-xs uppercase tracking-wider ${k === "dnd" ? "text-text" : KPI[k]!.text}`}>{KPI[k]!.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${k === "toplam" ? "text-text" : KPI[k]!.text}`}>{KPI[k]!.value(d.taskSummary)}</p>
            </div>
          ))}
        </div>
      );
    }
    if (id === "ilerleme") {
      return (
        <div key={id} className={card}>
          <div className="flex items-center justify-between text-xs text-muted mb-1.5">
            <span>Tamamlanma Oranı</span>
            <span className="font-bold text-text tabular-nums">%{d.taskSummary.completionRate}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg border border-border">
            <div
              className="h-full rounded-full bg-ok transition-all duration-300"
              style={{ width: `${Math.min(100, d.taskSummary.completionRate)}%` }}
            />
          </div>
        </div>
      );
    }
    if (id === "kritikStok") return d.criticalStockCount > 0 ? <CriticalStock key={id} count={d.criticalStockCount} /> : null;
    return null;
  };

  return (
    <div className="min-h-screen bg-bg text-text">
      {showPriorityModal && (
        <PriorityRouteModal
          hotelId={selectedHotelId}
          onClose={() => setShowPriorityModal(false)}
        />
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {loading && !data ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Kat planı ve günlük görevler yükleniyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
            {error}
          </div>
        ) : data ? (
          <>
            <section
              data-guide="islemlerim"
              aria-label="Günün özeti"
              className="rounded-2xl border border-border bg-surface p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  {data.hotel ? (
                    <p data-testid="kat-otel-adi" className="text-lg font-bold uppercase tracking-wide text-text">
                      {data.hotel.name}
                    </p>
                  ) : null}
                  <span className="text-xs font-semibold uppercase tracking-widest text-accent">
                    Günün Özeti · {formatDayTr(data.today)}
                  </span>
                  <h2 className="text-base font-bold text-text mt-0.5">
                    Günlük Minibar Kontrol Görevleri
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPriorityModal(true)}
                    style={{ minHeight: "var(--tap-action)" }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95"
                  >
                    <Icon name="zap" size={16} />
                    Tavsiye İş Planı
                    {data.taskSummary.clashCount > 0 ? (
                      <span className="rounded-full bg-danger px-1.5 py-0.5 text-xs font-bold text-white">
                        {data.taskSummary.clashCount}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void fetchDashboard(selectedHotelId)}
                    style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-bg px-3 py-2 text-xs font-semibold text-text hover:bg-surface"
                  >
                    <Icon name="refresh" size={16} />
                    Yenile
                  </button>
                </div>
              </div>

              {blocks.slice(0, lead).map((id) => renderBlock(id, data, false))}
            </section>

            {blocks.slice(lead).map((id) => id === "katlar" ? (
            <section key={id} data-guide="kat-listesi" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-text">Kat Planı ve Oda Doluluk Durumu</h2>
                <span className="text-xs text-muted">
                  {data.hotel ? `${data.hotel.name} · ` : ""}
                  {floors.length} Kat
                </span>
              </div>

              {filter ? (
                <p className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text">
                  <span>Süzgeç: {FILTER_LABEL[filter]}</span>
                  <Link
                    href={`/kat${hotelQuery}`}
                    style={{ minHeight: "var(--tap-action)" }}
                    className="inline-flex items-center rounded-xl border border-border bg-bg px-3 text-sm font-semibold text-accent hover:bg-surface"
                  >
                    Süzgeci kaldır
                  </Link>
                </p>
              ) : null}

              {data.floors.length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
                  Bu otel için tanımlı kat bulunamadı.
                </div>
              ) : floors.length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
                  Süzgece uyan kat yok.
                </div>
              ) : compactFloors ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
                  {floors.map((floor, floorIdx) => (
                    <Link
                      key={floor.id}
                      data-guide={floorIdx === 0 ? "oda-karti" : undefined}
                      href={`/kat/doluluk/${floor.id}${hotelQuery}`}
                      style={{ minHeight: "var(--tap-action)" }}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-bg"
                    >
                      <span className="text-base font-bold text-text">{floor.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                        <span className="rounded-full border border-border bg-bg px-2.5 py-1 font-semibold text-text">
                          {floor.occupiedRooms}/{floor.totalRooms} Dolu
                        </span>
                        <span className="text-accent">Giriş {floor.arrivalCount}</span>
                        <span className="text-warn">Çıkış {floor.departureCount}</span>
                        <span className="text-ok">Kontrol {floor.checkedCount}</span>
                        {floor.dndCount > 0 ? (
                          <span className="rounded-md bg-warn/15 px-2 py-0.5 font-semibold text-warn">{floor.dndCount} DND</span>
                        ) : null}
                        {floor.mybarCount > 0 ? (
                          <span className="rounded-md bg-danger/20 px-2 py-0.5 font-bold text-danger">{floor.mybarCount} MyBar Talebi</span>
                        ) : null}
                        <Icon name="arrow-right" size={14} className="text-accent" />
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {floors.map((floor, floorIdx) => {
                    const occupancyRate =
                      floor.totalRooms > 0
                        ? Math.round((floor.occupiedRooms / floor.totalRooms) * 100)
                        : 0;
                    return (
                      <Link
                        key={floor.id}
                        data-guide={floorIdx === 0 ? "oda-karti" : undefined}
                        href={`/kat/doluluk/${floor.id}${hotelQuery}`}
                        className="group relative flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 transition hover:border-accent/60"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                                Kat #{floor.number}
                              </span>
                              <h3 className="text-lg font-bold text-text group-hover:text-accent transition">
                                {floor.name}
                              </h3>
                            </div>
                            <span className="rounded-full bg-bg border border-border px-2.5 py-1 text-xs font-semibold text-text tabular-nums">
                              {floor.occupiedRooms}/{floor.totalRooms} Dolu (%{occupancyRate})
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl bg-bg border border-border p-2">
                              <p className="text-xs text-muted">Giriş</p>
                              <p className="text-sm font-bold text-accent tabular-nums">{floor.arrivalCount}</p>
                            </div>
                            <div className="rounded-xl bg-bg border border-border p-2">
                              <p className="text-xs text-muted">Çıkış</p>
                              <p className="text-sm font-bold text-warn tabular-nums">{floor.departureCount}</p>
                            </div>
                            <div className="rounded-xl bg-bg border border-border p-2">
                              <p className="text-xs text-muted">Kontrol</p>
                              <p className="text-sm font-bold text-ok tabular-nums">{floor.checkedCount}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
                          <div className="flex items-center gap-2">
                            {floor.dndCount > 0 ? (
                              <span className="rounded-md bg-warn/15 px-2 py-0.5 font-semibold text-warn">
                                {floor.dndCount} DND
                              </span>
                            ) : null}
                            {floor.mybarCount > 0 ? (
                              <span className="rounded-md bg-danger/20 px-2 py-0.5 font-bold text-danger">
                                {floor.mybarCount} MyBar Talebi
                              </span>
                            ) : null}
                            {floor.dndCount === 0 && floor.mybarCount === 0 ? (
                              <span className="text-muted">Bekleyen uyarı yok</span>
                            ) : null}
                          </div>
                          <span className="inline-flex items-center gap-1 font-semibold text-accent group-hover:translate-x-0.5 transition">
                            Odaları Aç
                            <Icon name="arrow-right" size={14} />
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
            ) : renderBlock(id, data, true))}
          </>
        ) : null}
      </main>
    </div>
  );
}

function CriticalStock({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-text">
      <div className="flex items-center gap-2.5">
        <Icon name="warning" size={20} className="text-warn" />
        <span>
          Otel deposunda <strong>{count} ürün</strong> kritik seviyenin altında!
        </span>
      </div>
      <button
        type="button"
        data-testid="kritik-stok-ac"
        onClick={() => setOpen(true)}
        style={{ minHeight: "var(--tap-action)" }}
        className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-warn px-3 py-2 text-xs font-bold text-bg hover:opacity-95"
      >
        Kritik Stokları Gör
        <Icon name="arrow-right" size={16} />
      </button>
      {open ? <CriticalStockDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

type CriticalRow = { productId: string; name: string; remaining: number; critical: number; missing: number; status: string };
type CriticalData = { counts: { total: number }; groups: { stokout: CriticalRow[]; kritik: CriticalRow[]; dikkat: CriticalRow[] } };

const CRITICAL_SECTIONS: { key: keyof CriticalData["groups"]; title: string; badge: string }[] = [
  { key: "stokout", title: "Stok yok", badge: "border-danger bg-danger text-white" },
  { key: "kritik", title: "Kritik", badge: "border-danger/60 bg-danger/15 text-danger" },
  { key: "dikkat", title: "Dikkat", badge: "border-warn/60 bg-warn/15 text-warn" },
];

/** The products behind the banner's number: what is left, the critical level and how many are missing. */
function CriticalStockDialog({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CriticalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDialogFocus(box, onClose, () => box.current?.querySelector<HTMLElement>("button"));

  useEffect(() => {
    const first = setTimeout(async () => {
      try {
        const res = await fetch("/api/minibar/stock?view=critical", { cache: "no-store" });
        const json = (await res.json()) as CriticalData & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Kritik stoklar yüklenemedi.");
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kritik stoklar yüklenemedi.");
      }
    }, 0);
    return () => clearTimeout(first);
  }, []);

  const rows = data ? CRITICAL_SECTIONS.flatMap((s) => data.groups[s.key].map((row) => ({ ...row, section: s }))) : [];
  return (
    <div className="fixed inset-0 z-[900] grid place-items-center bg-black/50 p-4">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kritik-stok-baslik"
        data-testid="kritik-stok-pencere"
        className="flex max-h-[88dvh] w-full max-w-xl flex-col rounded-2xl border border-border bg-surface text-text shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="kritik-stok-baslik" className="text-base font-bold">
            Kritik seviyenin altındaki ürünler{data ? ` (${rows.length})` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-bg text-text hover:bg-surface"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p role="alert" className="text-sm text-danger">{error}</p>
          ) : !data ? (
            <p className="text-sm text-muted">Yükleniyor...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted">Şu anda kritik seviyenin altında ürün yok.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row, index) => (
                <li
                  key={row.productId}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 ${index % 2 === 0 ? "bg-bg" : "bg-surface"}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text">{row.name}</p>
                    <p className="text-xs text-muted">
                      Kalan <strong className="text-text">{row.remaining}</strong> · Kritik seviye {row.critical}
                      {row.missing > 0 ? ` · Eksik ${row.missing}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${row.section.badge}`}>{row.section.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
          <Link
            href="/kat/stok"
            style={{ minHeight: "var(--tap-action)" }}
            className="inline-flex items-center rounded-xl bg-accent px-4 text-xs font-bold text-white hover:opacity-95"
          >
            Tüm stoklar
          </Link>
        </div>
      </div>
    </div>
  );
}

export default KatDashboard;
