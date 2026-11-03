import { Prisma } from "../../../src/generated/prisma/client";
import { businessDateStart, businessDay } from "../../../src/lib/time";
import { IdMap } from "../idmap";
import {
  clean,
  dndStatusFor,
  hhmm,
  isKnownDndStatus,
  isKnownScanKind,
  isKnownTaskStatus,
  isKnownUploadStatus,
  isKnownUploadTaskStatus,
  orNull,
  scanKindFor,
  taskStatusFor,
  taskTypeFor,
  taskTypeFromGorevTipi,
  uploadKindFor,
  uploadStatusFor,
  uploadTaskStatusFor,
  type TaskStatusName,
  type TaskTypeName,
  type UploadKindName,
} from "../mapping";
import type { StepContext } from "../types";
import { loadMap, loadRooms, optUser, userOrActor, type RoomInfo } from "./history";
import { chunked, idOf, num, opt, readAll, req, streamRows, type Row } from "./shared";

const asDate = (v: unknown): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written 'yyyy-MM-dd' (the legacy `date` columns arrive as plain strings). */
function validDay(v: unknown): string | null {
  if (typeof v !== "string" || !DAY_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

const upper = (s: string): string => s.trim().replace(/\s+/g, "_").toUpperCase();

/** Sub-steps in order: occupancy, tasks, DND, QR log, audit/system log (the last two are skipped by `--skip-logs`). */
export async function runTasks(ctx: StepContext): Promise<void> {
  await stepUploads(ctx);
  await stepGuestRecords(ctx);
  await stepUploadTasks(ctx);
  await stepDailyTasks(ctx);
  await stepTaskLogs(ctx);
  await stepDnd(ctx);
  if (ctx.cfg.skipLogs) {
    ctx.report.note("--skip-logs: QR okutma günlüğü, audit_logs ve sistem_loglari taşınmadı");
    return;
  }
  await stepQrLog(ctx);
  await stepAuditLogs(ctx);
}

// ---------------------------------------------------------------- uploads

const UPLOAD_SPEC = {
  key: ["id"],
  cols: [
    req("otel_id"),
    req("islem_kodu"),
    opt("dosya_adi"),
    req("dosya_tipi"),
    opt("durum"),
    opt("toplam_satir"),
    opt("basarili_satir"),
    opt("hatali_satir"),
    opt("hata_detaylari"),
    opt("yukleme_tarihi"),
    opt("yuklenen_kullanici_id"),
    opt("yukleyen_id"),
  ],
};

function parseErrors(raw: unknown): Prisma.InputJsonValue {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === "object") return raw as Prisma.InputJsonValue;
  const text = clean(raw);
  if (text === "") return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return (Array.isArray(parsed) ? parsed : [parsed]) as Prisma.InputJsonValue;
  } catch {
    return [{ message: text.slice(0, 2000) }];
  }
}

const nonNeg = (v: unknown): number => Math.max(0, Math.trunc(num(v) ?? 0));

async function stepUploads(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("occupancyUpload");
  const rows = await readAll(ctx, "dosya_yuklemeleri", UPLOAD_SPEC);
  rep.read(rows.length);
  ctx.report.note("dosya_yuklemeleri: dosya_yolu, dosya_boyutu ve silme_tarihi taşınmadı (dosyalar taşınmaz, saklama süresi 4 gün)");
  const hotelIdOf = await loadMap(ctx, "hotel");
  const userIdOf = await loadMap(ctx, "user");
  const { mapped, codes } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("occupancyUpload"),
    codes: new Set((await db.occupancyUpload.findMany({ select: { code: true } })).map((u) => u.code)),
  }));

  for (const part of chunked(rows, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.OccupancyUploadCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of part) {
        const legacyId = idOf(row.id);
        if (mapped.has(legacyId)) {
          rep.existing();
          continue;
        }
        const hotelId = hotelIdOf.get(idOf(row.otel_id));
        if (!hotelId) {
          rep.dropped(1, "OTEL_YOK");
          ctx.report.warn("YUKLEME_OTEL_YOK", "Yükleme eşlenmiş otele bağlanamadı; taşınmadı", `yükleme ${legacyId}`);
          continue;
        }
        const kind = uploadKindFor(clean(row.dosya_tipi));
        if (!kind) {
          rep.dropped(1, "DOSYA_TIPI_BILINMIYOR");
          ctx.report.warn("DOSYA_TIPI_BILINMIYOR", "Bilinmeyen dosya tipi; yükleme taşınmadı", `yükleme ${legacyId}: "${clean(row.dosya_tipi)}"`);
          continue;
        }
        if (!isKnownUploadStatus(clean(row.durum))) {
          ctx.report.warn("YUKLEME_DURUM_BILINMIYOR", "Bilinmeyen yükleme durumu YUKLENDI yapıldı", `yükleme ${legacyId}: "${clean(row.durum)}"`);
        }
        let code = clean(row.islem_kodu) || `LEGACY-${legacyId}`;
        if (codes.has(code)) {
          ctx.report.warn("YUKLEME_KODU_CAKISMA", "İşlem kodu hedefte vardı; -L{id} eki verildi", `${code} -> ${code}-L${legacyId}`);
          code = `${code}-L${legacyId}`;
        }
        codes.add(code);
        const uploader = optUser(userIdOf, row.yuklenen_kullanici_id) ?? optUser(userIdOf, row.yukleyen_id);
        if (!uploader) ctx.report.warn("KULLANICI_YOK_AKTOR", "Eşlenmemiş kullanıcı yerine aktör yazıldı", `yükleme ${legacyId}: yükleyen`);
        const createdAt = asDate(row.yukleme_tarihi);
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId,
          code,
          fileName: clean(row.dosya_adi) || "bilinmiyor",
          kind,
          status: uploadStatusFor(clean(row.durum)),
          totalRows: nonNeg(row.toplam_satir),
          okRows: nonNeg(row.basarili_satir),
          errorRows: nonNeg(row.hatali_satir),
          errors: parseErrors(row.hata_detaylari),
          storedPath: null,
          userId: uploader ?? ctx.actorId,
          ...(createdAt ? { createdAt } : {}),
        });
        pairs.push([legacyId, id]);
        mapped.set(legacyId, id);
        rep.created();
      }
      if (creates.length > 0) await db.occupancyUpload.createMany({ data: creates });
      await ctx.ids(db).putMany("occupancyUpload", pairs);
    });
  }
}

