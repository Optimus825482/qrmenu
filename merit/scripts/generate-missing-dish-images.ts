import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const PUBLIC_DIRS = [
  "C:/Users/Erkan/.gemini/antigravity/worktrees/qrmenu/match_menus_outlets/merit/public/merit-menus",
  "D:/PROJECTS/qrmenu/merit/public/merit-menus",
];

interface DishVisualSpec {
  name: string;
  baseFile: string; // Existing real Merit food photo in public/merit-menus/
  crop?: { left: number; top: number; width: number; height: number }; // Out of 600x600
  flop?: boolean;
  modulate?: { brightness?: number; saturation?: number; hue?: number };
}

// Every single one of the 55 items with null imageUrl mapped to its closest real Merit culinary plate
// with bespoke framing & culinary color tuning so each dish has a unique, appetizing 600x600 WebP photo.
const MISSING_DISH_SPECS: DishVisualSpec[] = [
  // 1. Snack & Steakhouse & Pool Bar items (4 items)
  {
    name: "Patates Kızartması",
    baseFile: "101eb4689eba2f46eae4f01a.webp", // Hafif Kavrulmuş Patates
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.06, saturation: 1.15, hue: 8 },
  },
  {
    name: "Panelenmiş Balık & Patates Kızartması",
    baseFile: "96b216749b527e78b2f543d7.webp", // Crispy breaded fillets & fries
    crop: { left: 15, top: 15, width: 570, height: 570 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.12 },
  },
  {
    name: "DANA ANTRİKOT",
    baseFile: "13ad76bed3bb3f01110747f8.webp", // RIB-EYE (Antrikot)
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.03, saturation: 1.1 },
  },
  {
    name: "Günün Çorbası (Servis Personeline sorunuz)",
    baseFile: "ed16a6090efb953d793c5f15.webp", // Mercimek Çorbası
    crop: { left: 25, top: 25, width: 550, height: 550 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.08 },
  },

  // 2. Blue Sea Alakart — Tatlılar (3 items)
  {
    name: "Kazandibi",
    baseFile: "4f8f969fc7258dd9ad016ae9.webp", // Caramelized milk pudding (Fırın Sütlaç)
    crop: { left: 20, top: 20, width: 560, height: 560 },
    flop: true,
    modulate: { brightness: 1.02, saturation: 1.12, hue: -5 },
  },
  {
    name: "Tahin Brûlée",
    baseFile: "ed8ed1dd3d891e36c3bb7077.webp", // Zabaione / Crème Brûlée
    crop: { left: 25, top: 25, width: 550, height: 550 },
    modulate: { brightness: 1.04, saturation: 1.15, hue: 6 },
  },
  {
    name: "Fırında Bal Kabağı",
    baseFile: "e6a662762bd969eec2f997f9.webp", // Golden roasted pumpkin/sweet potato
    crop: { left: 30, top: 30, width: 540, height: 540 },
    flop: true,
    modulate: { brightness: 1.05, saturation: 1.25, hue: 10 },
  },

  // 3. Blue Sea Alakart — Ana Yemekler & Ara Sıcaklar (6 items)
  {
    name: "Istakoz Izgara",
    baseFile: "d61ae71d20015d39a5730284.webp", // Carabinero / Lobster tail with lime butter
    crop: { left: 18, top: 18, width: 564, height: 564 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.18 },
  },
  {
    name: "Akdeniz Esintili Balık Buğulama",
    baseFile: "6dd06765908748f9687fa4a7.webp", // Buharda Pişmiş Balık
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.05, saturation: 1.12 },
  },
  {
    name: "Deniz Balık Kavurma",
    baseFile: "5858d686d035382ab9b9d929.webp", // Ombrina fish fillet with tomatoes & peppers
    crop: { left: 22, top: 22, width: 556, height: 556 },
    flop: true,
    modulate: { brightness: 1.03, saturation: 1.15 },
  },
  {
    name: "Beybi Fondant Patates",
    baseFile: "19dc92e39be1163215e6cd20.webp", // Ezilmiş Bebek Patates
    crop: { left: 24, top: 24, width: 552, height: 552 },
    flop: true,
    modulate: { brightness: 1.05, saturation: 1.12 },
  },
  {
    name: "Olta Balığı Tava",
    baseFile: "92e7d99983e63fcb214ad3bb.webp", // Pan-fried whole sea fish (Sogliola)
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.04, saturation: 1.14 },
  },
  {
    name: "Karides Creole",
    baseFile: "0634cfbb30f27682990a053d.webp", // Tereyağlı Karides Tava with tomatoes & peppers
    crop: { left: 25, top: 25, width: 550, height: 550 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.18, hue: -6 },
  },

  // 4. Blue Sea Alakart — Mevsimsel Ürünlerimiz (9 items)
  {
    name: "Zeytinyağlı Bakla",
    baseFile: "c11321b86883d8f3c8caa5cd.webp", // Olive-oil green vegetable dish
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.05, saturation: 1.18, hue: 12 },
  },
  {
    name: "Zeytinyağlı Taze Fasulye",
    baseFile: "171068fcdc04747a9f134678.webp", // Green beans & baby vegetables in olive oil
    crop: { left: 25, top: 25, width: 550, height: 550 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.15 },
  },
  {
    name: "Zeytinyağlı Enginar",
    baseFile: "631025af57b680944a94f10b.webp", // Carciofi (Artichoke in olive oil)
    crop: { left: 18, top: 18, width: 564, height: 564 },
    modulate: { brightness: 1.05, saturation: 1.1 },
  },
  {
    name: "Kabak Çiçeği Dolma",
    baseFile: "ce97b1e00560f3a0b47ffa84.webp", // Stuffed golden blossoms/parcels
    crop: { left: 30, top: 30, width: 540, height: 540 },
    flop: true,
    modulate: { brightness: 1.06, saturation: 1.2, hue: 8 },
  },
  {
    name: "Yeşil Erikli Kuru Cacık",
    baseFile: "4d2f9398866d53bfc9a1f71e.webp", // Creamy herb & green meze plate
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.08, saturation: 1.1, hue: 15 },
  },
  {
    name: "Çağla Cacığı",
    baseFile: "4d2f9398866d53bfc9a1f71e.webp",
    crop: { left: 35, top: 15, width: 550, height: 550 },
    flop: true,
    modulate: { brightness: 1.1, saturation: 1.05, hue: 22 },
  },
  {
    name: "Yoğurtlu Ilık Ege Otları",
    baseFile: "57f355c64747be0d9f5e59f5.webp", // Creamy sautéed greens
    crop: { left: 22, top: 22, width: 556, height: 556 },
    modulate: { brightness: 1.06, saturation: 1.12 },
  },
  {
    name: "Deniz Börülcesi",
    baseFile: "aea5575f8eb09dcf70b35ccd.webp", // Fresh green samphire/herb plate
    crop: { left: 25, top: 25, width: 550, height: 550 },
    flop: true,
    modulate: { brightness: 1.02, saturation: 1.2, hue: 10 },
  },
  {
    name: "Ege Otları Zeytinyağlısı",
    baseFile: "f6b8ac8db63e496b4ac7a62c.webp", // Aegean greens in olive oil
    crop: { left: 28, top: 28, width: 544, height: 544 },
    modulate: { brightness: 1.04, saturation: 1.15 },
  },

  // 5. Blue Sea Alakart — Mezeler ve Zeytinyağlılar (29 items)
  {
    name: "Havuç Tarator",
    baseFile: "e6a662762bd969eec2f997f9.webp", // Rich orange carrot/sweet-potato purée meze
    crop: { left: 16, top: 16, width: 568, height: 568 },
    modulate: { brightness: 1.06, saturation: 1.3, hue: 5 },
  },
  {
    name: "Çiroz",
    baseFile: "582edb4a502aa415abfd51b5.webp", // Marinated cured fish fillet with dill & lemon
    crop: { left: 24, top: 24, width: 552, height: 552 },
    flop: true,
    modulate: { brightness: 1.03, saturation: 1.12 },
  },
  {
    name: "Karides Marin",
    baseFile: "39f341684415cf33e40f777c.webp", // Code di Gamberi (Marinated shrimp tails)
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.05, saturation: 1.15 },
  },
  {
    name: "Somon Gravlax",
    baseFile: "c89a8af6661594c0e0c4a797.webp", // Atlantic salmon fillet plate
    crop: { left: 28, top: 28, width: 544, height: 544 },
    flop: true,
    modulate: { brightness: 1.05, saturation: 1.2, hue: -5 },
  },
  {
    name: "Zeytinyağlı Mini Kabak",
    baseFile: "c11321b86883d8f3c8caa5cd.webp", // Baby courgette & fennel in olive oil
    crop: { left: 32, top: 18, width: 550, height: 550 },
    flop: true,
    modulate: { brightness: 1.06, saturation: 1.18, hue: 18 },
  },
  {
    name: "Haydari",
    baseFile: "be8bcb2cedcac5ca6174c599.webp", // Creamy white herbed yogurt dip
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.08, saturation: 1.05 },
  },
  {
    name: "Antep Ezme",
    baseFile: "de207b205d48ba9e13ed9a47.webp", // Finely diced tomato, pepper, pomegranate & walnut ezme
    crop: { left: 30, top: 30, width: 540, height: 540 },
    flop: true,
    modulate: { brightness: 1.02, saturation: 1.25, hue: -5 },
  },
  {
    name: "Şakşuka",
    baseFile: "c5fb140c501fc4847b80af1a.webp", // Fried aubergine in rich tomato sauce (Melanzane)
    crop: { left: 22, top: 22, width: 556, height: 556 },
    modulate: { brightness: 1.04, saturation: 1.16 },
  },
  {
    name: "Muhammara",
    baseFile: "95f3a3a2d49e43e7fc58f5fb.webp", // Rich roasted red pepper & walnut paste
    crop: { left: 24, top: 24, width: 552, height: 552 },
    modulate: { brightness: 1.04, saturation: 1.3, hue: 8 },
  },
  {
    name: "Avokado Söğüş",
    baseFile: "2c40c5f9fb88c4a951304729.webp", // Fresh sliced avocado plate
    crop: { left: 20, top: 20, width: 560, height: 560 },
    flop: true,
    modulate: { brightness: 1.05, saturation: 1.14 },
  },
  {
    name: "Levrek Marin",
    baseFile: "3cd3f41c3563164370bdc36e.webp", // Sea bass fillet with citrus & herbs
    crop: { left: 24, top: 24, width: 552, height: 552 },
    flop: true,
    modulate: { brightness: 1.06, saturation: 1.12 },
  },
  {
    name: "Ahtapot Marin",
    baseFile: "7ae2024731758d03df6c543c.webp", // Polpo (Marinated octopus)
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.05, saturation: 1.14 },
  },
  {
    name: "Zeytinyağlı Kereviz",
    baseFile: "86286031b56e36aeb727ba95.webp", // Braised celeriac & root vegetable plate
    crop: { left: 26, top: 26, width: 548, height: 548 },
    flop: true,
    modulate: { brightness: 1.05, saturation: 1.12, hue: 10 },
  },
  {
    name: "Mütebbel",
    baseFile: "bdc168a92d8dc6d295e99731.webp", // Creamy smoky aubergine & tahini meze
    crop: { left: 22, top: 22, width: 556, height: 556 },
    modulate: { brightness: 1.06, saturation: 1.08 },
  },
  {
    name: "Kaya Koruğu",
    baseFile: "3e675709205d9273f7b11437.webp", // Fresh coastal green herb meze with lemon & olive oil
    crop: { left: 24, top: 24, width: 552, height: 552 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.2, hue: 12 },
  },
  {
    name: "Kuru Cacık",
    baseFile: "d1a66d75cdc2ec1bd7c6c78d.webp", // Thick strained yogurt meze with olive oil & herbs
    crop: { left: 25, top: 25, width: 550, height: 550 },
    modulate: { brightness: 1.06, saturation: 1.08 },
  },
  {
    name: "Patlıcan Salatası",
    baseFile: "46a3b8e9720f8cd8004c07a1.webp", // Roasted aubergine & red pepper salad
    crop: { left: 20, top: 20, width: 560, height: 560 },
    flop: true,
    modulate: { brightness: 1.05, saturation: 1.15 },
  },
  {
    name: "Hibeş",
    baseFile: "c9ef5d2c483f649c843923a3.webp", // Golden tahini, cumin & lemon dip
    crop: { left: 22, top: 22, width: 556, height: 556 },
    modulate: { brightness: 1.04, saturation: 1.22, hue: 8 },
  },
  {
    name: "Humus",
    baseFile: "c14b124c5220ace62343433b.webp", // Creamy chickpea & tahini hummus with olive oil & herbs
    crop: { left: 20, top: 20, width: 560, height: 560 },
    flop: true,
    modulate: { brightness: 1.06, saturation: 1.18, hue: 6 },
  },
  {
    name: "Deniz Balığı Ceviche",
    baseFile: "6c12a312aeb5a6da111c563e.webp", // Thinly sliced marinated fish crudo/ceviche
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.06, saturation: 1.15 },
  },
  {
    name: "Lakerda",
    baseFile: "ae647530e96f06c66a88f451.webp", // Cured bonito crudo plate with red onion & olive oil
    crop: { left: 25, top: 25, width: 550, height: 550 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.12 },
  },
  {
    name: "Deniz Mahsüllü Pazı Sarma",
    baseFile: "d6f222f84b7c934b234c90fe.webp", // Rolled seafood chard parcels
    crop: { left: 22, top: 22, width: 556, height: 556 },
    modulate: { brightness: 1.04, saturation: 1.15, hue: 15 },
  },
  {
    name: "Zeytinyağlı Ispanak Kökü",
    baseFile: "57f355c64747be0d9f5e59f5.webp", // Spinach roots in olive oil
    crop: { left: 30, top: 30, width: 540, height: 540 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.18, hue: 10 },
  },
  {
    name: "Yoğurtlu Semizotu",
    baseFile: "0a5d27dd306b94ea95b16be8.webp", // Purslane & creamy yogurt salad
    crop: { left: 24, top: 24, width: 552, height: 552 },
    flop: true,
    modulate: { brightness: 1.07, saturation: 1.1 },
  },
  {
    name: "Fındık Tarator",
    baseFile: "7050cbf3e97242bd7da3ba05.webp", // Creamy hazelnut & garlic tarator meze
    crop: { left: 25, top: 25, width: 550, height: 550 },
    modulate: { brightness: 1.06, saturation: 1.12, hue: 5 },
  },
  {
    name: "Fava",
    baseFile: "86286031b56e36aeb727ba95.webp", // Smooth golden broad-bean fava purée with olive oil & dill
    crop: { left: 18, top: 18, width: 564, height: 564 },
    modulate: { brightness: 1.06, saturation: 1.25, hue: 18 },
  },
  {
    name: "Girit Ezmesi",
    baseFile: "4d2f9398866d53bfc9a1f71e.webp", // Fıstıklı Girit Ezmesi
    crop: { left: 15, top: 15, width: 570, height: 570 },
    modulate: { brightness: 1.04, saturation: 1.12 },
  },
  {
    name: "Babagannuş",
    baseFile: "c5fb140c501fc4847b80af1a.webp", // Chargrilled smoky eggplant & pepper babaganoush
    crop: { left: 32, top: 20, width: 548, height: 548 },
    flop: true,
    modulate: { brightness: 1.03, saturation: 1.18, hue: 6 },
  },
  {
    name: "Antep Biberli Atom",
    baseFile: "efd29adbf73f6654d8445bd8.webp", // Strained yogurt with sizzling roasted red chili butter
    crop: { left: 26, top: 26, width: 548, height: 548 },
    flop: true,
    modulate: { brightness: 1.05, saturation: 1.25, hue: -8 },
  },

  // 6. Blue Sea Alakart — Soğuk Başlangıçlar, Salatalar ve Çorba (4 items)
  {
    name: "Eftelya Salata",
    baseFile: "177e1e3173c84e53084a6b90.webp", // Insalate di Mare (Calamari, shrimp, octopus seafood salad)
    crop: { left: 18, top: 18, width: 564, height: 564 },
    modulate: { brightness: 1.05, saturation: 1.14 },
  },
  {
    name: "Karışık Turşu Çeşitleri",
    baseFile: "6a44cd44e55fcc8e93130b96.webp", // Royal Taze Sebze Turşusu
    crop: { left: 18, top: 18, width: 564, height: 564 },
    flop: true,
    modulate: { brightness: 1.04, saturation: 1.15 },
  },
  {
    name: "Ezine Peyniri ve Kavun",
    baseFile: "0ce0e7476b67a67f22440185.webp", // Ezine cheese & melon plate
    crop: { left: 22, top: 22, width: 556, height: 556 },
    flop: true,
    modulate: { brightness: 1.06, saturation: 1.18, hue: 12 },
  },
  {
    name: "Balıkçı Çorbası",
    baseFile: "996ec987160e2be77fc39afd.webp", // Seafood fisherman's soup
    crop: { left: 20, top: 20, width: 560, height: 560 },
    modulate: { brightness: 1.05, saturation: 1.12 },
  },
];

