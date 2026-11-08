// Pure Turkish event sentence formatter for the radar ticker (spec 2.2, 3.7, Task 9).
// Privacy rule: never outputs prices, guest notes or free-text cancellation/rejection reasons.
import { orderStatusLabel } from "../labels";
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
  ONLINE: "çevrimiçi",
  UYARI: "oturum uyarısı",
  CIKTI: "oturumdan çıktı",
  DUSURULDU: "oturum düşürüldü",
  BOSTA: "boşta",
};

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

export type EventContextLookup = {
  outletName?(outletId?: string): string | undefined;
  tableLabel?(tableId?: string): string | undefined;
  roomNumber?(roomId?: string): string | undefined;
  productName?(productId?: string): string | undefined;
  printerName?(printerId?: string): string | undefined;
};

/** Builds a fast lookup from an active `RadarState` when available. */
export function lookupFromState(state: RadarState | null | undefined): EventContextLookup {
  if (!state) return {};
  const outlets = new Map<string, string>();
  const tables = new Map<string, string>();
  const printers = new Map<string, string>();
  const rooms = new Map<string, string>();
  const products = new Map<string, string>();

  for (const o of state.layers.order?.outlets ?? []) {
    outlets.set(o.outletId, o.name);
    for (const p of o.printers) printers.set(p.printerId, p.name);
    for (const a of o.areas) {
      for (const t of a.tables) tables.set(t.tableId, t.label);
    }
  }
  for (const f of state.layers.minibar?.floors ?? []) {
    for (const r of f.rooms) rooms.set(r.roomId, r.number);
  }
  for (const s of state.layers.minibar?.stock ?? []) {
    products.set(s.productId, s.name);
  }

  return {
    outletName: (id) => (id ? outlets.get(id) : undefined),
    tableLabel: (id) => (id ? tables.get(id) : undefined),
    roomNumber: (id) => (id ? rooms.get(id) : undefined),
    productName: (id) => (id ? products.get(id) : undefined),
    printerName: (id) => (id ? printers.get(id) : undefined),
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
      if (outlet) parts.push(outlet);
      parts.push(`#${e.orderNo} onay süresi aşıldı`);
      break;
    }
    case "order.sla": {
      parts.push(roomNo(e.roomId));
      parts.push(`#${e.orderNo} ${e.level === "BREACH" ? "SLA aşıldı" : "SLA uyarısı"}`);
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
      if (outlet) parts.push(outlet);
      parts.push(`Baskı işi ${PRINT_STATUS_TEXT[e.status]}`);
      break;
    }
    case "printer.health": {
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
      parts.push(
        e.roomIds.length > 0 ? `${e.roomIds.length} odada DND kontrolü eksik kaldı` : "DND gün sonu eksik kontrolleri işlendi",
      );
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
      parts.push(`${e.itemCount} günlük görev üretildi`);
      break;
    }
    case "stock.level": {
      const prod = ctx.productName?.(e.productId) ?? "Stok";
      parts.push(`${prod} kalan ${e.remaining} (kritik ${e.critical})`);
      break;
    }
    case "upload.status": {
      parts.push(`Doluluk yüklemesi (${e.kind}): ${e.status.toLocaleLowerCase("tr-TR")}`);
      break;
    }
    case "presence": {
      const person = resolveActor(e.userId, people, nameStyle) ?? "Personel";
      parts.push(`${person} ${PRESENCE_STATUS_TEXT[e.status]}`);
      break;
    }
    case "mail.failed": {
      parts.push(`E-posta gönderimi başarısız (${e.kind})`);
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
