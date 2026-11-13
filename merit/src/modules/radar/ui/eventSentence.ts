// Pure Turkish event sentence formatter for the radar ticker (spec 2.2, 3.7, Task 9).
// Privacy rule: never outputs prices, guest notes or free-text cancellation/rejection reasons.
import { UPLOAD_LABELS, orderStatusLabel } from "../labels";
import { shortName } from "../privacy";
import type { RadarState } from "../state";
import type { RadarEvent } from "../types";

export type NameStyle = "full" | "short";

const CHECK_TYPE_TEXT: Record<Extract<RadarEvent, { type: "room.checked" }>["checkType"], string> = {
  URUN_EKLENDI: "ürün eklendi",
  SARFIYAT_YOK: "sarfiyat yok",
  DND: "DND",
  ACIK: "açık",
};

const CALL_TYPE_TEXT: Record<Extract<RadarEvent, { type: "call.opened" }>["callType"], string> = {
  GARSON: "garson çağrısı",
  HESAP: "hesap isteği",
  DIGER: "çağrı",
};

const PRINT_STATUS_TEXT: Record<Extract<RadarEvent, { type: "print.job" }>["status"], string> = {
  KUYRUKTA: "kuyruğa alındı",
  BASILIYOR: "basılıyor",
  BASILDI: "basıldı",
  HATA: "baskı hatası",
};

const PRINTER_HEALTH_TEXT: Record<Extract<RadarEvent, { type: "printer.health" }>["state"], string> = {
  HAZIR: "hazır",
  SESSIZ: "sessiz",
  HATA: "hatalı",
};

const MYBAR_OUTCOME_TEXT: Record<Extract<RadarEvent, { type: "mybar.closed" }>["outcome"], string> = {
  TAMAM: "karşılandı",
  EKSIK: "eksikle kapatıldı",
  IPTAL: "iptal edildi",
};

const TASK_STATUS_TEXT: Record<Extract<RadarEvent, { type: "task.updated" }>["to"], string> = {
  BEKLIYOR: "bekliyor",
  DEVAM: "devam ediyor",
  DND_BEKLIYOR: "DND bekliyor",
  TAMAMLANDI: "tamamlandı",
  EKSIK: "eksik",
};

const PRESENCE_STATUS_TEXT: Record<Extract<RadarEvent, { type: "presence" }>["status"], string> = {
  ONLINE: "çevrimiçi oldu",
  UYARI: "oturum süresi dolmak üzere",
  CIKTI: "oturumu kapattı",
  DUSURULDU: "oturumu sonlandırıldı",
  BOSTA: "boşta (hareketsiz)",
};

const PRINT_REASON_TEXT: Record<NonNullable<Extract<RadarEvent, { type: "print.job" }>["reason"]>, string> = {
  YAZICI_YOK: "yazıcı tanımlı değil",
  BASILAMADI: "yazıcı basamadı",
};

const UPLOAD_STATUS_TEXT: Record<Extract<RadarEvent, { type: "upload.status" }>["status"], string> = {
  YUKLENDI: "yüklendi",
  ISLENIYOR: "işleniyor",
  TAMAMLANDI: "tamamlandı",
  HATA: "hatayla bitti",
  SILINDI: "silindi",
  BEKLIYOR: "bekliyor",
  EKSIK: "bugün yüklenmedi",
};

/** Rooms listed by number in one sentence before it falls back to "+N oda". */
const ROOM_LIST_MAX = 5;

/** `presence.tick` heartbeat (no user on the wire): keeps `lastSeenAt` fresh, is not news for the feed. */
export function isHeartbeat(e: RadarEvent): boolean {
  return e.type === "presence" && e.userId === "";
}

function resolveActor(
  userId: string | undefined,
  people: Readonly<Record<string, string>>,
  nameStyle: NameStyle,
): string | undefined {
  if (!userId) return undefined;
  const full = people[userId]?.trim();
  if (!full || full === "—") return "Personel";
  return nameStyle === "short" ? shortName(full) : full;
}

/** "2026-11-03" -> "03.11.2026"; anything else is returned as is. */
function dayText(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : date;
}

