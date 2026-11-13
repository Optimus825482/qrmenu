import type { OrderKind, OrderStatus } from "@/generated/prisma/client";

/** State machine transitions per OrderKind (MASA and ODA_SERVISI). */
export const ORDER_TRANSITIONS: Record<OrderKind, Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  MASA: {
    GONDERILDI: ["ONAYLANDI", "REDDEDILDI"],
    ONAYLANDI: ["HAZIR", "IPTAL"],
    HAZIR: ["SERVIS_EDILDI", "IPTAL"],
  },
  ODA_SERVISI: {
    GONDERILDI: ["ONAYLANDI", "IPTAL"],
    ONAYLANDI: ["HAZIR", "IPTAL"],
    HAZIR: ["YOLDA", "IPTAL"],
    YOLDA: ["TESLIM_EDILDI", "IPTAL"],
  },
};

export const CLOSED_STATUSES: readonly OrderStatus[] = [
  "SERVIS_EDILDI",
  "TESLIM_EDILDI",
  "REDDEDILDI",
  "IPTAL",
] as const;

export function isAllowed(kind: OrderKind, from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[kind]?.[from]?.includes(to) ?? false;
}
