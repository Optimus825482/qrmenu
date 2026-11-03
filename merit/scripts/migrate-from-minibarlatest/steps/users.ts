import type { Prisma } from "../../../src/generated/prisma/client";
import { IdMap } from "../idmap";
import {
  clean,
  emailStatusFor,
  isKnownStockRequestStatus,
  orNull,
  passwordKindFor,
  roleCodeFor,
  stockRequestStatusFor,
  toBool,
  type RoleCode,
} from "../mapping";
import type { StepContext, TxClient } from "../types";
import { chunked, idOf, num, opt, readAll, req, streamRows, type Row } from "./shared";

const asDate = (v: unknown): Date | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null);

/** Sub-steps in order: users, user hotels, supervisors, e-mail settings, e-mail log, stock requests, notifications. */
export async function runUsers(ctx: StepContext): Promise<void> {
  await stepUsers(ctx);
  await stepUserHotels(ctx);
  await stepSupervisors(ctx);
  await stepEmailSetting(ctx);
  await stepEmailLog(ctx);
  await stepStockRequests(ctx);
  await stepNotifications(ctx);
}

async function loadMap(ctx: StepContext, entity: Parameters<IdMap["load"]>[0]): Promise<Map<string, string>> {
  return ctx.tx((db) => ctx.ids(db).load(entity));
}

// ---------------------------------------------------------------- users

const USER_SPEC = {
  key: ["id"],
  cols: [
    req("kullanici_adi"),
    req("sifre_hash"),
    opt("ad"),
    opt("soyad"),
    opt("email"),
    opt("telefon"),
    req("rol"),
    opt("aktif"),
    opt("olusturma_tarihi"),
    opt("son_giris"),
    opt("otel_id"),
    opt("depo_sorumlusu_id"),
  ],
};
const USER_HOTEL_SPEC = { key: ["id"], cols: [req("kullanici_id"), req("otel_id")] };

async function stepUsers(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("user");
  const rows = await readAll(ctx, "kullanicilar", USER_SPEC);
  const links = await readAll(ctx, "kullanici_otel", USER_HOTEL_SPEC);
  rep.read(rows.length);

  const hotelIdOf = await loadMap(ctx, "hotel");
  const { mapped, roles, taken } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("user"),
    roles: new Map((await db.role.findMany({ select: { id: true, code: true } })).map((r) => [r.code, r.id])),
    taken: new Set((await db.user.findMany({ select: { username: true } })).map((u) => u.username.toLowerCase())),
  }));

  // Hash families (counts only) and the users who must reset their password (names only).
  const kinds = { pbkdf2: 0, bcrypt: 0, scrypt: 0, diger: 0 };
  for (const row of rows) {
    if (roleCodeFor(clean(row.rol)) === null) continue;
    const kind = passwordKindFor(clean(row.sifre_hash));
    kinds[kind] += 1;
    if (kind === "scrypt" || kind === "diger") {
      ctx.report.warn(
        "SIFRE_SIFIRLANMALI",
        "Şifre biçimi bu uygulamada doğrulanamıyor (yalnız pbkdf2:sha256 ve bcrypt çalışır); kullanıcının şifresi sıfırlanmalı",
        clean(row.kullanici_adi),
      );
    }
  }
  ctx.report.note(
    `Kullanıcı şifre biçimleri (yalnız sayı): pbkdf2:sha256 ${kinds.pbkdf2}, bcrypt ${kinds.bcrypt}, scrypt ${kinds.scrypt}, diğer ${kinds.diger}`,
  );
  ctx.report.note("kullanicilar: kullanıcı düzeyi email_bildirim_aktif, tema_renk_1/2 taşınmadı");

  const hotelsOfDepo = new Map<string, string[]>();
  for (const link of links) {
    const hotelId = hotelIdOf.get(idOf(link.otel_id));
    if (!hotelId) continue;
    const list = hotelsOfDepo.get(idOf(link.kullanici_id)) ?? [];
    list.push(hotelId);
    hotelsOfDepo.set(idOf(link.kullanici_id), list);
  }

  const todo = rows.filter((r) => !mapped.has(idOf(r.id)));
  rep.existing(rows.length - todo.length);
  for (const part of chunked(todo, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.UserCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of part) {
        const legacyId = idOf(row.id);
        const rawRole = clean(row.rol);
        const roleCode = roleCodeFor(rawRole);
        const roleId = roleCode ? roles.get(roleCode) : undefined;
        if (!roleCode || !roleId) {
          rep.dropped(1, "ROL_BILINMIYOR");
          ctx.report.warn("ROL_BILINMIYOR", "Rolü tanınmayan kullanıcı taşınmadı; geçmiş kayıtları aktöre yazılır", `kullanıcı ${legacyId}: rol "${rawRole}"`);
          continue;
        }
        const base = clean(row.kullanici_adi) || `kullanici${legacyId}`;
        let username = base;
        for (let n = 1; taken.has(username.toLowerCase()); n++) username = n === 1 ? `${base}.legacy` : `${base}.legacy${n}`;
        if (username !== base) {
          ctx.report.warn("KULLANICI_ADI_CAKISTI", "Kullanıcı adı hedefte vardı; .legacy eki verildi", `${base} -> ${username}`);
        }
        taken.add(username.toLowerCase());

        let isActive = toBool(row.aktif, true);
        if (rawRole.toLowerCase() === "superadmin") {
          isActive = false;
          ctx.report.warn("SUPERADMIN_PASIF", "superadmin kullanıcısı pasif taşındı", username);
        }
        let hotelId = row.otel_id === null || row.otel_id === undefined ? undefined : hotelIdOf.get(idOf(row.otel_id));
        if (!hotelId && roleCode === "R-DEP") {
          const own = hotelsOfDepo.get(legacyId) ?? [];
          if (own.length === 1) hotelId = own[0];
        }
        const first = clean(row.ad);
        const last = clean(row.soyad);
        const id = IdMap.newId();
        creates.push({
          id,
          username,
          passwordHash: clean(row.sifre_hash),
          fullName: `${first} ${last}`.trim() || username,
          email: orNull(row.email),
          phone: orNull(row.telefon),
          roleId,
          hotelId: hotelId ?? null,
          isActive,
          lastLoginAt: asDate(row.son_giris),
          ...(asDate(row.olusturma_tarihi) ? { createdAt: asDate(row.olusturma_tarihi)! } : {}),
        });
        pairs.push([legacyId, id]);
        rep.created();
      }
      if (creates.length > 0) await db.user.createMany({ data: creates });
      await ctx.ids(db).putMany("user", pairs);
    });
  }
}

