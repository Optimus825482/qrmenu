"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { LogoutButton } from "@/components/LogoutButton";
import { OutletSwitcher, type OutletTarget } from "@/components/ops/OutletSwitcher";
import type { SseStatus } from "@/shell/useSse";
import type { FullscreenPhase } from "./FullscreenGate";
import { setMuted, unlockAudio, useSoundState } from "./soundGate";
import type { PrinterState } from "./usePrinterStatus";

export type PosStatusBarProps = {
  connection: SseStatus;
  printer: { state: PrinterState; reason?: string; href: string } | null;
  phase: FullscreenPhase;
  wake: { supported: boolean; held: boolean; wanted: boolean };
  onStartFullscreen: () => void;
  pending: { orders: number; calls: number } | null;
  outletName: string;
  fullName: string;
  targets: OutletTarget[];
};

const CONNECTION: Record<SseStatus, { text: string; state?: "bad" | "warn" }> = {
  open: { text: "Canlı" },
  connecting: { text: "Bağlanıyor", state: "warn" },
  closed: { text: "Kopuk", state: "bad" },
};

function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono font-semibold">{now}</span>;
}

/** Alt durum şeridi: bağlantı, yazıcı, ses kapısı, tam ekran/uyku kilidi, bekleyen sayılar, saat, kullanıcı. */
export function PosStatusBar({ connection, printer, phase, wake, onStartFullscreen, pending, outletName, fullName, targets }: PosStatusBarProps) {
  const sound = useSoundState();
  const conn = CONNECTION[connection];
  return (
    <footer className="pos-strip" aria-label="Durum şeridi">
      <span className="pos-strip-item" data-state={conn.state} role="status">
        <Icon name={connection === "open" ? "wifi" : "wifi-off"} size={20} />
        {conn.text}
      </span>

      {printer ? (
        <Link href={printer.href} className="pos-strip-item" data-state={printer.state === "error" ? "bad" : printer.state === "unknown" ? "warn" : undefined}>
          <Icon name="printer" size={20} />
          Yazıcı: {printer.state === "ok" ? "Hazır" : printer.state === "error" ? `Hata${printer.reason ? ` (${printer.reason})` : ""}` : "Bilinmiyor"}
        </Link>
      ) : null}

      {sound === "unsupported" ? (
        <span className="pos-strip-item" data-state="warn">
          <Icon name="volume-off" size={20} />
          Ses: Desteklenmiyor
        </span>
      ) : (
        <button
          type="button"
          className="pos-strip-item"
          data-state={sound === "locked" ? "warn" : undefined}
          onClick={() => (sound === "locked" ? void unlockAudio() : setMuted(sound === "on"))}
        >
          <Icon name={sound === "on" ? "volume" : "volume-off"} size={20} />
          {sound === "locked" ? "Ses: Etkinleştirmek için dokunun" : sound === "on" ? "Ses: Açık" : "Ses: Kapalı"}
        </button>
      )}

      {phase === "failed" ? (
        <button type="button" className="pos-strip-item" data-state="bad" onClick={onStartFullscreen}>
          <Icon name="fullscreen" size={20} />
          Tam ekran başlatılamadı
        </button>
      ) : phase === "exited" ? (
        <button type="button" className="pos-strip-item" data-state="warn" onClick={onStartFullscreen}>
          <Icon name="fullscreen" size={20} />
          Tam ekran kapandı — yeniden başlat
        </button>
      ) : phase === "dismissed" ? (
        <button type="button" className="pos-strip-item" onClick={onStartFullscreen}>
          <Icon name="fullscreen" size={20} />
          Tam ekranı başlat
        </button>
      ) : null}

      {wake.wanted && !wake.supported ? (
        <span className="pos-strip-item" data-state="warn">
          Uyku kilidi desteklenmiyor
        </span>
      ) : null}

      {pending ? (
        <span className="pos-strip-item">
          Onay bekleyen: <strong>{pending.orders}</strong> · Açık çağrı: <strong>{pending.calls}</strong>
        </span>
      ) : null}

      <span className="pos-strip-item ml-auto">
        <Clock />
      </span>
      <span className="pos-strip-item">
        {outletName} · {fullName}
      </span>
      <OutletSwitcher targets={targets} className="pos-strip-select" />
      <LogoutButton className="pos-strip-item font-semibold underline" />
    </footer>
  );
}
