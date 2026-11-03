import fs from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "../../../src/generated/prisma/client";
import { ConfigError } from "../config";
import { IdMap } from "../idmap";
import { decodeLogo, toPng } from "../logos";
import { clean, fold, hotelCodeFor, orNull, parsePrice, toBool, truncate } from "../mapping";
import type { StepContext } from "../types";
import { chunked, idOf, num, opt, readAll, req, type Row } from "./shared";

interface Shared {
  /** legacy hotel id -> target hotel id */
  hotelIdOf: Map<string, string>;
}

export async function runDefinitions(ctx: StepContext): Promise<void> {
  const shared: Shared = { hotelIdOf: new Map() };
  await stepHotels(ctx, shared);
  await stepFloors(ctx, shared);
  await stepRoomTypes(ctx, shared);
  await stepRooms(ctx, shared);
  await stepProductGroups(ctx);
  await stepProducts(ctx);
  await stepSetups(ctx);
  await stepSetupItems(ctx);
  await stepRoomTypeSetups(ctx, shared);
}

// ---------------------------------------------------------------- hotels + logos

async function stepHotels(ctx: StepContext, shared: Shared): Promise<void> {
  const rep = ctx.report.entity("hotel");
  const rows = await readAll(ctx, "oteller", {
    key: ["id"],
    cols: [
      req("ad"),
      opt("adres"),
      opt("telefon"),
      opt("aktif"),
      opt("logo"),
      opt("email_bildirim_aktif"),
      opt("email_uyari_aktif"),
      opt("email_rapor_aktif"),
      opt("email_sistem_aktif"),
    ],
  });
  rep.read(rows.length);
  const { mapped, targets } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("hotel"),
    targets: await db.hotel.findMany({ select: { id: true, code: true, logoUrl: true, address: true, phone: true } }),
  }));
  const byCode = new Map(targets.map((h) => [h.code, h]));

  // Resolve every unmapped hotel BEFORE anything is written.
  const todo: { row: Row; target: (typeof targets)[number]; code: string }[] = [];
  for (const row of rows) {
    const legacyId = idOf(row.id);
    const known = mapped.get(legacyId);
    if (known) {
      shared.hotelIdOf.set(legacyId, known);
      continue;
    }
    const name = clean(row.ad);
    const code = ctx.cfg.hotelMap[legacyId] ?? hotelCodeFor(name);
    const target = code ? byCode.get(code) : undefined;
    if (!code || !target) {
      throw new ConfigError(
        `Eşleşmeyen otel: ${name} (id ${legacyId}); --hotel-map kullanın veya seed'i çalıştırın`,
      );
    }
    todo.push({ row, target, code });
  }
  rep.existing(rows.length - todo.length);

  for (const { row, target, code } of todo) {
    const legacyId = idOf(row.id);
    let logoUrl: string | null = null;
    if (!target.logoUrl) logoUrl = await prepareLogo(ctx, row, code, legacyId);
    await ctx.tx(async (db) => {
      const data: Record<string, unknown> = {};
      if (logoUrl) data.logoUrl = logoUrl;
      if (!target.address && orNull(row.adres)) data.address = orNull(row.adres);
      if (!target.phone && orNull(row.telefon)) data.phone = orNull(row.telefon);
      const flags: [string, string][] = [
        ["emailNotifyEnabled", "email_bildirim_aktif"],
        ["emailAlertEnabled", "email_uyari_aktif"],
        ["emailReportEnabled", "email_rapor_aktif"],
        ["emailSystemEnabled", "email_sistem_aktif"],
      ];
      for (const [field, col] of flags) if (row[col] !== null && row[col] !== undefined) data[field] = Boolean(row[col]);
      if (Object.keys(data).length > 0) await db.hotel.update({ where: { id: target.id }, data });
      await ctx.ids(db).putMany("hotel", [[legacyId, target.id]]);
    });
    shared.hotelIdOf.set(legacyId, target.id);
    rep.existing();
  }
  ctx.report.note("oteller: email, vergi_no, ilk_stok_* alanları taşınmadı");
}

