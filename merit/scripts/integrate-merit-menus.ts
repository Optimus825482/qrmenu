import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { AllergenKey } from "../src/modules/menu/allergens";
import type { ItemTagId } from "../src/modules/menu/design";
import { prisma } from "../src/lib/prisma";
import { generateQrToken } from "../src/lib/qr";
import { ensureDefaultCallOptions } from "../src/modules/menu/server/callOptionDefaults";
import { SEED_OUTLETS } from "../prisma/seed/outlets";
import { seedOutletMenuDesigns } from "../prisma/seed/menuDesigns";

interface XlsxProduct {
  "Menü no": string;
  "Menü": string;
  "Ürün no": string;
  "Ürün": string;
  "Kategori yolu": string;
  Fiyat: string | null;
  "Para birimi": string | null;
  "Açıklama": string | null;
}

interface XlsxOption {
  "Menü no": string;
  "Ürün no": string;
  "Seçim grubu": string | null;
  "Seçenek": string | null;
}

interface XlsxData {
  urunler: XlsxProduct[];
  secenekler: XlsxOption[];
}

interface ProcessedImages {
  prodIdToUrl: Record<string, string>;
  prodNameToUrl: Record<string, string>;
}

const REMOVED_OUTLETS: { hotelCode: string; name: string }[] = [
  { hotelCode: "DIAMOND", name: "Diamond Royal Spa & Wellness" },
  { hotelCode: "ROYAL", name: "Royal Spa & Hamam Dinlenme" },
  { hotelCode: "ROYAL", name: "Havuz Bar" },
  { hotelCode: "PREMIUM", name: "Meritta Club Park & Aile Bahçesi" },
  { hotelCode: "PREMIUM", name: "Tenis Kortları & Açık Hava Fitness" },
];

const SYNONYM_IMAGE_MAP: Record<string, string> = {
  "mevsim meyveleri": "taze mevsim meyveleri",
  "penne arabiatta": "penne arabiata",
  "dondurma": "royal dondurma",
  "gavurdağı salatası": "gavurdağ salatası",
  "karides ızgara (2/4 4/6 6/8 8/12 13/15 16/20)": "ızgara karides",
  "karides ızgara (2_4 4_7 7_8 8_12)": "ızgara karides",
  "ızgara langustin (2/4 4/7 7/8 8/12)": "ızgara karides",
  "mevsim balığı ızgara": "levrek ızgara",
  "alasya denizinde telde balık (400 gr levrek balığı)": "levrek ızgara",
  "tütsülü ahtapot ızgara": "külde saroz ahtapotu",
  "royal burger": "dıamond burger",
  "dana bonfile madalyon": "arjantin dana bonfile",
  "roka salatası": "roka parmesan salatası",
  "kalamar ızgara": "kalamar tava",
  "fusili al pesto": "pasta a forma dı fazzoletto con salsa al pesto",
  "royal tost": "kıbrıs tostu",
  "avşar tost": "kavurmalı tost",
  "ayvalık tost": "sanayi tostu",
};

function cleanText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/\s+/g, " ")
    .trim();
}

function normName(input: string): string {
  return cleanText(input).toLocaleLowerCase("tr");
}

