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
