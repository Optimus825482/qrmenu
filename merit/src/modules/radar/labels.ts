// Pure display models of the radar views (client-safe, no React): labels, tones and cell/card summaries.
import type { OrderKind, OrderStatus } from "@/generated/prisma/client";
import type { StateTable } from "./state";
import type { RadarLayer, RadarSnapshot, RadarSparkline } from "./types";

export type Tone = "muted" | "accent" | "warn" | "info" | "success" | "danger";

export type RoomCell = NonNullable<RadarSnapshot["layers"]["minibar"]>["floors"][number]["rooms"][number];
export type TableCard = StateTable;

const MIN_MS = 60_000;
/** A QR scan this recent means the guest is still at the table / room. */
export const GUEST_PRESENT_MS = 15 * MIN_MS;
/** An open call older than this is overdue (UX `CALL_OVERDUE_SEC`). */
export const CALL_OVERDUE_SECONDS = 60;

const MASA_LABELS: Partial<Record<OrderStatus, string>> = {
  GONDERILDI: "Onay bekliyor",
  ONAYLANDI: "Hazırlanıyor",
  HAZIR: "Hazır",
  SERVIS_EDILDI: "Servis edildi",
  REDDEDILDI: "Reddedildi",
  IPTAL: "İptal",
};

const ODA_LABELS: Partial<Record<OrderStatus, string>> = {
  TEYIT_BEKLIYOR: "Teyit bekliyor",
  ONAYLANDI: "Onaylandı",
  HAZIR: "Hazır",
  YOLDA: "Yolda",
  TESLIM_EDILDI: "Teslim edildi",
  REDDEDILDI: "Reddedildi",
  IPTAL: "İptal",
};

/** Guest-facing wording of an order status per order kind (table orders vs. room service). */
export function orderStatusLabel(status: OrderStatus, kind: OrderKind): string {
  return (kind === "MASA" ? MASA_LABELS : ODA_LABELS)[status] ?? status;
}

const TASK_TEXT: Record<NonNullable<RoomCell["task"]>["status"], { tone: Tone; text: string }> = {
  BEKLIYOR: { tone: "warn", text: "görev bekliyor" },
  DEVAM: { tone: "info", text: "görev devam ediyor" },
  DND_BEKLIYOR: { tone: "info", text: "DND bekliyor" },
  TAMAMLANDI: { tone: "success", text: "görev tamamlandı" },
  EKSIK: { tone: "danger", text: "görev eksik" },
};

export type RoomCellModel = {
  tone: Tone;
  edge: "solid" | "dashed";
  corner: string[];
  checked: boolean;
  ariaLabel: string;
};

/** Spec 5.3: ground = task state, edge = occupied/empty, corner marks = DND and MyBar, tick = checked today. */
export function roomCellModel(room: RoomCell, now: number): RoomCellModel {
  const task = room.task ? TASK_TEXT[room.task.status] : undefined;
  const dndShown = room.dnd !== null && (room.dnd.status === "AKTIF" || room.dnd.status === "EKSIK");
  const corner: string[] = [];
  const parts: string[] = [room.occupied ? "Dolu" : "Boş", task?.text ?? "görev yok"];
  if (room.dnd && dndShown) {
    const t = `${room.dnd.count}/${room.dnd.minChecks}`;
    corner.push(`D${t}`);
    parts.push(room.dnd.status === "EKSIK" ? `DND ${t} eksik` : `DND ${t}`);
  }
  if (room.mybar) {
    const minutes = Math.max(0, Math.floor((now - (Date.parse(room.mybar.since) || now)) / MIN_MS));
    corner.push(`M${minutes}`);
    parts.push(`MyBar ${minutes} dk`);
  }
  const checked = room.checkedToday !== null;
  if (checked) parts.push("kontrol edildi");
  const tone: Tone = room.dnd?.status === "EKSIK" ? "danger" : (task?.tone ?? "muted");
  return {
    tone,
    edge: room.occupied ? "solid" : "dashed",
    corner,
    checked,
    ariaLabel: `${room.number}: ${parts.join(", ")}`,
  };
}

export type TableCardModel = {
  tone: Tone;
  statusText: string;
  badges: string[];
  waiter: string;
  callSeconds?: number;
  callOverdue?: boolean;
  guestPresent: boolean;
  scanMinutes?: number;
};

