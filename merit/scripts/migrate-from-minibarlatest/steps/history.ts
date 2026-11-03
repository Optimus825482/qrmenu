import { Prisma } from "../../../src/generated/prisma/client";
import { DEFAULT_SETTINGS, SETTING_SCHEMAS } from "../../../src/lib/settings-defs";
import { businessDate, businessDay } from "../../../src/lib/time";
import { IdMap } from "../idmap";
import {
  checkTypeFor,
  clean,
  dolumStatusFor,
  isKnownCheckType,
  matchMybar,
  movementFor,
  orNull,
  parsePrice,
  txTypeFor,
  type MybarCandidate,
} from "../mapping";
import type { StepContext, TxClient } from "../types";
import { chunked, idOf, num, opt, readAll, req, streamRows, type Row } from "./shared";

const asDate = (v: unknown): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RoomInfo {
  id: string;
  hotelId: string;
}

interface PoolRow {
  legacyId: string;
  legacyHotel: string;
  legacyProduct: string;
  hotelId: string;
  productId: string;
  total: number;
  used: number;
  remaining: number;
  critical: number | null;
  createdAt: Date | null;
}

/** Sub-steps in order: MyBar, transactions, room checks, pool rows, pool movements, pool archive. */
export async function runHistory(ctx: StepContext): Promise<void> {
  await stepMybar(ctx);
  await stepTransactions(ctx);
  await stepRoomChecks(ctx);
  const pool = await stepPoolRows(ctx);
  await stepMovements(ctx, pool);
  await stepArchive(ctx);
}

async function loadMap(ctx: StepContext, entity: Parameters<IdMap["load"]>[0]): Promise<Map<string, string>> {
  return ctx.tx((db) => ctx.ids(db).load(entity));
}

async function loadRooms(ctx: StepContext): Promise<Map<string, RoomInfo>> {
  const roomIdOf = await loadMap(ctx, "room");
  const rooms = await ctx.tx((db) =>
    db.room.findMany({ where: { id: { in: [...roomIdOf.values()] } }, select: { id: true, hotelId: true } }),
  );
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const out = new Map<string, RoomInfo>();
  for (const [legacy, id] of roomIdOf) {
    const room = byId.get(id);
    if (room) out.set(legacy, room);
  }
  return out;
}

/** The migrated user, or the actor with a KULLANICI_YOK_AKTOR warning. */
function userOrActor(ctx: StepContext, userIdOf: Map<string, string>, legacyId: unknown, where: string): string {
  const known = legacyId === null || legacyId === undefined ? undefined : userIdOf.get(idOf(legacyId));
  if (known) return known;
  ctx.report.warn("KULLANICI_YOK_AKTOR", "Eşlenmemiş kullanıcı yerine aktör yazıldı", where);
  return ctx.actorId;
}

const optUser = (userIdOf: Map<string, string>, legacyId: unknown): string | null =>
  legacyId === null || legacyId === undefined ? null : (userIdOf.get(idOf(legacyId)) ?? null);

// ---------------------------------------------------------------- MyBar

const MYBAR_SPEC = {
  key: ["id"],
  cols: [
    req("oda_id"),
    req("talep_tarihi"),
    req("durum"),
    opt("tamamlanma_tarihi"),
    opt("notlar"),
    opt("tamamlayan_id"),
    opt("goren_id"),
    opt("gorulme_tarihi"),
    opt("kapatma_aciklamasi"),
    opt("iptal_aciklamasi"),
    opt("iptal_eden_id"),
    opt("iptal_tarihi"),
  ],
};

/** Completed MyBar requests of the legacy database (used by the transaction matching). */
async function legacyMybarCandidates(ctx: StepContext): Promise<Map<string, MybarCandidate[]>> {
  const rows = await readAll(ctx, "minibar_dolum_talepleri", MYBAR_SPEC);
  const byRoom = new Map<string, MybarCandidate[]>();
  for (const r of rows) {
    const at = asDate(r.talep_tarihi);
    if (!at) continue;
    const list = byRoom.get(idOf(r.oda_id)) ?? [];
    list.push({
      id: idOf(r.id),
      odaId: idOf(r.oda_id),
      tamamlayanId: r.tamamlayan_id === null || r.tamamlayan_id === undefined ? null : idOf(r.tamamlayan_id),
      talepAt: at,
      tamamlanmaAt: asDate(r.tamamlanma_tarihi),
      durum: clean(r.durum),
    });
    byRoom.set(idOf(r.oda_id), list);
  }
  return byRoom;
}

