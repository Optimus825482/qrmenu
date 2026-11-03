// Pure fixtures for the radar reducer/store tests (no DB).
import type { MeritEvent } from "@/lib/realtime-events";
import type { RadarEvent, RadarSnapshot } from "@/modules/radar/types";

export const H = "h1";
export const T0 = Date.parse("2026-11-03T10:00:00.000Z");
export const iso = (ms: number) => new Date(ms).toISOString();

export function makeSnapshot(opts: { tables?: number; generatedAt?: string } = {}): RadarSnapshot {
  const n = opts.tables ?? 3;
  return {
    generatedAt: opts.generatedAt ?? iso(T0),
    hotelId: H,
    businessDate: "2026-11-03",
    layers: {
      minibar: {
        floors: [
          {
            floorId: "f1",
            number: 1,
            name: "Kat 1",
            rooms: ["r1", "r2", "r3"].map((id, i) => ({
              roomId: id,
              number: `10${i + 1}`,
              occupied: true,
              task: { itemId: `ti-${id}`, type: "INHOUSE_KONTROL", status: "BEKLIYOR", priority: 1 },
              checkedToday: null,
              dnd: null,
              mybar: null,
            })),
          },
        ],
        supervisors: [],
        stock: [{ productId: "p1", name: "Cola", remaining: 5, critical: 5 }],
        uploads: [{ kind: "DOLULUK", status: "TAMAMLANDI" }],
      },
      order: {
        outlets: [
          {
            outletId: "o1",
            name: "Restoran",
            type: "RESTORAN",
            orderingEnabled: true,
            areas: [
              {
                areaId: "a1",
                name: "Salon",
                tables: Array.from({ length: n }, (_, i) => ({
                  tableId: `t${i + 1}`,
                  label: `${i + 1}`,
                  orders: [],
                  call: null,
                })),
              },
            ],
            queues: {
              kasa: { count: 0 },
              kds: { YENI: { count: 0 }, HAZIRLANIYOR: { count: 0 }, HAZIR: { count: 0 } },
              print: { KUYRUKTA: 0, BASILIYOR: 0, HATA: 0 },
            },
            printers: [{ printerId: "pr1", name: "Mutfak", state: "HAZIR" }],
          },
        ],
      },
      roomService: { slaMinutes: 30, orders: [] },
      staff: {
        sessions: [
          {
            sessionId: "s1",
            userId: "u1",
            name: "Ayse Kaya",
            roleCode: "GARSON",
            roleKind: "GARSON",
            status: "ONLINE",
            loginAt: iso(T0 - 3_600_000),
            lastSeenAt: iso(T0 - 60_000),
          },
        ],
      },
      system: { alerts: [] },
    },
    sparkline: [],
  } as unknown as RadarSnapshot;
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

let seq = 0;
export function ev<T extends RadarEvent["type"]>(
  type: T,
  at: number,
  rest: Omit<Extract<RadarEvent, { type: T }>, "id" | "at" | "hotelId" | "layer" | "type"> & { id?: string },
): RadarEvent {
  const { id, ...r } = rest as Record<string, unknown>;
  return { id: (id as string) ?? `${type}:${++seq}`, at: iso(at), hotelId: H, layer: "SIPARIS", type, ...r } as unknown as RadarEvent;
}

export function orderStatus(at: number, orderId: string, tableId: string, to: string, extra: Record<string, unknown> = {}): RadarEvent {
  return ev("order.status", at, { orderId, orderNo: 1, kind: "MASA", to, tableId, ...extra } as never);
}

/** Wire-level MeritEvent that `toRadarEvent` turns into an `order.status`. */
export function wireOrder(at: number, orderId: string, tableId: string, type = "order.approved", status = "ONAYLANDI"): MeritEvent {
  return {
    type,
    hotelId: H,
    at: iso(at),
    payload: { orderId, orderNo: 1, status, tableId, kind: "MASA" },
  };
}

export function wireScan(at: number, tableId: string): MeritEvent {
  return { type: "scan.table", hotelId: H, at: iso(at), payload: { tableId } };
}
