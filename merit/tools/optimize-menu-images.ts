import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BRAIN_DIR = "C:\\Users\\Erkan\\.gemini\\antigravity\\brain\\2d6a9306-89d9-4684-9d16-ada33ff9790c";
const TARGET_DIR = path.resolve("public/menu-samples");

const PATTERNS: { regex: RegExp; baseName: string }[] = [
  { regex: /diamond_old_fashioned/i, baseName: "cocktail" },
  { regex: /diamond_old_fashioned/i, baseName: "old-fashioned" },
  { regex: /islay_japanese_whisky/i, baseName: "whisky" },
  { regex: /fine_wine_cheese_pairing/i, baseName: "wine" },
  { regex: /fine_wine_cheese_pairing/i, baseName: "cheese-platter" },
  { regex: /fine_wine_cheese_pairing/i, baseName: "nuts" },
  { regex: /sunset_pomegranate/i, baseName: "lemonade" },
  { regex: /sunset_pomegranate/i, baseName: "pomegranate" },
  { regex: /lagoon_blue/i, baseName: "spritz" },
  { regex: /wiener_melange/i, baseName: "coffee" },
  { regex: /belgian_chocolate/i, baseName: "dessert" },
  { regex: /belgian_chocolate/i, baseName: "macaron" },
  { regex: /artisan_levrek/i, baseName: "flatbread" },
  { regex: /artisan_levrek/i, baseName: "burger" },
  { regex: /ginger_lemon|zencefil|tea/i, baseName: "tea" },
  { regex: /fruit|meyve/i, baseName: "fruit" },
  { regex: /smoothie/i, baseName: "smoothie" },
  { regex: /strudel|sacher/i, baseName: "strudel" },
  { regex: /watermelon|karpuz|hellim|salatasi|salad/i, baseName: "salad" },
  { regex: /watermelon|karpuz/i, baseName: "watermelon" },
  { regex: /sandwich|sandvic/i, baseName: "sandwich" },
  { regex: /nuts|kuruyemis/i, baseName: "nuts" },
];

async function main() {
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  const files = fs.readdirSync(BRAIN_DIR).filter((f) => f.endsWith(".jpg"));
  console.log(`Found ${files.length} JPEG files in brain dir.`);

  for (const file of files) {
    const srcPath = path.join(BRAIN_DIR, file);
    const matches = PATTERNS.filter((p) => p.regex.test(file));
    if (matches.length === 0) {
      console.log(`No match for ${file}`);
      continue;
    }

    for (const match of matches) {
      const jpgTarget = path.join(TARGET_DIR, `${match.baseName}.jpg`);
      const webpTarget = path.join(TARGET_DIR, `${match.baseName}.webp`);

      await sharp(srcPath)
        .resize(800, 800, { fit: "cover", position: "center" })
        .jpeg({ quality: 86, mozjpeg: true })
        .toFile(jpgTarget);

      await sharp(srcPath)
        .resize(800, 800, { fit: "cover", position: "center" })
        .webp({ quality: 85 })
        .toFile(webpTarget);

      console.log(`Processed: ${file} -> ${match.baseName}.jpg & .webp`);
    }
  }
}

main().catch(console.error);