// ---------------------------------------------------------------- user hotels

async function stepUserHotels(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("userHotel");
  const links = await readAll(ctx, "kullanici_otel", USER_HOTEL_SPEC);
  const userIdOf = await loadMap(ctx, "user");
  const hotelIdOf = await loadMap(ctx, "hotel");
  rep.read(links.length);

  const existing = await ctx.tx(async (db) => {
    const rows = await db.userHotel.findMany({ select: { userId: true, hotelId: true } });
    return new Set(rows.map((r) => `${r.userId}:${r.hotelId}`));
  });
  const pending: Prisma.UserHotelCreateManyInput[] = [];
  const queue = (userId: string, hotelId: string): boolean => {
    const key = `${userId}:${hotelId}`;
    if (existing.has(key)) return false;
    existing.add(key);
    pending.push({ userId, hotelId });
    return true;
  };

  for (const link of links) {
    const userId = userIdOf.get(idOf(link.kullanici_id));
    const hotelId = hotelIdOf.get(idOf(link.otel_id));
    if (!userId || !hotelId) {
      rep.dropped(1, "KULLANICI_OTEL_BAGSIZ");
      ctx.report.warn("KULLANICI_OTEL_BAGSIZ", "kullanici_otel satırı eşlenmiş kullanıcıya veya otele bağlanamadı", `satır ${idOf(link.id)}`);
      continue;
    }
    if (queue(userId, hotelId)) rep.created();
    else rep.existing();
  }

  // R-OTM users without any link or hotel see every hotel.
  const users = await readAll(ctx, "kullanicilar", USER_SPEC);
  const linked = new Set(links.map((l) => idOf(l.kullanici_id)));
  const adminRep = ctx.report.entity("userHotelAdmin");
  for (const row of users) {
    const legacyId = idOf(row.id);
    const userId = userIdOf.get(legacyId);
    if (!userId || roleCodeFor(clean(row.rol)) !== "R-OTM") continue;
    if (linked.has(legacyId) || (row.otel_id !== null && row.otel_id !== undefined)) continue;
    ctx.report.warn("ADMIN_TUM_OTELLER", "Otelsiz admin kullanıcısı tüm otellere bağlandı", clean(row.kullanici_adi));
    for (const hotelId of hotelIdOf.values()) {
      adminRep.read();
      if (queue(userId, hotelId)) adminRep.created();
      else adminRep.existing();
    }
  }

  for (const part of chunked(pending, ctx.cfg.batch)) {
    await ctx.tx((db) => db.userHotel.createMany({ data: part, skipDuplicates: true }));
  }
}