async function stepMybar(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("mybarRequest");
  const itemRep = ctx.report.entity("mybarRequestItem");
  const requests = await readAll(ctx, "minibar_dolum_talepleri", MYBAR_SPEC);
  const details = await readAll(ctx, "minibar_dolum_talebi_detay", { key: ["id"], cols: [req("talep_id"), req("urun_id")] });
  rep.read(requests.length);
  itemRep.read(details.length);
  const rooms = await loadRooms(ctx);
  const userIdOf = await loadMap(ctx, "user");
  const productIdOf = await loadMap(ctx, "product");
  const mapped = await loadMap(ctx, "mybarRequest");

  const itemsOf = new Map<string, Row[]>();
  for (const d of details) {
    const list = itemsOf.get(idOf(d.talep_id)) ?? [];
    list.push(d);
    itemsOf.set(idOf(d.talep_id), list);
  }
  const known = new Set(requests.map((r) => idOf(r.id)));
  const orphans = details.filter((d) => !known.has(idOf(d.talep_id)));
  if (orphans.length > 0) itemRep.dropped(orphans.length, "TALEP_YOK");

  for (const part of chunked(requests, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.MybarRequestCreateManyInput[] = [];
      const itemCreates: Prisma.MybarRequestItemCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of part) {
        const legacyId = idOf(row.id);
        const items = itemsOf.get(legacyId) ?? [];
        if (mapped.has(legacyId)) {
          rep.existing();
          itemRep.existing(items.length);
          continue;
        }
        const room = rooms.get(idOf(row.oda_id));
        const at = asDate(row.talep_tarihi);
        if (!room || !at) {
          rep.dropped(1, room ? "TARIH_YOK" : "ODA_YOK");
          itemRep.dropped(items.length, room ? "TARIH_YOK" : "ODA_YOK");
          ctx.report.warn("MYBAR_ODA_YOK", "MyBar talebi eşlenmiş odaya bağlanamadı; taşınmadı", `talep ${legacyId}`);
          continue;
        }
        const status = dolumStatusFor(clean(row.durum));
        if (!status.known) ctx.report.warn("MYBAR_DURUM_BILINMIYOR", "Bilinmeyen MyBar durumu BEKLEMEDE yapıldı", `talep ${legacyId}: "${clean(row.durum)}"`);
        if (status.mapped) ctx.report.warn("DURUM_DONUSTURULDU", "Legacy onaylandi/reddedildi durumu TAMAMLANDI/IPTAL'e dönüştürüldü", `talep ${legacyId}`);
        const closeNote = orNull(row.kapatma_aciklamasi);
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: room.hotelId,
          roomId: room.id,
          businessDate: businessDay(businessDate(at)),
          status: status.status,
          language: "tr",
          note: orNull(row.notlar),
          seenById: optUser(userIdOf, row.goren_id),
          seenAt: asDate(row.gorulme_tarihi),
          completedById: optUser(userIdOf, row.tamamlayan_id),
          completedAt: asDate(row.tamamlanma_tarihi),
          closeNote,
          closedWithMissing: closeNote !== null,
          cancelledById: optUser(userIdOf, row.iptal_eden_id),
          cancelledAt: asDate(row.iptal_tarihi),
          cancelNote: orNull(row.iptal_aciklamasi),
          idempotencyKey: `legacy-${legacyId}`,
          clientIp: "legacy",
          createdAt: at,
        });
        pairs.push([legacyId, id]);
        rep.created();
        for (const d of items) {
          const productId = productIdOf.get(idOf(d.urun_id));
          if (!productId) {
            itemRep.dropped(1, "URUN_YOK");
            ctx.report.warn("URUN_YOK", "Kalem eşlenmemiş ürüne bağlı; taşınmadı", `MyBar talebi ${legacyId}: ürün ${idOf(d.urun_id)}`);
            continue;
          }
          itemCreates.push({ requestId: id, productId, requestedQty: 1, deliveredQty: status.status === "TAMAMLANDI" ? 1 : 0 });
          itemRep.created();
        }
      }
      if (creates.length > 0) await db.mybarRequest.createMany({ data: creates });
      if (itemCreates.length > 0) await db.mybarRequestItem.createMany({ data: itemCreates });
      await ctx.ids(db).putMany("mybarRequest", pairs);
    });
  }
}