// ---------------------------------------------------------------- guest records

async function stepGuestRecords(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("guestRecord");
  if (!(await ctx.legacy.tableExists("misafir_kayitlari"))) {
    ctx.report.warn("TABLO_YOK", "Legacy tabloda misafir_kayitlari yok, boş varsayıldı", "misafir_kayitlari");
    return;
  }
  const rooms = await loadRooms(ctx);
  const uploadOf = await loadMap(ctx, "occupancyUpload");
  // process code -> legacy upload id (first upload wins when a legacy code repeats)
  const codeToUpload = new Map<string, string>();
  for (const u of await readAll(ctx, "dosya_yuklemeleri", { key: ["id"], cols: [req("islem_kodu")] })) {
    const code = clean(u.islem_kodu);
    if (code && !codeToUpload.has(code)) codeToUpload.set(code, idOf(u.id));
  }
  const mapped = await loadMap(ctx, "guestRecord");

  for await (const rows of streamRows(ctx, "misafir_kayitlari", {
    key: ["id"],
    cols: [
      req("oda_id"),
      req("islem_kodu"),
      opt("misafir_sayisi"),
      req("giris_tarihi"),
      opt("giris_saati"),
      req("cikis_tarihi"),
      opt("cikis_saati"),
      req("kayit_tipi"),
      opt("olusturma_tarihi"),
    ],
  })) {
    rep.read(rows.length);
    await ctx.tx(async (db) => {
      const creates: Prisma.GuestRecordCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of rows) {
        const legacyId = idOf(row.id);
        if (mapped.has(legacyId)) {
          rep.existing();
          continue;
        }
        const room = rooms.get(idOf(row.oda_id));
        if (!room) {
          rep.dropped(1, "ODA_YOK");
          ctx.report.warn("MISAFIR_ODA_YOK", "Misafir kaydı eşlenmiş odaya bağlanamadı; taşınmadı", `kayıt ${legacyId}`);
          continue;
        }
        const kind = uploadKindFor(clean(row.kayit_tipi));
        if (!kind) {
          rep.dropped(1, "KAYIT_TIPI_BILINMIYOR");
          ctx.report.warn("KAYIT_TIPI_BILINMIYOR", "Bilinmeyen misafir kayıt tipi; taşınmadı", `kayıt ${legacyId}: "${clean(row.kayit_tipi)}"`);
          continue;
        }
        const arrival = validDay(row.giris_tarihi);
        const departure = validDay(row.cikis_tarihi);
        if (!arrival || !departure) {
          rep.dropped(1, "TARIH_YOK");
          ctx.report.warn("MISAFIR_TARIH_YOK", "Misafir kaydının giriş/çıkış tarihi geçersiz; taşınmadı", `kayıt ${legacyId}`);
          continue;
        }
        const code = clean(row.islem_kodu);
        const legacyUpload = codeToUpload.get(code);
        const createdAt = asDate(row.olusturma_tarihi);
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: room.hotelId,
          roomId: room.id,
          uploadId: (legacyUpload ? uploadOf.get(legacyUpload) : undefined) ?? null,
          batchCode: code,
          guestCount: nonNeg(row.misafir_sayisi),
          arrivalDate: businessDay(arrival),
          arrivalTime: hhmm(row.giris_saati),
          departureDate: businessDay(departure),
          departureTime: hhmm(row.cikis_saati),
          kind,
          ...(createdAt ? { createdAt } : {}),
        });
        pairs.push([legacyId, id]);
        mapped.set(legacyId, id);
        rep.created();
      }
      if (creates.length > 0) await db.guestRecord.createMany({ data: creates });
      await ctx.ids(db).putMany("guestRecord", pairs);
    });
  }
}

// ---------------------------------------------------------------- upload tasks