// ---------------------------------------------------------------- supervisors

async function stepSupervisors(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("supervisor");
  const rows = (await readAll(ctx, "kullanicilar", USER_SPEC)).filter((r) => r.depo_sorumlusu_id !== null && r.depo_sorumlusu_id !== undefined);
  const userIdOf = await loadMap(ctx, "user");
  rep.read(rows.length);
  const current = await ctx.tx(async (db) => {
    const list = await db.user.findMany({ where: { id: { in: [...userIdOf.values()] } }, select: { id: true, supervisorId: true } });
    return new Map(list.map((u) => [u.id, u.supervisorId]));
  });
  for (const part of chunked(rows, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      for (const row of part) {
        const userId = userIdOf.get(idOf(row.id));
        const supervisorId = userIdOf.get(idOf(row.depo_sorumlusu_id));
        if (!userId || !supervisorId || userId === supervisorId) {
          rep.dropped(1, "DEPO_SORUMLUSU_YOK");
          if (userId) ctx.report.warn("DEPO_SORUMLUSU_YOK", "depo_sorumlusu_id eşlenmiş bir kullanıcı değil", `kullanıcı ${idOf(row.id)}`);
          continue;
        }
        if (current.get(userId) === supervisorId) {
          rep.existing();
          continue;
        }
        await db.user.update({ where: { id: userId }, data: { supervisorId } });
        rep.created();
      }
    });
  }
}

// ---------------------------------------------------------------- e-mail settings

async function stepEmailSetting(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("emailSetting");
  const rows = await readAll(ctx, "email_ayarlari", {
    key: ["id"],
    cols: [
      req("smtp_server"),
      req("smtp_port"),
      opt("smtp_username"),
      opt("smtp_use_tls"),
      opt("smtp_use_ssl"),
      req("sender_email"),
      opt("sender_name"),
    ],
  });
  rep.read(rows.length);
  if (rows.length === 0) return;
  const newest = rows.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
  if (rows.length > 1) rep.dropped(rows.length - 1, "ESKI_AYAR");
  const legacyId = idOf(newest.id);

  await ctx.tx(async (db) => {
    const ids = ctx.ids(db);
    if ((await ids.load("emailSetting")).has(legacyId) || (await db.emailSetting.count()) > 0) {
      rep.existing();
      return;
    }
    const id = IdMap.newId();
    await db.emailSetting.create({
      data: {
        id,
        smtpHost: clean(newest.smtp_server),
        port: num(newest.smtp_port) ?? 587,
        user: clean(newest.smtp_username),
        passwordEnc: "",
        tls: toBool(newest.smtp_use_tls, false),
        ssl: toBool(newest.smtp_use_ssl, false),
        senderEmail: clean(newest.sender_email),
        senderName: clean(newest.sender_name) || clean(newest.sender_email),
        isActive: false,
      },
    });
    await ids.putMany("emailSetting", [[legacyId, id]]);
    rep.created();
    ctx.report.warn("SMTP_SIFRESI_YENIDEN_GIRILMELI", "SMTP parolası taşınmaz; ayar pasif oluşturuldu", `ayar ${legacyId}`);
    ctx.report.todo("E-posta ayarında SMTP parolasını yeniden girip ayarı etkinleştirin (parola taşınmadı, ayar pasif).");
  });
}

// ---------------------------------------------------------------- e-mail log

