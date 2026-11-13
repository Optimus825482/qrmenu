/**
 * F&B personelini (50 kişi) tanımlar: ana otel DIAMOND, ek olarak diğer aktif oteller (üç otelde de çalışabilirler).
 * Tekrar çalıştırılabilir (idempotent); var olan kişinin eksik oteli tamamlanır.
 *
 *   npx tsx scripts/diamond-personel-tanimla.ts --dry-run   # yalnız ne yapılacağını yazar
 *   npx tsx scripts/diamond-personel-tanimla.ts             # kullanıcıları oluşturur
 *
 * Kullanıcılar domain fonksiyonu createOnboarding ile (R-SYS "admin" adına) oluşturulur: otomatik kullanıcı adı,
 * standart geçici şifre + mustChangePassword, denetim kaydı, oda servisi ekip üyeliği. Aynı ad soyadlı (büyük/küçük
 * harf duyarsız) silinmemiş bir DIAMOND kullanıcısı varsa kişi atlanır. Geçici şifre çıktıya yazılmaz.
 * `department` alanı yalnız bu dosyada tutulur; kullanıcı modelinde karşılığı yoktur (outlet ataması yapılmaz).
 */
import "dotenv/config";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOnboarding, update } from "@/modules/core/server/admin/users";

const HOTEL_CODE = "DIAMOND";
const ACTOR_USERNAME = "admin";
const MARKER_KEY = "seed.diamondPersonel.completedAt";

type Department = "Bar" | "Restaurant" | "Banket" | "A La Carte" | "Room Service";
type Person = { department: Department; fullName: string; jobTitle: string; roleCode: string };

const p = (department: Department, roleCode: string, jobTitle: string, names: string[]): Person[] =>
  names.map((fullName) => ({ department, fullName, jobTitle, roleCode }));