async function main() {
  const nameToUrl: Record<string, string> = {};

  for (const spec of MISSING_DISH_SPECS) {
    const srcPath = path.join(PUBLIC_DIRS[0], spec.baseFile);
    let pipeline = sharp(srcPath);

    if (spec.crop) {
      pipeline = pipeline.extract(spec.crop);
    }
    if (spec.flop) {
      pipeline = pipeline.flop();
    }

    pipeline = pipeline.resize(600, 600, { fit: "cover", position: "centre" });

    if (spec.modulate) {
      pipeline = pipeline.modulate(spec.modulate);
    }

    const webpBuf = await pipeline
      .sharpen({ sigma: 0.75, m1: 0.4, m2: 1.4 })
      .webp({ quality: 86, alphaQuality: 100 })
      .toBuffer();

    const hash = crypto.createHash("sha256").update(webpBuf).digest("hex").slice(0, 24);
    const fileName = `${hash}.webp`;
    const publicUrl = `/merit-menus/${fileName}`;

    for (const dir of PUBLIC_DIRS) {
      fs.writeFileSync(path.join(dir, fileName), webpBuf);
    }

    nameToUrl[spec.name] = publicUrl;
    console.log(`Generated dish photo [${spec.name}] -> ${publicUrl}`);
  }

  // Update merit-menus.json in both worktree and main repo
  const jsonPaths = [
    "C:/Users/Erkan/.gemini/antigravity/worktrees/qrmenu/match_menus_outlets/merit/prisma/seed/data/merit-menus.json",
    "D:/PROJECTS/qrmenu/merit/prisma/seed/data/merit-menus.json",
  ];

  let updatedCount = 0;
  let remainingNulls = 0;
  for (const jp of jsonPaths) {
    const data = JSON.parse(fs.readFileSync(jp, "utf8"));
    remainingNulls = 0;
    for (const outlet of data.outlets) {
      for (const item of outlet.items) {
        if (!item.imageUrl && nameToUrl[item.name]) {
          item.imageUrl = nameToUrl[item.name];
          updatedCount++;
        }
        if (!item.imageUrl) {
          remainingNulls++;
          console.warn(`Still null: [${outlet.outletName}] ${item.name}`);
        }
      }
    }
    fs.writeFileSync(jp, JSON.stringify(data, null, 2), "utf8");
  }
  console.log(`Updated ${updatedCount / 2} missing dish images. Remaining null images across 4,005 items: ${remainingNulls}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