// ---------------------------------------------------------------- transactions

const TX_SPEC = { key: ["id"], cols: [req("oda_id"), req("personel_id"), req("islem_tipi"), opt("islem_tarihi"), opt("aciklama")] };
const TX_ITEM_SPEC = {
  key: ["islem_id", "id"],
  cols: [
    req("urun_id"),
    opt("baslangic_stok"),
    opt("bitis_stok"),
    opt("tuketim"),
    opt("eklenen_miktar"),
    opt("ekstra_miktar"),
    opt("satis_fiyati"),
    opt("alis_fiyati"),
    opt("bedelsiz"),
    opt("setup_miktari"),
  ],
};

/** Merge-join cursor over a child table ordered by (parent id, id). */
class ChildCursor {
  private buf: Row[] = [];
  private pos = 0;
  private done = false;
  constructor(private readonly it: AsyncGenerator<Row[]>) {}

  private async fill(): Promise<void> {
    while (this.pos >= this.buf.length && !this.done) {
      const next = await this.it.next();
      if (next.done) {
        this.done = true;
        this.buf = [];
      } else {
        this.buf = next.value;
      }
      this.pos = 0;
    }
  }

  /** All children whose parent id is <= `maxParent`, in order. */
  async takeUpTo(maxParent: number, parentKey: string): Promise<Row[]> {
    const out: Row[] = [];
    for (;;) {
      await this.fill();
      if (this.pos >= this.buf.length) return out;
      const row = this.buf[this.pos];
      if (Number(row[parentKey]) > maxParent) return out;
      out.push(row);
      this.pos += 1;
    }
  }

  async drain(): Promise<Row[]> {
    return this.takeUpTo(Number.POSITIVE_INFINITY, "");
  }
}