/** Decodes and converts the legacy logo; writes it only when the file is missing (never on a dry run). Returns the logo URL. */
async function prepareLogo(ctx: StepContext, row: Row, code: string, legacyId: string): Promise<string | null> {
  const decoded = decodeLogo(typeof row.logo === "string" ? row.logo : null);
  if (!decoded.ok) {
    if (decoded.reason !== "BOS") {
      ctx.report.warn("LOGO_ATLANDI", `Logo atlandı (${decoded.reason})`, `otel ${legacyId}: ${decoded.reason}`);
      if (decoded.reason === "SVG_DESTEKLENMEZ") ctx.report.warn("SVG_DESTEKLENMEZ", "SVG logo desteklenmiyor", `otel ${legacyId}`);
    }
    return null;
  }
  let png: Buffer;
  try {
    png = await toPng(decoded.bytes);
  } catch {
    ctx.report.warn("LOGO_ATLANDI", "Logo atlandı (GORSEL_DEGIL)", `otel ${legacyId}: görsel çözülemedi`);
    return null;
  }
  const file = `${code.toLowerCase()}.png`;
  const full = path.resolve(ctx.cfg.logoDir, file);
  if (!ctx.dryRun) {
    const exists = await fs
      .access(full)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, png);
    }
  }
  return `/brand/hotels/${file}`;
}

// ---------------------------------------------------------------- floors

interface FloorRow {
  id: unknown;
  otel_id: unknown;
  kat_adi: unknown;
  kat_no: unknown;
  aktif: unknown;
}

const FLOOR_SPEC = { key: ["id"], cols: [req("otel_id"), opt("kat_adi"), req("kat_no"), opt("aktif")] };

async function stepFloors(ctx: StepContext, shared: Shared): Promise<void> {
  const rep = ctx.report.entity("floor");
  const rows = (await readAll(ctx, "katlar", FLOOR_SPEC)) as unknown as FloorRow[];
  rep.read(rows.length);
  const { mapped, existingFloors } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("floor"),
    existingFloors: await db.floor.findMany({ select: { id: true, hotelId: true, number: true } }),
  }));
  const index = new Map(existingFloors.map((f) => [`${f.hotelId}:${f.number}`, f.id]));
  const claimed = new Set(mapped.values());
  const todo = rows.filter((r) => !mapped.has(idOf(r.id)));
  rep.existing(rows.length - todo.length);

  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: { id: string; hotelId: string; number: number; name: string; isActive: boolean }[] = [];
      const pairs: [string, string][] = [];
      for (const row of part) {
        const hotelId = shared.hotelIdOf.get(idOf(row.otel_id));
        const number = num(row.kat_no);
        if (!hotelId || number === null) {
          rep.dropped(1, "KAT_OTELSIZ");
          ctx.report.warn("KAT_OTELSIZ", "Kat otele veya numaraya bağlanamadı", `kat ${idOf(row.id)}`);
          continue;
        }
        const key = `${hotelId}:${number}`;
        let id = index.get(key);
        if (id) {
          if (claimed.has(id)) {
            ctx.report.warn("KAT_NO_COBLU", "Aynı otelde aynı kat numarası; ilk kata eşlendi", `otel ${idOf(row.otel_id)} kat_no ${number}`);
          }
          rep.existing();
        } else {
          id = IdMap.newId();
          creates.push({
            id,
            hotelId,
            number,
            name: clean(row.kat_adi) || `Kat ${number}`,
            isActive: toBool(row.aktif, true),
          });
          index.set(key, id);
          rep.created();
        }
        claimed.add(id);
        pairs.push([idOf(row.id), id]);
      }
      if (creates.length > 0) await db.floor.createMany({ data: creates });
      await ctx.ids(db).putMany("floor", pairs);
    });
  }
}

// ---------------------------------------------------------------- room types (global -> per hotel copy)

const ROOM_SPEC = {
  key: ["id"],
  cols: [
    req("kat_id"),
    req("oda_no"),
    opt("kapasite"),
    opt("aktif"),
    opt("qr_kod_token"),
    opt("qr_kod_olusturma_tarihi"),
    opt("misafir_mesaji"),
    opt("oda_tipi_id"),
  ],
};
const TYPE_SPEC = { key: ["id"], cols: [req("ad"), opt("aktif"), opt("dolap_sayisi")] };
const ASSIGN_SPEC = { key: ["otel_id", "oda_tipi_id", "setup_id"], cols: [] };

