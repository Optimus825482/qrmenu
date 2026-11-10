# Matches source image files to menu items by name. Writes img_map.json: {menuKey|shoot: {itemIndex: relPath}}.
import io, json, os, re, sys
from menu_lib import HERE, flat_menu, fold, same, tokens

SRC = r"D:\PROJECTS\qrmenu\docs\29-YENİ MENÜ QR ÇALIŞMASI\29-YENİ MENÜ QR ÇALIŞMASI"
D = "1-İÇECEKLER\\İÇECEKLER"
SHOOT = "1-İÇECEKLER\\OTEL ÇEKİM SUNUM İÇECEKLER\\"
DRINKS = [D + "\\ALKOLLER SINIFLARINA GÖRE", D + "\\MEŞRUBATLAR", "12-RONNEFELDT ÇAYLAR"]

# variant -> (menu json, image folders in priority order)
VARIANTS = {
    "bella": ("bella_merit", ["4-BELLA MERİT FOTOLAR KATEGORİ"]),
    "mandarin": ("mandarin", ["5-MANDARİN FOTOLAR KATEGORİ"]),
    "steakhouse": ("steakhouse", ["10-STEAK ALACARTE GÖRSELLER"]),
    "room_service": ("room_service", ["6-ROOM SERVİS MENÜ GÖRSELLER"]),
    "diamond_pool": ("diamond_pool", ["7-DIAMOND POOL SNACK GÖRSELLER", "6-ROOM SERVİS MENÜ GÖRSELLER", SHOOT + "Diamond çekim"] + DRINKS),
    "premium_pool": ("premium_pool", ["7-DIAMOND POOL SNACK GÖRSELLER"]),
    "blue_sea": ("blue_sea", ["8-BLUE SEA SNACK GÖRSELLER", SHOOT + "royal&prm"] + DRINKS),
    "roof": ("roof", ["9-ROOF GARDEN GÖRSELLER", SHOOT + "the roof"] + DRINKS),
    "lobby_diamond": ("lobby_bars", [SHOOT + "Diamond çekim"] + DRINKS),
    "lobby_royal": ("lobby_bars", [SHOOT + "royal&prm"] + DRINKS),
    "whiskey": ("whiskey_lounge", [SHOOT + "whıskey lounge", SHOOT + "Diamond çekim"] + DRINKS),
    "tea": ("tea_lounge", [SHOOT + "tea lounge", SHOOT + "Diamond çekim"] + DRINKS),
    "cafe_verde": ("cafe_verde", [SHOOT + "tea lounge", SHOOT + "royal&prm"] + DRINKS),
}

FILE_NOISE = {"WL", "COPY", "KOPYA", "THE", "DE", "DI", "AL", "ALLA",
              "CON", "E", "VE", "ILE", "WITH", "AND", "YO", "PNG", "JPG"}
ITEM_NOISE = {"THE", "DE", "DI", "AL", "ALLA", "CON", "E", "VE", "ILE", "WITH", "AND", "YO", "ADET", "PCS", "G", "GR",
              "ML", "CL"}


def file_tokens(base):
    b = re.sub(r"\.(png|jpe?g)$", "", base, flags=re.I)
    b = re.sub(r"^\d+\s+", "", b)          # "101 bellini"
    b = re.sub(r"\(\d+\)", "", b)          # "(2)"
    b = re.sub(r"-\d{6,}", "", b)          # "BEYPAZARI-116019335"
    b = re.sub(r"\((W\.L|WHISKEY)\)", "", b, flags=re.I)
    b = re.sub(r"roof\s*-\s*whiskey lounge|roof\s*-\s*whiskey|tea\s*lounge\s*-?\s*verde|tea\s*-\s*verde|tea\s*lounge|whiskey lounge|royal\s+premium|\b(roof|verde|lobby|diamond)\b",
               " ", b, flags=re.I)
    return [t for t in tokens(b, FILE_NOISE) if not (t.isdigit() and len(t) > 4)]


def list_files(folder):
    out = []
    root = os.path.join(SRC, folder)
    for base, _, files in os.walk(root):
        if "blue sea snack" in base:
            continue
        for f in sorted(files):
            if f.lower().rsplit(".", 1)[-1] in ("png", "jpg", "jpeg") and "LOGO" not in f.upper():
                rel = os.path.relpath(os.path.join(base, f), SRC)
                out.append((rel, file_tokens(f)))
    return out