async function stepTransactions(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("minibarTx");
  const itemRep = ctx.report.entity("minibarTxItem");
  if (!(await ctx.legacy.tableExists("minibar_islemleri"))) {
    ctx.report.warn("TABLO_YOK", "Legacy tabloda minibar_islemleri yok, boş varsayıldı", "minibar_islemleri");
    return;
  }
  const rooms = await loadRooms(ctx);
  const userIdOf = await loadMap(ctx, "user");
  const productIdOf = await loadMap(ctx, "product");
  const mapped = await loadMap(ctx, "minibarTx");
  const candidates = await legacyMybarCandidates(ctx);
  ctx.report.note("minibar_islem_detay: zimmet_detay_id, kar_tutari, kar_orani, kampanya_id taşınmadı; setupId boş bırakıldı");

  const children = new ChildCursor(streamRows(ctx, "minibar_islem_detay", TX_ITEM_SPEC));

  const consumeOrphans = (rows: Row[], known: Set<string>): void => {
    const lost = rows.filter((r) => !known.has(idOf(r.islem_id)));
    if (lost.length > 0) {
      itemRep.read(lost.length);
      itemRep.dropped(lost.length, "ISLEM_YOK");
    }
  };

  for await (const batch of ctx.legacy.rows<Row>("minibar_islemleri", TX_SPEC)) {
    rep.read(batch.length);
    const maxId = Number(batch[batch.length - 1].id);
    const itemRows = await children.takeUpTo(maxId, "islem_id");
    consumeOrphans(itemRows, new Set(batch.map((r) => idOf(r.id))));
    const itemsOf = new Map<string, Row[]>();
    for (const d of itemRows) {
      const list = itemsOf.get(idOf(d.islem_id)) ?? [];
      list.push(d);
      itemsOf.set(idOf(d.islem_id), list);
    }

    await ctx.tx(async (db) => {
      const creates: Prisma.MinibarTransactionCreateManyInput[] = [];
      const itemCreates: Prisma.MinibarTransactionItemCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of batch) {
        const legacyId = idOf(row.id);
        const items = itemsOf.get(legacyId) ?? [];
        itemRep.read(items.length);
        if (mapped.has(legacyId)) {
          rep.existing();
          itemRep.existing(items.length);
          continue;
        }
        const room = rooms.get(idOf(row.oda_id));
        if (!room) {
          rep.dropped(1, "ODA_YOK");
          itemRep.dropped(items.length, "ODA_YOK");
          ctx.report.warn("ISLEM_ODA_YOK", "İşlem eşlenmiş odaya bağlanamadı; taşınmadı", `işlem ${legacyId}`);
          continue;
        }
        const at = asDate(row.islem_tarihi);
        if (!at) ctx.report.warn("ISLEM_TARIHI_YOK", "İşlem tarihi boş; şimdiki zaman yazıldı", `işlem ${legacyId}`);
        const occurredAt = at ?? new Date();
        const userId = userOrActor(ctx, userIdOf, row.personel_id, `işlem ${legacyId}: personel_id`);
        const matched = clean(row.islem_tipi).toLowerCase() === "ekstra_ekleme"
          ? matchMybar(
              { odaId: idOf(row.oda_id), personelId: idOf(row.personel_id), at: occurredAt },
              candidates.get(idOf(row.oda_id)) ?? [],
              ctx.cfg.mybarWindowMin,
            ) !== null
          : false;
        const { type, legacyType } = txTypeFor(clean(row.islem_tipi), matched);
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: room.hotelId,
          roomId: room.id,
          userId,
          type,
          legacyType,
          note: orNull(row.aciklama),
          clientRequestId: null,
          occurredAt,
          createdAt: occurredAt,
        });
        pairs.push([legacyId, id]);
        rep.created();
        for (const d of items) {
          const productId = productIdOf.get(idOf(d.urun_id));
          if (!productId) {
            itemRep.dropped(1, "URUN_YOK");
            ctx.report.warn("URUN_YOK", "İşlem kalemi eşlenmemiş ürüne bağlı; taşınmadı", `işlem ${legacyId}: ürün ${idOf(d.urun_id)}`);
            continue;
          }
          const sale = parsePrice(d.satis_fiyati);
          const purchase = parsePrice(d.alis_fiyati);
          if (!sale.valid || !purchase.valid) {
            ctx.report.warn("ISLEM_FIYAT_GECERSIZ", "Geçersiz fiyat boş bırakıldı", `işlem ${legacyId}: ürün ${idOf(d.urun_id)}`);
          }
          const extra = num(d.ekstra_miktar);
          itemCreates.push({
            transactionId: id,
            productId,
            setupId: null,
            setupQty: num(d.setup_miktari) ?? 0,
            startStock: num(d.baslangic_stok) ?? 0,
            endStock: num(d.bitis_stok) ?? 0,
            consumed: num(d.tuketim) ?? 0,
            added: num(d.eklenen_miktar) ?? 0,
            purchasePrice: purchase.value,
            salePrice: sale.value,
            legacyExtra: extra !== null && extra > 0 ? extra : null,
            isComplimentary: Boolean(d.bedelsiz),
            createdAt: occurredAt,
          });
          itemRep.created();
        }
      }
      if (creates.length > 0) await db.minibarTransaction.createMany({ data: creates });
      if (itemCreates.length > 0) await db.minibarTransactionItem.createMany({ data: itemCreates });
      await ctx.ids(db).putMany("minibarTx", pairs);
    });
  }
  const rest = await children.drain();
  if (rest.length > 0) {
    itemRep.read(rest.length);
    itemRep.dropped(rest.length, "ISLEM_YOK");
  }
}

// ---------------------------------------------------------------- room checks

