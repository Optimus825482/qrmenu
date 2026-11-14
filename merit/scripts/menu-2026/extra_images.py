# Pictures for the items the photo shoot left without one, from the hotel's own QR menu archive
# (D:\MERITMENULER, 08.11.2026: "<menu no>_<menu>/<category no>_<path>/<product no>_<NAME>_NN.jpg").
#
#   python extra_images.py            -> rewrites extra_images.json and prints the report
#
# A file is used only when its product name IS the item's name (same words, or a spelling variant with the
# same numbers): a wrong picture is worse than none. The outlet's own menu is searched first, then the others.
# A one-word name ("PORTAKAL", "VANİLYA") names a flavour of whatever its category sells, so it also needs the
# archive category to share a word with the item's own; the hookah flavours are never used.
# The archive fills products that have no photo with a placeholder (the hotel logo, a camera icon): a file whose
# content stands for PLACEHOLDER_NAMES or more different products is one, and is skipped.
# build_dataset.py applies extra_images.json to the items that still have no picture.
import collections, hashlib, io, json, os, re, sys
from room_service_list import find, norm

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = r"D:\MERITMENULER"
OUT = os.path.join(HERE, "extra_images.json")
DATASET = os.path.join(HERE, "..", "..", "prisma", "seed", "data", "merit-menus.json")

# outlet key -> menu numbers of the archive, own menu first
MENUS = {
    "DIAMOND|": ["1067"], "ROYAL|": ["808"], "PREMIUM|": ["1068"],
    "DIAMOND|Diamond Lobby Bar": ["924", "925"], "ROYAL|Royal Lobby Bar": ["924"], "PREMIUM|Premium Lobby Bar": ["925"],
    "DIAMOND|Diamond Pool Bar": ["1075", "30000283"], "PREMIUM|Premium Pool Bar": ["1076"],
    "ROYAL|Blue Sea Beach Bar": ["921", "920", "30000301"], "ROYAL|The Roof Garden": ["926"],
    "DIAMOND|Tea Lounge": ["922"], "PREMIUM|Cafe Verde": ["923"], "DIAMOND|Whiskey Lounge": ["1073"],
    "DIAMOND|The Steakhouse": ["944"], "ROYAL|Royal Mandarin": ["1079"], "ROYAL|Bella Merit": ["1080"],
}
# Pictures of the photo shoot (img_match.SRC) that belong to an item the name matcher could not pair, chosen by
# hand: outlet key -> {item name, or "name|category" where the outlet has the name more than once: file}.
# Written to extra_images.json with the "docs:" prefix.
MANUAL = {
    "DIAMOND|Diamond Pool Bar": {
        "PORTAKAL|FRESH MEYVE SUYU": "1-İÇECEKLER/OTEL ÇEKİM SUNUM İÇECEKLER/Diamond çekim/75 fresh portakal suyu.jpg",
        "ENGLISH BREAKFAST TEA": "12-RONNEFELDT ÇAYLAR/RONNEFELDT SALLAMA/ENGLISH BREAKFAST.jpg",
    },
    "ROYAL|Blue Sea Beach Bar": {
        "PORTAKAL|FRESH MEYVE SUYU": "1-İÇECEKLER/OTEL ÇEKİM SUNUM İÇECEKLER/royal&prm/75 fresh portakal suyu.jpg",
        "ENGLISH BREAKFAST TEA": "12-RONNEFELDT ÇAYLAR/RONNEFELDT SALLAMA/ENGLISH BREAKFAST.jpg",
    },
    "DIAMOND|Tea Lounge": {"NANE & PEPPERMINT": "12-RONNEFELDT ÇAYLAR/RONNEFELDT SALLAMA/PEPPERMINT.jpg"},
    "PREMIUM|Cafe Verde": {"NANE & PEPPERMINT": "12-RONNEFELDT ÇAYLAR/RONNEFELDT SALLAMA/PEPPERMINT.jpg"},
    "PREMIUM|Premium Pool Bar": {
        "Lahmacun": "8-BLUE SEA SNACK GÖRSELLER/lahmacun.jpeg",
        "Mevsim Meyveleri": "6-ROOM SERVİS MENÜ GÖRSELLER/MEVSİM MEYEVLERİ.jpeg",
        "Dondurma": "1-İÇECEKLER/OTEL ÇEKİM SUNUM İÇECEKLER/royal&prm/39 dondurma.jpg",
    },
}
PLACEHOLDER_NAMES = 4
# Placeholders too rare to be caught by the count (file names).
SKIP_FILES = {"46761_IL DELIZIOSO GELATO ROYAL_'S_01.jpg"}
PRODUCT = re.compile(r"^\d+_(.+)_(\d\d)\.(jpe?g|png)$", re.I)


