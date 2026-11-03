"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { RoomCardData } from "@/modules/minibar/server/minibarTypes";

interface FloorResponse {
  floor: { id: string; number: number; name: string; hotelId: string };
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
  };
}

type FilterKey = "all" | "occupied" | "empty" | "arrival" | "departure" | "dnd" | "mybar";

export default function KatDolulukDetailPage() {
  const params = useParams<{ floorId: string }>();
  const floorId = params?.floorId;

  const [data, setData] = useState<FloorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const loadFloor = async () => {
    if (!floorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/minibar/floor/${floorId}`);
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
  };

  useEffect(() => {
    const t = setTimeout(() => void loadFloor(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorId]);

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
        return rm.checkStatus === "dnd";
      case "mybar":
        return rm.hasMybarRequest;
      default:
        return true;
    }
  });

  return (
    <div className="min-h-screen bg-bg text-text">

      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/kat"
              style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text hover:bg-bg"
            >
              <Icon name="arrow-left" size={16} />
              Katlar
            </Link>
            <div>
              <h1 className="text-lg font-bold">
                {data ? `${data.floor.name} — Oda Doluluk Planı` : "Kat Odaları"}
              </h1>
              <p className="text-xs text-muted">
                Odaya dokunarak minibar kontrol ekranını açabilirsiniz
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
                  ["mybar", `MyBar Talebi (${data.stats.mybar})`],
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
                  const statusTone =
                    room.status === "clash"
                      ? "border-danger/60 bg-danger/10"
                      : room.status === "arrival"
                        ? "border-accent/50 bg-accent/10"
                        : room.status === "departure"
                          ? "border-warn/50 bg-warn/10"
                          : room.status === "in_house"
                            ? "border-ok/40 bg-surface"
                            : "border-border bg-surface opacity-75";

                  const badgeTone =
                    room.status === "clash"
                      ? "bg-danger/20 text-danger"
                      : room.status === "arrival"
                        ? "bg-accent/20 text-accent"
                        : room.status === "departure"
                          ? "bg-warn/20 text-warn"
                          : room.status === "in_house"
                            ? "bg-ok/20 text-ok"
                            : "bg-bg text-muted";

                  return (
                    <Link
                      key={room.id}
                      href={`/kat/oda-kontrol/${room.id}`}
                      className={`group flex flex-col justify-between rounded-2xl border p-4 transition hover:border-accent ${statusTone}`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xl font-bold text-text group-hover:text-accent transition tabular-nums">
                              Oda {room.number}
                            </span>
                            <p className="text-xs text-muted">{room.roomTypeName}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeTone}`}>
                            {room.statusLabel}
                          </span>
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
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border pt-2.5 text-xs">
                        <div>
                          {room.checkStatus === "completed" ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-ok">
                              <Icon name="check" size={14} />
                              Kontrol Edildi
                            </span>
                          ) : room.checkStatus === "dnd" ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-warn">
                              <Icon name="moon" size={14} />
                              DND ({room.dndCount})
                            </span>
                          ) : (
                            <span className="text-muted">Kontrol Bekliyor</span>
                          )}
                        </div>

                        {room.hasMybarRequest ? (
                          <span className="rounded-md bg-danger px-2 py-0.5 text-xs font-bold text-white">
                            MyBar!
                          </span>
                        ) : (
                          <span className="text-accent group-hover:translate-x-0.5 transition">
                            Kontrol →
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