async function stepRoomChecks(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("roomCheck");
  const rooms = await loadRooms(ctx);
  const userIdOf = await loadMap(ctx, "user");
  const mapped = await loadMap(ctx, "roomCheck");
  for await (const rows of streamRows(ctx, "oda_kontrol_kayitlari", {
    key: ["id"],
    cols: [req("oda_id"), req("personel_id"), req("kontrol_tarihi"), opt("baslangic_zamani"), opt("bitis_zamani"), req("kontrol_tipi")],
  })) {
    rep.read(rows.length);
    await ctx.tx(async (db) => {
      const creates: Prisma.RoomCheckCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of rows) {
        const legacyId = idOf(row.id);
        if (mapped.has(legacyId)) {
          rep.existing();
          continue;
        }
        const room = rooms.get(idOf(row.oda_id));
        const day = typeof row.kontrol_tarihi === "string" ? row.kontrol_tarihi : "";
        if (!room || !DAY_RE.test(day)) {
          rep.dropped(1, room ? "TARIH_YOK" : "ODA_YOK");
          ctx.report.warn("KONTROL_ODA_YOK", "Oda kontrolü eşlenmiş odaya veya tarihe bağlanamadı; taşınmadı", `kontrol ${legacyId}`);
          continue;
        }
        if (!isKnownCheckType(clean(row.kontrol_tipi))) {
          ctx.report.warn("KONTROL_TIPI_BILINMIYOR", "Bilinmeyen kontrol tipi ACIK yapıldı", `kontrol ${legacyId}: "${clean(row.kontrol_tipi)}"`);
        }
        const startedAt = asDate(row.baslangic_zamani);
        const id = IdMap.newId();
        creates.push({
          id,
          roomId: room.id,
          userId: userOrActor(ctx, userIdOf, row.personel_id, `kontrol ${legacyId}: personel_id`),
          checkDate: businessDay(day),
          ...(startedAt ? { startedAt, createdAt: startedAt } : {}),
          endedAt: asDate(row.bitis_zamani),
          type: checkTypeFor(clean(row.kontrol_tipi)),
        });
        pairs.push([legacyId, id]);
        mapped.set(legacyId, id);
        rep.created();
      }
      if (creates.length > 0) await db.roomCheck.createMany({ data: creates });
      await ctx.ids(db).putMany("roomCheck", pairs);
    });
  }
}

// ---------------------------------------------------------------- pool rows

async function defaultCriticalLevel(db: TxClient, hotelId: string): Promise<number> {
  const key = "stock.defaultCriticalLevel";
  const rows = await db.setting.findMany({ where: { key, OR: [{ hotelId: null }, { hotelId }] }, select: { hotelId: true, value: true } });
  for (const row of [rows.find((r) => r.hotelId === hotelId), rows.find((r) => r.hotelId === null)]) {
    const parsed = row ? SETTING_SCHEMAS[key].safeParse(row.value) : undefined;
    if (parsed?.success) return parsed.data;
  }
  return DEFAULT_SETTINGS[key];
}

