# Room service: prices of the dishes and the alcoholic drink groups, from the hotel's price list
# (merit_tum_menuler.md, 08.11.2026; menus 808 Royal, 1067 Diamond, 1068 Premium are identical).
#
#   python room_service_list.py <merit_tum_menuler.md>   -> rewrites menu_json/room_service_list.json
#
# build_dataset.py calls apply() after every outlet is built: the printed room service menu carries no prices
# and no drinks, so both come from the list. A drink the hotel's lobby bar also serves takes the lobby item's
# spelling, English name, description and picture, so the same bottle looks the same on both menus.
import difflib, io, json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "menu_json", "room_service_list.json")
MENU_NO = "808"

# Category of the list -> (category on the menu, English name), in the order they follow the dishes.
# The names are the lobby bars', so the two menus read alike.
DRINK_GROUPS = [
    ("SICAK İÇECEKLER", ("SICAK İÇECEKLER", "HOT DRINKS")),
    ("MEŞRUBATLAR", ("MEŞRUBATLAR", "SOFT DRINKS")),
    ("BİRALAR", ("BİRALAR", "BEERS")),
    ("APERATİFLER", ("APERATİFLER", "APERITIFS")),
    ("VOTKALAR", ("VOTKALAR", "VODKAS")),
    ("CİNLER", ("CİNLER", "GINS")),
    ("ROMLAR", ("ROMLAR", "RUMS")),
    ("TEKİLALAR", ("TEKİLALAR", "TEQUILAS")),
    ("KONYAKLAR", ("KONYAKLAR", "COGNACS")),
    ("LİKÖRLER", ("LİKÖRLER", "LIQUEURS")),
    ("VİSKİLER > BOURBON & TENNESSEE VİSKİLER", ("BOURBON & TENNESSEE VİSKİLER", "BOURBON & TENNESSEE WHISKIES")),
    ("VİSKİLER > SINGLE MALT VİSKİ", ("MALT VİSKİLER", "MALT WHISKIES")),
    ("VİSKİLER > İSKOÇ VİSKİLER", ("İSKOÇ VİSKİLER", "SCOTCH WHISKIES")),
    ("VİSKİLER > İRLANDA VİSKİLERİ", ("İRLANDA VİSKİLERİ", "IRISH WHISKIES")),
    ("İMZA KOKTEYLLER", ("İMZA KOKTEYLLER", "SIGNATURE COCKTAILS")),
    ("ULUSLARARASI KOKTEYLLER", ("ULUSLARARASI KOKTEYLLER", "INTERNATIONAL COCKTAILS")),
]
COCKTAILS = {"İMZA KOKTEYLLER", "ULUSLARARASI KOKTEYLLER"}
# Groups whose note in the list is the item's own text (flavours, kinds), not a measure.
DESCRIBED = COCKTAILS | {"SICAK İÇECEKLER", "MEŞRUBATLAR"}


def own_text(note):
    """The item's own text in a note of the list: the option list of the source system is not menu text."""
    m = re.match(r"^Seçenekler:\s*\w+:\s*(.+)$", note)
    if m:
        return m.group(1).strip()
    return re.sub(r"\s*/\s*Seçenekler:.*$", "", note).strip()

