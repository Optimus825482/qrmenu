"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";

interface RoomQrModalProps {
  roomNumber: string;
  floorName: string;
  roomTypeName: string;
  qrToken: string;
  onClose: () => void;
}

export function RoomQrModal({
  roomNumber,
  floorName,
  roomTypeName,
  qrToken,
  onClose,
}: RoomQrModalProps) {
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));
  const [copied, setCopied] = useState(false);

  const guestUrl = origin ? `${origin}/q/${qrToken}` : `/q/${qrToken}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(
    guestUrl,
  )}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Kopyalanamadı.
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-qr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface text-text shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-accent">
              Oda QR Kod
            </span>
            <h2 id="room-qr-modal-title" className="text-lg font-bold text-text">
              Oda {roomNumber} ({floorName})
            </h2>
            <p className="text-xs text-muted">{roomTypeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: "var(--tap-action)", minWidth: "var(--tap-action)" }}
            className="inline-flex items-center justify-center gap-1 rounded-xl border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-text hover:bg-surface"
          >
            <Icon name="close" size={16} />
            Kapat
          </button>
        </div>

        <div className="p-6 flex flex-col items-center space-y-4">
          <div className="rounded-2xl bg-white p-4 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImageUrl}
              alt={`Oda ${roomNumber} QR Kod`}
              className="h-56 w-56 object-contain"
            />
          </div>

          <div className="w-full rounded-xl border border-border bg-bg p-3 text-center">
            <p className="text-xs uppercase tracking-wider text-muted">QR Token / Kod</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-accent">{qrToken}</p>
            <p className="mt-1 truncate text-xs text-muted">{guestUrl}</p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleCopy()}
              style={{ minHeight: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-bg px-4 py-2.5 text-xs font-semibold text-text hover:bg-surface"
            >
              <Icon name="link" size={16} />
              {copied ? "Bağlantı Kopyalandı" : "Bağlantıyı Kopyala"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              style={{ minHeight: "var(--tap-action)" }}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white hover:opacity-95"
            >
              <Icon name="printer" size={16} />
              QR Etiket Yazdır
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
