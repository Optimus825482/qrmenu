// Client-safe alert derivation (spec 3.4). Pure: the same layers and clock always give the same alerts.
import { SLA_WARN_RATIO } from "@/modules/order/server/roomService/slaConstants";
import type { RadarAlert, RadarSnapshot } from "./types";

export type AlertThresholds = {
  callAlertSeconds: number;
  mybarStaleMinutes: number;
  idleMinutes: number;
  approvalEscalationMinutes: number;
};

export type AlertLayers = Omit<RadarSnapshot["layers"], "system">;

export const KIND_LABEL: Record<RadarAlert["kind"], string> = {
  SIPARIS_ONAY: "Onay bekleyen sipariş",
  RS_SLA: "Oda servisi SLA",
  CAGRI: "Garson çağrısı",
  YAZICI_IS: "Baskı işi hatası",
  YAZICI: "Yazıcı hatası",
  STOK: "Kritik stok",
  YUKLEME: "Doluluk yüklenmedi",
  MYBAR: "MyBar bekliyor",
  DND_EKSIK: "Rahatsız etmeyin eksik",
  EPOSTA: "E-posta hatası",
};

/** Occupancy files are expected by this local (Nicosia) time. */
export const UPLOAD_DEADLINE_HOUR = 10;

const MINUTE_MS = 60_000;

const nicosiaClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Nicosia",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function nicosiaHour(d: Date): number {
  const h = nicosiaClock.formatToParts(d).find((p) => p.type === "hour")?.value;
  return Number(h ?? 0);
}

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) || 0 : 0);

