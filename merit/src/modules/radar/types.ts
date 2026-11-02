// Client-safe: only `import type`. Shared by the server snapshot, the replay stream and the browser store.
import type {
  CallType,
  DndStatus,
  OrderKind,
  OrderStatus,
  OutletType,
  PrintJobStatus,
  RoleKind,
  RoomCheckType,
  SessionStatus,
  TaskStatus,
  TaskType,
  UploadStatus,
} from "@/generated/prisma/client";

export type RadarLayer = "MINIBAR" | "SIPARIS" | "ODA_SERVISI" | "PERSONEL" | "SISTEM";

export type WallView = "genel" | "kat" | "masa" | "kuyruk" | "odaServisi" | "personel";

export type RadarEventBase = {
  /** Idempotency key. Live: `${type}:${refId}:${at}`; replay: `${table}:${rowId}:${sub}`. */
  id: string;
  at: string;
  hotelId: string;
  layer: RadarLayer;
  outletId?: string;
  roomId?: string;
  byUserId?: string;
};

export type RadarEvent = RadarEventBase &
  (
    | {
        type: "order.status";
        orderId: string;
        orderNo: number;
        kind: OrderKind;
        to: OrderStatus;
        from?: OrderStatus;
        tableId?: string;
        roomId?: string;
        waiterId?: string;
        /** KDS "start preparing": status stays ONAYLANDI. */
        prep?: boolean;
      }
    | { type: "order.escalated"; orderId: string; orderNo: number }
    | { type: "order.sla"; orderId: string; orderNo: number; level: "WARN" | "BREACH" }
    | { type: "call.opened"; callId: string; tableId: string; callType: CallType }
    | { type: "call.closed"; callId: string; tableId: string }
    | { type: "table.scanned"; tableId: string }
    | { type: "table.assigned"; tableId: string; waiterId: string | null }
    | {
        type: "print.job";
        jobId?: string;
        printerId?: string;
        orderId?: string;
        status: PrintJobStatus;
        reason?: "YAZICI_YOK" | "BASILAMADI";
      }
    | { type: "printer.health"; printerId: string; state: "HAZIR" | "SESSIZ" | "HATA" }
    | { type: "room.checked"; roomId: string; checkType: RoomCheckType; taskStatus?: TaskStatus }
    | { type: "room.check.changed"; roomId: string; op: "SIL" | "DUZELT" }
    | { type: "room.scanned"; roomId: string }
    | { type: "dnd.marked"; roomId: string; count: number; minChecks: number; status: DndStatus }
    | { type: "dnd.missed"; roomIds: string[] }
    | { type: "mybar.opened"; requestId: string; roomId: string }
    | { type: "mybar.seen"; requestId: string; roomId: string }
    | { type: "mybar.closed"; requestId: string; roomId: string; outcome: "TAMAM" | "EKSIK" | "IPTAL" }
    | { type: "task.updated"; taskItemId: string; roomId: string; to: TaskStatus }
    | { type: "task.generated"; date: string; itemCount: number }
    | { type: "stock.level"; productId: string; remaining: number; critical: number }
    | { type: "upload.status"; kind: string; status: UploadStatus | "EKSIK" }
    | {
        type: "presence";
        sessionId: string;
        userId: string;
        status: SessionStatus | "BOSTA";
        outletId?: string;
        place?: string;
        lastSeenAt?: string;
      }
    | { type: "mail.failed"; kind: string }
    | { type: "outlet.ordering"; outletId: string; enabled: boolean }
  );

export type RadarEventType = RadarEvent["type"];

export type RadarAlert = {
  key: string;
  severity: "warn" | "crit";
  kind:
    | "SIPARIS_ONAY"
    | "RS_SLA"
    | "CAGRI"
    | "YAZICI_IS"
    | "YAZICI"
    | "STOK"
    | "YUKLEME"
    | "MYBAR"
    | "DND_EKSIK"
    | "EPOSTA";
  hotelId: string;
  ref: {
    outletId?: string;
    tableId?: string;
    roomId?: string;
    orderId?: string;
    printerId?: string;
    productId?: string;
  };
  text: string;
  since: string;
  count: number;
};

/** Placeholder until the P7 metric set lands (overview hotels carry it as-is). */
export type RadarMetric = { key: string; label: string; value: number | null; unit?: string };

export type RadarSparkline = { bucketStart: string; counts: Partial<Record<RadarLayer, number>> }[];

export type RadarSnapshot = {
  generatedAt: string;
  hotelId: string;
  businessDate: string;
  layers: {
    minibar?: {
      floors: {
        floorId: string;
        number: number;
        name: string;
        rooms: {
          roomId: string;
          number: string;
          occupied: boolean;
          task: { itemId: string; type: TaskType; status: TaskStatus; priority: number } | null;
          checkedToday: { type: RoomCheckType; at: string; userId: string } | null;
          dnd: { count: number; minChecks: number; status: DndStatus; lastAt: string } | null;
          mybar: { requestId: string; since: string; seen: boolean } | null;
        }[];
      }[];
      supervisors: {
        userId: string;
        name: string;
        floorIds: string[];
        done: number;
        total: number;
        lastRoomId?: string;
        lastAt?: string;
      }[];
      stock: { productId: string; name: string; remaining: number; critical: number }[];
      uploads: { kind: string; status: UploadStatus | "EKSIK"; at?: string }[];
    };
    order?: {
      outlets: {
        outletId: string;
        name: string;
        type: OutletType;
        orderingEnabled: boolean;
        areas: {
          areaId: string;
          name: string;
          tables: {
            tableId: string;
            label: string;
            waiterId?: string;
            waiterName?: string;
            orders: { orderId: string; orderNo: number; status: OrderStatus; since: string }[];
            call: { callId: string; type: CallType; since: string } | null;
            scannedAt?: string;
          }[];
        }[];
        queues: {
          kasa: { count: number; oldest?: string };
          kds: Record<"YENI" | "HAZIRLANIYOR" | "HAZIR", { count: number; oldest?: string }>;
          print: Record<"KUYRUKTA" | "BASILIYOR" | "HATA", number>;
        };
        printers: { printerId: string; name: string; state: "HAZIR" | "SESSIZ" | "HATA"; lastSeenAt?: string }[];
      }[];
    };
    roomService?: {
      slaMinutes: number;
      orders: {
        orderId: string;
        orderNo: number;
        roomNumber: string;
        status: OrderStatus;
        createdAt: string;
        level: "OK" | "WARN" | "BREACH";
      }[];
    };
    staff?: {
      sessions: {
        sessionId: string;
        userId: string;
        name: string;
        roleCode: string;
        roleKind: RoleKind;
        outletId?: string;
        status: SessionStatus;
        loginAt: string;
        lastSeenAt: string;
        lastPlace?: string;
      }[];
    };
    system: { alerts: RadarAlert[] };
  };
  sparkline: RadarSparkline;
};

export type RadarOverview = {
  generatedAt: string;
  hotels: {
    hotelId: string;
    code: string;
    name: string;
    metrics: RadarMetric[];
    sparkline: RadarSparkline;
    topAlerts: RadarAlert[];
  }[];
};

// RadarState (the reducer state) is defined with the client store in Task 7.