async function legacyFloorHotels(ctx: StepContext): Promise<Map<string, string>> {
  const floors = (await readAll(ctx, "katlar", FLOOR_SPEC)) as unknown as FloorRow[];
  return new Map(floors.map((f) => [idOf(f.id), idOf(f.otel_id)]));
}

async function stepRoomTypes(ctx: StepContext, shared: Shared): Promise<void> {
  const rep = ctx.report.entity("roomType");
  const types = await readAll(ctx, "oda_tipleri", TYPE_SPEC);
  const typeById = new Map(types.map((t) => [idOf(t.id), t]));
  const floorHotel = await legacyFloorHotels(ctx);
  const rooms = await readAll(ctx, "odalar", ROOM_SPEC);
  const assigns = await readAll(ctx, "oda_tipi_setup", ASSIGN_SPEC);

  // Used (hotel, type) pairs: rooms and assignments.
  const pairs = new Map<string, { otel: string; tip: string }>();
  const usedTypeIds = new Set<string>();
  const addPair = (otel: string | undefined, tip: unknown) => {
    if (!otel || tip === null || tip === undefined) return;
    pairs.set(`${otel}:${idOf(tip)}`, { otel, tip: idOf(tip) });
    usedTypeIds.add(idOf(tip));
  };
  for (const r of rooms) addPair(floorHotel.get(idOf(r.kat_id)), r.oda_tipi_id);
  for (const a of assigns) addPair(idOf(a.otel_id), a.oda_tipi_id);

  for (const t of types) {
    if (!usedTypeIds.has(idOf(t.id))) {
      rep.read();
      rep.dropped(1, "KULLANILMIYOR");
      ctx.report.warn("TIP_KULLANILMIYOR", "Hiçbir otelde kullanılmayan oda tipi taşınmadı", clean(t.ad));
    }
  }

  const usable = [...pairs.entries()].filter(([, p]) => typeById.has(p.tip) && shared.hotelIdOf.has(p.otel));
  rep.read(usable.length);
  const { mapped, existingTypes } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("roomType"),
    existingTypes: await db.roomType.findMany({ select: { id: true, hotelId: true, name: true } }),
  }));
  const index = new Map(existingTypes.map((t) => [`${t.hotelId}:${fold(t.name)}`, t.id]));
  const claimed = new Set(mapped.values());
  const todo = usable.filter(([key]) => !mapped.has(key));
  rep.existing(usable.length - todo.length);

  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: { id: string; hotelId: string; name: string; cabinetCount: number; isActive: boolean }[] = [];
      const out: [string, string][] = [];
      for (const [key, p] of part) {
        const type = typeById.get(p.tip)!;
        const hotelId = shared.hotelIdOf.get(p.otel)!;
        const name = clean(type.ad);
        const k = `${hotelId}:${fold(name)}`;
        let id = index.get(k);
        if (id) {
          if (claimed.has(id)) ctx.report.warn("TIP_AD_COBLU", "Aynı otelde aynı adlı oda tipi; ilkine eşlendi", `${name} (otel ${p.otel})`);
          rep.existing();
        } else {
          id = IdMap.newId();
          creates.push({
            id,
            hotelId,
            name,
            cabinetCount: Math.max(0, num(type.dolap_sayisi) ?? 0),
            isActive: toBool(type.aktif, true),
          });
          index.set(k, id);
          rep.created();
        }
        claimed.add(id);
        out.push([key, id]);
      }
      if (creates.length > 0) await db.roomType.createMany({ data: creates });
      await ctx.ids(db).putMany("roomType", out);
    });
  }
}

// ---------------------------------------------------------------- rooms