export type SessionInfo = { userId: string; roleCode?: string; place?: string; outletId?: string };
export type OrderPlace = { outletId?: string; tableId?: string; roomNumber?: string };

export type EventContextLookup = {
  outletName?(outletId?: string): string | undefined;
  tableLabel?(tableId?: string): string | undefined;
  roomNumber?(roomId?: string): string | undefined;
  productName?(productId?: string): string | undefined;
  printerName?(printerId?: string): string | undefined;
  /** Open session by id: who it belongs to, their role and last known place. */
  session?(sessionId?: string): SessionInfo | undefined;
  /** Role code of a user with an open session. */
  roleCode?(userId?: string): string | undefined;
  /** Where an open order sits (events that carry only the order id). */
  orderPlace?(orderId?: string): OrderPlace | undefined;
  /** Order number of an open order (print jobs carry only the order id). */
  orderNo?(orderId?: string): number | undefined;
  /** Outlet a printer belongs to. */
  printerOutlet?(printerId?: string): string | undefined;
};

/** Builds a fast lookup from an active `RadarState` when available. */
export function lookupFromState(state: RadarState | null | undefined): EventContextLookup {
  if (!state) return {};
  const outlets = new Map<string, string>();
  const tables = new Map<string, string>();
  const printers = new Map<string, string>();
  const rooms = new Map<string, string>();
  const products = new Map<string, string>();

  const printerOutlets = new Map<string, string>();
  const sessions = new Map<string, SessionInfo>();
  const roles = new Map<string, string>();
  const orderPlaces = new Map<string, OrderPlace>();
  const orderNos = new Map<string, number>();

  for (const o of state.layers.order?.outlets ?? []) {
    outlets.set(o.outletId, o.name);
    for (const p of o.printers) {
      printers.set(p.printerId, p.name);
      printerOutlets.set(p.printerId, o.outletId);
    }
    for (const a of o.areas) {
      for (const t of a.tables) {
        tables.set(t.tableId, t.label);
        for (const ord of t.orders) {
          orderPlaces.set(ord.orderId, { outletId: o.outletId, tableId: t.tableId });
          orderNos.set(ord.orderId, ord.orderNo);
        }
      }
    }
  }
  for (const ord of state.layers.roomService?.orders ?? []) {
    orderPlaces.set(ord.orderId, { roomNumber: ord.roomNumber });
    orderNos.set(ord.orderId, ord.orderNo);
  }
  for (const f of state.layers.minibar?.floors ?? []) {
    for (const r of f.rooms) rooms.set(r.roomId, r.number);
  }
  for (const s of state.layers.minibar?.stock ?? []) {
    products.set(s.productId, s.name);
  }
  for (const s of state.layers.staff?.sessions ?? []) {
    sessions.set(s.sessionId, {
      userId: s.userId,
      roleCode: s.roleCode,
      ...(s.lastPlace ? { place: s.lastPlace } : {}),
      ...(s.outletId ? { outletId: s.outletId } : {}),
    });
    if (s.roleCode) roles.set(s.userId, s.roleCode);
  }

  return {
    outletName: (id) => (id ? outlets.get(id) : undefined),
    tableLabel: (id) => (id ? tables.get(id) : undefined),
    roomNumber: (id) => (id ? rooms.get(id) : undefined),
    productName: (id) => (id ? products.get(id) : undefined),
    printerName: (id) => (id ? printers.get(id) : undefined),
    session: (id) => (id ? sessions.get(id) : undefined),
    roleCode: (id) => (id ? roles.get(id) : undefined),
    orderPlace: (id) => (id ? orderPlaces.get(id) : undefined),
    orderNo: (id) => (id ? orderNos.get(id) : undefined),
    printerOutlet: (id) => (id ? printerOutlets.get(id) : undefined),
  };
}

/**
 * Pure event sentence builder (spec 2.2: "Havuz Bar · M12 · #45 onaylandı · Ayşe K.").
 * Never inspects or emits prices, notes or rejection/cancellation reasons.
 */
