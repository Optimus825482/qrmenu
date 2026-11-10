# Shared helpers for the menu rebuild: flatten the extracted menus, normalize names, match Micros prices.
import difflib, io, json, os, re, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
JSON_DIR = os.path.join(HERE, "menu_json")

TR_MAP = str.maketrans("ıİşŞğĞçÇöÖüÜâÂîÎûÛ’‘`´", "iIsSgGcCoOuUaAiIuU''''")


def fold(text):
    """ASCII upper-case form used only for comparing names."""
    t = (text or "").translate(TR_MAP)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return t.upper()


def tokens(text, noise=()):
    t = fold(text).replace("&", " ")
    t = re.sub(r"(?<=[A-Z])\.(?=[A-Z])", "", t)  # V.S.O.P -> VSOP, Y.O -> YO
    t = re.sub(r"'S\b", "S", t)
    t = re.sub(r"(\d)([A-Z])", r"\1 \2", t)
    t = re.sub(r"([A-Z])(\d)", r"\1 \2", t)
    out = [x for x in re.split(r"[^A-Z0-9]+", t) if x]
    return [x for x in out if x not in noise]


def clean(s):
    if s is None:
        return None
    s = re.sub(r"\s+", " ", str(s)).strip()
    return s or None


VOLUME = re.compile(r"\s(\d+\s?(?:ml|cl|lt)\.?)$", re.I)
VARIANT = re.compile(r"\s*\((glass|bottle|\d+\s?\$)\)$", re.I)


def flatten(doc):
    """-> list of dict(catPath, catPathEn, tr, en, detailTr, detailEn, price)."""
    out = []

    def walk(cat, path, path_en):
        p, pe = path + [clean(cat["tr"])], path_en + [clean(cat.get("en") or cat["tr"])]
        for it in cat.get("items") or []:
            tr, en = clean(it["tr"]), clean(it.get("en") or it["tr"])
            m = VOLUME.search(en)
            if m and not VOLUME.search(tr):
                tr = tr + " " + m.group(1)
            dtr, den = clean(it.get("detailTr")), clean(it.get("detailEn"))
            out.append({
                "catPath": p[:2] if len(p) <= 2 else [p[0], " · ".join(p[1:])],
                "catPathEn": pe[:2] if len(pe) <= 2 else [pe[0], " · ".join(pe[1:])],
                "tr": tr, "en": en,
                "detailTr": dtr or den, "detailEn": den or dtr,
                "price": it.get("priceUsd"),
            })
        for sub in cat.get("sub") or []:
            walk(sub, p, pe)

    for c in doc["categories"]:
        walk(c, [], [])

    # Wines printed with two unlabelled prices: the lower one is the glass, the higher one the bottle.
    i = 0
    while i < len(out):
        a = out[i]
        m = VARIANT.search(a["tr"])
        if m:
            base = VARIANT.sub("", a["tr"])
            b = out[i + 1] if i + 1 < len(out) else None
            if b and VARIANT.sub("", b["tr"]) == base and VARIANT.search(b["tr"]) and a["catPath"] == b["catPath"]:
                lo, hi = (a, b) if (a["price"] or 0) <= (b["price"] or 0) else (b, a)
                for row, tr_s, en_s in ((lo, "Kadeh", "Glass"), (hi, "Şişe", "Bottle")):
                    row["tr"] = "%s (%s)" % (base, tr_s)
                    row["en"] = "%s (%s)" % (VARIANT.sub("", row["en"]), en_s)
                i += 2
                continue
            a["tr"], a["en"] = base, VARIANT.sub("", a["en"])
        i += 1
    return out


def load(name):
    return json.load(io.open(os.path.join(JSON_DIR, name + ".json"), encoding="utf8"))


# ---------------------------------------------------------------- Micros
NOISE = {"YO", "YRS", "YEARS", "YEAR", "YIL", "TEK", "CL", "ML", "BIRA", "LIKOR", "VERMUT", "CIN", "ROM", "THE",
         "DE", "33", "SRP", "KDH", "MEYVE", "SUYU", "TAZE"}
SKIP_FAMILY = re.compile(r"SISE|75|YERLI|SAMPANYA")


def load_micros(path):
    lines = io.open(path, encoding="utf8").read().split("\n")
    end = lines.index("### SAYFA: Report")
    items = []
    for line in lines[3:end]:
        p = line.split(" | ")
        if len(p) < 4:
            continue
        name, family, usd = " ".join(p[:-3]).replace("XXX", "").strip(), p[-3], float(p[-1])
        if SKIP_FAMILY.search(family) or re.search(r"\bDBL\b", name):
            continue
        price = round(usd)
        if abs(usd - price) > 0.05:
            price = round(usd, 2)
        items.append({"name": name, "family": family, "price": price, "tok": tokens(name, NOISE)})
    return items


