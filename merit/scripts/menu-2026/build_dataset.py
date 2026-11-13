# Builds merit/prisma/seed/data/merit-menus.json (version 3) from the extracted menus, Micros prices and image map.
import collections, hashlib, io, json, os, re, sys
from menu_lib import HERE, flat_menu, load, load_micros, price_for
from spelling import fix, fix_pair
from item_fixes import fix_item
from structure import restructure
import room_service_list

MERIT = r"D:\PROJECTS\qrmenu\merit"
OUT = os.path.join(MERIT, "prisma", "seed", "data", "merit-menus.json")
micros = load_micros(os.path.join(HERE, "menu_txt", "mcros_xlsx.txt"))
img_map = json.load(io.open(os.path.join(HERE, "img_map.json"), encoding="utf8"))

# (hotel, outlet name | None for room service, image variant, menu json, filter)
OUTLETS = [
    ("DIAMOND", None, "room_service", "room_service", None),
    ("DIAMOND", "Diamond Lobby Bar", "lobby_diamond", "lobby_bars", None),
    ("DIAMOND", "Diamond Pool Bar", "diamond_pool", "diamond_pool", None),
    ("DIAMOND", "Tea Lounge", "tea", "tea_lounge", None),
    ("DIAMOND", "Whiskey Lounge", "whiskey", "whiskey_lounge", None),
    ("DIAMOND", "The Steakhouse", "steakhouse", "steakhouse", None),
    ("ROYAL", None, "room_service", "room_service", None),
    ("ROYAL", "Royal Lobby Bar", "lobby_royal", "lobby_bars", None),
    ("ROYAL", "Blue Sea Beach Bar", "blue_sea", "blue_sea", None),
    # the roof's food (bar bites, sushi) belongs to its a la carte side and is left out
    ("ROYAL", "The Roof Garden", "roof", "roof", "drinks"),
    ("ROYAL", "Royal Mandarin", "mandarin", "mandarin", None),
    ("ROYAL", "Bella Merit", "bella", "bella_merit", None),
    ("PREMIUM", None, "room_service", "room_service", None),
    ("PREMIUM", "Premium Lobby Bar", "lobby_royal", "lobby_bars", None),
    ("PREMIUM", "Premium Pool Bar", "premium_pool", "premium_pool", None),
    ("PREMIUM", "Cafe Verde", "cafe_verde", "cafe_verde", None),
]
# "*" on a dish name refers to an advance-order note printed on that menu
STAR_NOTE = {
    "mandarin": ("Minimum 4 saat önceden sipariş verilmelidir.", "Orders must be placed at least 4 hours in advance."),
    "steakhouse": ("Minimum 24 saat önceden sipariş verilmelidir.", "Must be ordered at least 24 hours in advance."),
}

jobs, stats = {}, []


def image_url(rel):
    if rel not in jobs:
        jobs[rel] = hashlib.sha1(("v3|" + rel).encode("utf8")).hexdigest()[:24] + ".webp"
    return "/merit-menus/" + jobs[rel]


def join(a, b):
    if not a:
        return b
    return a if b in a else "%s %s" % (a.rstrip(), b)


outlets = []
for hotel, name, variant, menu, flt in OUTLETS:
    items = flat_menu(menu)
    mapping = img_map[variant]
    out, c = [], collections.Counter()
    for i, it in enumerate(items):
        if flt == "wine" and not it["wine"]:
            continue
        if flt == "drinks" and it["food"]:
            continue
        price, how = price_for(it, micros)
        tr, en, dtr, den = it["tr"], it["en"], it["detailTr"], it["detailEn"]
        if tr.startswith("*"):
            tr, en = tr.lstrip("* "), en.lstrip("* ")
            note = STAR_NOTE.get(menu)
            if note:
                dtr, den = join(dtr, note[0]), join(den, note[1])
        rel = mapping.get(str(i))
        tr, en = fix_pair(tr, en)
        cats = [fix_pair(a, b) for a, b in zip(it["catPath"], it["catPathEn"])]
        row = {
            "catPath": [c[0] for c in cats], "catPathEn": [c[1] for c in cats],
            "name": tr, "nameEn": en, "detail": fix(dtr), "detailEn": fix(den),
            "price": price, "imageUrl": image_url(rel) if rel else None, "allergens": [], "tags": [],
        }
        out.append(fix_item(row))
        c["items"] += 1
        c["priced"] += price is not None
        c["image"] += rel is not None
    out = restructure(out)
    c["items"], c["priced"], c["image"] = len(out), sum(r["price"] is not None for r in out), sum(r["imageUrl"] is not None for r in out)
    outlets.append({"hotelCode": hotel, "outletName": name, "isRoomService": name is None, "items": out})
    stats.append("%-8s %-32s %4d ürün  %4d fiyatlı  %4d görselli  %2d kategori" % (
        hotel, name or "Oda Servisi", c["items"], c["priced"], c["image"], len({r["catPath"][0] for r in out})))

stats += room_service_list.apply(outlets)
data = {"version": 3, "currency": "USD", "outlets": outlets}
io.open(OUT, "w", encoding="utf8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
io.open(os.path.join(HERE, "img_jobs.json"), "w", encoding="utf8").write(
    json.dumps([{"src": k, "out": v} for k, v in jobs.items()], ensure_ascii=False, indent=1))
print("\n".join(stats))
print("toplam ürün:", sum(len(o["items"]) for o in outlets), " benzersiz görsel:", len(jobs))