export function describeEvent(
  e: RadarEvent,
  people: Readonly<Record<string, string>> = {},
  nameStyle: NameStyle = "full",
  ctx: EventContextLookup = {},
): string {
  const actor = resolveActor(e.byUserId, people, nameStyle);
  const parts: string[] = [];
  const outlet = ctx.outletName?.(e.outletId);
  const roomNo = (id?: string) => {
    const n = ctx.roomNumber?.(id);
    return n ? `Oda ${n}` : "Oda";
  };
  const tableLbl = (id?: string) => {
    const lbl = ctx.tableLabel?.(id);
    return lbl ? lbl : "Masa";
  };

  switch (e.type) {
    case "order.status": {
      if (outlet) parts.push(outlet);
      if (e.kind === "MASA") parts.push(tableLbl(e.tableId));
      else parts.push(roomNo(e.roomId));
      const statusText = e.prep ? "hazırlanmaya başlandı" : orderStatusLabel(e.to, e.kind).toLocaleLowerCase("tr-TR");
      parts.push(`#${e.orderNo} ${statusText}`);
      break;
    }
    case "order.escalated": {
      const place = ctx.orderPlace?.(e.orderId);
      const where = outlet ?? ctx.outletName?.(place?.outletId);
      if (where) parts.push(where);
      if (place?.tableId) parts.push(tableLbl(place.tableId));
      else if (place?.roomNumber) parts.push(`Oda ${place.roomNumber}`);
      parts.push(`#${e.orderNo} onay bekliyor, onay süresi aşıldı`);
      break;
    }
    case "order.sla": {
      const known = ctx.roomNumber?.(e.roomId) ?? ctx.orderPlace?.(e.orderId)?.roomNumber;
      parts.push(known ? `Oda ${known}` : "Oda");
      parts.push(
        `#${e.orderNo} ${e.level === "BREACH" ? "teslim süresi aşıldı" : "teslim süresi dolmak üzere"}`,
      );
      break;
    }
    case "call.opened": {
      if (outlet) parts.push(outlet);
      parts.push(tableLbl(e.tableId));
      parts.push(`${CALL_TYPE_TEXT[e.callType]} açıldı`);
      break;
    }
    case "call.closed": {
      if (outlet) parts.push(outlet);
      parts.push(tableLbl(e.tableId));
      const closedBy =
        (e as { waiterName?: string }).waiterName ??
        (e.waiterId ? resolveActor(e.waiterId, people, nameStyle) : undefined);
      if (closedBy) {
        parts.push(`çağrı kapatıldı (${closedBy})`);
      } else {
        parts.push("çağrı kapatıldı");
      }
      break;
    }
    case "table.scanned": {
      if (outlet) parts.push(outlet);
      parts.push(tableLbl(e.tableId));
      parts.push("masa QR okutuldu");
      break;
    }
    case "table.assigned": {
      if (outlet) parts.push(outlet);
      parts.push(tableLbl(e.tableId));
      if (e.waiterId) {
        const waiter = resolveActor(e.waiterId, people, nameStyle) ?? "Personel";
        parts.push(`garson atandı (${waiter})`);
      } else {
        parts.push("garson ataması kaldırıldı");
      }
      break;
    }
    case "print.job": {
      const where = outlet ?? ctx.outletName?.(ctx.printerOutlet?.(e.printerId));
      if (where) parts.push(where);
      const pName = ctx.printerName?.(e.printerId);
      if (pName) parts.push(pName);
      const no = ctx.orderNo?.(e.orderId);
      const subject = no !== undefined ? `#${no} fişi` : "Baskı işi";
      const reason = e.status === "HATA" && e.reason ? ` (${PRINT_REASON_TEXT[e.reason]})` : "";
      parts.push(`${subject} ${PRINT_STATUS_TEXT[e.status]}${reason}`);
      break;
    }
    case "printer.health": {
      const where = outlet ?? ctx.outletName?.(ctx.printerOutlet?.(e.printerId));
      if (where) parts.push(where);
      const pName = ctx.printerName?.(e.printerId) ?? "Yazıcı";
      parts.push(`${pName} ${PRINTER_HEALTH_TEXT[e.state]}`);
      break;
    }
    case "room.checked": {
      parts.push(roomNo(e.roomId));
      parts.push(`oda kontrolü (${CHECK_TYPE_TEXT[e.checkType]})`);
      break;
    }
    case "room.check.changed": {
      parts.push(roomNo(e.roomId));
      parts.push(e.op === "SIL" ? "kontrol kaydı silindi" : "kontrol kaydı düzeltildi");
      break;
    }
    case "room.scanned": {
      parts.push(roomNo(e.roomId));
      parts.push("oda QR okutuldu");
      break;
    }
    case "dnd.marked": {
      parts.push(roomNo(e.roomId));
      parts.push(`DND ${e.count}/${e.minChecks} işaretlendi`);
      break;
    }
    case "dnd.missed": {
      if (e.roomIds.length === 0) {
        parts.push("DND gün sonu eksik kontrolleri işlendi");
        break;
      }
      const numbers = e.roomIds.map((id) => ctx.roomNumber?.(id)).filter((n): n is string => Boolean(n));
      const shown = numbers.slice(0, ROOM_LIST_MAX);
      const rest = e.roomIds.length - shown.length;
      const list = shown.length > 0 ? ` (${shown.join(", ")}${rest > 0 ? ` +${rest} oda` : ""})` : "";
      parts.push(`${e.roomIds.length} odada DND kontrolü eksik kaldı${list}`);
      break;
    }
    case "mybar.opened": {
      parts.push(roomNo(e.roomId));
      parts.push("MyBar talebi açıldı");
      break;
    }
    case "mybar.seen": {
      parts.push(roomNo(e.roomId));
      parts.push("MyBar talebi görüldü");
      break;
    }
    case "mybar.closed": {
      parts.push(roomNo(e.roomId));
      parts.push(`MyBar talebi ${MYBAR_OUTCOME_TEXT[e.outcome]}`);
      break;
    }
    case "task.updated": {
      parts.push(roomNo(e.roomId));
      parts.push(`görev ${TASK_STATUS_TEXT[e.to]}`);
      break;
    }
    case "task.generated": {
      parts.push(`${dayText(e.date)} için ${e.itemCount} oda görevi üretildi`);
      break;
    }
    case "stock.level": {
      const prod = ctx.productName?.(e.productId) ?? "Ürün";
      const state = e.remaining <= e.critical ? "kritik seviyenin altında" : "stok güncellendi";
      parts.push(`${prod} · ${state}: kalan ${e.remaining} (kritik ${e.critical})`);
      break;
    }
    case "upload.status": {
      const list = UPLOAD_LABELS[e.kind] ?? e.kind;
      parts.push(`Doluluk listesi (${list}) ${UPLOAD_STATUS_TEXT[e.status] ?? e.status.toLocaleLowerCase("tr-TR")}`);
      break;
    }
    case "presence": {
      // Heartbeats carry no user: the open session tells who it is.
      const session = ctx.session?.(e.sessionId);
      const userId = e.userId || session?.userId;
      const person = resolveActor(userId, people, nameStyle) ?? "Personel";
      const role = ctx.roleCode?.(userId) ?? session?.roleCode;
      parts.push(role ? `${person} (${role})` : person);
      const place = e.place ?? session?.place ?? outlet ?? ctx.outletName?.(session?.outletId);
      if (place) parts.push(place);
      parts.push(isHeartbeat(e) ? "çevrimiçi (bağlantı sinyali)" : PRESENCE_STATUS_TEXT[e.status]);
      break;
    }
    case "mail.failed": {
      parts.push(`E-posta gönderilemedi (${e.kind})`);
      break;
    }
    case "outlet.ordering": {
      if (outlet) parts.push(outlet);
      parts.push(e.enabled ? "sipariş alımı açıldı" : "sipariş alımı kapatıldı");
      break;
    }
  }

  if (actor && e.type !== "presence" && e.type !== "call.closed") {
    parts.push(actor);
  }
  return parts.join(" · ");
}
