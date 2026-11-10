"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RoutineCard } from "@/components/guide/RoutineCard";
import { Icon } from "@/components/icons/Icon";

interface PriorityPlanEntry {
  seq?: number;
  roomId: string;
  roomNumber: string;
  floorNumber?: number;
  floorName?: string;
  rank: number;
  label?: string;
  priorityLabel?: string;
  isCritical?: boolean;
  isCriticalClash?: boolean;
  departureTime?: string | null;
  arrivalTime?: string | null;
  warningText?: string | null;
  clash?: { departure: string; arrival: string; gapMin: number; critical: boolean };
}

interface PlanFloor {
  floorNumber: number;
  name: string;
  count: number;
  critical: number;
  firstSeq: number;
}

interface HotelPlanSummary {
  hotelId: string;
  hotelName: string;
  hotelCode: string;
  requireQrForControl: boolean;
  plan: {
    entries: PriorityPlanEntry[];
    floors: PlanFloor[];
    summary: { total: number; critical: number; normal: number; clashes: number };
    briefing: string[];
  };
}

interface PriorityPlanResponse {
  rooms?: PriorityPlanEntry[];
  entries?: PriorityPlanEntry[];
  floors?: PlanFloor[];
  summary?: { total: number; critical: number; normal: number; clashes: number };
  briefing?: string[];
  multiHotels?: HotelPlanSummary[];
  hotels?: Array<{ id: string; name: string; code: string }>;
  selectedHotelId?: string;
  requireQrForControl?: boolean;
  error?: string;
}