def same(a, b):
    return a == b or (len(a) > 3 and len(b) > 3 and difflib.SequenceMatcher(None, a, b).ratio() >= 0.84)


def match_price(name, micros):
    """-> (kind, micros item | None). kind: exact | partial | none."""
    mt = tokens(name, NOISE)
    if not mt:
        return "none", None
    nums = {t for t in mt if t.isdigit()}
    best = []
    for it in micros:
        it_t = it["tok"]
        if not it_t or {t for t in it_t if t.isdigit()} != nums:
            continue
        hit = sum(1 for t in it_t if any(same(t, m) for m in mt))
        if hit < len(it_t):
            continue
        cover = sum(1 for m in mt if any(same(t, m) for t in it_t)) / len(mt)
        best.append((cover, it))
    if not best:
        return "none", None
    best.sort(key=lambda x: -x[0])
    top = [b for b in best if b[0] == best[0][0]]
    if len({b[1]["price"] for b in top}) > 1:
        return "none", None
    return ("exact" if best[0][0] == 1 else "partial"), top[0][1]


# ---------------------------------------------------------------- food / drink split
FOOD_TOP = {"bella_merit": 8, "mandarin": 11, "steakhouse": 9, "room_service": 99, "premium_pool": 99,
            "diamond_pool": 7, "blue_sea": 7, "roof": 2}


def flat_menu(menu):
    """flatten() plus a `food` flag per item (drinks come after the food categories of a document)."""
    items = flatten(load(menu))
    order = []
    for it in items:
        if it["catPath"][0] not in order:
            order.append(it["catPath"][0])
    n = FOOD_TOP.get(menu, 0)
    for it in items:
        it["food"] = order.index(it["catPath"][0]) < n
        it["wine"] = bool(re.search(r"WINE|ŞARAP|SARAP", it["catPath"][0]))
    return items


