"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AppProps } from "@/shell/registry";
import { radarHotelsAction } from "../server/actions/radar";
import { RadarRoot, type RadarInitial } from "./RadarRoot";
import "./radar.css";

type Boot = { hotels: RadarInitial["hotels"] } | { error: string } | null;

/** XP app `core.radar` (CR-RAD): learns the hotels in scope, then hands over to the radar. */
export function RadarWindow({ setTitle, setStatus, openApp }: AppProps) {
  const [boot, setBoot] = useState<Boot>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTitle?.("Canlı Radar");
    radarHotelsAction().then(
      (r) => {
        if (cancelled) return;
        setBoot(r.ok ? { hotels: r.data } : { error: r.error.message });
      },
      () => {
        if (!cancelled) setBoot({ error: "Sunucuya ulaşılamadı." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, setTitle]);

  const initial = useMemo<RadarInitial | null>(
    () =>
      boot && "hotels" in boot && boot.hotels.length > 0
        ? { hotels: boot.hotels, hotelId: boot.hotels.length > 1 ? "ALL" : boot.hotels[0].id }
        : null,
    [boot],
  );
  const chrome = useMemo(() => ({ setTitle, setStatus }), [setTitle, setStatus]);

  if (!boot) return <div className="rd-center" role="status">Radar açılıyor</div>;
  if ("error" in boot) {
    return (
      <div className="rd-center" role="alert">
        <EmptyState title="Radar açılamadı" hint={boot.error} icon={<Icon name="wifi-off" size={32} />} />
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Tekrar dene
        </button>
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="rd-center">
        <EmptyState title="İzlenecek otel yok" hint="Hesabınızda Canlı Radar yetkisi olan bir otel görünmüyor." />
      </div>
    );
  }
  return <RadarRoot mode="window" initial={initial} openApp={(id) => openApp(id)} chrome={chrome} />;
}
