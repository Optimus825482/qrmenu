/**
 * Yerel deneme: siparişi olan bir outlet'in menüsü yeniden kurulabiliyor mu, sipariş satırı yerinde kalıyor mu?
 * Tea Lounge'a bir deneme siparişi ekler, damgayı silip senkronu çalıştırır, sonucu yazar ve denemeyi temizler.
 * Yalnız geliştirme veritabanında çalıştırın: npx tsx scripts/menu-2026/siparisli-senkron-dene.ts
 */
import "dotenv/config";
import { MENU_ARCHIVE_CATEGORY, menuStampKey } from "../../prisma/seed/menuSyncPolicy";
import { syncMeritMenus } from "../../prisma/seed/meritMenus";

async function main() {
  const { prisma } = await import("@/lib/prisma");
  const outlet = await prisma.outlet.findFirstOrThrow({
    where: { name: "Tea Lounge", hotel: { code: "DIAMOND" } },
    select: { id: true, hotelId: true },
  });
  const item = await prisma.menuNode.findFirstOrThrow({
    where: { outletId: outlet.id, kind: "OGE", isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  const order = await prisma.order.create({
    data: {
      hotelId: outlet.hotelId,
      outletId: outlet.id,
      kind: "MASA",
      businessDate: new Date("2026-11-10"),
      orderNo: 999_001,
      guestLanguage: "tr",
      clientIp: "127.0.0.1",
      idempotencyKey: `menu-senkron-deneme-${Date.now()}`,
      items: { create: [{ menuNodeId: item.id, nameSnapshot: item.name, qty: 1 }] },
    },
    select: { id: true },
  });
  const counts = async () => ({
    aktifUrun: await prisma.menuNode.count({ where: { outletId: outlet.id, kind: "OGE", isActive: true } }),
    pasifUrun: await prisma.menuNode.count({ where: { outletId: outlet.id, kind: "OGE", isActive: false } }),
    arsivKategori: await prisma.menuNode.count({ where: { outletId: outlet.id, name: MENU_ARCHIVE_CATEGORY } }),
    siparisSatiri: await prisma.orderItem.count({ where: { orderId: order.id } }),
  });
  try {
    console.log("önce:", await counts());
    await prisma.setting.deleteMany({ where: { key: menuStampKey(outlet.id) } });
    await syncMeritMenus(prisma);
    console.log("siparişli yeniden kurulumdan sonra:", await counts());
    const line = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
      select: { nameSnapshot: true, menuNode: { select: { isActive: true, parent: { select: { name: true } } } } },
    });
    console.log("sipariş satırı:", JSON.stringify(line));
    await syncMeritMenus(prisma);
    console.log("dosya aynıyken ikinci çalıştırma:", await counts());
  } finally {
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.setting.deleteMany({ where: { key: menuStampKey(outlet.id) } });
    await syncMeritMenus(prisma);
    console.log("temizlikten sonra:", await counts().catch(() => "sipariş silindi"));
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