# ---------------------------------------------------------------- price rules (Micros, USD)
NOISE |= {"VODKA", "VOTKA", "TEKILA", "VISKI"}
# menu name (folded) -> Micros item name without the TEK suffix; None = never price automatically
PRICE_ALIAS = {
    "JACK DANIEL'S NO:7": "JACK DANIELS", "JACK DANIEL'S HONEY": "JACK HONEY",
    "JACK DANIEL'S SINGLE BARREL": "JACK DAN. SINGLE BARREL", "BULLEIT BOURBON": "BULLEIT BOUR",
    "GRAPPA": "FIORI DI MIRTILLO GRAPPA", "REMY MARTIN LOUIS XIII": "REMY MARTIN XII LUIS",
    "PASSOA": "PASSAO", "GRANDE ABSENTH": "GRANDE ABSINTHE", "LAGAVULIN DE 1995 16 Y.O.": "LAGAVULIN 16",
    "GLENFIDDICH 12 Y.O.": "GLENFID 12YRS", "GLENFIDDICH 15 Y.O.": "GLENFID 15YRS",
    "GLENFIDDICH 18 Y.O.": "GLENFID 18YRS", "GLENFIDDICH 21 Y.O.": "GLENFID 21YRS",
    "COAL ILA 12 Y.O.": "COAL ILA", "MACALLAN ESTATE RESERVE": "MACALLAN EST",
    "CAPTAIN MORGAN WHITE": "CAP MORG WHI", "CAPTAIN MORGAN DARK": "CAP MOR BLA",
    "HAVANA CLUB 3 ANOS": "HAVANA CLUP 3 ANOS", "RON ZACAPA 23": "ZAPACA 23", "PATRON SILVER": "T.PAT SILVER",
    "RUSSIAN STANDART": "VODKA RUSKY STANDART", "ABSOLUT VANILLA": "VODKA ABSOLUT VANIGLIA",
    "GREY GOOSE SUPER PREMIUM": "VOTKA GREY GOOSE", "DIMPLE 15 Y.O.": "DIMPLE",
    "JUSTERINI & BROOKS BARE": "JUSTERINI & BROOKS RARE", "JOHNNIE WALKER BLACK LABEL 12 Y.O.": "BLACK LABEL",
    "JOHNNIE WALKER GOLD RESERVE": "GOLD LABEL", "JOHNNIE WALKER 18 Y.O.": "J.W. 18YRS",
    "JOHNNIE WALKER GREEN LABEL": "GREEN LABEK", "MALFY GRAPEFRUIT": "MALFY GREYFURT",
    "BACARDI CARTA ORO (GOLD)": "BACARDI GOLD", "APEROL SPRITZ": "APEROL SPIRITS",
    "SEFTALILI SOGUK CAY": "PEACH ICED TEA", "LIMONLU SOGUK CAY": "LEMON ICED TEA",
    "ELMALI YESIL CAY": "GREEN TEA WITH APPLE", "SOGUK MATCHA CAYI": "MATCHA ICED TEA",
    "BOGURTLENLI HIBISKUS CAYI": "BLACKBERRY HIBISCUS TEA", "ESPRESSO": "SINGLE ESPRESSO",
    "ESPRESSO, RISTRETTO, LUNGO": "SINGLE ESPRESSO", "KLASIK TURK CAYI": "DEMLEME CAY",
    "BITKI CAYLARI": "DEMLEME BITKI CAY", "MACCHIATO": "ESPRESSO MACCHIATO", "FRAPPE": "FRAPPE VANILYA",
    "AFFAGATO": "AFFOGATO VANILYA", "SMOOTHIES": "SERINLETICI SMOOTHIES", "MILKSHAKES": "MILKSHAKE",
    "FRAPPUCCINO": "FRAPPUCINO", "MEYVE SUYU": "PORTAKAL MEYVE SUYU", "FRESH MEYVE SUYU": "TAZE PORTAKAL SUYU",
    "SODA": "BEYPAZARI SODA", "SODA / MINERAL WATER": "BEYPAZARI SODA", "SAN PELLEGRINO": "PELLEGRINO 330 ML",
    "BRITVIC": "BRITVIC TONIC", "SU CAM 330 ML.": "SIRMA SU 33 CL", "SU 750 ML.": "SIRMA SU 75 CL",
    "ICE TEA": "FUSE TEA LIMON", "ICE TEA (PEACH, LEMON)": "FUSE TEA LIMON", "SALGAM SUYU": "SALGAM ACILI 33 L",
    "ZERDECALLI SAHLEP": "ZERDECALLI SALEP", "FILTRE KAHVE": "FILTER COFFEE",
    "JASMINE PEARLS": None, "SU 330 ML.": None, "OBAN 14 Y.O.": None, "BENRIARCH 10 Y.O.": None,
    "BENRIARCH 12 Y.O.": None, "ROYAL": None, "PORT": None, "MARGARITA": None,
}
# whole categories priced per item kind (every flavour of the same product costs the same in Micros)
CATEGORY_PRICE = {"SERINLETICI SMOOTHIE": "SERINLETICI SMOOTHIES", "MILKSHAKES": "MILKSHAKE"}
JUICE_CATS = {"MEYVE SUYU": "%s MEYVE SUYU", "FRESH MEYVE SUYU": "TAZE %s SUYU"}
JUICE_ALIAS = {"KARISIK": "MIX", "KIZILCIK": "CRANBERRY"}


def price_for(item, micros):
    """-> (price | None, how). Printed prices win; food is never priced from Micros (it lists drinks only)."""
    if item["price"] is not None:
        return item["price"], "printed"
    if item["food"]:
        return None, "food"
    by_name = {re.sub(r"\s+TEK$", "", m["name"]).strip(): m for m in micros}
    key = fold(item["tr"])
    cat = fold(item["catPath"][-1])
    if key in PRICE_ALIAS:
        hit = by_name.get(PRICE_ALIAS[key]) if PRICE_ALIAS[key] else None
        return (hit["price"], "alias") if hit else (None, "blocked" if PRICE_ALIAS[key] is None else "alias-missing")
    if cat in CATEGORY_PRICE:
        return by_name[CATEGORY_PRICE[cat]]["price"], "category"
    if cat in JUICE_CATS:
        name = JUICE_CATS[cat] % JUICE_ALIAS.get(key, key)
        hit = next((m for m in micros if fold(m["name"]).replace("MEYVESUYU", "SUYU") == name), None)
        return (hit["price"], "juice") if hit else (None, "none")
    if "RONNEFELDT" in cat or cat in ("DONDURMALAR", "ROYAL DONDURMA"):
        return None, "none"
    kind, hit = match_price(item["tr"], micros)
    if kind == "none" and item["en"] != item["tr"]:
        kind, hit = match_price(item["en"], micros)
    return (hit["price"], kind) if hit else (None, "none")
