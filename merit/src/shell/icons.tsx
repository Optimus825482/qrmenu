import type { ReactNode } from "react";

/**
 * Inline XP-style pictograms (no external assets). Colors come from theme.css through the
 * `xi-*` classes, so the SVGs carry no color literals. Drawn on a 32×32 grid.
 */

const GLYPHS: Record<string, ReactNode> = {
  // Monitor with a bar chart: Komuta Merkezi.
  komuta: (
    <>
      <rect className="xi-frame" x="2" y="4" width="28" height="19" rx="2" />
      <rect className="xi-screen" x="4.5" y="6.5" width="23" height="14" rx="1" />
      <rect className="xi-green" x="7" y="14" width="3.5" height="5" />
      <rect className="xi-gold" x="12.5" y="10" width="3.5" height="9" />
      <rect className="xi-red" x="18" y="12" width="3.5" height="7" />
      <rect className="xi-light" x="23" y="8.5" width="2.5" height="10.5" />
      <path className="xi-frame" d="M12 23h8l1.5 4h-11z" />
      <rect className="xi-frame" x="8" y="27" width="16" height="2.5" rx="1" />
    </>
  ),
  // Control panel: gear on a window.
  ayarlar: (
    <>
      <rect className="xi-paper" x="3" y="4" width="24" height="22" rx="2" />
      <rect className="xi-blue" x="3" y="4" width="24" height="5" rx="2" />
      <circle className="xi-gray" cx="19" cy="20" r="8" />
      <circle className="xi-paper" cx="19" cy="20" r="3" />
      <path
        className="xi-gray"
        d="M17.5 10h3l.6 2.5-4.2 0zM17.5 30h3l.6-2.5-4.2 0zM9 18.5v3l2.5.6v-4.2zM29 18.5v3l-2.5.6v-4.2z"
      />
    </>
  ),
  // Two people: Online Kullanıcılar.
  online: (
    <>
      <circle className="xi-skin" cx="12" cy="10" r="5" />
      <path className="xi-blue" d="M3 27c0-6 4-9.5 9-9.5s9 3.5 9 9.5z" />
      <circle className="xi-skin" cx="22" cy="12" r="4.5" />
      <path className="xi-green" d="M14 28c0-5.5 3.6-8.5 8-8.5s8 3 8 8.5z" />
      <circle className="xi-ok" cx="27" cy="6" r="3" />
    </>
  ),
  // Staff directory: a small group of users.
  kullanicilar: (
    <>
      <circle className="xi-skin" cx="16" cy="9" r="5" />
      <path className="xi-blue" d="M6 28c0-7 4-11 10-11s10 4 10 11z" />
      <circle className="xi-skin" cx="5.5" cy="14" r="3.5" />
      <path className="xi-green" d="M1 27c0-5 1.8-8 5-9.5 1.8.9 3 2.4 3.7 4.5L8 27z" />
      <circle className="xi-skin" cx="26.5" cy="14" r="3.5" />
      <path className="xi-gold" d="M24.3 22c.7-2.1 1.9-3.6 3.7-4.5 3.2 1.5 5 4.5 5 9.5h-7z" />
    </>
  ),
  ekipler: (
    <>
      <circle className="xi-skin" cx="12" cy="10" r="4.5" />
      <path className="xi-blue" d="M3 27c0-6 3.5-10 9-10s9 4 9 10z" />
      <circle className="xi-skin" cx="24" cy="12" r="3.5" />
      <path className="xi-green" d="M20 26c.2-4.7 1.7-7.4 4.5-8.5 3.8 1.4 5.5 4.2 5.5 8.5z" />
      <circle className="xi-gold" cx="25" cy="6" r="4" />
      <path className="xi-white-stroke" d="M25 4v4M23 6h4" />
    </>
  ),
  // Generic window.
  pencere: (
    <>
      <rect className="xi-paper" x="3" y="5" width="26" height="22" rx="2" />
      <rect className="xi-blue" x="3" y="5" width="26" height="6" rx="2" />
      <rect className="xi-light" x="6" y="14" width="20" height="2" />
      <rect className="xi-light" x="6" y="18" width="14" height="2" />
    </>
  ),
  // Building: hotel cards.
  otel: (
    <>
      <rect className="xi-gold" x="6" y="4" width="20" height="25" rx="1" />
      <rect className="xi-paper" x="9" y="7" width="4" height="4" />
      <rect className="xi-paper" x="19" y="7" width="4" height="4" />
      <rect className="xi-paper" x="9" y="14" width="4" height="4" />
      <rect className="xi-paper" x="19" y="14" width="4" height="4" />
      <rect className="xi-frame" x="14" y="21" width="4" height="8" />
    </>
  ),
  // Four-color flag of the Start button.
  baslat: (
    <>
      <path className="xi-red" d="M4 6c3-1.5 6-1.5 10 0v9c-4-1.5-7-1.5-10 0z" />
      <path className="xi-green" d="M16 6.5c4 1.5 7 1.5 12 0v9c-5 1.5-8 1.5-12 0z" />
      <path className="xi-blue" d="M4 17c3-1.5 6-1.5 10 0v9c-4-1.5-7-1.5-10 0z" />
      <path className="xi-gold" d="M16 17.5c4 1.5 7 1.5 12 0v9c-5 1.5-8 1.5-12 0z" />
    </>
  ),
  // Dialog glyphs.
  soru: (
    <>
      <circle className="xi-blue" cx="16" cy="16" r="13" />
      <path
        className="xi-white-stroke"
        d="M11.5 12.5c0-2.8 2-4.5 4.5-4.5s4.5 1.6 4.5 4c0 3.5-4.5 3.5-4.5 7"
      />
      <circle className="xi-white" cx="16" cy="23.5" r="1.8" />
    </>
  ),
  uyari: (
    <>
      <path className="xi-gold" d="M16 3l14 25H2z" />
      <rect className="xi-frame" x="14.5" y="11" width="3" height="9" rx="1" />
      <circle className="xi-frame" cx="16" cy="24" r="1.8" />
    </>
  ),
  // Clipboard: Denetim Günlüğü.
  denetim: (
    <>
      <rect className="xi-paper" x="6" y="4" width="20" height="25" rx="2" />
      <rect className="xi-blue" x="11" y="2" width="10" height="5" rx="1" />
      <rect className="xi-light" x="9" y="12" width="14" height="2" />
      <rect className="xi-light" x="9" y="16" width="14" height="2" />
      <rect className="xi-light" x="9" y="20" width="9" height="2" />
    </>
  ),
  // Menu card with a fork: Menü Yönetimi.
  menu: (
    <>
      <rect className="xi-paper" x="5" y="3" width="22" height="26" rx="2" />
      <rect className="xi-gold" x="5" y="3" width="22" height="6" rx="2" />
      <rect className="xi-light" x="9" y="13" width="14" height="2" />
      <rect className="xi-light" x="9" y="18" width="10" height="2" />
      <rect className="xi-light" x="9" y="23" width="12" height="2" />
    </>
  ),
  // Palette: Menü Tasarım Merkezi.
  tema: (
    <>
      <path className="xi-gold" d="M16 3C8 3 2.5 8.5 2.5 15.5S8 28 14 28c3 0 2.5-3 4-4 2-1.4 5.5 0 8-2.5C29 19 29.5 3 16 3z" />
      <circle className="xi-red" cx="9" cy="13" r="2.5" />
      <circle className="xi-green" cx="15" cy="9" r="2.5" />
      <circle className="xi-blue" cx="21.5" cy="12" r="2.5" />
    </>
  ),
  // QR code: Masa QR Kodları.
  qr: (
    <>
      <rect className="xi-paper" x="3" y="3" width="26" height="26" rx="2" />
      <rect className="xi-frame" x="6" y="6" width="8" height="8" />
      <rect className="xi-paper" x="8" y="8" width="4" height="4" />
      <rect className="xi-frame" x="18" y="6" width="8" height="8" />
      <rect className="xi-paper" x="20" y="8" width="4" height="4" />
      <rect className="xi-frame" x="6" y="18" width="8" height="8" />
      <rect className="xi-paper" x="8" y="20" width="4" height="4" />
      <rect className="xi-frame" x="18" y="18" width="3" height="3" />
      <rect className="xi-frame" x="23" y="23" width="3" height="3" />
    </>
  ),
  // Printer: Yazıcılar.
  yazici: (
    <>
      <rect className="xi-paper" x="9" y="3" width="14" height="8" />
      <rect className="xi-gray" x="3" y="10" width="26" height="12" rx="2" />
      <rect className="xi-paper" x="9" y="18" width="14" height="10" />
      <rect className="xi-light" x="11" y="21" width="10" height="1.5" />
      <rect className="xi-light" x="11" y="24" width="7" height="1.5" />
      <circle className="xi-ok" cx="25" cy="14" r="1.5" />
    </>
  ),
  bilgi: (
    <>
      <circle className="xi-blue" cx="16" cy="16" r="13" />
      <circle className="xi-white" cx="16" cy="9.5" r="2" />
      <rect className="xi-white" x="14.2" y="13.5" width="3.6" height="10" rx="1" />
    </>
  ),
};

export function XpIcon({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <svg
      className="xp-icon"
      width={size}
      height={size}
      style={{ width: `calc(${size}px * var(--xp-ui-scale, 1))`, height: `calc(${size}px * var(--xp-ui-scale, 1))` }}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name] ?? GLYPHS.pencere}
    </svg>
  );
}