function groupEntriesByFloor(entries: PriorityPlanEntry[]) {
  const map = new Map<number, { floorName: string; rooms: PriorityPlanEntry[] }>();
  entries.forEach((r) => {
    const fn = r.floorNumber ?? 0;
    const current = map.get(fn) ?? { floorName: r.floorName ?? `Kat ${fn}`, rooms: [] };
    current.rooms.push(r);
    map.set(fn, current);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([floorNumber, data]) => ({ floorNumber, ...data }));
}

export default function KatTavsiyeIsPlaniPage() {
  const [rooms, setRooms] = useState<PriorityPlanEntry[]>([]);
  const [floors, setFloors] = useState<PlanFloor[]>([]);
  const [summary, setSummary] = useState<{ total: number; critical: number; normal: number; clashes: number } | null>(null);
  const [briefing, setBriefing] = useState<string[]>([]);
  const [multiHotels, setMultiHotels] = useState<HotelPlanSummary[]>([]);
  const [hotels, setHotels] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("ALL");
  const [requireQrForControl, setRequireQrForControl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI States: Selected Floor Filter & Accordion
  const [selectedFloor, setSelectedFloor] = useState<number | "ALL">("ALL");
  const [expandedFloors, setExpandedFloors] = useState<Record<number, boolean>>({});
  const [expandedHotelFloors, setExpandedHotelFloors] = useState<Record<string, boolean>>({});
  const [showGuide, setShowGuide] = useState(true);

  const loadPlan = async (hId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const activeHotel = hId !== undefined ? hId : selectedHotelId;
      const url = activeHotel && activeHotel !== "ALL"
        ? `/api/minibar/priority-plan?hotelId=${encodeURIComponent(activeHotel)}`
        : "/api/minibar/priority-plan?hotelId=ALL";
      const res = await fetch(url);
      const json = (await res.json()) as PriorityPlanResponse;
      if (!res.ok) throw new Error(json.error ?? "Tavsiye planı alınamadı.");

      const allEntries = json.rooms ?? json.entries ?? [];
      setRooms(allEntries);
      setFloors(json.floors ?? []);
      setSummary(json.summary ?? null);
      setBriefing(json.briefing ?? []);
      const loadedMulti = json.multiHotels ?? [];
      setMultiHotels(loadedMulti);
      setHotels(json.hotels ?? []);
      // The server decides the view: a user with one hotel gets that hotel even for "ALL".
      if (json.selectedHotelId) setSelectedHotelId(json.selectedHotelId);
      setRequireQrForControl(Boolean(json.requireQrForControl));

      // Tek otel kat accordion varsayılan açık
      const exp: Record<number, boolean> = {};
      allEntries.forEach((r) => {
        const fn = r.floorNumber ?? 0;
        exp[fn] = true;
      });
      setExpandedFloors(exp);

      // Çoklu otel kat accordion varsayılan açık
      const expH: Record<string, boolean> = {};
      loadedMulti.forEach((h) => {
        h.plan.entries.forEach((r) => {
          expH[`${h.hotelId}-${r.floorNumber ?? 0}`] = true;
        });
      });
      setExpandedHotelFloors(expH);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramHotelId = params.get("hotelId");
    const initialHId = paramHotelId ?? "ALL";
    const t = setTimeout(() => void loadPlan(initialHId), 0);
    return () => clearTimeout(t);
  }, []);

  const handleHotelSelect = (hotelId: string) => {
    setSelectedHotelId(hotelId);
    setSelectedFloor("ALL");
    const url = new URL(window.location.href);
    if (hotelId === "ALL") {
      url.searchParams.delete("hotelId");
    } else {
      url.searchParams.set("hotelId", hotelId);
    }
    window.history.replaceState({}, "", url.toString());
    void loadPlan(hotelId);
  };

  const toggleFloor = (floorNumber: number) => {
    setExpandedFloors((prev) => ({
      ...prev,
      [floorNumber]: !prev[floorNumber],
    }));
  };

  const toggleHotelFloor = (hotelId: string, floorNumber: number) => {
    const key = `${hotelId}-${floorNumber}`;
    setExpandedHotelFloors((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  };

  // Tek otel modu için katlara göre gruplanmış odalar
  const groupedByFloor = useMemo(() => groupEntriesByFloor(rooms), [rooms]);

  const uniqueFloorNumbers = useMemo(() => {
    const set = new Set<number>();
    rooms.forEach((r) => set.add(r.floorNumber ?? 0));
    return Array.from(set).sort((a, b) => a - b);
  }, [rooms]);

  const renderRoomCard = (
    rm: PriorityPlanEntry,
    idx: number,
    hotelId?: string,
    isQrRequired?: boolean,
  ) => {
    const isClash = rm.rank === 1 || rm.isCriticalClash || Boolean(rm.clash?.critical);
    const targetControlUrl = hotelId
      ? `/kat/oda-kontrol/${rm.roomId}?hotelId=${encodeURIComponent(hotelId)}`
      : `/kat/oda-kontrol/${rm.roomId}`;
    const targetQrUrl = hotelId
      ? `/kat/qr?hotelId=${encodeURIComponent(hotelId)}`
      : "/kat/qr";

    return (
      <div
        key={rm.roomId}
        className={`flex items-center justify-between gap-4 rounded-xl border p-3.5 transition ${
          isClash
            ? "border-danger/60 bg-danger/10"
            : "border-border bg-surface hover:border-accent"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg border border-border text-xs font-bold text-text tabular-nums">
            #{rm.seq ?? idx + 1}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-text">Oda {rm.roomNumber}</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                {rm.priorityLabel ?? rm.label ?? "Kontrol"}
              </span>
              {isClash ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-danger text-white px-2 py-0.5 text-xs font-bold">
                  <Icon name="warning" size={12} />
                  Kritik Çakışma
                </span>
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
              {rm.departureTime ?? rm.clash?.departure ? (
                <span>Çıkış: {rm.departureTime ?? rm.clash?.departure}</span>
              ) : null}
              {rm.arrivalTime ?? rm.clash?.arrival ? (
                <span>Giriş: {rm.arrivalTime ?? rm.clash?.arrival}</span>
              ) : null}
            </div>

            {rm.warningText ? (
              <p className="mt-1 text-xs font-semibold text-danger">{rm.warningText}</p>
            ) : null}
          </div>
        </div>

        {/* Buton: QR Zorunlu ise doğrudan QR Okut, değilse Kontrol Et */}
        {isQrRequired ? (
          <Link
            href={targetQrUrl}
            style={{ minHeight: "var(--tap-action)" }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 shadow-sm transition"
          >
            <Icon name="camera" size={15} />
            QR Okut
          </Link>
        ) : (
          <Link
            href={targetControlUrl}
            style={{ minHeight: "var(--tap-action)" }}
            className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition"
          >
            Kontrol Et
            <Icon name="arrow-right" size={14} />
          </Link>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bg text-text pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg transition"
            >
              <Icon name="arrow-left" size={16} />
              Geri
            </Link>
            <div>
              <h1 className="text-lg font-bold">Tavsiye Edilen Günlük İş Planı</h1>
              <p className="text-xs text-muted">
                Çıkış + Giriş çakışmaları, erken çıkışlar ve kat sırasına göre akıllı önceliklendirme
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadPlan()}
            style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg transition"
          >
            <Icon name="refresh" size={16} />
            Yenile
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        <RoutineCard />

        {/* Otel Seçim / Çoklu Otel Görünüm Barı */}
        {hotels.length > 1 ? (
          <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted flex items-center gap-1.5">
                <Icon name="building" size={16} />
                Otel Görünümü:
              </span>
              <span className="text-xs font-semibold text-accent">
                {selectedHotelId === "ALL" ? `${hotels.length} otel birlikte görüntüleniyor` : "Tek otel filtresi aktif"}
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => handleHotelSelect("ALL")}
                className={`rounded-xl px-3.5 py-2 font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                  selectedHotelId === "ALL"
                    ? "bg-accent text-white shadow-sm ring-2 ring-accent/30"
                    : "border border-border bg-surface text-text hover:bg-bg"
                }`}
              >
                <Icon name="building" size={14} />
                Tüm Oteller ({hotels.length})
              </button>
              {hotels.map((h) => {
                const isSelected = selectedHotelId === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => handleHotelSelect(h.id)}
                    className={`rounded-xl px-3.5 py-2 font-bold transition whitespace-nowrap flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-accent text-white shadow-sm ring-2 ring-accent/30"
                        : "border border-border bg-surface text-text hover:bg-bg"
                    }`}
                  >
                    <Icon name="building" size={14} />
                    {h.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Yazılı Plan Rehberi ve Çalışma Mantığı */}
        <section className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-bg/50 transition"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent font-bold text-sm">
                <Icon name="clipboard" size={16} />
              </span>
              <div>
                <h2 className="text-sm font-bold text-text">Tavsiye Edilen İş Planı Nasıl Çalışır?</h2>
                <p className="text-xs text-muted">Öncelik sıralaması ve akıllı rota optimizasyonu detayları</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-accent flex items-center gap-1">
              {showGuide ? "Gizle" : "Açıkla"}
              <Icon name="chevron-down" size={14} className={showGuide ? "rotate-180" : undefined} />
            </span>
          </button>

          {showGuide ? (
            <div className="p-4 pt-1 border-t border-border/70 space-y-3 text-xs leading-relaxed">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-danger">
                    <Icon name="warning" size={14} />
                    <span>1. Çakışan Odalar (Departure + Arrival)</span>
                  </div>
                  <p className="text-muted">
                    Bugün hem mevcut misafirin çıkış yapacağı hem de yeni misafirin giriş yapacağı en acil odalardır.
                    Yeni misafir gelmeden önce minibar eksiksiz hazırlanmalıdır.
                  </p>
                </div>

                <div className="rounded-xl border border-warn/40 bg-warn/5 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-warn">
                    <Icon name="clock" size={14} />
                    <span>2. Çıkış Yapacak Odalar (Departure)</span>
                  </div>
                  <p className="text-muted">
                    Misafir resepsiyonda check-out yapmadan önce tüketilen ürünlerin adisyona doğru yansıtılabilmesi
                    için çıkış saatine göre önceliklendirilir.
                  </p>
                </div>

                <div className="rounded-xl border border-warn/40 bg-warn/5 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-warn">
                    <Icon name="moon" size={14} />
                    <span>3. DND Bekleyen Odalar</span>
                  </div>
                  <p className="text-muted">
                    Daha önce kapısında Rahatsız Etmeyin kartı bulunan ve yeniden kontrol süresi dolmuş olan odaların
                    tekrar kontrolüdür.
                  </p>
                </div>

                <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-accent">
                    <Icon name="user" size={14} />
                    <span>4. Yaklaşan Girişler (Arrival)</span>
                  </div>
                  <p className="text-muted">
                    Yeni misafirin varış saatine 1 saatten az kalan odaların son kontrolüdür.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-bg/80 p-3 space-y-1">
                <div className="font-bold text-text flex items-center gap-1.5">
                  <Icon name="check" size={14} />
                  <span>5. Konaklayan (In-House) Günlük Rutin & Kat Sırası</span>
                </div>
                <p className="text-muted">
                  Otelde konaklamaya devam eden odaların günlük rutin kontrolleridir. Personelin asansör ve koridorda
                  gereksiz vakit kaybetmemesi için odalar kat sırasına ve oda numaralarına göre optimize edilerek listelenir.
                </p>
              </div>

              {/* Günlük Brifing Notları */}
              {briefing.length > 0 ? (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-1.5">
                  <span className="font-bold text-accent text-xs">Bugünkü Özet Rota Tavsiyesi:</span>
                  <ul className="list-disc list-inside space-y-0.5 text-text">
                    {briefing.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Loading / Error States */}
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">
            Akıllı iş planı hesaplanıyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : selectedHotelId === "ALL" && multiHotels.length > 0 ? (
          /* ========================================================= */
          /* ÇOKLU OTEL GÖRÜNÜMÜ                                        */
          /* ========================================================= */
          <div className="space-y-6">
            {multiHotels.map((hSummary) => {
              const hGrouped = groupEntriesByFloor(hSummary.plan.entries);
              const hRooms = hSummary.plan.entries;

              return (
                <section
                  key={hSummary.hotelId}
                  className="rounded-2xl border-2 border-border bg-surface shadow-md overflow-hidden space-y-4 p-4"
                >
                  {/* Otel Kartı Başlığı */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent font-bold text-lg">
                        <Icon name="building" size={20} />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-text">{hSummary.hotelName}</h2>
                          <span className="text-xs rounded-full bg-accent/15 px-2 py-0.5 font-bold text-accent">
                            {hRooms.length} Görev
                          </span>
                        </div>
                        <p className="text-xs text-muted flex flex-wrap gap-2 mt-0.5">
                          <span>{hRooms.length} bekleyen oda</span>
                          {hSummary.plan.summary.clashes > 0 ? (
                            <span className="inline-flex items-center gap-1 text-danger font-bold">
                              · <Icon name="warning" size={12} /> {hSummary.plan.summary.clashes} çakışma
                            </span>
                          ) : null}
                          {hSummary.plan.summary.critical > 0 ? (
                            <span className="inline-flex items-center gap-1 text-warn font-bold">
                              · <Icon name="warning" size={12} /> {hSummary.plan.summary.critical} kritik
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleHotelSelect(hSummary.hotelId)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-xs font-bold text-accent hover:bg-accent/20 transition"
                    >
                      Yalnız Bu Oteli Göster
                      <Icon name="arrow-right" size={14} />
                    </button>
                  </div>

                  {/* Otel Özel Rota Tavsiyesi */}
                  {hSummary.plan.briefing.length > 0 ? (
                    <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-text space-y-1">
                      <span className="font-bold text-accent">Bugünkü Rota Özeti:</span>
                      <ul className="list-disc list-inside space-y-0.5 text-muted">
                        {hSummary.plan.briefing.map((b, bi) => (
                          <li key={bi}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* Otelin Kat ve Oda Listesi */}
                  {hRooms.length === 0 ? (
                    <div className="rounded-xl border border-border bg-bg/50 p-6 text-center text-xs text-muted">
                      Bu otelde bugün için bekleyen oda kontrol görevi bulunmuyor.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {hGrouped.map((grp) => {
                        const floorKey = `${hSummary.hotelId}-${grp.floorNumber}`;
                        const isExpanded = expandedHotelFloors[floorKey] ?? true;
                        const criticalCount = grp.rooms.filter(
                          (r) => r.rank === 1 || r.isCritical || r.isCriticalClash,
                        ).length;

                        return (
                          <div
                            key={floorKey}
                            className="rounded-xl border border-border bg-bg/60 overflow-hidden shadow-xs"
                          >
                            <button
                              type="button"
                              onClick={() => toggleHotelFloor(hSummary.hotelId, grp.floorNumber)}
                              className="w-full flex items-center justify-between p-3.5 bg-surface hover:bg-bg/60 transition text-left border-b border-border/70"
                            >
                              <div className="flex items-center gap-3">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white font-bold text-xs">
                                  {grp.floorNumber}
                                </span>
                                <div>
                                  <h3 className="text-xs font-bold text-text">{grp.floorName}</h3>
                                  <p className="text-xs text-muted">
                                    {grp.rooms.length} oda
                                    {criticalCount > 0 ? (
                                      <span className="text-danger font-bold ml-1">· {criticalCount} kritik</span>
                                    ) : null}
                                  </p>
                                </div>
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                                {isExpanded ? "Gizle" : "Odaları Göster"}
                                <Icon name="chevron-down" size={14} className={isExpanded ? "rotate-180" : undefined} />
                              </span>
                            </button>

                            {isExpanded ? (
                              <div className="p-2.5 space-y-2">
                                {grp.rooms.map((rm, idx) =>
                                  renderRoomCard(rm, idx, hSummary.hotelId, hSummary.requireQrForControl),
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Bugün için bekleyen oda kontrol görevi bulunmuyor.
          </div>
        ) : (
          /* ========================================================= */
          /* TEK OTEL GÖRÜNÜMÜ                                         */
          /* ========================================================= */
          <div className="space-y-4">
            {/* Kat Filtre Hapları (Pills) */}
            {uniqueFloorNumbers.length > 1 ? (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                <span className="text-muted font-bold whitespace-nowrap">Kat Filtresi:</span>
                <button
                  type="button"
                  onClick={() => setSelectedFloor("ALL")}
                  className={`rounded-xl px-3 py-1.5 font-bold transition whitespace-nowrap ${
                    selectedFloor === "ALL"
                      ? "bg-accent text-white shadow-sm"
                      : "border border-border bg-surface text-text hover:bg-bg"
                  }`}
                >
                  Tüm Katlar ({rooms.length})
                </button>
                {uniqueFloorNumbers.map((fn) => {
                  const count = rooms.filter((r) => (r.floorNumber ?? 0) === fn).length;
                  return (
                    <button
                      key={fn}
                      type="button"
                      onClick={() => setSelectedFloor(fn)}
                      className={`rounded-xl px-3 py-1.5 font-bold transition whitespace-nowrap ${
                        selectedFloor === fn
                          ? "bg-accent text-white shadow-sm"
                          : "border border-border bg-surface text-text hover:bg-bg"
                      }`}
                    >
                      Kat {fn} ({count})
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Katlara Göre Gruplanmış ve Tıklayınca Açılan Kat Listesi */}
            {groupedByFloor
              .filter((grp) => selectedFloor === "ALL" || grp.floorNumber === selectedFloor)
              .map((grp) => {
                const isExpanded = expandedFloors[grp.floorNumber] ?? true;
                const criticalCount = grp.rooms.filter(
                  (r) => r.rank === 1 || r.isCritical || r.isCriticalClash,
                ).length;

                return (
                  <div
                    key={grp.floorNumber}
                    className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm"
                  >
                    {/* Kat Başlığı - Tıklanabilir Accordion */}
                    <button
                      type="button"
                      onClick={() => toggleFloor(grp.floorNumber)}
                      className="w-full flex items-center justify-between p-4 bg-surface hover:bg-bg/60 transition text-left border-b border-border/70"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white font-bold text-xs">
                          {grp.floorNumber}
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-text">{grp.floorName}</h3>
                          <p className="text-xs text-muted">
                            {grp.rooms.length} oda bekliyor
                            {criticalCount > 0 ? (
                              <span className="text-danger font-bold ml-1">· {criticalCount} kritik</span>
                            ) : null}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                          {isExpanded ? "Oda Listesini Gizle" : "Odaları Göster"}
                          <Icon name="chevron-down" size={14} className={isExpanded ? "rotate-180" : undefined} />
                        </span>
                      </div>
                    </button>

                    {/* Katın Odaları Listesi */}
                    {isExpanded ? (
                      <div className="p-3 space-y-2.5 bg-bg/40">
                        {grp.rooms.map((rm, idx) =>
                          renderRoomCard(rm, idx, selectedHotelId !== "ALL" ? selectedHotelId : undefined, requireQrForControl),
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        )}
      </main>
    </div>
  );
}
