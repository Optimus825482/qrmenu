import pg from "pg";
import { prisma } from "../src/lib/prisma";

function requireLegacyUrl(): string {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) {
    throw new Error("LEGACY_DATABASE_URL ortam değişkeni gerekli (ör. postgresql://kullanici:sifre@localhost:5432/minibar)");
  }
  return url;
}
const LEGACY_URL: string = requireLegacyUrl();

async function main() {
  console.log("🚀 Minibar veri aktarımı başlatılıyor...");
  console.log(`Kaynak: ${LEGACY_URL.replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@")}`);

  const legacyClient = new pg.Client({ connectionString: LEGACY_URL });
  await legacyClient.connect();

  try {
    // 1. Otel Eşleme
    console.log("\n1. Oteller kontrol ediliyor...");
    const hotels = await prisma.hotel.findMany();
    const hotelCodeMap: Record<number, string> = {
      1: "DIAMOND",
      3: "PREMIUM",
      4: "ROYAL",
    };

    const legacyHotelToTargetId: Record<number, string> = {};
    for (const [legIdStr, code] of Object.entries(hotelCodeMap)) {
      const legId = Number(legIdStr);
      const h = hotels.find((x) => x.code === code);
      if (!h) {
        throw new Error(`Hedef veritabanında ${code} oteli bulunamadı!`);
      }
      legacyHotelToTargetId[legId] = h.id;
      console.log(`   ✓ Legacy Otel #${legId} -> ${h.name} (${h.code}) [${h.id}]`);
    }

    // 2. Ürün Grupları (ProductGroup)
    console.log("\n2. Ürün Grupları aktarılıyor...");
    const legGroups = await legacyClient.query(
      "SELECT id, grup_adi, aciklama, aktif FROM urun_gruplari ORDER BY id"
    );
    const legacyGroupIdToTargetId: Record<number, string> = {};

    for (const row of legGroups.rows) {
      const name = (row.grup_adi || "").trim();
      const existing = await prisma.productGroup.findFirst({
        where: { name },
      });
      if (existing) {
        legacyGroupIdToTargetId[row.id] = existing.id;
      } else {
        const created = await prisma.productGroup.create({
          data: {
            name,
            isActive: Boolean(row.aktif),
          },
        });
        legacyGroupIdToTargetId[row.id] = created.id;
      }
    }
    console.log(`   ✓ ${legGroups.rows.length} ürün grubu aktarıldı/eşlendi.`);

    // 3. Ürünler (Product)
    console.log("\n3. Ürünler aktarılıyor...");
    const legProducts = await legacyClient.query(
      "SELECT id, grup_id, urun_adi, barkod, birim, kritik_stok_seviyesi, aktif, urun_kodu, satis_fiyati, alis_fiyati FROM urunler ORDER BY id"
    );
    const legacyProdIdToTargetId: Record<number, string> = {};

    for (const row of legProducts.rows) {
      const name = (row.urun_adi || "").trim();
      const targetGroupId = legacyGroupIdToTargetId[row.grup_id];
      if (!targetGroupId) {
        console.warn(`   ⚠️ Ürün #${row.id} (${name}) için grup #${row.grup_id} bulunamadı, atlandı.`);
        continue;
      }

      const existing = await prisma.product.findFirst({
        where: { name },
      });

      if (existing) {
        legacyProdIdToTargetId[row.id] = existing.id;
      } else {
        const created = await prisma.product.create({
          data: {
            name,
            groupId: targetGroupId,
            code: row.urun_kodu?.trim() || null,
            barcode: row.barkod?.trim() || null,
            unit: (row.birim || "Adet").trim(),
            purchasePrice: row.alis_fiyati ? String(row.alis_fiyati) : null,
            salePrice: row.satis_fiyati ? String(row.satis_fiyati) : null,
            criticalLevel: Number(row.kritik_stok_seviyesi) || 10,
            isActive: Boolean(row.aktif),
          },
        });
        legacyProdIdToTargetId[row.id] = created.id;
      }
    }
    console.log(`   ✓ ${Object.keys(legacyProdIdToTargetId).length} ürün aktarıldı/eşlendi.`);

    // 4. Setuplar (Setup)
    console.log("\n4. Setuplar aktarılıyor...");
    const legSetups = await legacyClient.query(
      "SELECT id, ad, aciklama, aktif, dolap_ici FROM setuplar ORDER BY id"
    );
    const legacySetupIdToTargetId: Record<number, string> = {};

    for (const row of legSetups.rows) {
      const name = (row.ad || "").trim();
      const existing = await prisma.setup.findFirst({
        where: { name },
      });
      if (existing) {
        legacySetupIdToTargetId[row.id] = existing.id;
      } else {
        const created = await prisma.setup.create({
          data: {
            name,
            description: row.aciklama?.trim() || null,
            isInsideCabinet: Boolean(row.dolap_ici),
            isActive: Boolean(row.aktif),
          },
        });
        legacySetupIdToTargetId[row.id] = created.id;
      }
    }
    console.log(`   ✓ ${legSetups.rows.length} setup aktarıldı/eşlendi.`);

    // 5. Setup İçerikleri (SetupItem)
    console.log("\n5. Setup İçerikleri aktarılıyor...");
    const legItems = await legacyClient.query(
      "SELECT id, setup_id, urun_id, adet FROM setup_icerik ORDER BY id"
    );
    let itemCreatedCount = 0;

    for (const row of legItems.rows) {
      const targetSetupId = legacySetupIdToTargetId[row.setup_id];
      const targetProdId = legacyProdIdToTargetId[row.urun_id];
      if (!targetSetupId || !targetProdId) continue;

      const existing = await prisma.setupItem.findUnique({
        where: {
          setupId_productId: {
            setupId: targetSetupId,
            productId: targetProdId,
          },
        },
      });

      if (!existing) {
        await prisma.setupItem.create({
          data: {
            setupId: targetSetupId,
            productId: targetProdId,
            qty: Number(row.adet) || 1,
          },
        });
        itemCreatedCount++;
      }
    }
    console.log(`   ✓ ${itemCreatedCount} setup içeriği (ürün eşlemesi) aktarıldı.`);

    // 6. Katlar (Floor)
    console.log("\n6. Katlar aktarılıyor...");
    const legFloors = await legacyClient.query(
      "SELECT id, otel_id, kat_no, kat_adi, aktif FROM katlar ORDER BY otel_id, kat_no"
    );
    const legacyFloorIdToTargetId: Record<number, string> = {};

    for (const row of legFloors.rows) {
      const targetHotelId = legacyHotelToTargetId[row.otel_id];
      if (!targetHotelId) continue;

      const existing = await prisma.floor.findUnique({
        where: {
          hotelId_number: {
            hotelId: targetHotelId,
            number: Number(row.kat_no),
          },
        },
      });

      if (existing) {
        legacyFloorIdToTargetId[row.id] = existing.id;
      } else {
        const created = await prisma.floor.create({
          data: {
            hotelId: targetHotelId,
            number: Number(row.kat_no),
            name: (row.kat_adi || `${row.kat_no}. Kat`).trim(),
            isActive: Boolean(row.aktif),
          },
        });
        legacyFloorIdToTargetId[row.id] = created.id;
      }
    }
    console.log(`   ✓ ${legFloors.rows.length} kat aktarıldı/eşlendi.`);

    // 7. Oda Tipleri (RoomType - Otel bazlı)
    console.log("\n7. Oda Tipleri aktarılıyor...");
    const legRoomTypes = await legacyClient.query(
      "SELECT id, ad, dolap_sayisi, aktif FROM oda_tipleri ORDER BY id"
    );
    // Harita: [hotelId]_[legacy_oda_tipi_id] -> target RoomType.id
    const legacyRoomTypeToTargetId: Record<string, string> = {};

    for (const targetHotelId of Object.values(legacyHotelToTargetId)) {
      for (const row of legRoomTypes.rows) {
        const name = (row.ad || "").trim();

        const existing = await prisma.roomType.findUnique({
          where: {
            hotelId_name: {
              hotelId: targetHotelId,
              name,
            },
          },
        });

        if (existing) {
          legacyRoomTypeToTargetId[`${targetHotelId}_${row.id}`] = existing.id;
        } else {
          const created = await prisma.roomType.create({
            data: {
              hotelId: targetHotelId,
              name,
              cabinetCount: Number(row.dolap_sayisi) || 1,
              isActive: Boolean(row.aktif),
            },
          });
          legacyRoomTypeToTargetId[`${targetHotelId}_${row.id}`] = created.id;
        }
      }
    }
    console.log(`   ✓ 3 otel için oda tipleri aktarıldı/eşlendi.`);

    // 8. Oda Tipi Setup Atamaları (RoomTypeSetup)
    console.log("\n8. Oda Tipi - Setup Atamaları aktarılıyor...");
    const legOdaTipiSetup = await legacyClient.query(
      "SELECT otel_id, oda_tipi_id, setup_id FROM oda_tipi_setup"
    );
    let rtsCreatedCount = 0;

    for (const row of legOdaTipiSetup.rows) {
      const targetHotelId = legacyHotelToTargetId[row.otel_id];
      const targetSetupId = legacySetupIdToTargetId[row.setup_id];
      if (!targetHotelId || !targetSetupId) continue;

      const targetRoomTypeId = legacyRoomTypeToTargetId[`${targetHotelId}_${row.oda_tipi_id}`];
      if (!targetRoomTypeId) continue;

      const existing = await prisma.roomTypeSetup.findUnique({
        where: {
          hotelId_roomTypeId_setupId: {
            hotelId: targetHotelId,
            roomTypeId: targetRoomTypeId,
            setupId: targetSetupId,
          },
        },
      });

      if (!existing) {
        await prisma.roomTypeSetup.create({
          data: {
            hotelId: targetHotelId,
            roomTypeId: targetRoomTypeId,
            setupId: targetSetupId,
          },
        });
        rtsCreatedCount++;
      }
    }
    console.log(`   ✓ ${legOdaTipiSetup.rows.length} oda tipi - setup ataması aktarıldı.`);

    // 9. Odalar (Room)
    console.log("\n9. Odalar aktarılıyor...");
    const legRooms = await legacyClient.query(
      `SELECT o.id, o.kat_id, o.oda_no, o.aktif, o.qr_kod_token, o.misafir_mesaji, o.oda_tipi_id, k.otel_id
       FROM odalar o
       JOIN katlar k ON o.kat_id = k.id
       ORDER BY o.id`
    );
    let roomsCreatedCount = 0;

    for (const row of legRooms.rows) {
      const targetHotelId = legacyHotelToTargetId[row.otel_id];
      const targetFloorId = legacyFloorIdToTargetId[row.kat_id];
      if (!targetHotelId || !targetFloorId) continue;

      const targetRoomTypeId = row.oda_tipi_id
        ? legacyRoomTypeToTargetId[`${targetHotelId}_${row.oda_tipi_id}`] || null
        : null;

      const roomNumber = String(row.oda_no).trim();

      const existing = await prisma.room.findUnique({
        where: {
          hotelId_number: {
            hotelId: targetHotelId,
            number: roomNumber,
          },
        },
      });

      if (!existing) {
        await prisma.room.create({
          data: {
            hotelId: targetHotelId,
            floorId: targetFloorId,
            roomTypeId: targetRoomTypeId,
            number: roomNumber,
            qrToken: row.qr_kod_token?.trim() || null,
            guestMessage: row.misafir_mesaji?.trim() || null,
            isActive: Boolean(row.aktif),
          },
        });
        roomsCreatedCount++;
      }
    }
    console.log(`   ✓ ${roomsCreatedCount} yeni oda başarıyla aktarıldı (Toplam kaynak: ${legRooms.rows.length}).`);

    // Doğrulama
    console.log("\n================ MİGRASYON ÖZETİ ================");
    const totalFloors = await prisma.floor.count();
    const totalRooms = await prisma.room.count();
    const totalRoomTypes = await prisma.roomType.count();
    const totalGroups = await prisma.productGroup.count();
    const totalProducts = await prisma.product.count();
    const totalSetups = await prisma.setup.count();
    const totalSetupItems = await prisma.setupItem.count();
    const totalRoomTypeSetups = await prisma.roomTypeSetup.count();

    console.log(`• Katlar                 : ${totalFloors} (Hedefteki toplam)`);
    console.log(`• Odalar                 : ${totalRooms} (Hedefteki toplam)`);
    console.log(`• Oda Tipleri            : ${totalRoomTypes} (Hedefteki toplam)`);
    console.log(`• Ürün Grupları          : ${totalGroups}`);
    console.log(`• Ürünler                : ${totalProducts}`);
    console.log(`• Setuplar               : ${totalSetups}`);
    console.log(`• Setup Kalemleri        : ${totalSetupItems}`);
    console.log(`• Oda Tipi - Setup Bağları: ${totalRoomTypeSetups}`);
    console.log("=================================================");
    console.log("🎉 VERİ AKTARIMI BAŞARIYLA TAMAMLANDI!");
  } catch (err) {
    console.error("❌ Aktarım sırasında hata oluştu:", err);
    process.exit(1);
  } finally {
    await legacyClient.end();
    await prisma.$disconnect();
  }
}

main();
