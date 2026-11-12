import type { RoomBoard, RoomBoardColumn, RoomOrderCard } from "@/modules/order/server/roomService/board";
import type { RoomOpsTab } from "./RoomOrderCard";

/**
 * A stage is one column of the screen. The full board folds the five server columns into four
 * stages the staff reads at a glance; the order flow, the SLA and the reports keep the five steps.
 */
export type RoomStageId = "ALINDI" | "HAZIRLANIYOR" | "GONDERILDI" | "TESLIM" | "CONFIRM" | "READY" | "ONWAY" | "MYBAR" | "KUYRUK";

export type RoomStage = {
  id: RoomStageId;
  title: string;
  /** Server columns shown in this stage; empty for the delivered and the MyBar stage. */
  columns: readonly RoomBoardColumn[];
};

export const TAB_STAGES: Record<RoomOpsTab, readonly RoomStage[]> = {
  tumu: [
    { id: "ALINDI", title: "Talep Alındı", columns: ["CONFIRM", "NEW"] },
    { id: "HAZIRLANIYOR", title: "Hazırlanıyor", columns: ["PREP", "READY"] },
    { id: "GONDERILDI", title: "Gönderildi", columns: ["ONWAY"] },
    { id: "TESLIM", title: "Teslim Edildi", columns: [] },
  ],
  teyit: [{ id: "CONFIRM", title: "Teyit", columns: ["CONFIRM"] }],
  teslim: [
    { id: "READY", title: "Hazır", columns: ["READY"] },
    { id: "ONWAY", title: "Yolda", columns: ["ONWAY"] },
  ],
};

export const QUEUE_STAGE: RoomStage = { id: "KUYRUK", title: "Servis Kuyruğu", columns: [] };
export const MYBAR_STAGE: RoomStage = { id: "MYBAR", title: "MyBar Talepleri", columns: [] };

/** Step badge of a card inside a folded stage or the queue. */
export const STEP_LABEL: Record<RoomBoardColumn, string> = {
  CONFIRM: "Teyit bekliyor",
  NEW: "Talep alındı",
  PREP: "Hazırlanıyor",
  READY: "Hazır",
  ONWAY: "Gönderildi",
};

export type QueueEntry = { card: RoomOrderCard; column: RoomBoardColumn };

const time = (value: Date | string) => new Date(value).getTime();

/** Queue rule: the request that arrived first is served first (order number breaks a tie). */
export function byRequestTime(a: QueueEntry, b: QueueEntry): number {
  return time(a.card.createdAt) - time(b.card.createdAt) || a.card.orderNo - b.card.orderNo;
}

/** Cards of the given server columns as one list, in request-time order. */
export function entriesOf(board: RoomBoard, columns: readonly RoomBoardColumn[]): QueueEntry[] {
  return columns.flatMap((column) => board.columns[column].map((card) => ({ card, column }))).sort(byRequestTime);
}

const OPEN_COLUMNS: readonly RoomBoardColumn[] = ["CONFIRM", "NEW", "PREP", "READY", "ONWAY"];

/** Service queue: every open order in request-time order. */
export function queueOf(board: RoomBoard): QueueEntry[] {
  return entriesOf(board, OPEN_COLUMNS);
}

/** Stage of the full board that shows the given server column. */
export function stageOfColumn(column: RoomBoardColumn): RoomStageId {
  return TAB_STAGES.tumu.find((stage) => stage.columns.includes(column))?.id ?? "ALINDI";
}
