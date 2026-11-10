import type { RoleKind } from "@/generated/prisma/client";

export const MYBAR_NOTIFY_ROLES = ["R-KAT", "R-DEP", "R-OTM"] as const;
export const MYBAR_ACK_ROLE_CODES = ["R-KAT"] as const;
/** Who is told when no floor attendant has seen a request for `radar.mybarStaleMinutes`. */
export const MYBAR_ESCALATE_ROLES = ["R-DEP", "R-OTM"] as const;
export const MYBAR_EVENT_ROLE_KINDS: RoleKind[] = ["MINIBAR", "YONETIM", "SISTEM"];
export const MYBAR_NOTE_MAX = 500;
export const MYBAR_QTY_CAP = 20;
export const MYBAR_SUBMIT_LIMIT = { max: 30, windowMs: 60_000 };
export const EXPLANATION_RULE = { minChars: 10, minWords: 3 };

export function isValidExplanation(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= EXPLANATION_RULE.minChars &&
    trimmed.split(/\s+/).filter((word) => word.length > 1).length >= EXPLANATION_RULE.minWords;
}

// Client-safe registry, also re-exported by the server publication module.
export const MYBAR_EVENTS = [
  "mybar.created", "mybar.seen", "mybar.fulfilled", "mybar.completed", "mybar.cancelled", "scan.room",
] as const;