def score(item_tok, file_tok, food=False):
    if not item_tok or not file_tok:
        return 0.0
    hit_i = sum(1 for t in item_tok if any(same(t, f) for f in file_tok))
    hit_f = sum(1 for f in file_tok if any(same(t, f) for t in item_tok))
    s = min(hit_i / len(item_tok), hit_f / len(file_tok)) * 0.5 + (hit_i + hit_f) / (len(item_tok) + len(file_tok)) * 0.5
    # A file name that is a shortened form of the dish name ("AGNOLOTTI RIPIENI" for "... DI SPINACI E FORMAGGIO").
    if food and hit_f == len(file_tok) >= 2 and not ({t for t in item_tok if t.isdigit()} - set(file_tok)):
        s = max(s, 0.85)
    return s


def best(item, files, food=False):
    cands = []
    for name in {item["tr"], item["en"]}:
        it = tokens(name, ITEM_NOISE)
        for rel, ft in files:
            s = score(it, ft, food)
            if s >= 0.55:
                cands.append((s, rel))
    cands.sort(key=lambda x: (-x[0], len(x[1])))
    return cands[0] if cands else None


SYN = {fold(k): v for k, v in {
    "CAPPUCCINO": ["cappicino"], "CAFE LATTE": ["latte"], "ESPRESSO, RISTRETTO, LUNGO": ["espresso"],
    "ESPRESSO": ["single espresso"], "MACCHIATO": ["espresso machiato", "machiato"], "ESPRESSO MACCHIATO": ["espresso machiato"],
    "LATTE MACCHIATO": ["latte machiato"], "FILTER COFFEE": ["filtre kahve"], "FİLTRE KAHVE": ["filter coffee"],
    "KLASİK TÜRK ÇAYI": ["çay"], "DEMLEME ÇAY": ["çay"], "BİTKİ ÇAYLARI": ["ronnefeldt bitki çayı"],
    "TAZE DEMLEME BİTKİ ÇAYLARI": ["ronnefeldt bitki çayı"], "MATCHA ÇAYI": ["macha çayı", "sıcak matcha çayı"],
    "MATCHA LATTE": ["macha latte"], "FRAPPUCCINO": ["frappechino"], "ICED COFFEE CREAM": ["ice coffe cream"],
    "FRUIT FROZENS": ["fruit frozen"], "MILKSHAKES": ["milkshake"], "SMOOTHIES": ["smoothie"],
    "SOĞUK MATCHA ÇAYI": ["ice macha", "ıce matcha çayı"], "ŞEFTALİLİ SOĞUK ÇAY": ["şeftali soğuk çay"],
    "ELMALI YEŞİL ÇAY": ["yeşilçay elma soğuk çay"], "LİMONLU SOĞUK ÇAY": ["limon soğuk çay"],
    "BÖĞÜRTLENLİ HİBİSKUS ÇAYI": ["hibisküs böğürtlen soğuk çay"], "FRESH MEYVE SUYU": ["fresh portakal suyu"],
    "SODA": ["beypazarı"], "SODA / MINERAL WATER": ["beypazarı"], "ICE TEA": ["ice tea limon"],
    "ICE TEA (PEACH, LEMON)": ["ice tea şeftali"], "ENERJİ İÇECEĞİ": ["red bull"], "SU 750 ml.": ["cam su"],
    "BLOODY MARRY": ["bloddy mary"], "CAIRPIRINHA": ["cairprinha"], "ESPRESSO MARTINI": ["esprerro martini"],
    "OLD FASHIONED": ["old fashion"], "AMARETTO SOUR": ["ameretto sour"], "WHITE & BLACK RUSSIAN": ["white russian"],
    "THE PASSION": ["passion"], "GARDEN": ["garden kokteyli"], "FOR": ["four"], "FOR AS FIRE": ["forest fire"],
    "APARATIVO": ["aperetivo"], "CANCIERTO": ["concierto"], "BAZAAR": ["bazar"], "YOU AND ME": ["you me"],
    "MAGNOLYA": ["magnolia"], "ÇAKISTES": ["cakistes"], "ROYAL DONDURMA": ["dondurma"], "EFES PILSEN": ["efes"],
    "TÜRK KAHVESİ": ["türk kahvesi lobby"],
}.items()}
# drink categories without a product photo fall back to the hotel's own generic shot of that drink class
GENERIC = [("MALT", "179 malt viski"), ("VISKI", "178 viski"), ("WHISK", "178 viski"), ("KONYAK", "181 konyak"),
           ("LIKOR", "182 likör"), ("ROSE", "148 rose şarap"), ("WHITE WINE", "145 beyaz şarap"),
           ("BEYAZ SARAP", "145 beyaz şarap"), ("SPARKLING", "147 şampanya"), ("KOPUKLU", "147 şampanya"),
           ("WINE", "143 kırmızı şarap"), ("SARAP", "143 kırmızı şarap")]
