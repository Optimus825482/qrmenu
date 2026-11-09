import type { OrderStatus } from "@/generated/prisma/client";

/**
 * Ortak durum belirteci (spec 5.6): renk tek başına anlam taşımaz; her ton renk + kenar biçimi + metin
 * ile gösterilir. `fg`/`bg` çiftleri `globals.css` belirteçleridir (metin/zemin >= 4.5:1,
 * tests/unit/statusTone.test.ts doğrular). Kenar biçimi `.tone-*` sınıflarıyla (pos.css) çizilir.
 */
export type StatusTone = "neutral" | "scanned" | "pending" | "preparing" | "ready" | "call" | "done" | "cancelled";

export type ToneBorder = "solid" | "dashed" | "thick" | "double";

export const TONES: Record<StatusTone, { label: string; fg: string; bg: string; border: ToneBorder }> = {
  neutral: { label: "Boş", fg: "var(--muted)", bg: "var(--surface)", border: "solid" },
  scanned: { label: "Dolu", fg: "var(--accent)", bg: "var(--surface)", border: "dashed" },
  pending: { label: "Onay bekliyor", fg: "var(--warn)", bg: "var(--warn-bg)", border: "thick" },
  preparing: { label: "Hazırlanıyor", fg: "var(--info)", bg: "var(--info-bg)", border: "solid" },
  ready: { label: "Hazır", fg: "var(--success)", bg: "var(--success-bg)", border: "double" },
  call: { label: "Çağrı var", fg: "var(--danger)", bg: "var(--danger-bg)", border: "solid" },
  done: { label: "Tamamlandı", fg: "var(--muted)", bg: "var(--muted-bg)", border: "solid" },
  cancelled: { label: "İptal", fg: "var(--muted)", bg: "var(--muted-bg)", border: "dashed" },
};

export function orderTone(status: OrderStatus): StatusTone {
  switch (status) {
    case "GONDERILDI":
    case "TEYIT_BEKLIYOR":
      return "pending";
    case "ONAYLANDI":
    case "YOLDA":
      return "preparing";
    case "HAZIR":
      return "ready";
    case "SERVIS_EDILDI":
    case "TESLIM_EDILDI":
      return "done";
    case "REDDEDILDI":
    case "IPTAL":
      return "cancelled";
  }
}

export type TableToneInput = {
  openOrders: { status: OrderStatus }[];
  openCalls: number;
  oldestCallAgeSec?: number;
  scannedRecently: boolean;
};

export const CALL_OVERDUE_SEC = 60;

/** Masa kartının tonu: onay bekleyen > hazır > hazırlanan > misafir masada > (çağrı) > boş. */
export function tableTone(t: TableToneInput): { tone: StatusTone; label: string; callBadge: boolean; callOverdue: boolean } {
  const tones = t.openOrders.map((order) => orderTone(order.status));
  const pending = tones.filter((tone) => tone === "pending").length;
  const callBadge = t.openCalls > 0;
  const callOverdue = callBadge && (t.oldestCallAgeSec ?? 0) >= CALL_OVERDUE_SEC;
  let tone: StatusTone;
  let label: string;
  if (pending > 0) {
    tone = "pending";
    label = `${TONES.pending.label} · ${pending}`;
  } else if (tones.includes("ready")) {
    tone = "ready";
    label = TONES.ready.label;
  } else if (tones.includes("preparing")) {
    tone = "preparing";
    label = TONES.preparing.label;
  } else if (t.scannedRecently) {
    tone = "scanned";
    label = TONES.scanned.label;
  } else if (callBadge) {
    tone = "call";
    label = TONES.call.label;
  } else {
    tone = "neutral";
    label = TONES.neutral.label;
  }
  return { tone, label, callBadge, callOverdue };
}