function inferAllergensAndTags(
  catPath: string,
  name: string,
  detail: string | null,
): { allergens: AllergenKey[]; tags: ItemTagId[] } {
  const combined = `${catPath} ${name} ${detail ?? ""}`.toLocaleLowerCase("tr");
  const catUpper = catPath.toLocaleUpperCase("tr");
  const allergens = new Set<AllergenKey>();
  const tags = new Set<ItemTagId>();

  // Alcohol & Sulfites
  const isAlcoholCat =
    /VİSKİ|VOTKA|CİN|ROM|TEKİLA|KONYAK|LİKÖR|BİRA|ŞARAP|ŞAMPANYA|İMZA KOKTEYL|ULUSLARARASI KOKTEYL|APERATİF|ALKOLLÜ NARGİLE|BAR MENÜ/.test(
      catUpper,
    );
  const isNonAlc = /ALKOLSÜZ/.test(combined.toLocaleUpperCase("tr"));
  if (isAlcoholCat && !isNonAlc) {
    allergens.add("alkol");
  }
  if (/ŞARAP|ŞAMPANYA|PROSECCO|MARTINI|VERMUT|APEROL/.test(catUpper)) {
    allergens.add("sulfit");
  }
  if (/BİRA/.test(catUpper) || /bira|malt/.test(combined)) {
    allergens.add("gluten");
  }

  // Gluten
  if (
    /makarna|spagetti|penne|fettuccine|fusili|rigatoni|tagliatelle|ravioli|tortellini|lazanya|noodle|erişte|pizza|pide|gözleme|börek|tost|sandviç|sandwich|burger|hamburger|cheeseburger|waffle|pancake|ekmek|kruvasan|simit|poğaça|mantı|tempura|panelenmiş|çıtır|tiramisu|cheesecake|tart|baklava|küneh|künefe|sufle|browni/.test(
      combined,
    )
  ) {
    allergens.add("gluten");
  }

  // Dairy (sut)
  if (
    /peynir|kaşar|hellim|mozzarella|parmesan|cheddar|feta|ezine|tulum|burrata|mascarpone|ricotta|yoğurt|cacık|haydari|ayran|süt|krema|tereyağ|dondurma|latte|cappuccino|macchiato|mocha|sıcak çikolata|sahlep|salep|sütlaç|kazandibi|magnolia|cheesecake|tiramisu|alfredo/.test(
      combined,
    )
  ) {
    allergens.add("sut");
  }

  // Egg (yumurta)
  if (
    /yumurta|omlet|menemen|benedict|sezar|mayonez|waffle|pancake|tiramisu|cheesecake|sufle|browni|makaron|tempura/.test(
      combined,
    )
  ) {
    allergens.add("yumurta");
  }

  // Fish (balik)
  if (/balık|levrek|somon|çupra|çipura|ton balığ|çiroz|lakerda|anchovy|ançuez|yılan balığ|unagi|sake/.test(combined)) {
    allergens.add("balik");
  }

  // Crustaceans (deniz_urunu)
  if (/karides|ıstakoz|langustin|yengeç|ebi|kani/.test(combined)) {
    allergens.add("deniz_urunu");
  }

  // Molluscs (yumusakca)
  if (/kalamar|ahtapot|midye|tarak|deniz mahsül|deniz ürün/.test(combined)) {
    allergens.add("yumusakca");
  }

  // Nuts (kuruyemis)
  if (/ceviz|fındık|badem|fıstık|antep fıstığ|kaju|çam fıstığ|pesto|frangelico|amaretto/.test(combined)) {
    allergens.add("kuruyemis");
  }

  // Soy & Sesame
  if (/soya|edamame|tofu|teriyaki|sushi|maki|nigiri|sashimi|wonton/.test(combined)) {
    allergens.add("soya");
  }
  if (/susam|tahin|humus|simit/.test(combined)) {
    allergens.add("susam");
  }
  if (/kereviz/.test(combined)) {
    allergens.add("kereviz");
  }
  if (/hardal/.test(combined)) {
    allergens.add("hardal");
  }

  // Tags
  if (/acı|acılı|szechuan|arrabbiata|arabiatta|atom|mexican|jalapeno/.test(combined)) {
    tags.add("ACILI");
  }
  if (/İMZA KOKTEYL|SOMMELIER SEÇİMİ|ŞEFİN TADIMLARI|MERİT SPESİYALLERİ|JAPANESE WAGYU/.test(catUpper)) {
    tags.add("SEFIN_SECIMI");
  }
  if (/VEJETERYAN|VEJETARYEN/.test(catUpper)) {
    tags.add("VEJETARYEN");
  }
  if (/taze mevsim meyve|avokado söğüş|zeytinyağlı|deniz börülcesi|kaya koruğu|humus|fava|antep ezme|şakşuka|babagannuş|muhammara/.test(combined) && !allergens.has("sut") && !allergens.has("balik") && !allergens.has("deniz_urunu") && !allergens.has("yumusakca")) {
    tags.add("VEGAN");
  }

  return { allergens: [...allergens], tags: [...tags] };
}