# Drinks the lobby bar does not carry: name in the list -> (English name, text, English text). The texts replace
# the list's own, which is misspelled in places.
OWN_DRINKS = {
    "DEMLEME ÇAY": ("BREWED TEA", None, None),
    "SINGLE ESPRESSO": ("SINGLE ESPRESSO", None, None),
    "DOUBLE ESPRESSO": ("DOUBLE ESPRESSO", None, None),
    "TAZE DEMLEME BİTKİ ÇAYLARI": (
        "FRESHLY BREWED HERBAL TEAS",
        "KIŞ ÇAYI, REZENE, IHLAMUR, ADA ÇAYI, HİBİSKUS, PAPATYA, YASEMİN, EKİNEZYA, MELİSA",
        "WINTER TEA, FENNEL, LINDEN, SAGE, HIBISCUS, CHAMOMILE, JASMINE, ECHINACEA, LEMON BALM"),
    "RONNEFELDT BİTKİ ÇAYLARI": (
        "RONNEFELDT TEAS",
        "ENGLISH BREAKFAST, EARL GREY, MORGENTAU (MANGO, LİMON, GÜL YAPRAKLARI), NANE, PAPATYA, AYURVEDA HERBS & GINGER (ZENCEFİL, LİMON), ROOIBOS CREAM ORANGE (PORTAKAL, VANİLYA), SWEET BERRIES (ÇİLEK, AHUDUDU, KIRMIZI MEYVELER), BEYAZ ÇAY",
        "ENGLISH BREAKFAST, EARL GREY, MORGENTAU (MANGO, LEMON, ROSE PETALS), PEPPERMINT, CHAMOMILE, AYURVEDA HERBS & GINGER (GINGER, LEMON), ROOIBOS CREAM ORANGE (ORANGE, VANILLA), SWEET BERRIES (STRAWBERRY, RASPBERRY, RED FRUITS), WHITE TEA"),
    "COCA COLA ZERO": ("COCA COLA ZERO", None, None),
    "ICE TEA ŞEFTALİ": ("ICE TEA PEACH", None, None),
    "ICE TEA LİMON": ("ICE TEA LEMON", None, None),
    "LOKAL ENERJİ İÇECEĞİ": ("LOCAL ENERGY DRINK", None, None),
}

# Dish on the menu -> its name in the list, where the two are spelled too differently to be matched safely.
FOOD_ALIAS = {}

# One line of the printed menu that the list sells as separate dishes at different prices: (name, English name).
# Each takes the line's description and picture.
FOOD_SPLIT = {"Krep, Pancake ve Waffle": [("Waffle", "Waffle"), ("Pancake", "Pancake"), ("Krep", "Crêpe")]}

LOBBY = {"DIAMOND": "Diamond Lobby Bar", "ROYAL": "Royal Lobby Bar", "PREMIUM": "Premium Lobby Bar"}

FOLD = str.maketrans({"ı": "i", "İ": "i", "I": "i", "ş": "s", "Ş": "s", "ğ": "g", "Ğ": "g", "ü": "u", "Ü": "u",
                      "ö": "o", "Ö": "o", "ç": "c", "Ç": "c", "&": " ", "’": "", "'": "", "`": ""})