async function stepEmailLog(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("emailLog");
  const userIdOf = await loadMap(ctx, "user");
  const { mapped, tracking } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("emailLog"),
    tracking: new Set((await db.emailLog.findMany({ select: { trackingId: true } })).map((r) => r.trackingId)),
  }));
  ctx.report.note("email_loglari: icerik, okundu ve ek_bilgiler taşınmadı");
  for await (const rows of streamRows(ctx, "email_loglari", {
    key: ["id"],
    cols: [
      req("alici_email"),
      opt("alici_kullanici_id"),
      opt("konu"),
      opt("email_tipi"),
      opt("durum"),
      opt("hata_mesaji"),
      opt("gonderim_tarihi"),
      opt("tracking_id"),
      opt("ilgili_tablo"),
      opt("ilgili_kayit_id"),
    ],
  })) {
    rep.read(rows.length);
    const todo = rows.filter((r) => !mapped.has(idOf(r.id)));
    rep.existing(rows.length - todo.length);
    if (todo.length === 0) continue;
    await ctx.tx(async (db) => {
      const creates: Prisma.EmailLogCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of todo) {
        const legacyId = idOf(row.id);
        let trackingId = orNull(row.tracking_id) ?? `legacy-${legacyId}`;
        if (tracking.has(trackingId)) trackingId = `${trackingId}-L${legacyId}`;
        tracking.add(trackingId);
        const id = IdMap.newId();
        const at = asDate(row.gonderim_tarihi);
        creates.push({
          id,
          to: clean(row.alici_email),
          userId: row.alici_kullanici_id === null || row.alici_kullanici_id === undefined ? null : (userIdOf.get(idOf(row.alici_kullanici_id)) ?? null),
          subject: clean(row.konu),
          kind: clean(row.email_tipi) || "legacy",
          status: emailStatusFor(clean(row.durum)),
          error: orNull(row.hata_mesaji),
          trackingId,
          refType: orNull(row.ilgili_tablo),
          refId: row.ilgili_kayit_id === null || row.ilgili_kayit_id === undefined ? null : String(row.ilgili_kayit_id),
          ...(at ? { createdAt: at } : {}),
        });
        pairs.push([legacyId, id]);
        mapped.set(legacyId, id);
        rep.created();
      }
      await db.emailLog.createMany({ data: creates });
      await ctx.ids(db).putMany("emailLog", pairs);
    });
  }
}

// ---------------------------------------------------------------- stock requests