export async function main() {
  const scratchDir = "C:/Users/Erkan/.gemini/antigravity/brain/a45410d9-2df9-4caa-a0bf-2e0d48aa9a73/scratch";
  const xlsxData = JSON.parse(fs.readFileSync(path.join(scratchDir, "merit_xlsx.json"), "utf8")) as XlsxData;
  const imgData = JSON.parse(fs.readFileSync(path.join(scratchDir, "processed_images.json"), "utf8")) as ProcessedImages;

  // Build option map: `${menuNo}|${prodNo}` -> formatted option string
  const optionMap = new Map<string, Map<string, string[]>>();
  for (const opt of xlsxData.secenekler) {
    const key = `${opt["Menü no"]}|${opt["Ürün no"]}`;
    const grp = cleanText(opt["Seçim grubu"]) || "Seçenekler";
    const val = cleanText(opt["Seçenek"]);
    if (!val) continue;
    let groups = optionMap.get(key);
    if (!groups) {
      groups = new Map();
      optionMap.set(key, groups);
    }
    const list = groups.get(grp) ?? [];
    if (!list.includes(val)) list.push(val);
    groups.set(grp, list);
  }

  // Group products by menu number
  const productsByMenu = new Map<string, XlsxProduct[]>();
  for (const prod of xlsxData.urunler) {
    const mNo = String(prod["Menü no"]);
    const list = productsByMenu.get(mNo) ?? [];
    list.push(prod);
    productsByMenu.set(mNo, list);
  }

  // 1. Remove unwanted Spa / Sport / duplicate outlets
  const hotels = await prisma.hotel.findMany({ select: { id: true, code: true, name: true } });
  const hotelIdByCode = new Map(hotels.map((h) => [h.code, h.id]));

  for (const rem of REMOVED_OUTLETS) {
    const hotelId = hotelIdByCode.get(rem.hotelCode);
    if (!hotelId) continue;
    const outlet = await prisma.outlet.findFirst({ where: { hotelId, name: rem.name }, select: { id: true } });
    if (!outlet) continue;
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { order: { outletId: outlet.id } } });
      await tx.orderEvent.deleteMany({ where: { order: { outletId: outlet.id } } });
      await tx.printJob.deleteMany({ where: { order: { outletId: outlet.id } } });
      await tx.order.deleteMany({ where: { outletId: outlet.id } });
      await tx.waiterCall.deleteMany({ where: { outletId: outlet.id } });
      await tx.tableAssignment.deleteMany({ where: { outletId: outlet.id } });
      await tx.qrScanLog.deleteMany({ where: { table: { outletId: outlet.id } } });
      await tx.outletTable.deleteMany({ where: { outletId: outlet.id } });
      await tx.outletAreaDefinition.deleteMany({ where: { outletId: outlet.id } });
      // Delete menuNodes bottom-up (OGE -> GRUP -> ALT_KATEGORI -> KATEGORI)
      for (const kind of ["OGE", "GRUP", "ALT_KATEGORI", "KATEGORI"] as const) {
        await tx.menuNode.deleteMany({ where: { outletId: outlet.id, kind } });
      }
      await tx.outletMember.deleteMany({ where: { outletId: outlet.id } });
      await tx.outletCallOption.deleteMany({ where: { outletId: outlet.id } });
      await tx.outletMenuDesign.deleteMany({ where: { outletId: outlet.id } });
      await tx.outlet.delete({ where: { id: outlet.id } });
    });
    console.log(`Kaldırıldı: [${rem.hotelCode}] ${rem.name}`);
  }

  // 2. Ensure all SEED_OUTLETS exist with areas, tables, QR tokens, call options, and designs
  for (const def of SEED_OUTLETS) {
    const hotelId = hotelIdByCode.get(def.hotelCode);
    if (!hotelId) continue;
    let outlet = await prisma.outlet.findFirst({ where: { hotelId, name: def.name }, select: { id: true } });
    if (!outlet) {
      outlet = await prisma.outlet.create({
        data: {
          hotelId,
          name: def.name,
          type: def.type,
          hasMenu: true,
          hasOrdering: true,
          orderingEnabled: true,
          kdsEnabled: true,
          isActive: true,
        },
        select: { id: true },
      });
      await ensureDefaultCallOptions(prisma, outlet.id);
      console.log(`Yeni Outlet Oluşturuldu: [${def.hotelCode}] ${def.name}`);
    } else {
      await prisma.outlet.update({
        where: { id: outlet.id },
        data: { type: def.type, hasMenu: true, isActive: true },
      });
    }

    let nextNumber = 1;
    for (const areaDef of def.areas) {
      const area =
        (await prisma.outletAreaDefinition.findFirst({
          where: { outletId: outlet.id, type: areaDef.type, name: areaDef.name },
          select: { id: true },
        })) ??
        (await prisma.outletAreaDefinition.create({
          data: { outletId: outlet.id, type: areaDef.type, name: areaDef.name, orderingEnabled: true },
          select: { id: true },
        }));

      for (let i = 0; i < areaDef.tableCount; i++) {
        const number = nextNumber++;
        const label = `${def.name} ${number}`;
        let table = await prisma.outletTable.upsert({
          where: { outletId_number: { outletId: outlet.id, number } },
          create: {
            outletId: outlet.id,
            areaId: area.id,
            number,
            name: null,
            label,
            capacity: [2, 4, 4, 6][(number - 1) % 4],
          },
          update: {},
        });
        if (!table.qrToken) {
          table = await prisma.outletTable.update({
            where: { id: table.id },
            data: { qrToken: generateQrToken("TABLE", table.id) },
          });
        }
      }
    }
  }

  // Ensure Room Service outlets exist for all 3 hotels
  for (const hotel of hotels) {
    const existingRs = await prisma.outlet.findFirst({
      where: { hotelId: hotel.id, type: "ODA_SERVISI" },
      select: { id: true },
    });
    if (!existingRs) {
      const rs = await prisma.outlet.create({
        data: {
          hotelId: hotel.id,
          name: `${hotel.name} Oda Servisi`,
          type: "ODA_SERVISI",
          hasMenu: true,
          hasOrdering: true,
          orderingEnabled: true,
          kdsEnabled: true,
        },
        select: { id: true },
      });
      await ensureDefaultCallOptions(prisma, rs.id);
    }
  }

  await seedOutletMenuDesigns(prisma);

  // Ensure showImages: true on all outlet menu designs so our processed WebP images are displayed
  const designs = await prisma.outletMenuDesign.findMany();
  for (const d of designs) {
    const opts = (typeof d.options === "object" && d.options !== null ? d.options : {}) as Record<string, unknown>;
    if (opts.showImages === false) {
      await prisma.outletMenuDesign.update({
        where: { id: d.id },
        data: { options: { ...opts, showImages: true } },
      });
    }
  }

  // Helper to resolve product list for an outlet
  type MenuSourceSpec = {
    hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM";
    outletName?: string;
    isRoomService?: boolean;
    menuIds: string[];
    filterPrefix?: string; // e.g., "ŞARAPLAR > " for Dionysos Wine House
    stripPrefix?: string;
    categoryFilter?: (catPath: string) => boolean;
  };

  const INTEGRATIONS: MenuSourceSpec[] = [
    // DIAMOND (7 outlets)
    { hotelCode: "DIAMOND", isRoomService: true, menuIds: ["1067"] },
    { hotelCode: "DIAMOND", outletName: "Diamond 24/7 Lobby Lounge", menuIds: ["924"] },
    { hotelCode: "DIAMOND", outletName: "Diamond Lagoon Pool Bar & Deck", menuIds: ["1075", "30000283"] },
    { hotelCode: "DIAMOND", outletName: "Diamond Royal Tea & Patisserie", menuIds: ["922"] },
    { hotelCode: "DIAMOND", outletName: "Diamond Exclusive Whiskey House", menuIds: ["1073"] },
    { hotelCode: "DIAMOND", outletName: "Shisha & Sunset Terrace", menuIds: ["926"] },
    { hotelCode: "DIAMOND", outletName: "The Steakhouse", menuIds: ["944"] },

    // ROYAL (9 outlets)
    { hotelCode: "ROYAL", isRoomService: true, menuIds: ["808"] },
    { hotelCode: "ROYAL", outletName: "Captain’s Lounge Bar", menuIds: ["924"] },
    { hotelCode: "ROYAL", outletName: "Royal Sea View Pool Bar", menuIds: ["921", "920"] },
    { hotelCode: "ROYAL", outletName: "Beach Bar", menuIds: ["921", "920"] },
    {
      hotelCode: "ROYAL",
      outletName: "Dionysos Wine House",
      menuIds: ["926"],
      filterPrefix: "ŞARAPLAR > ",
      stripPrefix: "ŞARAPLAR > ",
    },
    {
      hotelCode: "ROYAL",
      outletName: "Vienna Cafe",
      menuIds: ["922", "923"],
      categoryFilter: (cp) =>
        /SICAK İÇECEKLER|SOĞUK KAHVELER|RONNEFELDT|EV YAPIMI SOĞUK ÇAYLAR|SERİNLETİCİ SOĞUK İÇECEKLER|MEŞRUBATLAR|ROYAL DONDURMA/.test(
          cp,
        ),
    },
    { hotelCode: "ROYAL", outletName: "Blue Sea Alakart", menuIds: ["30000301"] },
    { hotelCode: "ROYAL", outletName: "Royal Mandarin", menuIds: ["1079"] },
    { hotelCode: "ROYAL", outletName: "Bella Merit", menuIds: ["1080"] },

    // PREMIUM (4 outlets)
    { hotelCode: "PREMIUM", isRoomService: true, menuIds: ["1068"] },
    { hotelCode: "PREMIUM", outletName: "Premium Lobby & Atrium Bar", menuIds: ["925"] },
    { hotelCode: "PREMIUM", outletName: "Premium Lagoon & Kids Pool Bar", menuIds: ["1076"] },
    { hotelCode: "PREMIUM", outletName: "Merit Premium Cafe Verde", menuIds: ["923"] },
  ];

  const toPublicUrl = (u: string): string => u.replace(/^\/uploads\/merit-menus\//, "/merit-menus/");

  function resolveImageUrl(prodNo: string, prodName: string): string | null {
    if (imgData.prodIdToUrl[prodNo]) return toPublicUrl(imgData.prodIdToUrl[prodNo]);
    const n = normName(prodName);
    if (imgData.prodNameToUrl[n]) return toPublicUrl(imgData.prodNameToUrl[n]);
    const syn = SYNONYM_IMAGE_MAP[n];
    if (syn && imgData.prodNameToUrl[syn]) return toPublicUrl(imgData.prodNameToUrl[syn]);
    return null;
  }

  const exportedOutlets: Array<{
    hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM";
    outletName: string | null;
    isRoomService: boolean;
    items: Array<{
      catPath: string[];
      name: string;
      detail: string | null;
      price: number | null;
      imageUrl: string | null;
      allergens: AllergenKey[];
      tags: ItemTagId[];
    }>;
  }> = [];

  for (const spec of INTEGRATIONS) {
    const hotelId = hotelIdByCode.get(spec.hotelCode);
    if (!hotelId) continue;

    const outlet = spec.isRoomService
      ? await prisma.outlet.findFirst({ where: { hotelId, type: "ODA_SERVISI" }, select: { id: true, name: true } })
      : await prisma.outlet.findFirst({ where: { hotelId, name: spec.outletName }, select: { id: true, name: true } });

    if (!outlet) {
      console.warn(`Outlet bulunamadı: [${spec.hotelCode}] ${spec.outletName ?? "ODA_SERVISI"}`);
      continue;
    }

    // Collect & deduplicate products across spec.menuIds
    const rawProducts: XlsxProduct[] = [];
    for (const mId of spec.menuIds) {
      rawProducts.push(...(productsByMenu.get(mId) ?? []));
    }

    const seenInCat = new Set<string>();
    const itemsToInsert: {
      catPath: string[];
      name: string;
      detail: string | null;
      price: number | null;
      imageUrl: string | null;
      allergens: AllergenKey[];
      tags: ItemTagId[];
    }[] = [];

    for (const prod of rawProducts) {
      const pName = cleanText(prod["Ürün"]);
      if (!pName || pName === "*Bilgilendirme" || prod["Ürün no"] === "46674") continue;

      let rawCatPath = cleanText(prod["Kategori yolu"]);
      if (/Otel İnfo|BİLGİLENDİRME|SİPARİŞ OLUŞTURUN/i.test(rawCatPath)) continue;
      if (spec.filterPrefix && !rawCatPath.startsWith(spec.filterPrefix)) continue;
      if (spec.stripPrefix && rawCatPath.startsWith(spec.stripPrefix)) {
        rawCatPath = rawCatPath.slice(spec.stripPrefix.length).trim();
      }
      if (spec.categoryFilter && !spec.categoryFilter(rawCatPath)) continue;

      const segments = rawCatPath.split(/\s*>\s*/).map((s) => cleanText(s)).filter(Boolean);
      if (segments.length === 0) continue;

      const dedupeKey = `${segments.join(">")}|${normName(pName)}`;
      if (seenInCat.has(dedupeKey)) continue;
      seenInCat.add(dedupeKey);

      // Build detail text + options if not already included
      let detailText = cleanText(prod["Açıklama"]);
      const optGroups = optionMap.get(`${prod["Menü no"]}|${prod["Ürün no"]}`);
      if (optGroups && optGroups.size > 0) {
        const optParts: string[] = [];
        for (const [gName, vals] of optGroups.entries()) {
          optParts.push(`${gName}: ${vals.join(", ")}`);
        }
        const optSummary = optParts.join(" · ");
        if (!detailText) {
          detailText = optSummary;
        } else if (!detailText.toLocaleLowerCase("tr").includes(valsFirst(optGroups).toLocaleLowerCase("tr"))) {
          detailText = `${detailText} (${optSummary})`;
        }
      }
      if (detailText.length > 950) {
        detailText = `${detailText.slice(0, 947)}...`;
      }

      const numPrice =
        prod.Fiyat !== null && prod.Fiyat !== undefined && String(prod.Fiyat).trim() !== ""
          ? Number(prod.Fiyat)
          : null;
      const validPrice = numPrice !== null && Number.isFinite(numPrice) && numPrice >= 0 ? numPrice : null;

      const imageUrl = resolveImageUrl(String(prod["Ürün no"]), pName);
      const { allergens, tags } = inferAllergensAndTags(rawCatPath, pName, detailText || null);

      itemsToInsert.push({
        catPath: segments.slice(0, 3),
        name: pName.slice(0, 120),
        detail: detailText ? detailText : null,
        price: validPrice,
        imageUrl,
        allergens,
        tags,
      });
    }

    // Replace existing menu nodes for this outlet inside a transaction
    await prisma.$transaction(
      async (tx) => {
        // Clear any existing orders referencing old menuNodes of this outlet so replacement is clean
        await tx.orderItem.deleteMany({ where: { order: { outletId: outlet.id } } });
        await tx.orderEvent.deleteMany({ where: { order: { outletId: outlet.id } } });
        await tx.printJob.deleteMany({ where: { order: { outletId: outlet.id } } });
        await tx.order.deleteMany({ where: { outletId: outlet.id } });

        for (const kind of ["OGE", "GRUP", "ALT_KATEGORI", "KATEGORI"] as const) {
          await tx.menuNode.deleteMany({ where: { outletId: outlet.id, kind } });
        }

        const catIdMap = new Map<string, string>();
        const subIdMap = new Map<string, string>();
        const grpIdMap = new Map<string, string>();
        const sortCounters = new Map<string, number>();

        const nextSort = (parentKey: string): number => {
          const cur = sortCounters.get(parentKey) ?? 0;
          sortCounters.set(parentKey, cur + 1);
          return cur;
        };

        const ensureCategory = async (name: string): Promise<string> => {
          const existing = catIdMap.get(name);
          if (existing) return existing;
          const row = await tx.menuNode.create({
            data: {
              outletId: outlet.id,
              parentId: null,
              kind: "KATEGORI",
              name,
              sortOrder: nextSort("ROOT"),
            },
            select: { id: true },
          });
          catIdMap.set(name, row.id);
          return row.id;
        };

        const ensureSubcategory = async (catName: string, subName: string): Promise<string> => {
          const key = `${catName}>${subName}`;
          const existing = subIdMap.get(key);
          if (existing) return existing;
          const catId = await ensureCategory(catName);
          const row = await tx.menuNode.create({
            data: {
              outletId: outlet.id,
              parentId: catId,
              kind: "ALT_KATEGORI",
              name: subName,
              sortOrder: nextSort(`CAT:${catId}`),
            },
            select: { id: true },
          });
          subIdMap.set(key, row.id);
          return row.id;
        };

        const ensureGroup = async (catName: string, subName: string, grpName: string): Promise<string> => {
          const key = `${catName}>${subName}>${grpName}`;
          const existing = grpIdMap.get(key);
          if (existing) return existing;
          const subId = await ensureSubcategory(catName, subName);
          const row = await tx.menuNode.create({
            data: {
              outletId: outlet.id,
              parentId: subId,
              kind: "GRUP",
              name: grpName,
              sortOrder: nextSort(`SUB:${subId}`),
            },
            select: { id: true },
          });
          grpIdMap.set(key, row.id);
          return row.id;
        };

        for (const item of itemsToInsert) {
          let parentId: string;
          if (item.catPath.length === 1) {
            parentId = await ensureCategory(item.catPath[0]);
          } else if (item.catPath.length === 2) {
            parentId = await ensureSubcategory(item.catPath[0], item.catPath[1]);
          } else {
            parentId = await ensureGroup(item.catPath[0], item.catPath[1], item.catPath[2]);
          }

          await tx.menuNode.create({
            data: {
              outletId: outlet.id,
              parentId,
              kind: "OGE",
              name: item.name,
              detail: item.detail,
              price: item.price,
              currency: "USD",
              imageUrl: item.imageUrl,
              imageUrls: item.imageUrl ? [item.imageUrl] : [],
              allergens: item.allergens,
              tags: item.tags,
              isAvailable: true,
              isActive: true,
              sortOrder: nextSort(`ITEMS:${parentId}`),
            },
          });
        }
      },
      { timeout: 120_000 },
    );

    exportedOutlets.push({
      hotelCode: spec.hotelCode,
      outletName: spec.outletName ?? null,
      isRoomService: Boolean(spec.isRoomService),
      items: itemsToInsert,
    });

    const withImg = itemsToInsert.filter((i) => i.imageUrl !== null).length;
    console.log(
      `Entegre Edildi: [${spec.hotelCode}] ${outlet.name} <- Menü (${spec.menuIds.join("+")}) | ${itemsToInsert.length} ürün (${withImg} fotoğraflı)`,
    );
  }

  const outJsonPath = path.join(__dirname, "../prisma/seed/data/merit-menus.json");
  fs.mkdirSync(path.dirname(outJsonPath), { recursive: true });
  fs.writeFileSync(outJsonPath, JSON.stringify({ version: 1, outlets: exportedOutlets }, null, 2), "utf8");
  console.log(`Seed veri paketi kaydedildi: ${outJsonPath}`);
}

function valsFirst(optGroups: Map<string, string[]>): string {
  for (const vals of optGroups.values()) {
    if (vals.length > 0) return vals[0];
  }
  return "";
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
