import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { evaluateQuality, type QualityItem } from "../src/modules/menu/quality";
import { designFromStored } from "../src/modules/menu/design";
import { TRANSLATION_LANGS } from "../src/modules/menu/server/translations";

async function checkAllOutletsQuality() {
  const outlets = await prisma.outlet.findMany({
    where: { hasMenu: true, isActive: true },
    include: {
      hotel: { select: { code: true, name: true } },
      menuDesign: true,
      theme: true,
    },
    orderBy: [{ hotelId: "asc" }, { name: "asc" }],
  });

  console.log(`Checking quality for ${outlets.length} outlets...\n`);

  for (const outlet of outlets) {
    const rawDesign = designFromStored(outlet.menuDesign);
    const theme = outlet.theme ?? {
      bg: "#ffffff",
      accent: "#0a6ea8",
      soft: "#e3f1fa",
      textOnAccent: "#ffffff",
    };

    const nodes = await prisma.menuNode.findMany({
      where: { outletId: outlet.id, kind: "OGE" },
      include: {
        translations: { select: { lang: true } },
        parent: { select: { name: true, parent: { select: { name: true } } } },
      },
    });

    const items: QualityItem[] = nodes.map((n) => {
      const parentName = n.parent?.name ?? "";
      const grandParentName = n.parent?.parent?.name ?? "";
      const catPath = grandParentName ? `${grandParentName} > ${parentName}` : parentName;
      return {
        id: n.id,
        name: n.name,
        categoryPath: catPath,
        detail: n.detail,
        imageUrl: n.imageUrl,
        allergens: n.allergens,
        tags: n.tags,
        translationLangs: n.translations.map((t) => t.lang),
      };
    });

    const findings = evaluateQuality({ design: rawDesign, theme, items });
    const nonPhotoFindings = findings.filter((f) => f.id !== "photo-density");

    console.log(
      `[${outlet.hotel.code}] ${outlet.name}: Template=${rawDesign.template}, Ambience=${rawDesign.ambience}, Theme=${outlet.theme?.name ?? "DEFAULT"}, Items=${items.length}`,
    );
    if (nonPhotoFindings.length === 0) {
      console.log(`  ✅ 0 Uyarı / Kusursuz! (Fotoğraf bilgisi hariç)`);
    } else {
      for (const f of nonPhotoFindings) {
        console.log(`  ⚠️ [${f.level.toUpperCase()}] ${f.id}: ${f.message}`);
      }
    }
  }
}

checkAllOutletsQuality()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