async function stepRooms(ctx: StepContext, shared: Shared): Promise<void> {
  const rep = ctx.report.entity("room");
  const rows = await readAll(ctx, "odalar", ROOM_SPEC);
  rep.read(rows.length);
  const floorHotel = await legacyFloorHotels(ctx);
  const state = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("room"),
    floors: await ctx.ids(db).load("floor"),
    types: await ctx.ids(db).load("roomType"),
    rooms: await db.room.findMany({ select: { id: true, hotelId: true, number: true, qrToken: true } }),
  }));
  const index = new Map(state.rooms.map((r) => [`${r.hotelId}:${r.number}`, r]));
  const tokens = new Set(state.rooms.flatMap((r) => (r.qrToken ? [r.qrToken] : [])));
  const claimed = new Set(state.mapped.values());
  const todo = rows.filter((r) => !state.mapped.has(idOf(r.id)));
  rep.existing(rows.length - todo.length);

  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.RoomCreateManyInput[] = [];
      const updates: { id: string; token: string; at: Date | null }[] = [];
      const out: [string, string][] = [];
      for (const row of part) {
        const legacyId = idOf(row.id);
        const katId = row.kat_id === null || row.kat_id === undefined ? null : idOf(row.kat_id);
        const otelLegacy = katId ? floorHotel.get(katId) : undefined;
        const hotelId = otelLegacy ? shared.hotelIdOf.get(otelLegacy) : undefined;
        const floorId = katId ? state.floors.get(katId) : undefined;
        if (!hotelId || !floorId) {
          rep.dropped(1, "ODA_KATSIZ");
          ctx.report.warn("ODA_KATSIZ", "Oda bir kata bağlı değil; taşınmadı", `oda ${legacyId} (${clean(row.oda_no)})`);
          continue;
        }
        const number = clean(row.oda_no);
        if (number === "") {
          rep.dropped(1, "ODA_NO_BOS");
          ctx.report.warn("ODA_NO_BOS", "Oda numarası boş; taşınmadı", `oda ${legacyId}`);
          continue;
        }
        const token = orNull(row.qr_kod_token);
        const at = row.qr_kod_olusturma_tarihi instanceof Date ? row.qr_kod_olusturma_tarihi : null;
        const existing = index.get(`${hotelId}:${number}`);
        if (existing) {
          if (claimed.has(existing.id)) {
            rep.dropped(1, "ODA_NO_COBLU");
            ctx.report.warn("ODA_NO_COBLU", "Aynı otelde aynı oda numarası; taşınmadı", `oda ${legacyId} (${number})`);
            continue;
          }
          claimed.add(existing.id);
          rep.existing();
          out.push([legacyId, existing.id]);
          // Legacy QR tokens stay valid: filled only while the room has none and the token is free.
          if (token && !existing.qrToken && !tokens.has(token)) {
            tokens.add(token);
            existing.qrToken = token;
            updates.push({ id: existing.id, token, at });
            ctx.report.warn("QR_TOKEN_DOLDURULDU", "Mevcut odaya legacy QR token'ı yazıldı (bilgi)", `oda ${legacyId} (${number})`);
          }
          continue;
        }
        let qrToken = token;
        if (qrToken && tokens.has(qrToken)) {
          ctx.report.warn("QR_TOKEN_CAKISMA", "QR token başka bir odada var; bu odada boş bırakıldı", `oda ${legacyId} (${number})`);
          qrToken = null;
        }
        if (qrToken) tokens.add(qrToken);
        let guestMessage: string | null = null;
        const msg = orNull(row.misafir_mesaji);
        if (msg) {
          const t = truncate(msg, 500);
          guestMessage = t.value;
          if (t.cut) ctx.report.warn("MESAJ_KISALTILDI", "Misafir mesajı 500 karaktere kısaltıldı", `oda ${legacyId}`);
        }
        let roomTypeId: string | null = null;
        if (row.oda_tipi_id !== null && row.oda_tipi_id !== undefined) {
          roomTypeId = state.types.get(`${otelLegacy}:${idOf(row.oda_tipi_id)}`) ?? null;
          if (!roomTypeId) ctx.report.warn("ODA_TIPI_YOK", "Oda tipi bulunamadı; oda tipsiz taşındı", `oda ${legacyId}`);
        }
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId,
          floorId,
          roomTypeId,
          number,
          capacity: num(row.kapasite),
          qrToken,
          qrGeneratedAt: qrToken ? at : null,
          guestMessage,
          isActive: toBool(row.aktif, true),
        });
        index.set(`${hotelId}:${number}`, { id, hotelId, number, qrToken });
        claimed.add(id);
        rep.created();
        out.push([legacyId, id]);
      }
      if (creates.length > 0) await db.room.createMany({ data: creates });
      for (const u of updates) await db.room.update({ where: { id: u.id }, data: { qrToken: u.token, qrGeneratedAt: u.at } });
      await ctx.ids(db).putMany("room", out);
    });
  }
  ctx.report.note("odalar: qr_kod_gorsel taşınmadı (token'dan yeniden üretilir); qr_kod_token aynen korundu");
}