OVERRIDES = json.load(io.open(os.path.join(HERE, "img_overrides.json"), encoding="utf8"))


def is_food(folder):
    return not folder.startswith("1-") and not folder.startswith("12-")


result, report = {}, []
verbose = len(sys.argv) > 1 and sys.argv[1]
for key, (menu, folders) in VARIANTS.items():
    items = flat_menu(menu)
    mapping, used, low = {}, set(), []
    by_base = {}
    for folder in folders:
        for rel, _ in list_files(folder):
            by_base.setdefault(fold(os.path.basename(rel).rsplit(".", 1)[0]), rel)
    for i, it in enumerate(items):
        want = OVERRIDES.get(menu, {}).get(it["tr"])
        if want is not None:
            if want == "":
                mapping[i] = None
            elif fold(want) in by_base:
                mapping[i] = by_base[fold(want)]
                used.add(mapping[i])
            else:
                report.append("  !! override not found: %s -> %s" % (it["tr"], want))
    extra = [f for f in (SHOOT + "Diamond çekim", SHOOT + "royal&prm") if f not in folders] if any(f.startswith("1-") for f in folders) else []
    for folder in folders + extra:
        files = list_files(folder)
        food = is_food(folder)
        pairs = []
        for i, it in enumerate(items):
            if i in mapping:
                continue
            if it["food"] != food:
                continue
            for name in [it["tr"], it["en"]] + SYN.get(fold(it["tr"]), []):
                tk = tokens(name, ITEM_NOISE)
                for rel, ft in files:
                    sc = score(tk, ft, food)
                    if sc >= 0.55:
                        pairs.append((sc, -len(rel), i, rel))
        pairs.sort(reverse=True)
        for sc, _, i, rel in pairs:
            if i in mapping or (food and rel in used):
                continue
            if sc >= 0.8 or (food and sc >= 0.55):
                mapping[i] = rel
                used.add(rel)
                if sc < 0.8:
                    low.append((items[i]["tr"], rel, sc))
    generic = {fold(os.path.basename(r).rsplit(".", 1)[0]): r for r, _ in list_files(SHOOT + "Diamond çekim")}
    for i, it in enumerate(items):
        if i in mapping or it["food"]:
            continue
        cat = fold(it["catPath"][0])
        for needle, base in GENERIC:
            if needle in cat and fold(base) in generic:
                mapping[i] = generic[fold(base)]
                break
    mapping = {i: p for i, p in mapping.items() if p}
    result[key] = {str(i): p for i, p in mapping.items()}
    all_files = [rel for folder in folders if is_food(folder) for rel, _ in list_files(folder)]
    unused = [os.path.basename(r) for r in all_files if r not in used]
    missing = [it["tr"] for i, it in enumerate(items) if i not in mapping and not re.search("WINE|ŞARAP", it["catPath"][0])]
    report.append("== %s: %d/%d items with image" % (key, len(mapping), len(items)))
    if verbose in (key, "all"):
        report.append("  LOW: " + " ; ".join("%s <= %s (%.2f)" % (tr, os.path.basename(r), sc) for tr, r, sc in low))
        report.append("  UNUSED FILES: " + " ; ".join(unused))
        report.append("  NO IMAGE: " + " ; ".join(missing))
    if verbose == "ok:" + key:
        report.append("  OK: " + " ; ".join("%s <= %s" % (items[i]["tr"], os.path.basename(p)) for i, p in sorted(mapping.items())))
io.open(os.path.join(HERE, "img_map.json"), "w", encoding="utf8").write(json.dumps(result, ensure_ascii=False, indent=1))
print(chr(10).join(report))