async function stepStockRequests(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("stockRequest");
  const itemRep = ctx.report.entity("stockRequestItem");
  const requests = await readAll(ctx, "kat_sorumlusu_siparis_talepleri", {
    key: ["id"],
    cols: [
      req("talep_no"),
      req("kat_sorumlusu_id"),
      opt("depo_sorumlusu_id"),
      opt("talep_tarihi"),
      opt("onay_tarihi"),
      opt("teslim_tarihi"),
      req("durum"),
      opt("aciklama"),
      opt("red_nedeni"),
      opt("olusturma_tarihi"),
    ],
  });
  const details = await readAll(ctx, "kat_sorumlusu_siparis_talep_detaylari", {
    key: ["id"],
    cols: [req("talep_id"), req("urun_id"), opt("talep_miktari"), opt("onaylanan_miktar"), opt("teslim_edilen_miktar"), opt("aciliyet")],
  });
  rep.read(requests.length);
  itemRep.read(details.length);

  const userIdOf = await loadMap(ctx, "user");
  const productIdOf = await loadMap(ctx, "product");
  const { mapped, codes, userHotel } = await ctx.tx(async (db) => {
    const ids = [...userIdOf.values()];
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, hotelId: true } });
    const links = await db.userHotel.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: "asc" }, select: { userId: true, hotelId: true } });
    const hotelOf = new Map<string, string>();
    for (const u of users) if (u.hotelId) hotelOf.set(u.id, u.hotelId);
    for (const l of links) if (!hotelOf.has(l.userId)) hotelOf.set(l.userId, l.hotelId);
    return {
      mapped: await ctx.ids(db).load("stockRequest"),
      codes: new Set((await db.stockRequest.findMany({ select: { code: true } })).map((r) => r.code)),
      userHotel: hotelOf,
    };
  });

  const itemsOf = new Map<string, Row[]>();
  for (const d of details) {
    const list = itemsOf.get(idOf(d.talep_id)) ?? [];
    list.push(d);
    itemsOf.set(idOf(d.talep_id), list);
  }
  const requestIds = new Set(requests.map((r) => idOf(r.id)));
  const orphans = details.filter((d) => !requestIds.has(idOf(d.talep_id)));
  if (orphans.length > 0) itemRep.dropped(orphans.length, "TALEP_YOK");

  const actor = ctx.actorId;
  for (const part of chunked(requests, ctx.cfg.batch)) {
    await ctx.tx(async (db) => {
      const creates: Prisma.StockRequestCreateManyInput[] = [];
      const itemCreates: Prisma.StockRequestItemCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of part) {
        const legacyId = idOf(row.id);
        const items = itemsOf.get(legacyId) ?? [];
        if (mapped.has(legacyId)) {
          rep.existing();
          itemRep.existing(items.length);
          continue;
        }
        const requesterId = userIdOf.get(idOf(row.kat_sorumlusu_id));
        const hotelId = requesterId ? userHotel.get(requesterId) : undefined;
        if (!requesterId || !hotelId) {
          rep.dropped(1, "TALEP_OTELSIZ");
          itemRep.dropped(items.length, "TALEP_OTELSIZ");
          ctx.report.warn("TALEP_OTELSIZ", "Talep eden kullanıcının oteli belirlenemedi; talep taşınmadı", `talep ${clean(row.talep_no)}`);
          continue;
        }
        let handledById: string | null = null;
        if (row.depo_sorumlusu_id !== null && row.depo_sorumlusu_id !== undefined) {
          handledById = userIdOf.get(idOf(row.depo_sorumlusu_id)) ?? actor;
          if (handledById === actor && !userIdOf.has(idOf(row.depo_sorumlusu_id))) {
            ctx.report.warn("KULLANICI_YOK_AKTOR", "Eşlenmemiş kullanıcı yerine aktör yazıldı", `talep ${clean(row.talep_no)}: depo_sorumlusu_id`);
          }
        }
        if (!isKnownStockRequestStatus(clean(row.durum))) {
          ctx.report.warn("DURUM_BILINMIYOR", "Bilinmeyen talep durumu BEKLEMEDE yapıldı", `talep ${clean(row.talep_no)}: "${clean(row.durum)}"`);
        }
        let code = clean(row.talep_no) || `LEGACY-${legacyId}`;
        if (codes.has(code)) code = `${code}-L${legacyId}`;
        codes.add(code);

        const id = IdMap.newId();
        const createdAt = asDate(row.talep_tarihi) ?? asDate(row.olusturma_tarihi);
        creates.push({
          id,
          hotelId,
          code,
          requestedById: requesterId,
          handledById,
          status: stockRequestStatusFor(clean(row.durum)),
          note: orNull(row.aciklama),
          rejectReason: orNull(row.red_nedeni),
          approvedAt: asDate(row.onay_tarihi),
          deliveredAt: asDate(row.teslim_tarihi),
          ...(createdAt ? { createdAt } : {}),
        });
        pairs.push([legacyId, id]);
        rep.created();
        for (const d of items) {
          const productId = productIdOf.get(idOf(d.urun_id));
          if (!productId) {
            itemRep.dropped(1, "URUN_YOK");
            ctx.report.warn("URUN_YOK", "Talep kalemi eşlenmemiş ürüne bağlı; taşınmadı", `talep ${clean(row.talep_no)}: ürün ${idOf(d.urun_id)}`);
            continue;
          }
          itemCreates.push({
            requestId: id,
            productId,
            requestedQty: Math.max(1, num(d.talep_miktari) ?? 1),
            approvedQty: num(d.onaylanan_miktar),
            deliveredQty: num(d.teslim_edilen_miktar),
            urgency: clean(d.aciliyet).toLowerCase() === "acil" ? "ACIL" : "NORMAL",
          });
          itemRep.created();
        }
      }
      if (creates.length > 0) await db.stockRequest.createMany({ data: creates });
      if (itemCreates.length > 0) await db.stockRequestItem.createMany({ data: itemCreates });
      await ctx.ids(db).putMany("stockRequest", pairs);
    });
  }
}

// ---------------------------------------------------------------- notifications

interface Recipient {
  id: string;
  hotelId: string | null;
  hotelIds: Set<string>;
  code: string;
}

async function loadRecipients(db: TxClient, userIds: string[]): Promise<Recipient[]> {
  const users = await db.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true, hotelId: true, role: { select: { code: true } }, userHotels: { select: { hotelId: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    hotelId: u.hotelId,
    hotelIds: new Set([...(u.hotelId ? [u.hotelId] : []), ...u.userHotels.map((h) => h.hotelId)]),
    code: u.role.code,
  }));
}

function inScope(user: Recipient, code: RoleCode, hotelId: string | null): boolean {
  if (user.code !== code) return false;
  if (hotelId === null || code === "R-SYS") return true;
  return user.hotelIds.has(hotelId);
}

