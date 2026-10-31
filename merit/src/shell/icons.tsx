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
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name] ?? GLYPHS.pencere}
    </svg>
  );
}