async function stepPoolRows(ctx: StepContext): Promise<Map<string, PoolRow>> {
  const rep = ctx.report.entity("hotelStock");
  const result = new Map<string, PoolRow>();
  const rows = await readAll(ctx, "otel_zimmet_stok", {
    key: ["id"],
    cols: [
      req("otel_id"),
      req("urun_id"),
      req("toplam_miktar"),
      req("kullanilan_miktar"),
      req("kalan_miktar"),
      opt("kritik_stok_seviyesi"),
      opt("olusturma_tarihi"),
    ],
  });
  rep.read(rows.length);
  const hotelIdOf = await loadMap(ctx, "hotel");
  const productIdOf = await loadMap(ctx, "product");
  const { mapped, names, present } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("hotelStock"),
    names: {
      hotels: new Map((await db.hotel.findMany({ select: { id: true, code: true } })).map((h) => [h.id, h.code])),
      products: new Map((await db.product.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name])),
    },
    present: new Set((await db.hotelStock.findMany({ select: { hotelId: true, productId: true } })).map((s) => `${s.hotelId}:${s.productId}`)),
  }));

  const levels = new Map<string, number>();
  for (const part of chunked(rows, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.HotelStockCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of part) {
        const legacyId = idOf(row.id);
        const key = `${idOf(row.otel_id)}:${idOf(row.urun_id)}`;
        const hotelId = hotelIdOf.get(idOf(row.otel_id));
        const productId = productIdOf.get(idOf(row.urun_id));
        if (!hotelId || !productId) {
          rep.dropped(1, "HAVUZ_BAGSIZ");
          ctx.report.warn("HAVUZ_BAGSIZ", "Havuz satırı eşlenmiş otele veya ürüne bağlanamadı; taşınmadı", `satır ${legacyId}`);
          continue;
        }
        const label = `${names.hotels.get(hotelId) ?? hotelId}/${names.products.get(productId) ?? productId}`;
        const rawTotal = num(row.toplam_miktar) ?? 0;
        const rawUsed = num(row.kullanilan_miktar) ?? 0;
        const rawRemaining = num(row.kalan_miktar) ?? 0;
        const used = Math.max(0, rawUsed);
        const remaining = Math.max(0, rawRemaining);
        const pool: PoolRow = {
          legacyId,
          legacyHotel: idOf(row.otel_id),
          legacyProduct: idOf(row.urun_id),
          hotelId,
          productId,
          total: used + remaining,
          used,
          remaining,
          critical: num(row.kritik_stok_seviyesi),
          createdAt: asDate(row.olusturma_tarihi),
        };
        if (rawUsed < 0 || rawRemaining < 0) {
          ctx.report.warn("HAVUZ_NEGATIF", "Negatif havuz değeri 0'a çekildi", `${label}: kullanılan ${rawUsed}, kalan ${rawRemaining}`);
        }
        if (rawTotal !== rawUsed + rawRemaining) {
          ctx.report.warn(
            "HAVUZ_TUTARSIZ",
            "Legacy toplam ≠ kullanılan + kalan; toplam = kullanılan + kalan olarak yazıldı",
            `${label}: toplam ${rawTotal}, kullanılan ${rawUsed}, kalan ${rawRemaining}`,
          );
        }
        if (mapped.has(key)) {
          rep.existing();
          result.set(legacyId, pool);
          continue;
        }
        if (present.has(`${hotelId}:${productId}`)) {
          rep.dropped(1, "HAVUZ_VAR");
          ctx.report.warn("HAVUZ_VAR", "Hedefte bu otel/ürün için havuz satırı zaten var; dokunulmadı", label);
          continue;
        }
        let critical = pool.critical === null ? null : Math.max(0, pool.critical);
        if (critical === null) {
          if (!levels.has(hotelId)) levels.set(hotelId, await defaultCriticalLevel(db, hotelId));
          critical = levels.get(hotelId)!;
        }
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId,
          productId,
          totalQty: pool.total,
          usedQty: used,
          remainingQty: remaining,
          criticalLevel: critical,
          ...(pool.createdAt ? { createdAt: pool.createdAt } : {}),
        });
        pairs.push([key, id]);
        mapped.set(key, id);
        present.add(`${hotelId}:${productId}`);
        result.set(legacyId, pool);
        rep.created();
      }
      if (creates.length > 0) await db.hotelStock.createMany({ data: creates });
      await ctx.ids(db).putMany("hotelStock", pairs);
    });
  }
  return result;
}

// ---------------------------------------------------------------- pool movements

