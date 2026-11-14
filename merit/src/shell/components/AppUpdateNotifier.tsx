"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AUTO_UPDATED_KEY } from "../staleBuildReload";
import { useAppUpdate } from "../useAppUpdate";
import { updatedNoticeShouldClose } from "../updatedNotice";
import { Icon } from "@/components/icons/Icon";

const subscribeNever = () => () => {};

/** The page reloaded itself into the new version (staleBuildReload). Kept until the notice is closed. */
function readAutoUpdated(): boolean {
  try {
    return sessionStorage.getItem(AUTO_UPDATED_KEY) === "1";
  } catch {
    return false;
  }
}

function forgetAutoUpdated(): void {
  try {
    sessionStorage.removeItem(AUTO_UPDATED_KEY);
  } catch {
    // storage blocked: nothing to forget
  }
}

/**
 * After an idle page updated itself, a notice says so (the version and what is new), so the user knows the
 * app changed even though they never pressed "Güncelle". The page usually reloads while nobody is there, so
 * the notice waits for somebody to come back (updatedNoticeShouldClose) instead of closing on a plain timer.
 */
function AutoUpdatedNotice({ version, highlights }: { version: string; highlights: string[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setOpen(readAutoUpdated()), 0);
    return () => clearTimeout(show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const shownAt = Date.now();
    let seenAt: number | null = null;
    const unattendedScreen = window.location.pathname.startsWith("/radar");
    const markSeen = () => {
      if (seenAt === null) seenAt = Date.now();
    };
    const activity = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of activity) window.addEventListener(e, markSeen, { passive: true });
    const tick = setInterval(() => {
      const now = Date.now();
      const close = updatedNoticeShouldClose({
        shownForMs: now - shownAt,
        sinceSeenMs: seenAt === null ? null : now - seenAt,
        unattendedScreen,
      });
      if (close) {
        forgetAutoUpdated();
        setOpen(false);
      }
    }, 1_000);
    return () => {
      clearInterval(tick);
      for (const e of activity) window.removeEventListener(e, markSeen);
    };
  }, [open]);

  const close = () => {
    forgetAutoUpdated();
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="app-auto-updated"
      style={{
        position: "fixed",
        zIndex: 999999,
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "max(18px, env(safe-area-inset-bottom, 18px))",
        width: "calc(100% - 32px)",
        maxWidth: "460px",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #0b1a2d 0%, #112845 100%)",
          color: "#ffffff",
          borderRadius: "16px",
          padding: "16px 18px",
          border: "1px solid rgba(212, 175, 55, 0.4)",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.5)",
          display: "flex",
          gap: "12px",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 36px",
            height: "36px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #d4af37 0%, #aa841c 100%)",
            color: "#0b1a2d",
          }}
        >
          <Icon name="check-circle" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "14px", fontWeight: 700 }}>Sistem güncellendi · v{version}</div>
          <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "#cbd5e1" }}>
            Uygulama yeni sürüme otomatik geçti; ekran yenilendi.
          </p>
          {highlights.length > 0 ? (
            <ul style={{ margin: "6px 0 0", paddingLeft: "16px", fontSize: "11.5px", color: "#93c5fd" }}>
              {highlights.slice(0, 2).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={close}
          style={{
            minHeight: "36px",
            padding: "0 14px",
            background: "rgba(255, 255, 255, 0.08)",
            color: "#e2e8f0",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "10px",
            fontWeight: 600,
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Tamam
        </button>
      </div>
    </div>
  );
}

export function AppUpdateNotifier() {
  const {
    hasUpdate,
    isUpdating,
    isStandalone,
    currentVersion,
    serverInfo,
    applyUpdate,
    dismissUpdate,
  } = useAppUpdate();

  // "server" during SSR / hydration, then the client view; guest QR pages (/q/...) never show the notice.
  const view = useSyncExternalStore(
    subscribeNever,
    () => (window.location.pathname.startsWith("/q/") ? "guest" : "app"),
    () => "server",
  );

  if (view !== "app") return null;
  if (!hasUpdate) return <AutoUpdatedNotice version={serverInfo?.version ?? currentVersion} highlights={serverInfo?.highlights ?? []} />;

  const targetVersion = serverInfo?.version ?? currentVersion;
  const highlights = serverInfo?.highlights ?? [
    "Performans ve kararlılık geliştirmeleri",
    "Yeni operasyonel özellikler ve düzeltmeler",
  ];

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: "fixed",
        zIndex: 999999,
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "max(18px, env(safe-area-inset-bottom, 18px))",
        width: "calc(100% - 32px)",
        maxWidth: "460px",
        pointerEvents: "auto",
        animation: "slideUpFade 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #0b1a2d 0%, #112845 100%)",
          color: "#ffffff",
          borderRadius: "16px",
          padding: "18px 20px",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(212, 175, 55, 0.35)",
          border: "1px solid rgba(212, 175, 55, 0.4)",
          backdropFilter: "blur(12px)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #d4af37 0%, #aa841c 100%)",
                color: "#0b1a2d",
                fontSize: "18px",
                boxShadow: "0 2px 8px rgba(212, 175, 55, 0.4)",
              }}
            >
              <Icon name="rocket" size={18} />
            </span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", letterSpacing: "0.02em" }}>
                  Sistem Güncellemesi
                </span>
                <span
                  style={{
                    background: "rgba(212, 175, 55, 0.2)",
                    color: "#f5d77f",
                    border: "1px solid rgba(212, 175, 55, 0.4)",
                    borderRadius: "6px",
                    padding: "1px 7px",
                    fontSize: "11px",
                    fontWeight: "600",
                    fontFamily: "monospace",
                  }}
                >
                  v{targetVersion}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
                {isStandalone ? "Kurulu Uygulama için yeni sürüm hazır" : "Yeni sürüm yayında"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissUpdate}
            aria-label="Kapat ve daha sonra hatırlat"
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: "18px",
              lineHeight: 1,
              borderRadius: "6px",
            }}
          >
            <Icon name="close" size={16} title="Kapat" />
          </button>
        </div>

        {/* Message body */}
        <div style={{ fontSize: "12.5px", color: "#cbd5e1", lineHeight: 1.45 }}>
          Uygulamanın yeni özellikler ve operasyonel geliştirmeler içeren güncel sürümüne geçmek için
          lütfen güncelleyin.
          {highlights.length > 0 && (
            <ul
              style={{
                margin: "6px 0 0 0",
                paddingLeft: "16px",
                fontSize: "11.5px",
                color: "#93c5fd",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              {highlights.slice(0, 2).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginTop: "4px",
          }}
        >
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => void applyUpdate()}
            style={{
              flex: 1,
              minHeight: "44px",
              background: "linear-gradient(135deg, #d4af37 0%, #b89125 100%)",
              color: "#0b1a2d",
              border: "none",
              borderRadius: "10px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: isUpdating ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 12px rgba(212, 175, 55, 0.3)",
              transition: "all 0.2s ease",
            }}
          >
            {isUpdating ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: "14px",
                    height: "14px",
                    border: "2px solid #0b1a2d",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                Güncelleniyor...
              </>
            ) : (
              <>
                <Icon name="refresh" size={14} /> Şimdi Güncelle
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isUpdating}
            onClick={dismissUpdate}
            style={{
              minHeight: "44px",
              padding: "0 16px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#94a3b8",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: "10px",
              fontWeight: "600",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Daha Sonra
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
