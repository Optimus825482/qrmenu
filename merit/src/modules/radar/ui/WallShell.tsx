"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { CONNECTION_TEXT, type ConnectionState } from "./Toolbar";
import { acquireWakeLock } from "./wakeLock";

export type WallShellProps = {
  hotelName: string;
  clockText: string;
  connection: ConnectionState;
  rotationLabel: string;
  soundEnabled: boolean;
  onToggleSound(): void;
  onWakeLockStatus?(ok: boolean): void;
  wakeLockAvailable?: boolean;
};

export function WallShell({
  hotelName,
  clockText,
  connection,
  rotationLabel,
  soundEnabled,
  onToggleSound,
  onWakeLockStatus,
  wakeLockAvailable = true,
}: WallShellProps) {
  const [fsError, setFsError] = useState<string | null>(null);
  const lockRef = useRef<{ release(): void } | null>(null);

  useEffect(() => {
    return () => {
      lockRef.current?.release();
      lockRef.current = null;
    };
  }, []);

  const handleStartFullscreen = () => {
    setFsError(null);
    lockRef.current?.release();
    lockRef.current = acquireWakeLock(undefined, undefined, (ok) => {
      onWakeLockStatus?.(ok);
    });
    if (typeof document !== "undefined" && document.documentElement?.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => {
        setFsError("Tam ekran tarayıcı tarafından reddedildi.");
      });
    }
  };

  return (
    <header className="rd-wall-header" role="banner" aria-label="Duvar ekranı üst çubuğu">
      <div className="rd-wall-brand">
        <Icon name="radar" size={20} />
        <strong>{hotelName || "Canlı Radar"}</strong>
        <span className="rd-wall-clock">{clockText}</span>
      </div>

      <div className="rd-wall-meta">
        <span className="rd-wall-rotation" role="status" aria-live="polite">
          {rotationLabel}
        </span>
        {!wakeLockAvailable ? (
          <span className="rd-muted rd-small">Ekran uyku kilidi yok</span>
        ) : null}
        {fsError ? (
          <span className="rd-error-text" role="alert">
            {fsError}
          </span>
        ) : null}
        <button
          type="button"
          className="rd-chip"
          aria-pressed={soundEnabled}
          onClick={onToggleSound}
        >
          <Icon name={soundEnabled ? "volume" : "volume-off"} size={16} />
          <span>Ses</span>
        </button>
        <button
          type="button"
          className="rd-chip rd-wall-fs-btn"
          onClick={handleStartFullscreen}
        >
          <Icon name="fullscreen" size={16} />
          <span>Tam ekran başlat</span>
        </button>
        <span className="rd-conn" data-state={connection} role="status">
          <Icon name={connection === "offline" ? "wifi-off" : "wifi"} size={16} />
          <span>{CONNECTION_TEXT[connection]}</span>
        </span>
      </div>
    </header>
  );
}