export function deriveAlerts(
  layers: AlertLayers,
  now: Date,
  th: AlertThresholds,
  opts: { hotelId: string; isSystem: boolean; mailFailed?: number },
): RadarAlert[] {
  const { hotelId } = opts;
  const t = now.getTime();
  const nowIso = now.toISOString();
  const out: RadarAlert[] = [];
  const add = (a: Omit<RadarAlert, "hotelId" | "count"> & { count?: number }) =>
    out.push({ ...a, hotelId, count: a.count ?? 1 });

  for (const outlet of layers.order?.outlets ?? []) {
    for (const area of outlet.areas) {
      for (const table of area.tables) {
        for (const o of table.orders) {
          if (o.status !== "GONDERILDI") continue;
          const age = t - ms(o.since);
          if (o.escalated === true || age > th.approvalEscalationMinutes * MINUTE_MS) {
            add({
              key: `SIPARIS_ONAY:${o.orderId}`,
              severity: "crit",
              kind: "SIPARIS_ONAY",
              ref: { outletId: outlet.outletId, tableId: table.tableId, orderId: o.orderId },
              text: `Masa ${table.label}: #${o.orderNo} onay bekliyor`,
              since: o.since,
            });
          }
        }
        if (table.call && t - ms(table.call.since) > th.callAlertSeconds * 1000) {
          add({
            key: `CAGRI:${table.call.callId}`,
            severity: "crit",
            kind: "CAGRI",
            ref: { outletId: outlet.outletId, tableId: table.tableId },
            text: `Masa ${table.label}: çağrı yanıtlanmadı`,
            since: table.call.since,
          });
        }
      }
    }
    const failed = outlet.queues.print.HATA;
    if (failed > 0) {
      add({
        key: `YAZICI_IS:${outlet.outletId}`,
        severity: "crit",
        kind: "YAZICI_IS",
        ref: { outletId: outlet.outletId },
        text: `${outlet.name}: ${failed} baskı işi hatalı`,
        since: nowIso,
        count: failed,
      });
    }
    for (const p of outlet.printers) {
      if (p.state === "HAZIR") continue;
      add({
        key: `YAZICI:${p.printerId}`,
        severity: "crit",
        kind: "YAZICI",
        ref: { outletId: outlet.outletId, printerId: p.printerId },
        text: p.state === "HATA" ? `${p.name}: yazıcı hatası` : `${p.name}: yazıcıdan ses yok`,
        since: p.lastSeenAt ?? nowIso,
      });
    }
  }

  const rs = layers.roomService;
  if (rs && rs.slaMinutes > 0) {
    const slaMs = rs.slaMinutes * MINUTE_MS;
    for (const o of rs.orders) {
      const age = t - ms(o.slaStartAt ?? o.createdAt);
      const byAge: "OK" | "WARN" | "BREACH" = age >= slaMs ? "BREACH" : age >= slaMs * SLA_WARN_RATIO ? "WARN" : "OK";
      const level = o.level === "BREACH" || byAge === "BREACH" ? "BREACH" : o.level === "WARN" || byAge === "WARN" ? "WARN" : "OK";
      if (level === "OK") continue;
      add({
        key: `RS_SLA:${o.orderId}`,
        severity: level === "BREACH" ? "crit" : "warn",
        kind: "RS_SLA",
        ref: { orderId: o.orderId },
        text: `Oda ${o.roomNumber}: #${o.orderNo} ${level === "BREACH" ? "SLA aşıldı" : "SLA'ya yaklaşıyor"}`,
        since: o.slaStartAt ?? o.createdAt,
      });
    }
  }

  const mb = layers.minibar;
  if (mb) {
    for (const f of mb.floors) {
      for (const r of f.rooms) {
        if (r.mybar && t - ms(r.mybar.since) > th.mybarStaleMinutes * MINUTE_MS) {
          add({
            key: `MYBAR:${r.mybar.requestId}`,
            severity: "crit",
            kind: "MYBAR",
            ref: { roomId: r.roomId },
            text: `Oda ${r.number}: MyBar talebi bekliyor`,
            since: r.mybar.since,
          });
        }
        if (r.dnd?.status === "EKSIK") {
          add({
            key: `DND_EKSIK:${r.roomId}`,
            severity: "crit",
            kind: "DND_EKSIK",
            ref: { roomId: r.roomId },
            text: `Oda ${r.number}: rahatsız etmeyin kontrolü eksik`,
            since: r.dnd.lastAt,
          });
        }
      }
    }
    for (const s of mb.stock) {
      if (s.remaining > s.critical) continue;
      add({
        key: `STOK:${s.productId}`,
        severity: "crit",
        kind: "STOK",
        ref: { productId: s.productId },
        text: `${s.name}: stok kritik (${s.remaining})`,
        since: nowIso,
      });
    }
    if (nicosiaHour(now) >= UPLOAD_DEADLINE_HOUR) {
      for (const u of mb.uploads) {
        if (u.status !== "EKSIK") continue;
        add({
          key: `YUKLEME:${u.kind}`,
          severity: "crit",
          kind: "YUKLEME",
          ref: {},
          text: `Doluluk dosyası yüklenmedi (${u.kind})`,
          since: u.at ?? nowIso,
        });
      }
    }
  }

  if (opts.isSystem && (opts.mailFailed ?? 0) > 0) {
    add({
      key: "EPOSTA",
      severity: "crit",
      kind: "EPOSTA",
      ref: {},
      text: `${opts.mailFailed} e-posta gönderilemedi`,
      since: nowIso,
      count: opts.mailFailed,
    });
  }
  return out;
}

const RANK: Record<RadarAlert["severity"], number> = { crit: 0, warn: 1 };

/** Kritik > Dikkat, then oldest first; same kind and severity merge into one counted row. */
export function groupAlerts(alerts: RadarAlert[], max = 5): { shown: RadarAlert[]; more: number } {
  const groups = new Map<string, RadarAlert>();
  for (const a of alerts) {
    const gk = `${a.severity}|${a.kind}`;
    const g = groups.get(gk);
    if (!g) {
      groups.set(gk, { ...a });
      continue;
    }
    g.count += a.count;
    if (ms(a.since) < ms(g.since)) g.since = a.since;
  }
  const rows = [...groups.values()].map((g) =>
    g.count > 1 ? { ...g, text: `${KIND_LABEL[g.kind]} ×${g.count}` } : g,
  );
  rows.sort((a, b) => RANK[a.severity] - RANK[b.severity] || ms(a.since) - ms(b.since) || (a.key < b.key ? -1 : 1));
  return { shown: rows.slice(0, max), more: Math.max(0, rows.length - max) };
}