async function stepUploadTasks(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("uploadTask");
  const rows = await readAll(ctx, "yukleme_gorevleri", {
    key: ["id"],
    cols: [req("otel_id"), req("gorev_tarihi"), req("dosya_tipi"), opt("durum"), opt("dosya_yukleme_id"), opt("olusturma_tarihi")],
  });
  rep.read(rows.length);
  const hotelIdOf = await loadMap(ctx, "hotel");
  const uploadOf = await loadMap(ctx, "occupancyUpload");
  const { mapped, taken } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("uploadTask"),
    taken: new Set(
      (await db.uploadTask.findMany({ select: { hotelId: true, date: true, kind: true } })).map(
        (t) => `${t.hotelId}:${t.date.toISOString().slice(0, 10)}:${t.kind}`,
      ),
    ),
  }));

  // (hotel, date, kind) is unique in the target: the newest legacy row wins.
  interface Candidate {
    row: Row;
    legacyId: string;
    hotelId: string;
    day: string;
    kind: UploadKindName;
    key: string;
    created: number;
  }
  const winners = new Map<string, Candidate>();
  const losers: Candidate[] = [];
  for (const row of rows) {
    const legacyId = idOf(row.id);
    const hotelId = hotelIdOf.get(idOf(row.otel_id));
    const day = validDay(row.gorev_tarihi);
    const kind = uploadKindFor(clean(row.dosya_tipi));
    if (!hotelId || !day || !kind) {
      const reason = !hotelId ? "OTEL_YOK" : !day ? "TARIH_YOK" : "DOSYA_TIPI_BILINMIYOR";
      rep.dropped(1, reason);
      ctx.report.warn("YUKLEME_GOREVI_ATLANDI", "Yükleme görevi otel/tarih/tipe bağlanamadı; taşınmadı", `görev ${legacyId}: ${reason}`);
      continue;
    }
    const cand: Candidate = { row, legacyId, hotelId, day, kind, key: `${hotelId}:${day}:${kind}`, created: asDate(row.olusturma_tarihi)?.getTime() ?? 0 };
    const current = winners.get(cand.key);
    if (!current) {
      winners.set(cand.key, cand);
    } else if (cand.created > current.created || (cand.created === current.created && Number(cand.legacyId) > Number(current.legacyId))) {
      losers.push(current);
      winners.set(cand.key, cand);
    } else {
      losers.push(cand);
    }
  }
  for (const l of losers) {
    rep.dropped(1, "YUKLEME_GOREV_CAKISMA");
    ctx.report.warn("YUKLEME_GOREV_CAKISMA", "Aynı (otel, gün, tip) için daha yeni bir yükleme görevi var; eskisi taşınmadı", `görev ${l.legacyId}`);
  }

  for (const part of chunked([...winners.values()], ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.UploadTaskCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const c of part) {
        if (mapped.has(c.legacyId)) {
          rep.existing();
          continue;
        }
        if (taken.has(c.key)) {
          rep.dropped(1, "HEDEFTE_VAR");
          ctx.report.warn("YUKLEME_GOREVI_VAR", "Hedefte aynı (otel, gün, tip) için yükleme görevi var; dokunulmadı", c.key);
          continue;
        }
        if (!isKnownUploadTaskStatus(clean(c.row.durum))) {
          ctx.report.warn("YUKLEME_GOREV_DURUM_BILINMIYOR", "Bilinmeyen yükleme görevi durumu BEKLIYOR yapıldı", `görev ${c.legacyId}: "${clean(c.row.durum)}"`);
        }
        const createdAt = asDate(c.row.olusturma_tarihi);
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: c.hotelId,
          date: businessDay(c.day),
          kind: c.kind,
          status: uploadTaskStatusFor(clean(c.row.durum)),
          uploadId: c.row.dosya_yukleme_id === null || c.row.dosya_yukleme_id === undefined ? null : (uploadOf.get(idOf(c.row.dosya_yukleme_id)) ?? null),
          ...(createdAt ? { createdAt } : {}),
        });
        pairs.push([c.legacyId, id]);
        taken.add(c.key);
        rep.created();
      }
      if (creates.length > 0) await db.uploadTask.createMany({ data: creates });
      await ctx.ids(db).putMany("uploadTask", pairs);
    });
  }
}

// ---------------------------------------------------------------- daily tasks

interface Parent {
  legacyHotel: string;
  hotelId: string | null;
  day: string | null;
  tip: string;
  completedAt: Date | null;
  createdAt: Date | null;
}

async function loadParents(ctx: StepContext): Promise<Map<string, Parent>> {
  const hotelIdOf = await loadMap(ctx, "hotel");
  const rows = await readAll(ctx, "gunluk_gorevler", {
    key: ["id"],
    cols: [req("otel_id"), req("gorev_tarihi"), opt("gorev_tipi"), opt("tamamlanma_tarihi"), opt("olusturma_tarihi")],
  });
  const out = new Map<string, Parent>();
  for (const r of rows) {
    out.set(idOf(r.id), {
      legacyHotel: idOf(r.otel_id),
      hotelId: hotelIdOf.get(idOf(r.otel_id)) ?? null,
      day: validDay(r.gorev_tarihi),
      tip: clean(r.gorev_tipi),
      completedAt: asDate(r.tamamlanma_tarihi),
      createdAt: asDate(r.olusturma_tarihi),
    });
  }
  return out;
}

const DETAIL_SPEC = {
  key: ["id"],
  cols: [
    req("gorev_id"),
    req("oda_id"),
    opt("misafir_kayit_id"),
    opt("durum"),
    opt("varis_saati"),
    opt("cikis_saati"),
    opt("oncelik_sirasi"),
    opt("kontrol_zamani"),
    opt("dnd_sayisi"),
    opt("son_dnd_zamani"),
    opt("notlar"),
  ],
};

const STATUS_ORDER: TaskStatusName[] = ["DND_BEKLIYOR", "EKSIK", "DEVAM", "BEKLIYOR"];

interface Group {
  key: string;
  legacyHotel: string;
  hotelId: string;
  day: string;
  type: TaskTypeName;
  statuses: Set<TaskStatusName>;
  maxChecked: Date | null;
  parentCompleted: Date | null;
  createdAt: Date | null;
  rooms: Set<string>;
}

type Classified =
  | { drop: "GOREV_YOK" | "OTEL_YOK" | "TARIH_YOK" | "ODA_YOK" }
  | {
      drop?: undefined;
      group: { key: string; legacyHotel: string; hotelId: string; day: string; type: TaskTypeName };
      room: RoomInfo;
      status: TaskStatusName;
      parent: Parent;
      typeUnknown: boolean;
    };

