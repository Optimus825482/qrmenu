"use client";

import { useMemo, useRef } from "react";
import type { RoomQrPrintSheet as PrintData } from "../server/roomQr";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Yalniz uygulama ici yol veya http(s) adresi; baska sema (javascript:, data:) gosterilmez. */
const safeLogo = (url: string | null) => (url && /^(\/(?!\/)|https?:\/\/)/i.test(url) ? url : null);

/** Baski belgesi: her oda icin bir kart (otel, oda, kat, QR). SVG'ler sunucuda uretilmis QR'lardir. */
export function buildPrintHtml(data: PrintData): string {
  const logo = safeLogo(data.hotel.logoUrl);
  const cards = data.cards
    .map(
      (c) => `<section class="card">
  ${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : ""}
  <div class="hotel">${esc(data.hotel.name)}</div>
  <div class="qr">${c.svg}</div>
  <div class="room">Oda ${esc(c.roomNumber)}</div>
  <div class="floor">${esc(c.floorName)}</div>
  <div class="cta">Hizmetler için kameranızla okutunuz</div>
  <div class="cta en">Scan with your camera for services</div>
</section>`,
    )
    .join("\n");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Oda QR Kartları</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8mm;padding:8mm}
.card{border:1px solid #cbd5e1;border-radius:4mm;padding:6mm;text-align:center;break-inside:avoid;page-break-inside:avoid}
.logo{max-height:12mm;max-width:40mm;object-fit:contain;margin-bottom:2mm}
.hotel{font-size:12pt;font-weight:700;letter-spacing:.04em}
.qr{width:48mm;margin:4mm auto}
.qr svg{width:100%;height:auto;display:block}
.room{font-size:20pt;font-weight:800}
.floor{font-size:11pt;color:#475569;margin-bottom:3mm}
.cta{font-size:9pt}
.cta.en{color:#64748b;font-size:8pt}
@page{size:A4;margin:0}
@media print{.grid{padding:6mm}}
</style></head><body><div class="grid">${cards}</div></body></html>`;
}

/**
 * Tam ekran baski onizlemesi. Belge ayri bir cerceve (iframe) icinde cizilir; yazdirma yalniz
 * bu cerceveyi basar, uygulama kabugunu degil.
 */
export function RoomQrPrintSheet({ data, onClose }: { data: PrintData; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => buildPrintHtml(data), [data]);

  return (
    <div
      className="fixed inset-0 z-[9000] flex flex-col bg-[#ece9d8]"
      role="dialog"
      aria-label="Oda QR baskı önizlemesi"
      data-testid="room-qr-print-sheet"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#7f9db9] bg-[#f0f0f0] p-2 text-xs">
        <span className="font-bold">
          {data.hotel.name}: {data.cards.length} kart
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="xp-button px-3 py-1 font-bold"
            onClick={() => frame.current?.contentWindow?.print()}
          >
            Yazdır
          </button>
          <button type="button" className="xp-button px-3 py-1 font-bold" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
      <iframe
        ref={frame}
        title="Oda QR kartları"
        className="min-h-0 flex-1 border-0 bg-white"
        sandbox="allow-same-origin allow-modals"
        srcDoc={html}
      />
    </div>
  );
}
