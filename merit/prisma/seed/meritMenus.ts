import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { generateQrToken } from "../../src/lib/qr";
import { ensureDefaultCallOptions } from "../../src/modules/menu/server/callOptionDefaults";
import { HOTELS, HOTEL_MODULES } from "./hotels";
import { seedOutletMenuDesigns } from "./menuDesigns";
import { decideMenuSync } from "./menuSyncPolicy";
import { MENU_THEMES } from "./menuThemes";
import { SEED_OUTLETS } from "./outlets";

export interface MeritMenuItemSeed {
  catPath: string[];
  name: string;
  detail: string | null;
  price: number | null;
  imageUrl: string | null;
  allergens: string[];
  tags: string[];
}

export interface MeritOutletMenuSeed {
  hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM";
  outletName: string | null;
  isRoomService: boolean;
  items: MeritMenuItemSeed[];
}

export interface MeritMenusDataset {
  version: number;
  outlets: MeritOutletMenuSeed[];
}

const REMOVED_OUTLETS: Array<{ hotelCode: "DIAMOND" | "ROYAL" | "PREMIUM"; name: string }> = [
  { hotelCode: "DIAMOND", name: "Diamond Royal Spa & Wellness" },
  { hotelCode: "ROYAL", name: "Royal Spa & Hamam Dinlenme" },
  { hotelCode: "ROYAL", name: "Havuz Bar" },
  { hotelCode: "PREMIUM", name: "Meritta Club Park & Aile Bahçesi" },
  { hotelCode: "PREMIUM", name: "Tenis Kortları & Açık Hava Fitness" },
];

export function loadMeritMenusDataset(): MeritMenusDataset {
  const file = path.join(__dirname, "data", "merit-menus.json");
  return JSON.parse(readFileSync(file, "utf8")) as MeritMenusDataset;
}

/**
 * Idempotent synchronization of the 20 Merit outlets and 4,005 real menu items.
 * - Cleans up removed Spa/Sport/Park outlets.
 * - Creates missing outlets, areas, tables, QR tokens, call options, and menu designs.
 * - Populates the menu tree only when the outlet has no menu nodes.
 * - Leaves already-populated outlets intact (nothing is deleted; orders are never touched). A full rebuild
 *   needs MERIT_MENUS_FORCE_RESET=true and is refused for outlets that have orders.
 */