def outlet_key(outlet):
    return "%s|%s" % (outlet["hotelCode"], outlet["outletName"] or "")


def archive():
    """menu no -> {normalized product name: [(path relative to SRC, normalized category)]}, first pictures only."""
    out, used = {}, collections.defaultdict(set)
    for menu in sorted(os.listdir(SRC)):
        no = menu.split("_")[0]
        root = os.path.join(SRC, menu)
        if not os.path.isdir(root) or not no.isdigit():
            continue
        names = out.setdefault(no, {})
        for base, _, files in os.walk(root):
            cat = norm(re.sub(r"^\d+_", "", os.path.basename(base)))
            if "nargile" in cat:
                continue
            for f in sorted(files):
                m = PRODUCT.match(f)
                if m and m.group(2) == "01" and f not in SKIP_FILES:
                    full = os.path.join(base, f)
                    digest = hashlib.md5(io.open(full, "rb").read()).hexdigest()
                    used[digest].add(norm(m.group(1)))
                    names.setdefault(norm(m.group(1)), []).append((os.path.relpath(full, SRC), cat, digest))
    for names in out.values():
        for key in list(names):
            names[key] = [(rel, cat) for rel, cat, digest in names[key] if len(used[digest]) < PLACEHOLDER_NAMES]
            if not names[key]:
                del names[key]
    return out


def pick(item, names):
    """The picture of `item` among `names`, or None."""
    found = find(item["name"], names)
    if not found:
        return None
    if len(norm(item["name"]).split()) > 1:
        return found[0][0]
    words = {w for c in item["catPath"] for w in norm(c).split() if len(w) > 3}
    return next((rel for rel, cat in found if words & set(cat.split())), None)


def main():
    data = json.load(io.open(DATASET, encoding="utf8"))
    arch = archive()
    shoot = {j["out"] for j in json.load(io.open(os.path.join(HERE, "img_jobs.json"), encoding="utf8"))}
    everything = {}
    for names in arch.values():
        for k, v in names.items():
            everything.setdefault(k, []).extend(v)
    result, report = {}, []
    for outlet in data["outlets"]:
        key = outlet_key(outlet)
        own = {}
        for no in MENUS[key]:
            for k, v in arch.get(no, {}).items():
                own.setdefault(k, []).extend(v)
        hit, miss = {}, []
        for item in outlet["items"]:
            # A picture of the photo shoot stays; one this script supplied earlier is matched again.
            if item["imageUrl"] and os.path.basename(item["imageUrl"]) in shoot:
                continue
            manual = MANUAL.get(key, {})
            by_hand = manual.get("%s|%s" % (item["name"], item["catPath"][-1])) or manual.get(item["name"])
            if by_hand:
                hit["%s|%s" % (item["name"], item["catPath"][-1])] = "docs:" + by_hand
                continue
            rel = pick(item, own) or pick(item, everything)
            if rel:
                hit[item["name"]] = rel.replace("\\", "/")
            else:
                miss.append(item["name"])
        result[key] = hit
        report.append("%-28s %3d eşleşti, %3d yok: %s" % (key, len(hit), len(miss), "; ".join(miss)))
    io.open(OUT, "w", encoding="utf8", newline="\n").write(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    sys.stdout.reconfigure(encoding="utf8")
    print("\n".join(report))
    for key, hit in result.items():
        for name, rel in hit.items():
            print("  %s | %s -> %s" % (key, name, rel))


if __name__ == "__main__":
    main()
