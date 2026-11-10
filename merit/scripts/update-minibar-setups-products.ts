import { prisma } from "../src/lib/prisma";

/**
 * One-off demo catalogue script: it rewrites setup contents (par levels) and opens pool rows. It never runs by
 * accident: production is refused, and every other environment needs the explicit `--yes-overwrite-catalog` flag.
 * Existing pool balances (HotelStock) are never touched; only missing rows are opened.
 */
function assertAllowed(): void {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    console.error("Bu betik üretim ortamında çalıştırılamaz (setup içerikleri ve havuz satırları değişir).");
    process.exit(2);
  }
  if (!process.argv.includes("--yes-overwrite-catalog")) {
    console.error(
      "Bu betik setup içeriklerini (par seviyeleri) siler ve yeniden yazar. Bilerek çalıştırmak için --yes-overwrite-catalog ekleyin.",
    );
    process.exit(2);
  }
}

async function main() {
  assertAllowed();
  console.log("🚀 Minibar ürünleri ve setupları güncelleniyor...");

  // 1. Deactivate / Clean Mr Brown products
  console.log("\n1. Mr Brown ürünleri pasife alınıyor/temizleniyor...");
  await prisma.product.updateMany({
    where: {
      name: { contains: "Mr Brown", mode: "insensitive" },
    },
    data: { isActive: false },
  });
  console.log("   ✓ Mr Brown ürünleri pasif edildi.");

  // 2. Product Groups
  console.log("\n2. Ürün Grupları kontrol ediliyor...");
  const groupNames = [
    "Soğuk İçecekler & Meşrubat",
    "Sıcak İçecekler & Kahve",
    "Atıştırmalık & Çikolata",
    "Cips & Kraker & Bisküvi",
    "Alkol & Şarap",
    "Su & Soda",
  ];

  const groupMap: Record<string, string> = {};
  for (const name of groupNames) {
    let g = await prisma.productGroup.findFirst({ where: { name } });
    if (!g) {
      g = await prisma.productGroup.create({
        data: { name, isActive: true },
      });
    }
    groupMap[name] = g.id;
  }
  const defaultGroupId = Object.values(groupMap)[0];

  // Helper to categorize product
  function getGroupName(productName: string): string {
    const p = productName.toLowerCase();
    if (p.includes("su ") || p.includes("soda") || p.includes("pellegrino") || p.includes("perrier")) {
      return groupMap["Su & Soda"] || defaultGroupId;
    }
    if (p.includes("kahve") || p.includes("nescafe") || p.includes("coffee") || p.includes("şeker") || p.includes("sakarin") || p.includes("segafredo")) {
      return groupMap["Sıcak İçecekler & Kahve"] || defaultGroupId;
    }
    if (p.includes("pepsi") || p.includes("yedigün") || p.includes("seven up") || p.includes("ice tea") || p.includes("latte") || p.includes("mocha") || p.includes("redbull")) {
      return groupMap["Soğuk İçecekler & Meşrubat"] || defaultGroupId;
    }
    if (p.includes("efes") || p.includes("rose") || p.includes("champaigne") || p.includes("chardonay") || p.includes("merlot")) {
      return groupMap["Alkol & Şarap"] || defaultGroupId;
    }
    if (p.includes("cips") || p.includes("crax") || p.includes("çizi") || p.includes("bruschette") || p.includes("fıstık")) {
      return groupMap["Cips & Kraker & Bisküvi"] || defaultGroupId;
    }
    return groupMap["Atıştırmalık & Çikolata"] || defaultGroupId;
  }

  // 3. Define Full Product List from User's Prompt
  console.log("\n3. Ürünler ekleniyor / güncelleniyor...");
  const rawProducts = [
    // Ortak Meşrubat & Sular
    { name: "Taşkesti Su 0.75 cl", unit: "Adet" },
    { name: "Taşkesti Su 0.33 cl", unit: "Adet" },
    { name: "Pepsi 330 ml", unit: "Kutu" },
    { name: "Diet Pepsi 330 ml", unit: "Kutu" },
    { name: "Yedigün 330 ml", unit: "Kutu" },
    { name: "Seven Up 330 ml", unit: "Kutu" },
    { name: "İce Tea Limon 330 ml", unit: "Kutu" },
    { name: "İce Tea Şeftali 330 ml", unit: "Kutu" },
    { name: "Gustavo Latte 250 ml", unit: "Kutu" },
    { name: "Gustavo Mocha 250 ml", unit: "Kutu" },
    { name: "Soda 200 ml", unit: "Şişe" },
    { name: "Efes Pilsen 0.33 cl", unit: "Şişe" },
    { name: "Redbull 250 ml.", unit: "Kutu" },
    { name: "Pellegrino 250 ml", unit: "Şişe" },
    { name: "Perrier 200 ml", unit: "Şişe" },

    // Sıcak İçecekler & Sarf
    { name: "Nescafe Gold 2 gr.", unit: "Poşet" },
    { name: "Coffee Mate 5 gr.", unit: "Poşet" },
    { name: "Beyaz Şeker 2 gr.", unit: "Paket" },
    { name: "Esmer Şeker 2 gr.", unit: "Paket" },
    { name: "Sakarin ( Tatlandırıcı)", unit: "Paket" },
    { name: "Segafredo Kahve 6 gr", unit: "Kapsül" },
    { name: "Türk Kahvesi", unit: "Paket" },

    // Atıştırmalık & Çikolata & Bisküvi
    { name: "Çokonat 33 gr.", unit: "Adet" },
    { name: "Brownie Intense 50 gr.", unit: "Adet" },
    { name: "Tuzlu Fıstık 60 gr.", unit: "Paket" },
    { name: "Ülker Çizi 70 gr.", unit: "Paket" },
    { name: "Haribo 100 gr.", unit: "Paket" },
    { name: "Eti Crax 50 gr.", unit: "Paket" },
    { name: "Benimo 80 gr.", unit: "Paket" },
    { name: "Eti Puf 18 gr.", unit: "Adet" },
    { name: "Pop Kek 40 gr.", unit: "Adet" },
    { name: "Eti Cin 25 gr.", unit: "Adet" },
    { name: "Pringles Cips 40 gr.", unit: "Kutu" },
    { name: "Maretti Bruschette Domatesli 70 gr.", unit: "Paket" },
    { name: "Maretti Bruschette Peynirli 70 gr.", unit: "Paket" },
    { name: "Snickers 50 GR.", unit: "Adet" },
    { name: "Nesfit Kırmızı Meyveli", unit: "Paket" },
    { name: "Nesfit Karamelli", unit: "Paket" },
    { name: "Nesfit Kakaolu", unit: "Paket" },
    { name: "Nesfit Sütlü Muzlu Çikolatalı", unit: "Paket" },
    { name: "First Naneli Sakız 27 gr", unit: "Paket" },
    { name: "First Çilekli Sakız 27 gr", unit: "Paket" },

    // Alkol & Şaraplar
    { name: "Mateus Rose 187 ml.", unit: "Şişe" },
    { name: "JP Chenet Champaigne 200 ml.", unit: "Şişe" },
    { name: "Masion Castel Chardonay 187 ml", unit: "Şişe" },
    { name: "Masion Castel Merlot 187 ml.", unit: "Şişe" },
  ];

  const productNameToId: Record<string, string> = {};

  for (const item of rawProducts) {
    const trimmedName = item.name.trim();
    const groupId = getGroupName(trimmedName);

    let prod = await prisma.product.findFirst({
      where: {
        name: { equals: trimmedName, mode: "insensitive" },
      },
    });

    if (prod) {
      prod = await prisma.product.update({
        where: { id: prod.id },
        data: {
          name: trimmedName,
          unit: item.unit,
          isActive: true,
          groupId,
        },
      });
    } else {
      prod = await prisma.product.create({
        data: {
          name: trimmedName,
          unit: item.unit,
          groupId,
          isActive: true,
          criticalLevel: 20,
        },
      });
    }
    productNameToId[trimmedName] = prod.id;
  }
  console.log(`   ✓ ${Object.keys(productNameToId).length} ürün veritabanında aktif.`);

  // 4. Setupların Tanımlanması
  console.log("\n4. Setuplar oluşturuluyor / güncelleniyor...");

  // Setup 1: Diamond Suit - Queen - Standart
  const diamondStandartItems = [
    "Taşkesti Su 0.75 cl", "Taşkesti Su 0.33 cl", "Pepsi 330 ml", "Diet Pepsi 330 ml",
    "Yedigün 330 ml", "Seven Up 330 ml", "İce Tea Limon 330 ml", "İce Tea Şeftali 330 ml",
    "Gustavo Latte 250 ml", "Gustavo Mocha 250 ml", "Soda 200 ml", "Efes Pilsen 0.33 cl",
    "Nescafe Gold 2 gr.", "Coffee Mate 5 gr.", "Beyaz Şeker 2 gr.", "Esmer Şeker 2 gr.",
    "Sakarin ( Tatlandırıcı)", "Redbull 250 ml.", "Çokonat 33 gr.", "Brownie Intense 50 gr.",
    "Tuzlu Fıstık 60 gr."
  ];

  // Setup 2: Royal Suit - Queen - Standart (includes Segafredo kapsül)
  const royalStandartItems = [
    ...diamondStandartItems,
    "Segafredo Kahve 6 gr"
  ];

  // Setup 3: Premium Suit/Queen/Standart (includes Segafredo + snacks)
  const premiumStandartItems = [
    ...royalStandartItems,
    "Ülker Çizi 70 gr.", "Haribo 100 gr.", "Eti Crax 50 gr.", "Benimo 80 gr.",
    "Eti Puf 18 gr.", "Pop Kek 40 gr.", "Eti Cin 25 gr."
  ];

  // Setup 4: Diamond & Royal King Suite
  const diamondRoyalKingItems = [
    "Taşkesti Su 0.75 cl", "Taşkesti Su 0.33 cl", "Pepsi 330 ml", "Diet Pepsi 330 ml",
    "Yedigün 330 ml", "Seven Up 330 ml", "İce Tea Limon 330 ml", "İce Tea Şeftali 330 ml",
    "Gustavo Latte 250 ml", "Gustavo Mocha 250 ml", "Pellegrino 250 ml", "Perrier 200 ml",
    "Efes Pilsen 0.33 cl", "Nescafe Gold 2 gr.", "Coffee Mate 5 gr.", "Beyaz Şeker 2 gr.",
    "Esmer Şeker 2 gr.", "Sakarin ( Tatlandırıcı)", "Redbull 250 ml.", "Çokonat 33 gr.",
    "Brownie Intense 50 gr.", "Tuzlu Fıstık 60 gr.", "Segafredo Kahve 6 gr",
    "Mateus Rose 187 ml.", "JP Chenet Champaigne 200 ml.", "Masion Castel Chardonay 187 ml",
    "Masion Castel Merlot 187 ml.", "Pringles Cips 40 gr.", "Maretti Bruschette Domatesli 70 gr.",
    "Maretti Bruschette Peynirli 70 gr.", "Türk Kahvesi", "Eti Crax 50 gr.", "Snickers 50 GR.",
    "Nesfit Kırmızı Meyveli", "Nesfit Karamelli", "Nesfit Kakaolu", "Nesfit Sütlü Muzlu Çikolatalı",
    "First Naneli Sakız 27 gr", "First Çilekli Sakız 27 gr"
  ];

  // Setup 5: Premium King Suite
  const premiumKingItems = [
    "Taşkesti Su 0.75 cl", "Taşkesti Su 0.33 cl", "Pepsi 330 ml", "Diet Pepsi 330 ml",
    "Yedigün 330 ml", "Seven Up 330 ml", "İce Tea Limon 330 ml", "İce Tea Şeftali 330 ml",
    "Gustavo Latte 250 ml", "Gustavo Mocha 250 ml", "Soda 200 ml", "Efes Pilsen 0.33 cl",
    "Nescafe Gold 2 gr.", "Coffee Mate 5 gr.", "Beyaz Şeker 2 gr.", "Esmer Şeker 2 gr.",
    "Sakarin ( Tatlandırıcı)", "Redbull 250 ml.", "Çokonat 33 gr.", "Brownie Intense 50 gr.",
    "Tuzlu Fıstık 60 gr.", "Segafredo Kahve 6 gr", "Ülker Çizi 70 gr.", "Mateus Rose 187 ml.",
    "JP Chenet Champaigne 200 ml.", "Masion Castel Chardonay 187 ml", "Masion Castel Merlot 187 ml.",
    "Pringles Cips 40 gr.", "Maretti Bruschette Domatesli 70 gr.", "Maretti Bruschette Peynirli 70 gr.",
    "Türk Kahvesi", "Eti Crax 50 gr.", "Snickers 50 GR.", "Nesfit Kırmızı Meyveli",
    "Nesfit Karamelli", "Nesfit Kakaolu", "Nesfit Sütlü Muzlu Çikolatalı", "First Naneli Sakız 27 gr",
    "First Çilekli Sakız 27 gr", "Haribo 100 gr.", "Benimo 80 gr.", "Eti Puf 18 gr.",
    "Pop Kek 40 gr.", "Eti Cin 25 gr."
  ];

  const setupDefinitions = [
    { name: "Diamond Standart & Suit Setup", items: diamondStandartItems },
    { name: "Royal Standart & Suit Setup", items: royalStandartItems },
    { name: "Premium Standart & Suit Setup", items: premiumStandartItems },
    { name: "Diamond & Royal King Setup", items: diamondRoyalKingItems },
    { name: "Premium King Suite Setup", items: premiumKingItems },
  ];

  const setupNameToId: Record<string, string> = {};

  for (const sDef of setupDefinitions) {
    let s = await prisma.setup.findFirst({ where: { name: sDef.name } });
    if (!s) {
      s = await prisma.setup.create({
        data: {
          name: sDef.name,
          isActive: true,
          isInsideCabinet: true,
        },
      });
    }
    setupNameToId[sDef.name] = s.id;

    // Clear old items for this setup and re-populate
    await prisma.setupItem.deleteMany({ where: { setupId: s.id } });

    for (const pName of sDef.items) {
      const pId = productNameToId[pName];
      if (!pId) continue;

      const qty = pName.includes("Su ") || pName.includes("Pepsi") || pName.includes("Soda") ? 2 : 1;

      await prisma.setupItem.create({
        data: {
          setupId: s.id,
          productId: pId,
          qty,
        },
      });
    }
    console.log(`   ✓ "${sDef.name}" setup'ı (${sDef.items.length} ürün) bağlandı.`);
  }

  // 5. RoomType - Setup Bağlantıları
  console.log("\n5. Oda Tipleri ile Setup'lar eşleştiriliyor...");
  const hotels = await prisma.hotel.findMany();
  const diamondHotel = hotels.find((h) => h.code === "DIAMOND");
  const royalHotel = hotels.find((h) => h.code === "ROYAL");
  const premiumHotel = hotels.find((h) => h.code === "PREMIUM");

  const roomTypes = await prisma.roomType.findMany();

  for (const rt of roomTypes) {
    const isKing = rt.name.includes("KING");
    let targetSetupId: string | null = null;

    if (diamondHotel && rt.hotelId === diamondHotel.id) {
      targetSetupId = isKing
        ? setupNameToId["Diamond & Royal King Setup"]
        : setupNameToId["Diamond Standart & Suit Setup"];
    } else if (royalHotel && rt.hotelId === royalHotel.id) {
      targetSetupId = isKing
        ? setupNameToId["Diamond & Royal King Setup"]
        : setupNameToId["Royal Standart & Suit Setup"];
    } else if (premiumHotel && rt.hotelId === premiumHotel.id) {
      targetSetupId = isKing
        ? setupNameToId["Premium King Suite Setup"]
        : setupNameToId["Premium Standart & Suit Setup"];
    }

    if (targetSetupId) {
      await prisma.roomTypeSetup.upsert({
        where: {
          hotelId_roomTypeId_setupId: {
            hotelId: rt.hotelId,
            roomTypeId: rt.id,
            setupId: targetSetupId,
          },
        },
        update: {},
        create: {
          hotelId: rt.hotelId,
          roomTypeId: rt.id,
          setupId: targetSetupId,
        },
      });
    }
  }
  console.log("   ✓ Tüm oda tipleri ilgili minibar setuplarıyla eşleştirildi.");

  // 6. HotelStock Konsinye Zimmet Havuzunu Güncelle
  console.log("\n6. Ortak Konsinye Zimmet Havuzu (HotelStock) güncelleniyor...");
  const activeProducts = await prisma.product.findMany({ where: { isActive: true } });

  for (const h of hotels) {
    for (const p of activeProducts) {
      await prisma.hotelStock.upsert({
        where: {
          hotelId_productId: { hotelId: h.id, productId: p.id },
        },
        // An existing balance is the ledger's (HotelStockMovement): never overwritten here.
        update: {},
        create: {
          hotelId: h.id,
          productId: p.id,
          totalQty: 200,
          usedQty: 0,
          remainingQty: 200,
          criticalLevel: 25,
        },
      });
    }
  }
  console.log("   ✓ 3 otel için ortak zimmet havuzları 200'er adet ürünle dolduruldu.");

  console.log("\n🎉 TÜM ÜRÜN VE SETUP GÜNCELLEMELERİ BAŞARIYLA TAMAMLANDI!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