export async function syncMeritMenus(db: PrismaClient): Promise<void> {
  // Ensure the 3 core hotels exist
  for (const { code, name } of HOTELS) {
    const hotel = await db.hotel.upsert({
      where: { code },
      create: { code, name, isSystemDefault: true },
      update: { name, isSystemDefault: true },
    });
    for (const moduleKey of HOTEL_MODULES) {
      await db.hotelModule.upsert({
        where: { hotelId_moduleKey: { hotelId: hotel.id, moduleKey } },
        create: { hotelId: hotel.id, moduleKey, enabled: true },
        update: {},
      });
    }
  }

  const hotels = await db.hotel.findMany({ select: { id: true, code: true, name: true } });
  const hotelIdByCode = new Map(hotels.map((h) => [h.code, h.id]));

  // 1. Remove unwanted Spa/Sport/Park outlets
  for (const rem of REMOVED_OUTLETS) {
    const hotelId = hotelIdByCode.get(rem.hotelCode);
    if (!hotelId) continue;
    const outlet = await db.outlet.findFirst({ where: { hotelId, name: rem.name }, select: { id: true } });
    if (!outlet) continue;
    // Sipariş verisi asla silinmez: siparişi olan outlet yerinde bırakılır.
    if ((await db.order.count({ where: { outletId: outlet.id } })) > 0) {
      console.log(`atlandı: kaldırılacak outlet'te sipariş var, korunuyor: [${rem.hotelCode}] ${rem.name}`);
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.waiterCall.deleteMany({ where: { outletId: outlet.id } });
      await tx.tableAssignment.deleteMany({ where: { outletId: outlet.id } });
      await tx.qrScanLog.deleteMany({ where: { table: { outletId: outlet.id } } });
      await tx.outletTable.deleteMany({ where: { outletId: outlet.id } });
      await tx.outletAreaDefinition.deleteMany({ where: { outletId: outlet.id } });
      for (const kind of ["OGE", "GRUP", "ALT_KATEGORI", "KATEGORI"] as const) {
        await tx.menuNode.deleteMany({ where: { outletId: outlet.id, kind } });
      }
      await tx.outletMember.deleteMany({ where: { outletId: outlet.id } });
      await tx.outletCallOption.deleteMany({ where: { outletId: outlet.id } });
      await tx.outletMenuDesign.deleteMany({ where: { outletId: outlet.id } });
      await tx.outlet.delete({ where: { id: outlet.id } });
    });
  }

  // 2. Ensure all 17 F&B SEED_OUTLETS + 3 ODA_SERVISI outlets exist
  for (const def of SEED_OUTLETS) {
    const hotelId = hotelIdByCode.get(def.hotelCode);
    if (!hotelId) continue;
    let outlet = await db.outlet.findFirst({ where: { hotelId, name: def.name }, select: { id: true } });
    if (!outlet) {
      outlet = await db.outlet.create({
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
      await ensureDefaultCallOptions(db, outlet.id);
    }

    let nextNumber = 1;
    for (const areaDef of def.areas) {
      const area =
        (await db.outletAreaDefinition.findFirst({
          where: { outletId: outlet.id, type: areaDef.type, name: areaDef.name },
          select: { id: true },
        })) ??
        (await db.outletAreaDefinition.create({
          data: { outletId: outlet.id, type: areaDef.type, name: areaDef.name, orderingEnabled: true },
          select: { id: true },
        }));

      for (let i = 0; i < areaDef.tableCount; i++) {
        const number = nextNumber++;
        const label = `${def.name} ${number}`;
        const table = await db.outletTable.upsert({
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
          await db.outletTable.update({
            where: { id: table.id },
            data: { qrToken: generateQrToken("TABLE", table.id) },
          });
        }
      }
    }
  }

  for (const hotel of hotels) {
    const existingRs = await db.outlet.findFirst({
      where: { hotelId: hotel.id, type: "ODA_SERVISI" },
      select: { id: true },
    });
    if (!existingRs) {
      const rs = await db.outlet.create({
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
      await ensureDefaultCallOptions(db, rs.id);
    }
  }

  // Ensure all built-in menu themes (including light & airy themes) exist
  for (const theme of MENU_THEMES) {
    const existingTheme = await db.menuTheme.findFirst({ where: { name: theme.name }, select: { id: true } });
    if (!existingTheme) {
      await db.menuTheme.create({
        data: {
          name: theme.name,
          bg: theme.bg,
          accent: theme.accent,
          soft: theme.soft,
          textOnAccent: theme.textOnAccent,
          isDefault: Boolean(theme.isDefault),
        },
      });
    }
  }

  await seedOutletMenuDesigns(db, false);

  // 3. Populate or upgrade each outlet's menu from merit-menus.json
  const dataset = loadMeritMenusDataset();
  let rebuiltAny = false;
  for (const spec of dataset.outlets) {
    const hotelId = hotelIdByCode.get(spec.hotelCode);
    if (!hotelId) continue;

    const outlet = spec.isRoomService
      ? await db.outlet.findFirst({ where: { hotelId, type: "ODA_SERVISI" }, select: { id: true, name: true } })
      : await db.outlet.findFirst({ where: { hotelId, name: spec.outletName ?? "" }, select: { id: true, name: true } });
    if (!outlet) continue;

    const [totalNodes, orderCount, totalItems, meritImgItems, legacyUploadItems, existingCats, directUnderCatCount] = await Promise.all([
      db.menuNode.count({ where: { outletId: outlet.id } }),
      db.order.count({ where: { outletId: outlet.id } }),
      db.menuNode.count({ where: { outletId: outlet.id, kind: "OGE" } }),
      db.menuNode.count({ where: { outletId: outlet.id, kind: "OGE", imageUrl: { startsWith: "/merit-menus/" } } }),
      db.menuNode.count({ where: { outletId: outlet.id, kind: "OGE", imageUrl: { startsWith: "/uploads/merit-menus/" } } }),
      db.menuNode.findMany({
        where: { outletId: outlet.id, kind: "KATEGORI", parentId: null },
        orderBy: { sortOrder: "asc" },
        select: { name: true },
      }),
      db.menuNode.count({ where: { outletId: outlet.id, kind: "OGE", parent: { kind: "KATEGORI" } } }),
    ]);

    const expectedCats = Array.from(new Set(spec.items.map((i) => i.catPath[0])));
    const hasV2Categories =
      existingCats.length === expectedCats.length &&
      existingCats.every((c, idx) => c.name === expectedCats[idx]);

    const isCurrentV2Menu =
      hasV2Categories && directUnderCatCount === 0 && totalItems >= spec.items.length && meritImgItems > 0 && legacyUploadItems === 0;
    const decision = decideMenuSync({
      menuNodeCount: totalNodes,
      orderCount,
      forceReset: process.env.MERIT_MENUS_FORCE_RESET === "true",
      isCurrentV2Menu,
    });
    if (decision === "refuse-has-orders") {
      console.error(`reddedildi: [${spec.hotelCode}] ${outlet.name} outlet'inde ${orderCount} sipariş var; MERIT_MENUS_FORCE_RESET uygulanmadı.`);
      continue;
    }
    if (decision === "skip-keep") {
      console.log(`atlandı: mevcut menü korunuyor: [${spec.hotelCode}] ${outlet.name}`);
      continue;
    }

    // Uyumlu v2 menü korunur; yalnız eksik/örnek görseller yükseltilir (silme yok).
    if (decision === "refresh-images") {
      const nodesToUpgrade = await db.menuNode.findMany({
        where: {
          outletId: outlet.id,
          kind: "OGE",
          OR: [
            { imageUrl: null },
            {
              imageUrl: {
                in: [
                  "/merit-menus/068b7ffd16e5a0b1eba98c58.webp",
                  "/merit-menus/e9b7b2eaf9edf35ca392cc42.webp",
                ],
              },
            },
          ],
        },
        select: { id: true, name: true },
      });
      if (nodesToUpgrade.length > 0) {
        const imageByName = new Map<string, string>();
        for (const item of spec.items) {
          if (item.imageUrl) {
            imageByName.set(item.name, item.imageUrl);
          }
        }
        let upgraded = 0;
        for (const node of nodesToUpgrade) {
          const newUrl = imageByName.get(node.name);
          if (newUrl) {
            await db.menuNode.update({
              where: { id: node.id },
              data: { imageUrl: newUrl, imageUrls: [newUrl] },
            });
            upgraded++;
          }
        }
        if (upgraded > 0) {
          console.log(`Menü Görselleri Güncellendi: [${spec.hotelCode}] ${outlet.name} (${upgraded} ürün)`);
        }
      }
      continue;
    }

    await db.$transaction(
      async (tx) => {
        // Buraya yalnız boş menü ya da açık MERIT_MENUS_FORCE_RESET (siparişsiz outlet) ile gelinir.
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

        for (const item of spec.items) {
          let parentId: string;
          if (item.catPath.length === 1) {
            parentId = await ensureSubcategory(item.catPath[0], "Genel Seçki");
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
    rebuiltAny = true;
    console.log(`Merit Menü Senkronize Edildi: [${spec.hotelCode}] ${outlet.name} (${spec.items.length} ürün)`);
  }

  if (rebuiltAny) {
    await seedOutletMenuDesigns(db, true);
  }
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  try {
    await syncMeritMenus(prisma);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

if (/^meritMenus\.[cm]?[jt]s$/.test(path.basename(process.argv[1] ?? ""))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
