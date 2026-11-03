/** KDS süre rozeti: yeşil < 5 dk, sarı 5–10 dk, kırmızı ≥ 10 dk (spec §7.3). */
export type AgeTone = "ok" | "warn" | "late";

export const KDS_WARN_SEC = 300;
export const KDS_LATE_SEC = 600;

export function kdsTone(ageSec: number): AgeTone {
  if (ageSec >= KDS_LATE_SEC) return "late";
  if (ageSec >= KDS_WARN_SEC) return "warn";
  return "ok";
}

/** 60 sn altı "45 sn", sonrası tam dakika "12 dk". */
export function formatAge(ageSec: number): string {
  const sec = Math.max(0, Math.floor(ageSec));
  if (sec < 60) return `${sec} sn`;
  return `${Math.floor(sec / 60)} dk`;
}
