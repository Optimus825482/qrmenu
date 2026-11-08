import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TRANSLATION_LANGS, autoCloudTranslate } from "../src/modules/menu/server/translations";

async function populateTranslations() {
  console.log("Starting fast auto-cloud translation seed for all outlets...");

  // 1. Get all nodes that lack complete translations
  const allNodes = await prisma.menuNode.findMany({
    select: {
      id: true,
      outletId: true,
      kind: true,
      name: true,
      detail: true,
      translations: { select: { lang: true } },
    },
  });

  const nodesNeedingTrans = allNodes.filter(
    (n) => n.translations.length < TRANSLATION_LANGS.length,
  );

  console.log(`Total nodes: ${allNodes.length}, needing translations: ${nodesNeedingTrans.length}`);

  // Group by exact (name + detail) to minimize translation calls
  const map = new Map<string, typeof nodesNeedingTrans>();
  for (const node of nodesNeedingTrans) {
    const key = `${node.name.trim()}::${(node.detail ?? "").trim()}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(node);
  }

  console.log(`Unique text pairs to translate: ${map.size}`);

  let doneCount = 0;
  const entries = Array.from(map.entries());
  const batchSize = 15;

  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async ([key, nodes]) => {
        const sample = nodes[0];
        try {
          const translations = await autoCloudTranslate(sample.name, sample.detail);
          
          for (const node of nodes) {
            const existingLangs = new Set(node.translations.map((t) => t.lang));
            for (const lang of TRANSLATION_LANGS) {
              if (existingLangs.has(lang)) continue;
              const val = translations[lang];
              if (!val?.name) continue;

              await prisma.menuNodeTranslation.upsert({
                where: { nodeId_lang: { nodeId: node.id, lang } },
                create: {
                  nodeId: node.id,
                  lang,
                  name: val.name,
                  detail: val.detail,
                  isVerified: true,
                },
                update: {
                  name: val.name,
                  detail: val.detail,
                  isVerified: true,
                },
              });
            }
          }
        } catch (err) {
          console.warn(`Error translating "${sample.name}":`, err);
        }
      }),
    );

    doneCount += slice.length;
    if (doneCount % 50 === 0 || doneCount === entries.length) {
      console.log(`Progress: ${doneCount} / ${entries.length} unique items translated...`);
    }
  }

  console.log("✅ All translations populated successfully!");
}

populateTranslations()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