async function stepMovements(ctx: StepContext, pool: Map<string, PoolRow>): Promise<void> {
  const rep = ctx.report.entity("hotelStockMovement");
  const userIdOf = await loadMap(ctx, "user");
  const stockOf = await loadMap(ctx, "hotelStock");
  const txIdOf = await loadMap(ctx, "minibarTx");
  const mapped = await loadMap(ctx, "stockMovement");
  const mybarTx = await ctx.tx(async (db) => {
    const rows = await db.minibarTransaction.findMany({ where: { type: "MYBAR_KARSILAMA" }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  });

  // Opening balances: one GOC movement per migrated pool row with a positive total.
  const openings = [...pool.values()].filter((p) => p.total > 0 && stockOf.has(`${p.legacyHotel}:${p.legacyProduct}`));
  rep.read(openings.length);
  for (const part of chunked(openings, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.HotelStockMovementCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const p of part) {
        const key = `open:${p.legacyHotel}:${p.legacyProduct}`;
        if (mapped.has(key)) {
          rep.existing();
          continue;
        }
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: p.hotelId,
          productId: p.productId,
          userId: ctx.actorId,
          type: "GOC",
          qty: p.total,
          note: "Göç açılış bakiyesi",
          ...(p.createdAt ? { createdAt: p.createdAt } : {}),
        });
        pairs.push([key, id]);
        mapped.set(key, id);
        rep.created();
      }
      if (creates.length > 0) await db.hotelStockMovement.createMany({ data: creates });
      await ctx.ids(db).putMany("stockMovement", pairs);
    });
  }

  for await (const rows of streamRows(ctx, "personel_zimmet_kullanim", {
    key: ["id"],
    cols: [
      req("otel_zimmet_stok_id"),
      opt("personel_id"),
      opt("urun_id"),
      req("kullanilan_miktar"),
      opt("islem_tarihi"),
      opt("islem_tipi"),
      opt("referans_islem_id"),
      opt("aciklama"),
    ],
  })) {
    rep.read(rows.length);
    await ctx.tx(async (db) => {
      const creates: Prisma.HotelStockMovementCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of rows) {
        const legacyId = idOf(row.id);
        const key = `pzk:${legacyId}`;
        if (mapped.has(key)) {
          rep.existing();
          continue;
        }
        const p = pool.get(idOf(row.otel_zimmet_stok_id));
        if (!p || !stockOf.has(`${p.legacyHotel}:${p.legacyProduct}`)) {
          rep.dropped(1, "HAREKET_YETIM");
          ctx.report.warn("HAREKET_YETIM", "Kullanım satırı taşınan bir havuz satırına bağlı değil; taşınmadı", `kullanım ${legacyId}`);
          continue;
        }
        const refLegacy = row.referans_islem_id === null || row.referans_islem_id === undefined ? null : idOf(row.referans_islem_id);
        const refTx = refLegacy ? txIdOf.get(refLegacy) : undefined;
        const move = movementFor(clean(row.islem_tipi), refTx !== undefined && mybarTx.has(refTx), num(row.kullanilan_miktar) ?? 0);
        if (!move.known) {
          ctx.report.warn("HAREKET_TIPI_BILINMIYOR", "Bilinmeyen hareket tipi KULLANIM sayıldı", `kullanım ${legacyId}: "${clean(row.islem_tipi)}"`);
        }
        const note = `${move.notePrefix ?? ""}${clean(row.aciklama)}`.trim();
        const at = asDate(row.islem_tarihi);
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: p.hotelId,
          productId: p.productId,
          userId: userOrActor(ctx, userIdOf, row.personel_id, `kullanım ${legacyId}: personel_id`),
          type: move.type,
          qty: move.qty,
          refType: refTx ? "MinibarTransaction" : null,
          refId: refTx ?? null,
          note: note === "" ? null : note,
          ...(at ? { createdAt: at } : {}),
        });
        pairs.push([key, id]);
        mapped.set(key, id);
        rep.created();
      }
      if (creates.length > 0) await db.hotelStockMovement.createMany({ data: creates });
      await ctx.ids(db).putMany("stockMovement", pairs);
    });
  }

  await verifyPool(ctx, pool, stockOf);
}