// ---------------------------------------------------------------- product groups / products

async function stepProductGroups(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("productGroup");
  const rows = await readAll(ctx, "urun_gruplari", { key: ["id"], cols: [req("grup_adi"), opt("aciklama"), opt("aktif")] });
  rep.read(rows.length);
  const { mapped, groups } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("productGroup"),
    groups: await db.productGroup.findMany({ select: { id: true, name: true } }),
  }));
  const index = new Map(groups.map((g) => [fold(g.name), g.id]));
  const todo = rows.filter((r) => !mapped.has(idOf(r.id)));
  rep.existing(rows.length - todo.length);

  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: { id: string; name: string; description: string | null; isActive: boolean }[] = [];
      const out: [string, string][] = [];
      for (const row of part) {
        const name = clean(row.grup_adi);
        if (name === "") {
          rep.dropped(1, "GRUP_ADSIZ");
          ctx.report.warn("GRUP_ADSIZ", "Ürün grubunun adı boş; taşınmadı", `grup ${idOf(row.id)}`);
          continue;
        }
        let id = index.get(fold(name));
        if (id) {
          rep.existing();
        } else {
          id = IdMap.newId();
          creates.push({ id, name, description: orNull(row.aciklama), isActive: toBool(row.aktif, true) });
          index.set(fold(name), id);
          rep.created();
        }
        out.push([idOf(row.id), id]);
      }
      if (creates.length > 0) await db.productGroup.createMany({ data: creates });
      await ctx.ids(db).putMany("productGroup", out);
    });
  }
}

async function stepProducts(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("product");
  const rows = await readAll(ctx, "urunler", {
    key: ["id"],
    cols: [
      req("grup_id"),
      req("urun_adi"),
      opt("barkod"),
      opt("birim"),
      opt("kritik_stok_seviyesi"),
      opt("aktif"),
      opt("urun_kodu"),
      opt("satis_fiyati"),
      opt("alis_fiyati"),
    ],
  });
  rep.read(rows.length);
  const state = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("product"),
    groups: await ctx.ids(db).load("productGroup"),
    products: await db.product.findMany({ select: { id: true, groupId: true, name: true, code: true, barcode: true } }),
  }));
  const index = new Map(state.products.map((p) => [`${p.groupId}|${fold(p.name)}`, p.id]));
  const codes = new Set(state.products.flatMap((p) => (p.code ? [p.code] : [])));
  const barcodes = new Set(state.products.flatMap((p) => (p.barcode ? [p.barcode] : [])));
  const todo = rows.filter((r) => !state.mapped.has(idOf(r.id)));
  rep.existing(rows.length - todo.length);

  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: {
        id: string;
        groupId: string;
        code: string | null;
        name: string;
        barcode: string | null;
        unit: string;
        criticalLevel: number;
        purchasePrice: string | null;
        salePrice: string | null;
        isActive: boolean;
      }[] = [];
      const out: [string, string][] = [];
      for (const row of part) {
        const legacyId = idOf(row.id);
        const groupId = state.groups.get(idOf(row.grup_id));
        const rawName = clean(row.urun_adi);
        if (!groupId || rawName === "") {
          rep.dropped(1, !groupId ? "URUN_GRUPSUZ" : "URUN_ADSIZ");
          ctx.report.warn(!groupId ? "URUN_GRUPSUZ" : "URUN_ADSIZ", "Ürün grubu veya adı yok; taşınmadı", `urun ${legacyId}`);
          continue;
        }
        const t = truncate(rawName, 200);
        if (t.cut) ctx.report.warn("URUN_AD_KISALTILDI", "Ürün adı 200 karaktere kısaltıldı", `urun ${legacyId}`);
        const key = `${groupId}|${fold(t.value)}`;
        let id = index.get(key);
        if (id) {
          rep.existing();
          out.push([legacyId, id]);
          continue;
        }
        let code = orNull(row.urun_kodu);
        let barcode = orNull(row.barkod);
        if (code && codes.has(code)) {
          ctx.report.warn("URUN_CAKISMA", "Ürün kodu başka üründe var; boş bırakıldı", `urun ${legacyId}: kod ${code}`);
          code = null;
        }
        if (barcode && barcodes.has(barcode)) {
          ctx.report.warn("URUN_CAKISMA", "Barkod başka üründe var; boş bırakıldı", `urun ${legacyId}: barkod ${barcode}`);
          barcode = null;
        }
        if (code) codes.add(code);
        if (barcode) barcodes.add(barcode);
        const purchase = parsePrice(row.alis_fiyati);
        const sale = parsePrice(row.satis_fiyati);
        if (!purchase.valid || !sale.valid) {
          ctx.report.warn("FIYAT_GECERSIZ", "Geçersiz veya negatif fiyat; boş bırakıldı", `urun ${legacyId}`);
        }
        const critical = num(row.kritik_stok_seviyesi);
        id = IdMap.newId();
        creates.push({
          id,
          groupId,
          code,
          name: t.value,
          barcode,
          unit: orNull(row.birim) ?? "Adet",
          criticalLevel: critical !== null && critical >= 0 ? Math.floor(critical) : 10,
          purchasePrice: purchase.value,
          salePrice: sale.value,
          isActive: toBool(row.aktif, true),
        });
        index.set(key, id);
        rep.created();
        out.push([legacyId, id]);
      }
      if (creates.length > 0) await db.product.createMany({ data: creates });
      await ctx.ids(db).putMany("product", out);
    });
  }
  ctx.report.note("urunler: kar_tutari, kar_orani taşınmadı");
}

