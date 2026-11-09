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

interface PriorityPlanResponse {
  rooms?: PriorityPlanEntry[];
  entries?: PriorityPlanEntry[];
  floors?: PlanFloor[];
  summary?: { total: number; critical: number; normal: number; clashes: number };
  briefing?: string[];
  requireQrForControl?: boolean;
  error?: string;
}

export default function KatTavsiyeIsPlaniPage() {
  const [rooms, setRooms] = useState<PriorityPlanEntry[]>([]);
  const [floors, setFloors] = useState<PlanFloor[]>([]);
  const [summary, setSummary] = useState<{ total: number; critical: number; normal: number; clashes: number } | null>(null);
  const [briefing, setBriefing] = useState<string[]>([]);
  const [requireQrForControl, setRequireQrForControl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI States: Selected Floor Filter & Accordion
  const [selectedFloor, setSelectedFloor] = useState<number | "ALL">("ALL");
  const [expandedFloors, setExpandedFloors] = useState<Record<number, boolean>>({});
  const [showGuide, setShowGuide] = useState(true);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/minibar/priority-plan");
      const json = (await res.json()) as PriorityPlanResponse;
      if (!res.ok) throw new Error(json.error ?? "Tavsiye planı alınamadı.");

      const allEntries = json.rooms ?? json.entries ?? [];
      setRooms(allEntries);
      setFloors(json.floors ?? []);
      setSummary(json.summary ?? null);
      setBriefing(json.briefing ?? []);
      setRequireQrForControl(Boolean(json.requireQrForControl));

      // Varsayılan olarak tüm katları açık yap
      const exp: Record<number, boolean> = {};
      allEntries.forEach((r) => {
        const fn = r.floorNumber ?? 0;
        exp[fn] = true;
      });
      setExpandedFloors(exp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => void loadPlan(), 0);
    return () => clearTimeout(t);
  }, []);

  const toggleFloor = (floorNumber: number) => {
    setExpandedFloors((prev) => ({
      ...prev,
      [floorNumber]: !prev[floorNumber],
    }));
  };

  // Katlara göre gruplanmış odalar
  const groupedByFloor = useMemo(() => {
    const map = new Map<number, { floorName: string; rooms: PriorityPlanEntry[] }>();
    rooms.forEach((r) => {
      const fn = r.floorNumber ?? 0;
      const current = map.get(fn) ?? { floorName: r.floorName ?? `Kat ${fn}`, rooms: [] };
      current.rooms.push(r);
      map.set(fn, current);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([floorNumber, data]) => ({ floorNumber, ...data }));
  }, [rooms]);

  const uniqueFloorNumbers = useMemo(() => {
    const set = new Set<number>();
    rooms.forEach((r) => set.add(r.floorNumber ?? 0));
    return Array.from(set).sort((a, b) => a - b);
  }, [rooms]);

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

        {/* Yazılı Plan Rehberi ve Çalışma Mantığı */}
        <section className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-bg/50 transition"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent font-bold text-sm">
                📋
              </span>
              <div>
                <h2 className="text-sm font-bold text-text">Tavsiye Edilen İş Planı Nasıl Çalışır?</h2>
                <p className="text-xs text-muted">Öncelik sıralaması ve akıllı rota optimizasyonu detayları</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-accent flex items-center gap-1">
              {showGuide ? "Gizle ▲" : "Açıkla ▼"}
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

        {/* Loading / Error States */}
        {loading ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">
            Akıllı iş planı hesaplanıyor...
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
            {error}
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
            Bugün için bekleyen oda kontrol görevi bulunmuyor.
          </div>
        ) : (
          /* Katlara Göre Gruplanmış ve Tıklayınca Açılan Kat Listesi */
          <div className="space-y-4">
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
                        <span className="text-xs font-semibold text-muted">
                          {isExpanded ? "Oda Listesini Gizle ▲" : "Odaları Göster ▼"}
                        </span>
                      </div>
                    </button>

                    {/* Katın Odaları Listesi */}
                    {isExpanded ? (
                      <div className="p-3 space-y-2.5 bg-bg/40">
                        {grp.rooms.map((rm, idx) => {
                          const isClash = rm.rank === 1 || rm.isCriticalClash || Boolean(rm.clash?.critical);
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
                                      <span className="rounded-full bg-danger text-white px-2 py-0.5 text-[11px] font-bold animate-pulse">
                                        🚨 Kritik Çakışma
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
                              {requireQrForControl ? (
                                <Link
                                  href="/kat/qr"
                                  style={{ minHeight: "var(--tap-action)" }}
                                  className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 shadow-sm transition"
                                >
                                  <Icon name="camera" size={15} />
                                  QR Okut
                                </Link>
                              ) : (
                                <Link
                                  href={`/kat/oda-kontrol/${rm.roomId}`}
                                  style={{ minHeight: "var(--tap-action)" }}
                                  className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition"
                                >
                                  Kontrol Et
                                  <Icon name="arrow-right" size={14} />
                                </Link>
                              )}
                            </div>
                          );
                        })}
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