/** Status of a table card in UX priority: call overdue > awaiting approval > active call > ready > preparing > guest present > empty. */
export function tableCardModel(t: TableCard, now: number): TableCardModel {
  const open = t.orders;
  const awaiting = open.filter((o) => o.status === "GONDERILDI").length;
  const scanMs = t.scannedAt !== undefined ? now - (Date.parse(t.scannedAt) || 0) : undefined;
  const guestPresent = scanMs !== undefined && scanMs >= 0 && scanMs <= GUEST_PRESENT_MS;
  const scanMinutes = scanMs !== undefined && scanMs >= 0 ? Math.floor(scanMs / 60_000) : undefined;
  const callSeconds = t.call ? Math.max(0, Math.floor((now - (Date.parse(t.call.since) || now)) / 1000)) : undefined;
  const callOverdue = callSeconds !== undefined && callSeconds >= CALL_OVERDUE_SECONDS;

  let tone: Tone;
  let statusText: string;
  if (callOverdue) {
    tone = "danger";
    statusText = t.call?.type === "HESAP" ? "Hesap Gecikti" : "Çağrı Gecikti";
  } else if (awaiting > 0) {
    tone = "warn";
    statusText = orderStatusLabel("GONDERILDI", "MASA");
  } else if (t.call) {
    tone = "warn";
    statusText = t.call.type === "HESAP" ? "Hesap İstendi" : "Garson Çağrısı";
  } else if (open.some((o) => o.status === "HAZIR")) {
    tone = "success";
    statusText = orderStatusLabel("HAZIR", "MASA");
  } else if (open.some((o) => o.status === "ONAYLANDI")) {
    tone = "info";
    statusText = orderStatusLabel("ONAYLANDI", "MASA");
  } else if (guestPresent) {
    tone = "accent";
    statusText = "Misafir masada";
  } else {
    tone = "muted";
    statusText = "Boş";
  }

  const badges: string[] = [];
  if (open.length > 0) badges.push(`${open.length} sipariş`);
  if (t.call) {
    badges.push("Çağrı");
    if (t.call.type === "HESAP") badges.push("Hesap");
  }
  if (guestPresent) {
    badges.push(scanMinutes !== undefined && scanMinutes > 0 ? `QR Menü (${scanMinutes} dk)` : "QR Menü");
  }
  if (open.some((o) => o.escalated)) badges.push("Yükseltildi");

  return {
    tone,
    statusText,
    badges,
    waiter: t.waiterName ?? "Atanmadı",
    ...(callSeconds !== undefined ? { callSeconds, callOverdue } : {}),
    guestPresent,
    ...(scanMinutes !== undefined ? { scanMinutes } : {}),
  };
}

/** Layer a counter belongs to, from its source screen code. */
export function metricLayer(screenCode: string): RadarLayer {
  if (screenCode.startsWith("MB-")) return "MINIBAR";
  if (screenCode.startsWith("QS-") || screenCode.startsWith("QM-")) return "SIPARIS";
  if (screenCode.startsWith("RO-")) return "ODA_SERVISI";
  if (screenCode === "CR-ONL") return "PERSONEL";
  return "SISTEM";
}

export const LAYER_LABELS: Record<RadarLayer, string> = {
  MINIBAR: "Minibar",
  SIPARIS: "QR Sipariş",
  ODA_SERVISI: "Oda Servisi",
  PERSONEL: "Personel",
  SISTEM: "Sistem",
};

export const SEVERITY_LABELS = { ok: "Normal", warn: "Dikkat", crit: "Kritik" } as const;

export const UPLOAD_LABELS: Record<string, string> = {
  IN_HOUSE: "Konaklayanlar",
  ARRIVAL: "Girişler",
  DEPARTURE: "Çıkışlar",
};

export const TONE_LABELS: Record<Tone, string> = {
  muted: "Nötr",
  accent: "Misafir",
  warn: "Dikkat",
  info: "Sürüyor",
  success: "Tamam",
  danger: "Kritik",
};

/** Event count per minute bucket, summed over `layers` (all when omitted). */
export function sparkTotals(spark: RadarSparkline, layers?: ReadonlySet<RadarLayer>): number[] {
  return spark.map((b) =>
    (Object.entries(b.counts) as [RadarLayer, number][]).reduce(
      (sum, [layer, n]) => (!layers || layers.has(layer) ? sum + (n ?? 0) : sum),
      0,
    ),
  );
}

/** SVG polyline points of `values` scaled into `w` x `h` (flat line for no data; never NaN). */
export function sparkPoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return `0,${h} ${w},${h}`;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => `${round(i * step)},${round(h - (v / max) * (h - 2) - 1)}`)
    .join(" ");
}

const round = (n: number) => Math.round(n * 10) / 10;