def norm(text):
    text = unicodedata.normalize("NFKD", (text or "").translate(FOLD).lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def same_product(a, b):
    """A near match is a spelling variant only: the same numbers (12 Y.O. is not 15 Y.O.) and no word replaced
    by a different one (BLACK is not RED)."""
    ta, tb = a.split(), b.split()
    if sorted(t for t in ta if t.isdigit()) != sorted(t for t in tb if t.isdigit()):
        return False
    da, db = [t for t in ta if t not in tb], [t for t in tb if t not in ta]
    return (not da and not db) or difflib.SequenceMatcher(None, "".join(da), "".join(db)).ratio() >= 0.6


def find(name, by_norm):
    """The entry of `by_norm` (normalized name -> value) that is `name`, exactly or as a spelling variant."""
    key = norm(name)
    if key in by_norm:
        return by_norm[key]
    close = difflib.get_close_matches(key, list(by_norm), n=1, cutoff=0.86)
    return by_norm[close[0]] if close and same_product(key, close[0]) else None


def extract(md_path):
    """The room service menu of the list: dish prices by name, and the drink groups with their items."""
    food, groups, menu, cat = {}, {}, None, ""
    wanted = dict(DRINK_GROUPS)
    for line in io.open(md_path, encoding="utf8"):
        line = line.rstrip("\n")
        m = re.match(r"^## .+? — Menü (\d+)", line)
        if m:
            menu = m.group(1)
            continue
        if line.startswith("### "):
            cat = line[4:].strip()
            continue
        if menu != MENU_NO or not line.startswith("| ") or line.startswith("| Ürün") or line.startswith("|---"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        pm = re.match(r"^([\d.,]+)\s*\$$", cells[1]) if len(cells) > 1 else None
        if not pm:
            continue  # the information line of the menu has no price
        name = unicodedata.normalize("NFKC", cells[0])
        price = float(pm.group(1).replace(",", ""))
        if cat.startswith("YİYECEKLER"):
            food[name] = price
        elif cat in wanted:
            note = unicodedata.normalize("NFKC", cells[2]) if len(cells) > 2 else ""
            detail = own_text(note) if cat in DESCRIBED else None
            # The list prices a spirit by its smallest measure ("5 cl / Seçenekler: ..."); the price of the larger
            # measures is not in the list, so the menu states which measure the price is for.
            mm = re.match(r"^(\d+)\s*cl(?![a-z])", note, re.I)
            groups.setdefault(cat, []).append({"name": name, "price": price, "detail": detail or None,
                                               "measure": "%s cl" % mm.group(1) if mm and cat not in DESCRIBED else None})
    data = {"source": "merit_tum_menuler.md (08.11.2026), Menü %s" % MENU_NO, "food": food,
            "drinks": [{"category": c, "items": groups.get(c, [])} for c, _ in DRINK_GROUPS]}
    io.open(DATA, "w", encoding="utf8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    return data


def measured(measure, detail):
    """The description of a drink priced by measure: the measure first, then the item's own text."""
    if not measure:
        return detail
    return "%s · %s" % (measure, detail) if detail else measure


def apply(outlets):
    """Prices the room service dishes and appends the drink groups. -> report lines."""
    data = json.load(io.open(DATA, encoding="utf8"))
    food = {norm(k): v for k, v in data["food"].items()}
    names = dict(DRINK_GROUPS)
    report = []
    for outlet in outlets:
        if not outlet["isRoomService"]:
            continue
        hotel = outlet["hotelCode"]
        unpriced, dishes = [], []
        for row in outlet["items"]:
            dishes.extend(dict(row, name=tr, nameEn=en) for tr, en in FOOD_SPLIT.get(row["name"], [])) if row["name"] in FOOD_SPLIT else dishes.append(row)
        outlet["items"] = dishes
        for row in dishes:
            price = find(FOOD_ALIAS.get(row["name"], row["name"]), food)
            if price is None:
                unpriced.append(row["name"])
            else:
                row["price"] = price
        lobby = next((o for o in outlets if o["outletName"] == LOBBY[hotel]), None)
        by_cat = {}
        for row in (lobby["items"] if lobby else []):
            by_cat.setdefault(row["catPath"][0], {})[norm(row["name"])] = row
        added = own = 0
        for group in data["drinks"]:
            cat_tr, cat_en = names[group["category"]]
            for it in group["items"]:
                twin = find(it["name"], by_cat.get(cat_tr, {}))
                ours = None if twin else OWN_DRINKS.get(it["name"])
                own += twin is None
                if ours:
                    twin = {"name": it["name"], "nameEn": ours[0], "detail": ours[1] or it["detail"], "detailEn": ours[2], "imageUrl": None}
                outlet["items"].append({
                    "catPath": [cat_tr], "catPathEn": [cat_en],
                    "name": twin["name"] if twin else it["name"],
                    "nameEn": twin["nameEn"] if twin else it["name"],
                    "detail": measured(it.get("measure"), twin["detail"] if twin else it["detail"]),
                    "detailEn": measured(it.get("measure"), twin["detailEn"] if twin else None),
                    "price": it["price"],
                    "imageUrl": twin["imageUrl"] if twin else None,
                    "allergens": [], "tags": [],
                })
                added += 1
        report.append("%-8s oda servisi: %d yemek fiyatlandı, %d fiyatsız %s; %d içki eklendi (%d'i lobi barda yok)" % (
            hotel, len(outlet["items"]) - added - len(unpriced), len(unpriced), unpriced or "", added, own))
    return report


if __name__ == "__main__":
    d = extract(sys.argv[1])
    sys.stdout.reconfigure(encoding="utf8")
    print("yemek:", len(d["food"]), " içki:", sum(len(g["items"]) for g in d["drinks"]), "->", DATA)
