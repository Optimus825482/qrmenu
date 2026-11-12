"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";
import { usePushSubscription } from "@/shell/push/usePushSubscription";

export type NotificationPermissionGateProps = {
  screen?: "Garson" | "Şef / Mutfak" | string;
  /** What the notifications are about: decides the explanation text. */
  subject?: "orders" | "minibar";
};

const WHAT: Record<"orders" | "minibar", { missed: string; needed: string }> = {
  orders: {
    missed: "Yeni sipariş ve masa çağrılarını",
    needed: "Yeni siparişler, masa çağrıları ve durum güncellemelerini",
  },
  minibar: {
    missed: "Yeni MyBar taleplerini, DND ve stok uyarılarını",
    needed: "Yeni MyBar talepleri, DND hatırlatmaları ve stok uyarılarını",
  },
};

export function NotificationPermissionGate({ screen = "Garson / Şef", subject = "orders" }: NotificationPermissionGateProps) {
  const what = WHAT[subject];
  // Unknown until mounted: the server cannot read the browser's permission, so both render nothing first.
  const [permission, setPermission] = useState<NotificationPermission | "unsupported" | null>(null);
  const { enable: enablePush } = usePushSubscription();

  const checkPermission = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      if (res === "granted") {
        void enablePush().catch(() => {});
      }
    } catch {
      checkPermission();
    }
  }, [checkPermission, enablePush]);

  useEffect(() => {
    // Deferred: react-hooks/set-state-in-effect rejects a direct call that ends in setState.
    const first = window.setTimeout(checkPermission, 0);
    // Sayfa açıldığında henüz sorulmamışsa doğrudan izin penceresini tetikle
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
        .then((res) => {
          setPermission(res);
          if (res === "granted") void enablePush().catch(() => {});
        })
        .catch(checkPermission);
    }

    // Kullanıcı tarayıcı ayarlarından (adres çubuğundaki kilit simgesi vb.) izni açarsa anında algıla
    const interval = window.setInterval(checkPermission, 1500);
    window.addEventListener("focus", checkPermission);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("focus", checkPermission);
    };
  }, [checkPermission, enablePush]);

  // Bildirim izni verilmişse veya tarayıcı desteklemiyorsa hiçbir engel gösterme
  if (permission === null || permission === "granted" || permission === "unsupported") {
    return null;
  }

  const isDenied = permission === "denied";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-0 z-50 mb-3 w-full rounded-xl border-2 p-4 shadow-xl transition-all"
      style={{
        backgroundColor: isDenied ? "#fef2f2" : "#fef3c7",
        borderColor: isDenied ? "#ef4444" : "#f59e0b",
        color: isDenied ? "#991b1b" : "#92400e",
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
            style={{ backgroundColor: isDenied ? "#ef4444" : "#f59e0b" }}
          >
            <Icon name={isDenied ? "warning" : "bell"} size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base">
                {screen} Ekranı · Bildirim İzni Gerekli
              </span>
              <span
                className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: isDenied ? "#b91c1c" : "#b45309" }}
              >
                {isDenied ? "Engellendi" : "Zorunlu"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed sm:text-sm">
              {isDenied
                ? `Tarayıcınızda bildirimler engellenmiş! ${what.missed} kaçırmamak için lütfen adres çubuğundaki kilit (site ayarları) simgesine tıklayıp Bildirimler'e 'İzin Ver' seçeneğini işaretleyin.`
                : `${what.needed} anında alabilmek için bildirim izni vermeniz zorunludur.`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 pt-1 sm:pt-0">
          {isDenied ? (
            <button
              type="button"
              onClick={checkPermission}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-red-700 active:scale-95 transition-all"
            >
              <Icon name="refresh" size={15} />
              İzni Tekrar Kontrol Et
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void requestPermission()}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-amber-700 active:scale-95 transition-all"
            >
              <Icon name="bell" size={16} />
              Bildirimlere İzin Ver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