async function stepNotifications(ctx: StepContext): Promise<void> {
  const rep = ctx.report.entity("notification");
  const rowRep = ctx.report.entity("notificationRecipient");
  const days = ctx.cfg.notificationsDays;
  const userIdOf = await loadMap(ctx, "user");
  const hotelIdOf = await loadMap(ctx, "hotel");
  const roomIdOf = await loadMap(ctx, "room");
  const { mapped, recipients } = await ctx.tx(async (db) => ({
    mapped: await ctx.ids(db).load("notification"),
    recipients: await loadRecipients(db, [...userIdOf.values()]),
  }));

  const exists = await ctx.legacy.tableExists("bildirimler");
  const total = exists ? await ctx.legacy.count("bildirimler") : 0;
  let seen = 0;
  ctx.report.note(`bildirimler: son ${days === 0 ? "tüm" : `${days} günün`} bildirimleri taşındı; hedef_rol/otel hedefleri alıcı başına bir satıra açıldı, gonderen_id taşınmadı`);

  for await (const rows of streamRows(ctx, "bildirimler", {
    key: ["id"],
    cols: [
      req("hedef_rol"),
      opt("hedef_otel_id"),
      opt("hedef_kullanici_id"),
      opt("bildirim_tipi"),
      opt("baslik"),
      opt("mesaj"),
      opt("okundu"),
      opt("olusturma_tarihi"),
      opt("oda_id"),
      opt("gorev_id"),
    ],
    ...(days > 0 ? { where: `"olusturma_tarihi" >= now() - interval '${Math.floor(days)} days'` } : {}),
  })) {
    seen += rows.length;
    rep.read(rows.length);
    await ctx.tx(async (db) => {
      const creates: Prisma.NotificationCreateManyInput[] = [];
      const pairs: [string, string][] = [];
      for (const row of rows) {
        const legacyId = idOf(row.id);
        const hotelId = row.hedef_otel_id === null || row.hedef_otel_id === undefined ? null : (hotelIdOf.get(idOf(row.hedef_otel_id)) ?? null);
        let targets: string[];
        if (row.hedef_kullanici_id !== null && row.hedef_kullanici_id !== undefined) {
          const one = userIdOf.get(idOf(row.hedef_kullanici_id));
          targets = one ? [one] : [];
        } else {
          const code = roleCodeFor(clean(row.hedef_rol));
          if (!code) {
            rep.dropped(1, "ROL_BILINMIYOR");
            continue;
          }
          targets = recipients.filter((u) => inScope(u, code, hotelId)).map((u) => u.id);
        }
        if (targets.length === 0) {
          rep.dropped(1, "ALICI_YOK");
          continue;
        }
        const fresh = targets.filter((userId) => !mapped.has(`${legacyId}:${userId}`));
        if (fresh.length === 0) {
          rep.existing();
          rowRep.read(targets.length);
          rowRep.existing(targets.length);
          continue;
        }
        const at = asDate(row.olusturma_tarihi);
        const roomId = row.oda_id === null || row.oda_id === undefined ? undefined : roomIdOf.get(idOf(row.oda_id));
        const refType = roomId ? "Room" : row.gorev_id !== null && row.gorev_id !== undefined ? "LegacyTask" : null;
        const refId = roomId ?? (refType ? idOf(row.gorev_id) : null);
        for (const userId of fresh) {
          const id = IdMap.newId();
          creates.push({
            id,
            userId,
            hotelId,
            type: clean(row.bildirim_tipi) || "legacy",
            title: clean(row.baslik),
            body: typeof row.mesaj === "string" ? row.mesaj : "",
            refType,
            refId,
            isRead: toBool(row.okundu, false),
            ...(at ? { createdAt: at } : {}),
          });
          pairs.push([`${legacyId}:${userId}`, id]);
          mapped.set(`${legacyId}:${userId}`, id);
        }
        rep.created();
        rowRep.read(targets.length);
        rowRep.created(fresh.length);
        rowRep.existing(targets.length - fresh.length);
      }
      if (creates.length > 0) await db.notification.createMany({ data: creates });
      await ctx.ids(db).putMany("notification", pairs);
    });
  }
  if (exists && total > seen) {
    rep.read(total - seen);
    rep.dropped(total - seen, "ESKI");
  }
}