// ---------------------------------------------------------------- setups, contents, assignments

async function stepSetups(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("setup");
  const rows = await readAll(ctx, "setuplar", {
    key: ["id"],
    cols: [req("ad"), opt("aciklama"), opt("aktif"), opt("dolap_ici")],
  });
  rep.read(rows.length);
  const { mapped, setups } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("setup"),
    setups: await db.setup.findMany({ select: { id: true, name: true } }),
  }));
  const index = new Map(setups.map((s) => [fold(s.name), s.id]));
  const todo = rows.filter((r) => !mapped.has(idOf(r.id)));
  rep.existing(rows.length - todo.length);

  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: { id: string; name: string; description: string | null; isInsideCabinet: boolean; isActive: boolean }[] = [];
      const out: [string, string][] = [];
      for (const row of part) {
        const name = clean(row.ad);
        if (name === "") {
          rep.dropped(1, "SETUP_ADSIZ");
          ctx.report.warn("SETUP_ADSIZ", "Setup adı boş; taşınmadı", `setup ${idOf(row.id)}`);
          continue;
        }
        let id = index.get(fold(name));
        if (id) {
          rep.existing();
        } else {
          id = IdMap.newId();
          creates.push({
            id,
            name,
            description: orNull(row.aciklama),
            isInsideCabinet: toBool(row.dolap_ici, true),
            isActive: toBool(row.aktif, true),
          });
          index.set(fold(name), id);
          rep.created();
        }
        out.push([idOf(row.id), id]);
      }
      if (creates.length > 0) await db.setup.createMany({ data: creates });
      await ctx.ids(db).putMany("setup", out);
    });
  }
}

