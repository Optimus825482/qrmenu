import type { ReactNode } from "react";

export type MobileTabId = "izleme" | "raporlar" | "bildirimler" | "tanimlar" | "ayarlar";

const PATHS: Record<MobileTabId, ReactNode> = {
  // pulse line
  izleme: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  // bar chart
  raporlar: <path d="M5 20V10M12 20V4M19 20v-7" />,
  // bell
  bildirimler: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  // list
  tanimlar: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  // sliders
  ayarlar: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
};

/** 24 px outline pictogram of a bottom tab (stroke follows the text color). */
export function TabIcon({ id }: { id: MobileTabId }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[id]}
    </svg>
  );
}

export type NavGlyphId = "back" | "home" | "recents" | "close" | "signal" | "signal-off";

const NAV_PATHS: Record<NavGlyphId, ReactNode> = {
  back: <path d="M15 5 7 12l8 7z" />,
  home: <circle cx="12" cy="12" r="6.5" />,
  recents: <rect x="6" y="6" width="12" height="12" rx="2" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  // Wi-Fi arcs: the live (SSE) connection.
  signal: (
    <>
      <path d="M3 9.5a13 13 0 0 1 18 0M6.5 13a8 8 0 0 1 11 0M10 16.5a3 3 0 0 1 4 0" />
      <path d="M12 19.5h.01" />
    </>
  ),
  "signal-off": (
    <>
      <path d="M6.5 13a8 8 0 0 1 3-1.9M14.5 11.1a8 8 0 0 1 3 1.9M10 16.5a3 3 0 0 1 4 0M4 4l16 16" />
      <path d="M12 19.5h.01" />
    </>
  ),
};

/** Outline glyph of the system chrome (navigation buttons, status bar). */
export function NavGlyph({ id, size = 22 }: { id: NavGlyphId; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {NAV_PATHS[id]}
    </svg>
  );
}