/** Balance invariant and Σ movement vs remaining quantity for every migrated pool row. */
async function verifyPool(ctx: StepContext, pool: Map<string, PoolRow>, stockOf: Map<string, string>): Promise<void> {
  const ids = [...new Set([...pool.values()].map((p) => stockOf.get(`${p.legacyHotel}:${p.legacyProduct}`)).filter((v): v is string => !!v))];
  if (ids.length === 0) return;
  const { broken, diffs } = await ctx.tx(async (db) => {
    const broken = await db.$queryRaw<{ n: bigint }[]>(
      Prisma.sql`SELECT count(*) AS n FROM hotel_stocks WHERE id = ANY(${ids}::text[]) AND total_qty - used_qty <> remaining_qty`,
    );
    const diffs = await db.$queryRaw<{ label: string; remaining: number; moved: bigint }[]>(Prisma.sql`
      SELECT h.code || '/' || p.name AS label, s.remaining_qty AS remaining, COALESCE(SUM(m.qty), 0) AS moved
      FROM hotel_stocks s
      JOIN hotels h ON h.id = s.hotel_id
      JOIN products p ON p.id = s.product_id
      LEFT JOIN hotel_stock_movements m ON m.hotel_id = s.hotel_id AND m.product_id = s.product_id
      WHERE s.id = ANY(${ids}::text[])
      GROUP BY h.code, p.name, s.remaining_qty
      HAVING COALESCE(SUM(m.qty), 0) <> s.remaining_qty`);
    return { broken: Number(broken[0]?.n ?? 0), diffs };
  });
  ctx.report.check({ name: "Havuz bakiyesi: toplam − kullanılan = kalan", ok: broken === 0, detail: `${ids.length} satır, ${broken} bozuk` });
  for (const d of diffs) {
    ctx.report.warn("HAVUZ_HAREKET_FARKI", "Havuz kalanı ile Σ hareket eşit değil (legacy hareket geçmişi eksik/tutarsız)", `${d.label}: kalan ${d.remaining}, Σ hareket ${Number(d.moved)}`);
  }
  ctx.report.check({
    name: "Havuz kalanı = Σ hareket (bilgi)",
    ok: true,
    detail: `${ids.length} satırın ${diffs.length} tanesinde fark var (HAVUZ_HAREKET_FARKI uyarıları)`,
  });
}

// ---------------------------------------------------------------- legacy pool archive

const ARCHIVES = [
  { table: "personel_zimmet", detail: "personel_zimmet_detay", fk: "zimmet_id" },
  { table: "zimmet_sablonlari", detail: "zimmet_sablon_detaylari", fk: "sablon_id" },
] as const;

async function stepArchive(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("legacyArchive");
  for (const a of ARCHIVES) {
    if (!(await ctx.legacy.tableExists(a.table))) continue;
    const parentCols = [...(await ctx.legacy.columns(a.table))].filter((c) => c !== "id").map((name) => ({ name }));
    const parents = await readAll(ctx, a.table, { key: ["id"], cols: parentCols });
    const childCols = (await ctx.legacy.tableExists(a.detail))
      ? [...(await ctx.legacy.columns(a.detail))].filter((c) => c !== "id").map((name) => ({ name }))
      : [];
    const children = childCols.length > 0 ? await readAll(ctx, a.detail, { key: ["id"], cols: childCols }) : [];
    const childrenOf = new Map<string, Row[]>();
    for (const c of children) {
      const list = childrenOf.get(idOf(c[a.fk])) ?? [];
      list.push(c);
      childrenOf.set(idOf(c[a.fk]), list);
    }
    rep.read(parents.length);
    const present = await ctx.tx(async (db) => {
      const rows = await db.legacyArchive.findMany({ where: { legacyTable: a.table }, select: { legacyId: true } });
      return new Set(rows.map((r) => r.legacyId));
    });
    const todo = parents.filter((p) => !present.has(idOf(p.id)));
    rep.existing(parents.length - todo.length);
    for (const part of chunked(todo, ctx.cfg.batch)) {
      await ctx.tx(async (db) => {
        await db.legacyArchive.createMany({
          data: part.map((p) => ({
            legacyTable: a.table,
            legacyId: idOf(p.id),
            payload: JSON.parse(JSON.stringify({ ...p, [a.detail]: childrenOf.get(idOf(p.id)) ?? [] })) as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
        rep.created(part.length);
      });
    }
  }
  ctx.report.note("personel_zimmet*, zimmet_sablon*: yalnız LegacyArchive'e arşivlendi, başka tabloya yazılmadı (spec §12)");
}