async function stepSetupItems(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("setupItem");
  const rows = await readAll(ctx, "setup_icerik", { key: ["id"], cols: [req("setup_id"), req("urun_id"), opt("adet")] });
  rep.read(rows.length);
  const state = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("setupItem"),
    setups: await ctx.ids(db).load("setup"),
    products: await ctx.ids(db).load("product"),
    items: await db.setupItem.findMany({ select: { id: true, setupId: true, productId: true } }),
  }));
  const index = new Map(state.items.map((i) => [`${i.setupId}|${i.productId}`, i.id]));

  // One entry per (setup, product): duplicate rows are summed.
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${idOf(row.setup_id)}:${idOf(row.urun_id)}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const todo: [string, Row[]][] = [];
  for (const [key, list] of groups) {
    if (state.mapped.has(key)) {
      rep.existing();
      if (list.length > 1) rep.dropped(list.length - 1, "birleştirildi (SETUP_ICERIK_TEKRAR)");
    } else todo.push([key, list]);
  }

  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: { id: string; setupId: string; productId: string; qty: number }[] = [];
      const out: [string, string][] = [];
      for (const [key, list] of part) {
        const first = list[0];
        const setupId = state.setups.get(idOf(first.setup_id));
        const productId = state.products.get(idOf(first.urun_id));
        if (!setupId || !productId) {
          rep.dropped(list.length, "SETUP_ICERIK_YETIM");
          for (const r of list) {
            ctx.report.warn("SETUP_ICERIK_YETIM", "Setup veya ürünü olmayan içerik satırı; taşınmadı", `satır ${idOf(r.id)} (setup ${idOf(r.setup_id)}, ürün ${idOf(r.urun_id)})`);
          }
          continue;
        }
        let qty = 0;
        for (const r of list) {
          const a = num(r.adet);
          if (a === null || a < 1) {
            ctx.report.warn("SETUP_ICERIK_ADET", "Adet 1'den küçük; 1 yapıldı", `satır ${idOf(r.id)}`);
            qty += 1;
          } else qty += Math.floor(a);
        }
        if (list.length > 1) {
          ctx.report.warn("SETUP_ICERIK_TEKRAR", "Tekrar eden setup içeriği toplandı", `setup ${idOf(first.setup_id)}, ürün ${idOf(first.urun_id)}: ${list.length} satır`);
          rep.dropped(list.length - 1, "birleştirildi (SETUP_ICERIK_TEKRAR)");
        }
        const tk = `${setupId}|${productId}`;
        let id = index.get(tk);
        if (id) {
          rep.existing();
        } else {
          id = IdMap.newId();
          creates.push({ id, setupId, productId, qty });
          index.set(tk, id);
          rep.created();
        }
        out.push([key, id]);
      }
      if (creates.length > 0) await db.setupItem.createMany({ data: creates });
      await ctx.ids(db).putMany("setupItem", out);
    });
  }
}

async function stepRoomTypeSetups(ctx: StepContext, shared: Shared): Promise<void> {
  const rep = ctx.report.entity("roomTypeSetup");
  const rows = await readAll(ctx, "oda_tipi_setup", ASSIGN_SPEC);
  rep.read(rows.length);
  const state = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("roomTypeSetup"),
    types: await ctx.ids(db).load("roomType"),
    setups: await ctx.ids(db).load("setup"),
    existing: await db.roomTypeSetup.findMany({ select: { hotelId: true, roomTypeId: true, setupId: true } }),
  }));
  const have = new Set(state.existing.map((e) => `${e.hotelId}:${e.roomTypeId}:${e.setupId}`));
  const seen = new Set<string>();

  for (const part of chunked(rows, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: { hotelId: string; roomTypeId: string; setupId: string }[] = [];
      const out: [string, string][] = [];
      for (const row of part) {
        const legacyKey = `${idOf(row.otel_id)}:${idOf(row.oda_tipi_id)}:${idOf(row.setup_id)}`;
        if (state.mapped.has(legacyKey)) {
          rep.existing();
          continue;
        }
        const hotelId = shared.hotelIdOf.get(idOf(row.otel_id));
        const roomTypeId = state.types.get(`${idOf(row.otel_id)}:${idOf(row.oda_tipi_id)}`);
        const setupId = state.setups.get(idOf(row.setup_id));
        if (!hotelId || !roomTypeId || !setupId) {
          rep.dropped(1, "ATAMA_YETIM");
          ctx.report.warn("ATAMA_YETIM", "Oda tipi veya setup'ı olmayan atama; taşınmadı", legacyKey);
          continue;
        }
        if (seen.has(legacyKey)) {
          rep.dropped(1, "ATAMA_TEKRAR");
          continue;
        }
        seen.add(legacyKey);
        const target = `${hotelId}:${roomTypeId}:${setupId}`;
        if (have.has(target)) {
          rep.existing();
        } else {
          creates.push({ hotelId, roomTypeId, setupId });
          have.add(target);
          rep.created();
        }
        out.push([legacyKey, target]);
      }
      if (creates.length > 0) await db.roomTypeSetup.createMany({ data: creates });
      await ctx.ids(db).putMany("roomTypeSetup", out);
    });
  }
}