async function stepDailyTasks(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("dailyTask");
  const itemRep = ctx.report.entity("dailyTaskItem");
  if (!(await ctx.legacy.tableExists("gorev_detaylari"))) {
    ctx.report.warn("TABLO_YOK", "Legacy tabloda gorev_detaylari yok, boş varsayıldı", "gorev_detaylari");
    return;
  }
  ctx.report.note("gunluk_gorevler.personel_id taşınmadı (DailyTask'ta atanan alanı yok); görevler (otel, gün, tip) başına birleştirildi");
  const parents = await loadParents(ctx);
  const rooms = await loadRooms(ctx);
  const guestKind = new Map<string, string>();
  if (await ctx.legacy.tableExists("misafir_kayitlari")) {
    for await (const rows of ctx.legacy.rows<Row>("misafir_kayitlari", { key: ["id"], cols: [req("kayit_tipi")] })) {
      for (const r of rows) guestKind.set(idOf(r.id), clean(r.kayit_tipi));
    }
  }

  const classify = (row: Row): Classified => {
    const parent = parents.get(idOf(row.gorev_id));
    if (!parent) return { drop: "GOREV_YOK" };
    if (!parent.hotelId) return { drop: "OTEL_YOK" };
    if (!parent.day) return { drop: "TARIH_YOK" };
    const room = rooms.get(idOf(row.oda_id));
    if (!room) return { drop: "ODA_YOK" };
    const guest = row.misafir_kayit_id === null || row.misafir_kayit_id === undefined ? undefined : guestKind.get(idOf(row.misafir_kayit_id));
    let type: TaskTypeName;
    let typeUnknown = false;
    if (guest !== undefined && uploadKindFor(guest)) {
      type = taskTypeFor(guest);
    } else {
      // No (usable) guest record: fall back to the control type of the legacy task itself.
      const own = taskTypeFromGorevTipi(parent.tip);
      type = own ?? "INHOUSE_KONTROL";
      typeUnknown = own === null;
    }
    return {
      group: { key: `${parent.legacyHotel}:${parent.day}:${type}`, legacyHotel: parent.legacyHotel, hotelId: parent.hotelId, day: parent.day, type },
      room,
      status: taskStatusFor(clean(row.durum)),
      parent,
      typeUnknown,
    };
  };

  // Pass 1 (read only): one aggregate per (hotel, day, type); the first row of a (group, room) pair wins.
  const groups = new Map<string, Group>();
  const seen = new Set<string>();
  for await (const rows of ctx.legacy.rows<Row>("gorev_detaylari", DETAIL_SPEC)) {
    for (const row of rows) {
      const c = classify(row);
      if (c.drop) continue;
      const pair = `${c.group.key}|${c.room.id}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      let g = groups.get(c.group.key);
      if (!g) {
        g = { ...c.group, statuses: new Set(), maxChecked: null, parentCompleted: null, createdAt: null, rooms: new Set() };
        groups.set(c.group.key, g);
      }
      g.statuses.add(c.status);
      const checked = asDate(row.kontrol_zamani);
      if (checked && (!g.maxChecked || checked > g.maxChecked)) g.maxChecked = checked;
      if (c.parent.completedAt && (!g.parentCompleted || c.parent.completedAt > g.parentCompleted)) g.parentCompleted = c.parent.completedAt;
      if (c.parent.createdAt && (!g.createdAt || c.parent.createdAt < g.createdAt)) g.createdAt = c.parent.createdAt;
    }
  }
  seen.clear();

  rep.read(groups.size);
  const taskIdOf = await loadMap(ctx, "dailyTask");
  for (const part of chunked([...groups.values()], ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const todo = part.filter((g) => !taskIdOf.has(g.key));
      rep.existing(part.length - todo.length);
      if (todo.length === 0) return;
      const present = await db.dailyTask.findMany({
        where: { OR: todo.map((g) => ({ hotelId: g.hotelId, date: businessDay(g.day), type: g.type })) },
        select: { id: true, hotelId: true, date: true, type: true },
      });
      const presentKey = new Map(present.map((t) => [`${t.hotelId}:${t.date.toISOString().slice(0, 10)}:${t.type}`, t.id]));
      const creates: Prisma.DailyTaskCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const g of todo) {
        const existing = presentKey.get(`${g.hotelId}:${g.day}:${g.type}`);
        if (existing) {
          pairs.push([g.key, existing]);
          taskIdOf.set(g.key, existing);
          rep.existing();
          ctx.report.warn("GOREV_HEDEFTE_VAR", "Hedefte aynı (otel, gün, tip) için günlük görev var; kalemler ona eklendi", g.key);
          continue;
        }
        const allDone = g.statuses.size === 1 && g.statuses.has("TAMAMLANDI");
        const status: TaskStatusName = allDone ? "TAMAMLANDI" : (STATUS_ORDER.find((s) => g.statuses.has(s)) ?? "BEKLIYOR");
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: g.hotelId,
          date: businessDay(g.day),
          type: g.type,
          status,
          completedAt: allDone ? (g.maxChecked ?? g.parentCompleted) : null,
          ...(g.createdAt ? { createdAt: g.createdAt } : {}),
        });
        pairs.push([g.key, id]);
        taskIdOf.set(g.key, id);
        rep.created();
      }
      if (creates.length > 0) await db.dailyTask.createMany({ data: creates });
      await ctx.ids(db).putMany("dailyTask", pairs);
    });
  }

  // Pass 2: the items.
  const itemOf = await loadMap(ctx, "dailyTaskItem");
  const guestOf = await loadMap(ctx, "guestRecord");
  const placed = new Set<string>();
  for await (const rows of ctx.legacy.rows<Row>("gorev_detaylari", DETAIL_SPEC)) {
    itemRep.read(rows.length);
    await ctx.tx(async (db) => {
      const creates: Prisma.DailyTaskItemCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      // (taskId, roomId) pairs already in the target, for EVERY task of this batch (so a re-run never re-inserts
      // an item that run 1 dropped because the target already had it).
      const takenForeign = new Set<string>();
      const batchTaskIds = [...new Set(rows.flatMap((r) => {
        const c = classify(r);
        return !c.drop && taskIdOf.has(c.group.key) ? [taskIdOf.get(c.group.key)!] : [];
      }))];
      if (batchTaskIds.length > 0) {
        for (const it of await db.dailyTaskItem.findMany({ where: { taskId: { in: batchTaskIds } }, select: { taskId: true, roomId: true } })) {
          takenForeign.add(`${it.taskId}:${it.roomId}`);
        }
      }
      for (const row of rows) {
        const legacyId = idOf(row.id);
        const c = classify(row);
        if (c.drop) {
          itemRep.dropped(1, c.drop);
          ctx.report.warn(`GOREV_KALEM_${c.drop}`, "Görev kalemi taşınamadı (görev/otel/tarih/oda eşlenemedi)", `detay ${legacyId}`);
          continue;
        }
        const taskId = taskIdOf.get(c.group.key);
        if (!taskId) {
          itemRep.failed();
          ctx.report.warn("GOREV_YOK", "Günlük görev oluşturulamadı", `detay ${legacyId}`);
          continue;
        }
        const pair = `${taskId}:${c.room.id}`;
        if (itemOf.has(legacyId)) {
          itemRep.existing();
          placed.add(pair);
          continue;
        }
        if (placed.has(pair)) {
          itemRep.dropped(1, "GOREV_KALEM_COBLU");
          ctx.report.warn("GOREV_KALEM_COBLU", "Aynı oda aynı görevde ikinci kez geldi; ilki kaldı", `detay ${legacyId}`);
          continue;
        }
        placed.add(pair);
        if (takenForeign.has(pair)) {
          itemRep.dropped(1, "HEDEFTE_VAR");
          ctx.report.warn("GOREV_KALEM_HEDEFTE_VAR", "Hedefte bu görev ve oda için kalem var; dokunulmadı", `detay ${legacyId}`);
          continue;
        }
        if (c.typeUnknown) {
          ctx.report.warn("GOREV_TIPI_BELIRSIZ", "Görev tipi misafir kaydından/görevden belirlenemedi; INHOUSE_KONTROL yazıldı", `detay ${legacyId}`);
        }
        if (!isKnownTaskStatus(clean(row.durum))) {
          ctx.report.warn("GOREV_DURUM_BILINMIYOR", "Bilinmeyen görev durumu BEKLIYOR yapıldı", `detay ${legacyId}: "${clean(row.durum)}"`);
        }
        const guestLegacy = row.misafir_kayit_id === null || row.misafir_kayit_id === undefined ? null : idOf(row.misafir_kayit_id);
        const guestRecordId = guestLegacy ? (guestOf.get(guestLegacy) ?? null) : null;
        if (guestLegacy && !guestRecordId) {
          ctx.report.warn("GOREV_MISAFIR_KAYDI_YOK", "Görev kaleminin misafir kaydı taşınmadı; bağ boş bırakıldı", `detay ${legacyId}`);
        }
        const id = IdMap.newId();
        creates.push({
          id,
          taskId,
          roomId: c.room.id,
          guestRecordId,
          status: c.status,
          arrivalTime: hhmm(row.varis_saati),
          departureTime: hhmm(row.cikis_saati),
          priority: Math.trunc(num(row.oncelik_sirasi) ?? 999),
          checkedAt: asDate(row.kontrol_zamani),
          dndCount: nonNeg(row.dnd_sayisi),
          lastDndAt: asDate(row.son_dnd_zamani),
          note: orNull(row.notlar),
        });
        pairs.push([legacyId, id]);
        itemOf.set(legacyId, id);
        itemRep.created();
      }
      if (creates.length > 0) await db.dailyTaskItem.createMany({ data: creates });
      await ctx.ids(db).putMany("dailyTaskItem", pairs);
    });
  }
}

async function stepTaskLogs(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("taskStatusLog");
  if (!(await ctx.legacy.tableExists("gorev_durum_loglari"))) {
    ctx.report.warn("TABLO_YOK", "Legacy tabloda gorev_durum_loglari yok, boş varsayıldı", "gorev_durum_loglari");
    return;
  }
  const itemOf = await loadMap(ctx, "dailyTaskItem");
  const userIdOf = await loadMap(ctx, "user");
  const mapped = await loadMap(ctx, "taskStatusLog");
  for await (const rows of ctx.legacy.rows<Row>("gorev_durum_loglari", {
    key: ["id"],
    cols: [req("gorev_detay_id"), opt("onceki_durum"), opt("yeni_durum"), opt("degisiklik_zamani"), opt("degistiren_id"), opt("aciklama")],
  })) {
    rep.read(rows.length);
    await ctx.tx(async (db) => {
      const todo = rows.filter((r) => !mapped.has(idOf(r.id)) && itemOf.has(idOf(r.gorev_detay_id)));
      // A missing new status is read from the migrated item.
      const needStatus = todo.filter((r) => clean(r.yeni_durum) === "").map((r) => itemOf.get(idOf(r.gorev_detay_id))!);
      const itemStatus = new Map<string, TaskStatusName>();
      if (needStatus.length > 0) {
        for (const it of await db.dailyTaskItem.findMany({ where: { id: { in: needStatus } }, select: { id: true, status: true } })) {
          itemStatus.set(it.id, it.status);
        }
      }
      const creates: Prisma.TaskStatusLogCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of rows) {
        const legacyId = idOf(row.id);
        if (mapped.has(legacyId)) {
          rep.existing();
          continue;
        }
        const itemId = itemOf.get(idOf(row.gorev_detay_id));
        if (!itemId) {
          rep.dropped(1, "KALEM_YOK");
          ctx.report.warn("DURUM_LOGU_KALEM_YOK", "Durum günlüğü taşınmayan bir görev kalemine ait; taşınmadı", `günlük ${legacyId}`);
          continue;
        }
        const createdAt = asDate(row.degisiklik_zamani);
        for (const col of ["onceki_durum", "yeni_durum"] as const) {
          const value = clean(row[col]);
          if (value !== "" && !isKnownTaskStatus(value)) {
            ctx.report.warn("GOREV_DURUM_BILINMIYOR", "Bilinmeyen görev durumu BEKLIYOR yapıldı", `günlük ${legacyId} ${col}: "${value}"`);
          }
        }
        const id = IdMap.newId();
        creates.push({
          id,
          taskItemId: itemId,
          from: clean(row.onceki_durum) === "" ? null : taskStatusFor(clean(row.onceki_durum)),
          to: clean(row.yeni_durum) === "" ? (itemStatus.get(itemId) ?? "BEKLIYOR") : taskStatusFor(clean(row.yeni_durum)),
          userId: optUser(userIdOf, row.degistiren_id),
          note: orNull(row.aciklama),
          ...(createdAt ? { createdAt } : {}),
        });
        pairs.push([legacyId, id]);
        mapped.set(legacyId, id);
        rep.created();
      }
      if (creates.length > 0) await db.taskStatusLog.createMany({ data: creates });
      await ctx.ids(db).putMany("taskStatusLog", pairs);
    });
  }
}

// ---------------------------------------------------------------- DND

interface PlanCheck {
  key: string;
  at: Date;
  userId: string;
  note: string | null;
  no: number;
}

interface PlanRecord {
  key: string;
  roomId: string;
  hotelId: string;
  day: string;
  count: number;
  firstAt: Date;
  lastAt: Date;
  status: "AKTIF" | "TAMAMLANDI" | "IPTAL" | "EKSIK";
  taskItemId: string | null;
  createdAt: Date | null;
  checks: PlanCheck[];
}

function mergeInto(target: PlanRecord, from: PlanRecord): number {
  let lost = 0;
  for (const c of [...from.checks].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (target.checks.some((t) => t.at.getTime() === c.at.getTime())) {
      lost += 1;
      continue;
    }
    target.checks.push({ ...c, no: Math.max(0, ...target.checks.map((t) => t.no)) + 1 });
  }
  target.count = Math.max(target.count, from.count);
  if (from.firstAt < target.firstAt) target.firstAt = from.firstAt;
  if (from.lastAt > target.lastAt) target.lastAt = from.lastAt;
  return lost;
}

async function stepDnd(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("roomDnd");
  const checkRep = ctx.report.entity("roomDndCheck");
  const independent = await readAll(ctx, "oda_dnd_kayitlari", {
    key: ["id"],
    cols: [
      req("oda_id"),
      req("kayit_tarihi"),
      opt("dnd_sayisi"),
      opt("ilk_dnd_zamani"),
      opt("son_dnd_zamani"),
      opt("durum"),
      opt("gorev_detay_id"),
      opt("olusturma_tarihi"),
    ],
  });
  const independentChecks = await readAll(ctx, "oda_dnd_kontrolleri", {
    key: ["id"],
    cols: [req("dnd_kayit_id"), opt("kontrol_no"), opt("kontrol_eden_id"), req("kontrol_zamani"), opt("notlar")],
  });
  const taskChecks = await readAll(ctx, "dnd_kontroller", {
    key: ["id"],
    cols: [req("gorev_detay_id"), req("kontrol_zamani"), opt("kontrol_eden_id"), opt("notlar")],
  });
  const details: Row[] = [];
  if (await ctx.legacy.tableExists("gorev_detaylari")) {
    for await (const rows of ctx.legacy.rows<Row>("gorev_detaylari", {
      key: ["id"],
      cols: [req("gorev_id"), req("oda_id"), opt("durum"), req("dnd_sayisi"), opt("son_dnd_zamani")],
      where: '"dnd_sayisi" > 0',
    })) {
      details.push(...rows);
    }
  }
  rep.read(independent.length + details.length);
  checkRep.read(independentChecks.length + taskChecks.length);

  const parents = await loadParents(ctx);
  const rooms = await loadRooms(ctx);
  const userIdOf = await loadMap(ctx, "user");
  const itemOf = await loadMap(ctx, "dailyTaskItem");
  const mappedRecords = await loadMap(ctx, "roomDnd");
  const mappedChecks = await loadMap(ctx, "roomDndCheck");

  const plan = new Map<string, PlanRecord>(); // by `${roomId}|${day}`
  const planOrder: PlanRecord[] = [];

  const add = (rec: PlanRecord, source: string): boolean => {
    const slot = `${rec.roomId}|${rec.day}`;
    const current = plan.get(slot);
    if (!current) {
      plan.set(slot, rec);
      planOrder.push(rec);
      return true;
    }
    const lost = mergeInto(current, rec);
    rep.dropped(1, "DND_BIRLESTI");
    if (lost > 0) checkRep.dropped(lost, "DND_KONTROL_TEKRAR");
    ctx.report.warn("DND_CAKISMA", "Aynı (oda, gün) için birden fazla DND verisi vardı; tek kayıtta birleştirildi", `${source} ${rec.day}`);
    return false;
  };

  // Independent records.
  const checksOf = new Map<string, Row[]>();
  for (const c of independentChecks) {
    const list = checksOf.get(idOf(c.dnd_kayit_id)) ?? [];
    list.push(c);
    checksOf.set(idOf(c.dnd_kayit_id), list);
  }
  const recordIds = new Set(independent.map((r) => idOf(r.id)));
  const orphanChecks = independentChecks.filter((c) => !recordIds.has(idOf(c.dnd_kayit_id)));
  if (orphanChecks.length > 0) {
    checkRep.dropped(orphanChecks.length, "DND_YOK");
    ctx.report.warn("DND_KONTROL_KAYIT_YOK", "DND kontrolü taşınmayan veya olmayan bir DND kaydına ait; taşınmadı", `${orphanChecks.length} satır`);
  }
  for (const row of independent) {
    const legacyId = idOf(row.id);
    const own = checksOf.get(legacyId) ?? [];
    const room = rooms.get(idOf(row.oda_id));
    const day = validDay(row.kayit_tarihi);
    if (!room || !day) {
      rep.dropped(1, room ? "TARIH_YOK" : "ODA_YOK");
      if (own.length > 0) checkRep.dropped(own.length, "DND_YOK");
      ctx.report.warn("DND_ODA_YOK", "DND kaydı eşlenmiş odaya/tarihe bağlanamadı; taşınmadı", `kayıt ${legacyId}`);
      continue;
    }
    if (!isKnownDndStatus(clean(row.durum))) {
      ctx.report.warn("DND_DURUM_BILINMIYOR", "Bilinmeyen DND durumu EKSIK yapıldı", `kayıt ${legacyId}: "${clean(row.durum)}"`);
    }
    const raw = Math.trunc(num(row.dnd_sayisi) ?? 0);
    if (raw < 1) ctx.report.warn("DND_SAYISI_SIFIR", "DND sayısı 0'dı; 1 yapıldı", `kayıt ${legacyId}`);
    const created = asDate(row.olusturma_tarihi);
    const firstAt = asDate(row.ilk_dnd_zamani) ?? created ?? asDate(row.son_dnd_zamani) ?? businessDateStart(day);
    const checks: PlanCheck[] = [...own]
      .sort((a, b) => (num(a.kontrol_no) ?? 0) - (num(b.kontrol_no) ?? 0) || Number(a.id) - Number(b.id))
      .map((c, i) => ({
        key: `o:${idOf(c.id)}`,
        at: asDate(c.kontrol_zamani) ?? firstAt,
        userId: userOrActor(ctx, userIdOf, c.kontrol_eden_id, `DND kontrolü ${idOf(c.id)}: kontrol_eden_id`),
        note: orNull(c.notlar),
        no: Math.trunc(num(c.kontrol_no) ?? i + 1) || i + 1,
      }));
    const rec: PlanRecord = {
      key: `o:${legacyId}`,
      roomId: room.id,
      hotelId: room.hotelId,
      day,
      count: Math.max(raw, 1),
      firstAt,
      lastAt: asDate(row.son_dnd_zamani) ?? firstAt,
      status: dndStatusFor(clean(row.durum)),
      taskItemId: row.gorev_detay_id === null || row.gorev_detay_id === undefined ? null : (itemOf.get(idOf(row.gorev_detay_id)) ?? null),
      createdAt: created,
      checks,
    };
    add(rec, `oda ${idOf(row.oda_id)}`);
  }

  // Task-linked legacy DND (no independent record for the same room and task day).
  const tChecksOf = new Map<string, Row[]>();
  for (const c of taskChecks) {
    const list = tChecksOf.get(idOf(c.gorev_detay_id)) ?? [];
    list.push(c);
    tChecksOf.set(idOf(c.gorev_detay_id), list);
  }
  const detailIds = new Set(details.map((d) => idOf(d.id)));
  const orphanTask = taskChecks.filter((c) => !detailIds.has(idOf(c.gorev_detay_id)));
  if (orphanTask.length > 0) {
    checkRep.dropped(orphanTask.length, "DND_YOK");
    ctx.report.warn("DND_KONTROL_DETAY_YOK", "DND kontrolü DND'li olmayan veya olmayan bir görev detayına ait; taşınmadı", `${orphanTask.length} satır`);
  }
  for (const d of details) {
    const legacyId = idOf(d.id);
    const own = [...(tChecksOf.get(legacyId) ?? [])].sort((a, b) => (asDate(a.kontrol_zamani)?.getTime() ?? 0) - (asDate(b.kontrol_zamani)?.getTime() ?? 0) || Number(a.id) - Number(b.id));
    const parent = parents.get(idOf(d.gorev_id));
    const room = rooms.get(idOf(d.oda_id));
    if (!parent || !parent.day || !room) {
      rep.dropped(1, !parent || !parent.day ? "GOREV_YOK" : "ODA_YOK");
      if (own.length > 0) checkRep.dropped(own.length, "DND_YOK");
      ctx.report.warn("DND_GOREV_YOK", "Görevdeki DND verisi görev veya odaya bağlanamadı; taşınmadı", `detay ${legacyId}`);
      continue;
    }
    if (!isKnownTaskStatus(clean(d.durum))) {
      ctx.report.warn("DND_DURUM_BILINMIYOR", "Göreve bağlı DND'nin görev durumu bilinmiyor; AKTIF yapıldı", `detay ${legacyId}: "${clean(d.durum)}"`);
    }
    const itemStatus = taskStatusFor(clean(d.durum));
    const lastRaw = asDate(d.son_dnd_zamani);
    const firstCheck = own.length > 0 ? (asDate(own[0].kontrol_zamani) ?? null) : null;
    const firstAt = firstCheck ?? lastRaw ?? parent.createdAt ?? businessDateStart(parent.day);
    const checks: PlanCheck[] = own.map((c, i) => ({
      key: `g:${idOf(c.id)}`,
      at: asDate(c.kontrol_zamani) ?? firstAt,
      userId: userOrActor(ctx, userIdOf, c.kontrol_eden_id, `DND kontrolü ${idOf(c.id)}: kontrol_eden_id`),
      note: orNull(c.notlar),
      no: i + 1,
    }));
    const rec: PlanRecord = {
      key: `g:${legacyId}`,
      roomId: room.id,
      hotelId: room.hotelId,
      day: parent.day,
      count: Math.max(1, Math.trunc(num(d.dnd_sayisi) ?? 1)),
      firstAt,
      lastAt: lastRaw ?? firstAt,
      status: itemStatus === "TAMAMLANDI" ? "TAMAMLANDI" : itemStatus === "EKSIK" ? "EKSIK" : "AKTIF",
      taskItemId: itemOf.get(legacyId) ?? null,
      createdAt: firstAt,
      checks,
    };
    add(rec, `oda ${idOf(d.oda_id)}`);
  }

  // Write.
  for (const part of chunked(planOrder, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const todo = part.filter((r) => !mappedRecords.has(r.key));
      for (const r of part) {
        if (mappedRecords.has(r.key)) {
          rep.existing();
          checkRep.existing(r.checks.length);
        }
      }
      if (todo.length === 0) return;
      const present = await db.roomDnd.findMany({
        where: { OR: todo.map((r) => ({ roomId: r.roomId, date: businessDay(r.day) })) },
        select: { roomId: true, date: true },
      });
      const taken = new Set(present.map((p) => `${p.roomId}|${p.date.toISOString().slice(0, 10)}`));
      const creates: Prisma.RoomDndCreateManyInput[] = [];
      const checkCreates: Prisma.RoomDndCheckCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      const checkPairs: [string, string][] = [];
      for (const r of todo) {
        if (taken.has(`${r.roomId}|${r.day}`)) {
          rep.dropped(1, "HEDEFTE_VAR");
          if (r.checks.length > 0) checkRep.dropped(r.checks.length, "HEDEFTE_VAR");
          ctx.report.warn("DND_HEDEFTE_VAR", "Hedefte aynı (oda, gün) için DND kaydı var; dokunulmadı", `${r.roomId} ${r.day}`);
          continue;
        }
        const id = IdMap.newId();
        creates.push({
          id,
          hotelId: r.hotelId,
          roomId: r.roomId,
          date: businessDay(r.day),
          count: r.count,
          firstAt: r.firstAt,
          lastAt: r.lastAt,
          status: r.status,
          taskItemId: r.taskItemId,
          ...(r.createdAt ? { createdAt: r.createdAt } : {}),
        });
        pairs.push([r.key, id]);
        rep.created();
        for (const c of r.checks) {
          if (mappedChecks.has(c.key)) {
            checkRep.existing();
            continue;
          }
          const checkId = IdMap.newId();
          checkCreates.push({ id: checkId, dndId: id, no: c.no, userId: c.userId, at: c.at, note: c.note });
          checkPairs.push([c.key, checkId]);
          checkRep.created();
        }
      }
      if (creates.length > 0) await db.roomDnd.createMany({ data: creates });
      if (checkCreates.length > 0) await db.roomDndCheck.createMany({ data: checkCreates });
      await ctx.ids(db).putMany("roomDnd", pairs);
      await ctx.ids(db).putMany("roomDndCheck", checkPairs);
    });
  }
}

// ---------------------------------------------------------------- QR log

async function stepQrLog(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("qrScanLog");
  const rooms = await loadRooms(ctx);
  const userIdOf = await loadMap(ctx, "user");
  const mapped = await loadMap(ctx, "qrScanLog");
  for await (const rows of streamRows(ctx, "qr_kod_okutma_loglari", {
    key: ["id"],
    cols: [opt("oda_id"), opt("kullanici_id"), req("okutma_tarihi"), req("okutma_tipi"), opt("ip_adresi"), opt("user_agent"), opt("basarili"), opt("hata_mesaji")],
  })) {
    rep.read(rows.length);
    await ctx.tx(async (db) => {
      const creates: Prisma.QrScanLogCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of rows) {
        const legacyId = idOf(row.id);
        if (mapped.has(legacyId)) {
          rep.existing();
          continue;
        }
        const at = asDate(row.okutma_tarihi);
        if (!at) {
          rep.dropped(1, "TARIH_YOK");
          ctx.report.warn("QR_TARIH_YOK", "QR okutma kaydının tarihi yok; taşınmadı", `kayıt ${legacyId}`);
          continue;
        }
        if (!isKnownScanKind(clean(row.okutma_tipi))) {
          ctx.report.warn("QR_TUR_BILINMIYOR", "Bilinmeyen okutma tipi SISTEM yapıldı", `kayıt ${legacyId}: "${clean(row.okutma_tipi)}"`);
        }
        const id = IdMap.newId();
        creates.push({
          id,
          roomId: row.oda_id === null || row.oda_id === undefined ? null : (rooms.get(idOf(row.oda_id))?.id ?? null),
          userId: optUser(userIdOf, row.kullanici_id),
          kind: scanKindFor(clean(row.okutma_tipi)),
          ok: row.basarili === null || row.basarili === undefined ? true : Boolean(row.basarili),
          error: orNull(row.hata_mesaji),
          ip: orNull(row.ip_adresi) ?? "unknown",
          userAgent: clean(row.user_agent),
          createdAt: at,
        });
        pairs.push([legacyId, id]);
        mapped.set(legacyId, id);
        rep.created();
      }
      if (creates.length > 0) await db.qrScanLog.createMany({ data: creates });
      await ctx.ids(db).putMany("qrScanLog", pairs);
    });
  }
}

// ---------------------------------------------------------------- audit / system log

function json(value: unknown): { value: Prisma.InputJsonValue } | null {
  if (value === null || value === undefined) return null;
  return { value: value as Prisma.InputJsonValue };
}

async function stepAuditLogs(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("auditLog");
  const userIdOf = await loadMap(ctx, "user");
  const mapped = await loadMap(ctx, "auditLog");
  const sources = [
    {
      table: "audit_logs",
      prefix: "a",
      cols: [opt("kullanici_id"), opt("islem_tipi"), opt("tablo_adi"), opt("kayit_id"), opt("eski_deger"), opt("yeni_deger"), opt("ip_adresi"), req("islem_tarihi")],
    },
    {
      table: "sistem_loglari",
      prefix: "s",
      cols: [opt("kullanici_id"), opt("islem_tipi"), opt("modul"), opt("islem_detay"), opt("ip_adresi"), req("islem_tarihi")],
    },
  ] as const;

  for (const src of sources) {
    for await (const rows of streamRows(ctx, src.table, { key: ["id"], cols: [...src.cols] })) {
      rep.read(rows.length);
      await ctx.tx(async (db) => {
        const creates: Prisma.AuditLogCreateManyInput[] = [];
        const pairs: [string, string][] = [];
        for (const row of rows) {
          const key = `${src.prefix}:${idOf(row.id)}`;
          if (mapped.has(key)) {
            rep.existing();
            continue;
          }
          const at = asDate(row.islem_tarihi);
          if (!at) {
            rep.dropped(1, "TARIH_YOK");
            ctx.report.warn("LOG_TARIH_YOK", "Günlük satırının tarihi yok; taşınmadı", key);
            continue;
          }
          const id = IdMap.newId();
          const base = {
            id,
            userId: optUser(userIdOf, row.kullanici_id),
            ip: orNull(row.ip_adresi),
            createdAt: at,
          };
          if (src.prefix === "a") {
            const before = json(row.eski_deger);
            const after = json(row.yeni_deger);
            creates.push({
              ...base,
              action: `LEGACY_${upper(clean(row.islem_tipi) || "KAYIT")}`,
              entity: clean(row.tablo_adi) || "bilinmiyor",
              entityId: row.kayit_id === null || row.kayit_id === undefined ? null : String(row.kayit_id),
              ...(before ? { before: before.value } : {}),
              ...(after ? { after: after.value } : {}),
            });
          } else {
            const detail = json(row.islem_detay);
            creates.push({
              ...base,
              action: `LEGACY_LOG_${upper(clean(row.islem_tipi) || "KAYIT")}`,
              entity: clean(row.modul) || "bilinmiyor",
              ...(detail ? { after: detail.value } : {}),
            });
          }
          pairs.push([key, id]);
          mapped.set(key, id);
          rep.created();
        }
        if (creates.length > 0) await db.auditLog.createMany({ data: creates });
        await ctx.ids(db).putMany("auditLog", pairs);
      });
    }
  }
  ctx.report.note("audit_logs/sistem_loglari: kullanici_adi, kullanici_rol, url, endpoint, user_agent, http_method ve özet alanları taşınmadı");
}