export const PEOPLE: Person[] = [
  ...p("Bar", "R-FBY", "F&B Müdür Yardımcısı", ["Egemen Özkarslıoğlu"]),
  ...p("Bar", "R-SGF", "Headwaiter", ["Muhammed Özmen", "Keremcan Candan"]),
  ...p("Bar", "R-SGF", "Supervisor", ["Yunus Emre Uğurlu", "Ali Beyaz", "Süleyman Oktay", "Gökhan Kuştutan", "Gökhan Mamak"]),
  ...p("Bar", "R-BAR", "Captain", ["Meliha Sağlam", "Hüseyin Paşayev", "Hakan Baran", "Selim Çolak", "Kemal Doğanbey", "Halil Gürsoy"]),
  ...p("Bar", "R-BAR", "Junior Captain", ["Ayşenur Varol", "Devran Korkut", "Hilal Avcı", "Melih Eser", "Burak Kahraman"]),
  ...p("Restaurant", "R-FBY", "F&B Müdür Yardımcısı", ["Mesut Urhan"]),
  ...p("Restaurant", "R-SGF", "Headwaiter", ["Cemil Ataç"]),
  ...p("Restaurant", "R-SGF", "Supervisor", ["Ahmet Yavuz", "Ceyhun Irmakcan", "Atajan Kurbanov"]),
  ...p("Restaurant", "R-GAR", "Captain", ["Ertuğrul Yazıcı", "Yücel Öz", "Celal Katmaz"]),
  ...p("Restaurant", "R-GAR", "Junior Captain", ["Murat Gökduman", "Deniz Erdoğan", "Mehmet Demirbağ", "Baki Burak Özcan"]),
  ...p("Banket", "R-GAR", "Captain", ["Musa Koca"]),
  ...p("A La Carte", "R-FBY", "F&B Müdür Yardımcısı", ["Eren Altay"]),
  ...p("A La Carte", "R-SGF", "Supervisor", ["Halil Songür", "Halil Batak"]),
  ...p("A La Carte", "R-GAR", "Captain", ["Şeref Ceyhan", "Onur Can Sezer"]),
  ...p("A La Carte", "R-GAR", "Junior Captain", ["Semih Sağlam", "Yusuf Koçak"]),
  ...p("A La Carte", "R-GAR", "Incharge (A La Carte Waiter)", ["Süleyman Kabak"]),
  ...p("Room Service", "R-OSS", "Maître d'Hôtel", ["Alper Boysal"]),
  ...p("Room Service", "R-ODS", "Supervisor", ["Gökhan Bulut", "Devrim Egemen Öztürk"]),
  ...p("Room Service", "R-ODS", "Captain", ["Atajan Bayanov", "Kerem Bozkaplan", "Yakup Çetinkaya", "Ülkü Cent", "Oktay Golbay"]),
  ...p("Room Service", "R-ODS", "Junior Captain", ["Oğuzhan Kiraz", "Halime Arslanuşak"]),
];

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  // --once (deploy): runs a single time per database. Afterwards the list belongs to the administrators:
  // a person they delete or rename must not come back on the next deploy.
  const once = args.includes("--once");
  const unknown = args.filter((a) => a !== "--dry-run" && a !== "--once");
  if (unknown.length) throw new Error(`Bilinmeyen bayrak: ${unknown.join(", ")}`);
  if (once && (await prisma.setting.findFirst({ where: { hotelId: null, key: MARKER_KEY }, select: { id: true } }))) {
    console.log("Diamond personel tanımlama daha önce tamamlanmış; atlandı.");
    return 0;
  }

  const hotel = await prisma.hotel.findUnique({ where: { code: HOTEL_CODE }, select: { id: true } });
  if (!hotel) throw new Error(`Otel bulunamadı: ${HOTEL_CODE}`);
  // Everyone is defined in every active hotel; DIAMOND stays the primary one.
  const others = (await prisma.hotel.findMany({ where: { isActive: true, id: { not: hotel.id } }, select: { id: true }, orderBy: { code: "asc" } })).map((h) => h.id);
  const allHotels = [hotel.id, ...others];
  const roleCodes = [...new Set(PEOPLE.map((x) => x.roleCode))];
  const roles = await prisma.role.findMany({ where: { code: { in: roleCodes } }, select: { id: true, code: true } });
  const missing = roleCodes.filter((c) => !roles.some((r) => r.code === c));
  if (missing.length) throw new Error(`Eksik rol(ler): ${missing.join(", ")} - hiçbir şey yazılmadı`);
  const roleId = new Map(roles.map((r) => [r.code, r.id]));

  // Audit rows are written in this user's name: `admin` when it exists, otherwise the oldest system administrator.
  const actorSelect = { id: true, username: true, fullName: true, roleId: true, role: { select: { code: true, kind: true } } } as const;
  const sysAdmin = { deletedAt: null, isActive: true, role: { code: "R-SYS" } } as const;
  const actor =
    (await prisma.user.findFirst({ where: { ...sysAdmin, username: ACTOR_USERNAME }, select: actorSelect })) ??
    (await prisma.user.findFirst({ where: sysAdmin, orderBy: { createdAt: "asc" }, select: actorSelect }));
  if (!actor) throw new Error("Aktif sistem yöneticisi (R-SYS) bulunamadı - hiçbir şey yazılmadı");
  const ctx: Ctx = {
    user: {
      id: actor.id,
      username: actor.username,
      fullName: actor.fullName,
      roleId: actor.roleId,
      roleCode: actor.role.code,
      roleKind: actor.role.kind,
    },
    session: { id: "script-diamond-personel", hotelId: hotel.id },
    hotelIds: allHotels,
  };

  const existing = await prisma.user.findMany({
    where: { deletedAt: null, OR: [{ hotelId: hotel.id }, { userHotels: { some: { hotelId: hotel.id } } }] },
    select: {
      id: true, fullName: true, username: true, jobTitle: true, email: true, emailOptIn: true, phone: true,
      roleId: true, hotelId: true, supervisorId: true, userHotels: { select: { hotelId: true } },
    },
  });
  const key = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
  const byName = new Map(existing.map((u) => [key(u.fullName), u]));

  const rows: { fullName: string; username: string; role: string; status: string }[] = [];
  for (const person of PEOPLE) {
    const found = byName.get(key(person.fullName));
    if (found) {
      const has = new Set([found.hotelId, ...found.userHotels.map((h) => h.hotelId)]);
      const lacking = others.filter((id) => !has.has(id));
      if (lacking.length === 0) {
        rows.push({ fullName: person.fullName, username: found.username, role: person.roleCode, status: "skipped" });
        continue;
      }
      if (!dryRun) {
        await update(ctx, found.id, {
          username: found.username,
          fullName: found.fullName,
          jobTitle: found.jobTitle ?? "",
          email: found.email,
          emailOptIn: found.emailOptIn,
          phone: found.phone,
          roleId: found.roleId,
          hotelId: found.hotelId ?? hotel.id,
          hotelIds: [...new Set([...found.userHotels.map((h) => h.hotelId), ...lacking])],
          supervisorId: found.supervisorId,
        });
      }
      rows.push({ fullName: person.fullName, username: found.username, role: person.roleCode, status: dryRun ? "would-update" : "updated" });
      continue;
    }
    if (dryRun) {
      rows.push({ fullName: person.fullName, username: "(otomatik)", role: person.roleCode, status: "would-create" });
      continue;
    }
    const { user } = await createOnboarding(ctx, {
      fullName: person.fullName,
      jobTitle: person.jobTitle,
      roleId: roleId.get(person.roleCode)!,
      hotelId: hotel.id,
      hotelIds: others,
    });
    rows.push({ fullName: person.fullName, username: user.username, role: person.roleCode, status: "created" });
  }
  console.table(rows);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  console.log(
    `${dryRun ? "[DRY-RUN] " : ""}toplam ${rows.length}: created ${count("created")}, would-create ${count("would-create")}, updated ${count("updated")}, would-update ${count("would-update")}, skipped ${count("skipped")}`,
  );
  if (once && !dryRun) {
    await prisma.setting.create({ data: { hotelId: null, key: MARKER_KEY, value: new Date().toISOString() } });
    console.log("Tamamlandı işareti yazıldı; sonraki açılışlarda atlanacak.");
  }
  return 0;
}

main()
  .then((code) => prisma.$disconnect().then(() => process.exit(code)))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
