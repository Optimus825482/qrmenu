# Drink prices of the hotel's 2025-26 beverage menus (the "İçecek Menüleri Fiyatlı" workbook, $ prices).
#
#   python excel_prices.py <workbook.xlsx>   -> rewrites menu_json/excel_prices.json (needs openpyxl)
#
# build_dataset.py calls apply() last: every drink of an outlet that its beverage sheet lists takes the sheet's
# price, and write_report() records each match with the sheet row it came from.
#
# Which column is the price:
#   - A spirit is priced Single (C, 5 cl), Double (D, 8 cl) and bottle (E, 70 or 100 cl). The menu carries one
#     price per item and states "5 cl", so the Single column is used. Double and bottle prices are not on the menu.
#   - A wine is priced by the glass (C, a few wines only) and by the bottle (D). The menu lists such a wine twice,
#     "(Kadeh)" and "(Şişe)": each takes its own column, and a glass item never takes a bottle price.
# Dishes keep the price they have: the workbook's food sheets are not applied.
import csv, difflib, io, json, os, re, sys, unicodedata
from room_service_list import norm, find, same_product

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "menu_json", "excel_prices.json")

# Sheet of the workbook -> the outlets it prices (outlet name; None is the hotel's room service).
SHEETS = {
    "2025 IN ROOM DINING BEV. MENU": [("DIAMOND", None), ("ROYAL", None), ("PREMIUM", None)],
    "2025-26 LOBBY BARS MENU": [("DIAMOND", "Diamond Lobby Bar"), ("ROYAL", "Royal Lobby Bar"), ("PREMIUM", "Premium Lobby Bar")],
    "2025-26 BEACH BEVERAGE MENU": [("ROYAL", "Blue Sea Beach Bar"), ("DIAMOND", "Diamond Pool Bar")],
    "2025-26 THE ROOF GARDEN": [("ROYAL", "The Roof Garden")],
    "2025-26 WHISKEY LOUNGE": [("DIAMOND", "Whiskey Lounge")],
    "2025-26 WHISKEY COCKTAIL MENU": [("DIAMOND", "Whiskey Lounge")],
    "2025-26 TEA LOUNGE MENU": [("DIAMOND", "Tea Lounge")],
    "2025-26 CAFE VERDE PREMIUM": [("PREMIUM", "Cafe Verde")],
    "2025-26 ROYALS WINE MENU": [("ROYAL", "Royal Mandarin"), ("ROYAL", "Bella Merit"), ("DIAMOND", "The Steakhouse")],
}
WINE_SHEET = "2025-26 ROYALS WINE MENU"
MASTER_SHEET = "2025-26 BEVERAGES"
COUNTRIES = {"france", "italy", "turkiye", "spain", "portugal", "argentina", "chile", "new zealand", "germany",
             "australia", "south africa", "usa", "greece", "lebanon", "georgia"}
# A sheet price below this share of the item's current price is held back for the hotel to confirm.
HOLD_BELOW = 0.6
# Erkan, 14.11.2026: the workbook is the reference, so a doubtful price is applied too (he confirmed the 27 rows). It stays marked in the
# report for the hotel to confirm; True keeps the current price of such an item instead.
HOLD = False
# Held prices the hotel confirmed: (hotel, outlet as reported, item name).
HOLD_OK = set()


def parts(text):
    """Names a line of a sheet stands for: the line, and its Turkish and English halves ("SU / WATER 330 ml.")."""
    text = unicodedata.normalize("NFKC", text)
    out = [text] + [p for p in re.split(r"\s+/\s*|\s*/\s+|/(?=[A-ZÇĞİÖŞÜ])", text) if p.strip()]
    return [n for n in dict.fromkeys(norm(p) for p in out) if n]


def usd(cell):
    v = cell.value
    return round(v, 2) if isinstance(v, (int, float)) and "$" in (cell.number_format or "") and v else None


def extract(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    sheets = {}
    for title in SHEETS:
        wine = title == WINE_SHEET
        lines = []
        for r in wb[title].iter_rows(min_col=2, max_col=5):
            text = r[0].value
            if isinstance(text, str) and text.strip():
                heads = [c.value.strip().upper() for c in r[1:4] if isinstance(c.value, str)]
                lines.append({"row": r[0].row, "text": " ".join(text.split()), "c": usd(r[1]), "d": usd(r[2]), "e": usd(r[3]),
                              "header": any(h in ("PRICE", "SINGLE", "DOUBLE", "GLASS") for h in heads)})
        rows, section, last = [], "", None
        for i, ln in enumerate(lines):
            priced = ln["c"] is not None or ln["d"] is not None
            alone = (i == 0 or lines[i - 1]["row"] != ln["row"] - 1) and (i + 1 == len(lines) or lines[i + 1]["row"] != ln["row"] + 1)
            if ln["header"] or (not priced and alone):
                # A heading: marked by its column titles, or a line standing alone between blank rows. On the wine
                # sheet a country ("france") sits under the heading of the wine kind and does not replace it.
                if not (wine and norm(ln["text"]) in COUNTRIES):
                    section = ln["text"]
                last = None
                continue
            if priced:
                last = {"sheet": title, "section": section, "row": ln["row"], "text": ln["text"], "names": parts(ln["text"]),
                        "single": None if wine else ln["c"], "double": None if wine else ln["d"], "bottle": ln["d"] if wine else ln["e"],
                        "glass": ln["c"] if wine else None, "tokens": [], "detail": ""}
                rows.append(last)
                if "," in ln["text"] and "/" not in ln["text"]:
                    last["tokens"] += [norm(t) for t in ln["text"].split(",") if norm(t)]
            elif last is not None:
                # The lines under a priced line: its flavours ("ANANAS, DOMATES, ...") each sell at that line's
                # price; on the wine sheet the line is the grape and region, which tells two wines of a name apart.
                last["detail"] = (last["detail"] + " " + ln["text"]).strip()
                if "," in ln["text"] and not wine:
                    last["tokens"] += [norm(t) for t in ln["text"].split(",") if norm(t)]
        # A heading whose only priced lines are flavour lists at one price is itself the item ("MILKSHAKES").
        by_section = {}
        for r in rows:
            by_section.setdefault(r["section"], []).append(r)
        for section, rs in by_section.items():
            if section and not wine and all(r["tokens"] and "," in r["text"] for r in rs) and len({r["single"] for r in rs}) == 1:
                rows.append(dict(rs[0], names=parts(section), tokens=[], text=section + " ← " + rs[0]["text"], title=True))
        sheets[title] = rows
    # The cost chart every menu sheet was priced from: name, and $ per single, double, 70 cl and 100 cl bottle.
    master, section = [], ""
    for r in wb[MASTER_SHEET].iter_rows(min_row=4, max_col=14):
        name = r[0].value
        if not isinstance(name, str) or not name.strip():
            continue
        k = usd(r[10])
        if k is None and not isinstance(r[10].value, (int, float)):
            section = name.strip()
            continue
        master.append({"section": section, "row": r[0].row, "name": " ".join(name.split()), "single": k, "double": usd(r[11]),
                       "bottle70": usd(r[12]), "bottle100": usd(r[13])})
    data = {"source": os.path.basename(path), "sheets": sheets, "master": master}
    io.open(DATA, "w", encoding="utf8", newline="\n").write(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
    return data


_SECTION = {}


def in_section(row, item):
    """The sheet line sits under the item's category (either language, any level; spelling variants allowed)."""
    if not row["section"]:
        return False
    key = (row["section"], tuple(item["catPath"]), tuple(item.get("catPathEn", [])))
    if key not in _SECTION:
        cats = {norm(c) for c in item["catPath"] + item.get("catPathEn", [])}
        _SECTION[key] = any(s == c or difflib.SequenceMatcher(None, s, c).ratio() >= 0.8 for s in parts(row["section"]) for c in cats)
    return _SECTION[key]


DRINK_WORDS = ("icecek", "sarap", "wine", "kokteyl", "cocktail")


def is_drink(item, sections):
    """The item's category is one the beverage sheets price (a dish is outside the workbook's drink sheets)."""
    cats = [norm(c) for c in item["catPath"] + item.get("catPathEn", [])]
    return any(w in c for w in DRINK_WORDS for c in cats) or any(in_section({"section": s}, item) for s in sections)


VARIANT = re.compile(r"\s*\((Kadeh|Glass|Şişe|Bottle)\)\s*$", re.I)


def variant_of(item):
    """(name without its measure, "glass" | "bottle" | None) of a menu item."""
    m = VARIANT.search(item["name"])
    if not m:
        return item["name"], None
    return item["name"][:m.start()], "glass" if m.group(1).lower() in ("kadeh", "glass") else "bottle"


def column(row, variant):
    """(price, column label) a menu item takes from a sheet line."""
    if row["sheet"] == WINE_SHEET:
        return (row["glass"], "C kadeh") if variant == "glass" else (row["bottle"], "D şişe")
    if variant == "bottle":
        return row["bottle"], "E şişe"
    if row["single"] is not None:
        return row["single"], "C single"
    return row["double"], "D (yalnız Double sütunu dolu)"


def match(item, rows):
    """The sheet line of a menu item. -> (row, how) | (None, why)."""
    base, variant = variant_of(item)
    en = VARIANT.sub("", item.get("nameEn") or "")
    names = [n for n in dict.fromkeys(norm(x) for x in (base, en)) if n]

    def one(pool, how):
        """The line of `pool`, if its lines agree on the price the item would take."""
        prices = {column(r, variant)[0] for r in pool}
        if len(prices) == 1:
            return pool[0], how
        # Two lines of one name (CLOUDY BAY, a Sauvignon Blanc and a Chardonnay): the text under the line decides.
        text = norm(item.get("detail") or "")
        scored = sorted(((difflib.SequenceMatcher(None, text, norm(r["detail"])).ratio(), i) for i, r in enumerate(pool)), reverse=True) if text else []
        if scored and scored[0][0] >= 0.6 and scored[0][0] - scored[1][0] >= 0.15:
            return pool[scored[0][1]], how + " + açıklama"
        return None, "belirsiz: Excel'de %s" % ", ".join("satır %d = %s $" % (r["row"], _money(column(r, variant)[0])) for r in pool)

    wine = bool(rows) and rows[0]["sheet"] == WINE_SHEET and any(r["sheet"] == WINE_SHEET for r in rows)
    for scoped in (True, False):
        pool = [r for r in rows if (not scoped or in_section(r, item)) and any(n in r["names"] for n in names)]
        if pool:
            return one(pool, "ad" if scoped else "ad (başka bölüm)")
    if wine:
        # The menu names a wine by its house ("SARAFİN") and gives the grape in the text; the sheet writes both
        # ("SARAFİN CABERNET SAUVIGNON"). The grape picks the line among the house's wines of that kind.
        grape = norm((item.get("detail") or "").split("/")[0])
        pool = [r for r in rows if in_section(r, item) and any(n and r["names"][0].startswith(n + " ") for n in names)]
        exact = [r for r in pool if any(r["names"][0] == ("%s %s" % (n, grape)).strip() for n in names)]
        if exact:
            return one(exact, "ad + üzüm")
        close = [r for r in pool if grape and set(r["names"][0].split()) - set(names[0].split()) <= set(grape.split())]
        if close:
            return one(close, "ad + üzüm")
        full = [r for r in rows if in_section(r, item) and any(r["names"][0].startswith(n + " ") or n.startswith(r["names"][0] + " ") for n in names)]
        if len(full) == 1:
            return full[0], "ad (kısaltılmış)"
    # A flavour of a priced line: under the item's category, or under the line that names the category.
    pool = [r for r in rows if any(n in r["tokens"] for n in names) and (in_section(r, item) or in_section({"section": r["text"]}, item))]
    if pool:
        return one(pool, "çeşit")
    # A spelling variant of the name (same numbers, no word replaced), in the item's category first.
    for scoped in (True, False):
        by_norm = {}
        for r in rows:
            if not scoped or in_section(r, item):
                for n in r["names"]:
                    by_norm.setdefault(n, []).append(r)
        for n in names:
            got = find(n, by_norm)
            if got:
                return one(got, "yakın ad" if scoped else "yakın ad (başka bölüm)")
    return None, "Excel sayfasında yok"


def apply(outlets):
    """Prices the drinks of every outlet from its sheets. -> (report lines, audit rows)."""
    data = json.load(io.open(DATA, encoding="utf8"))
    by_outlet = {}
    for title, targets in SHEETS.items():
        for key in targets:
            by_outlet.setdefault(key, []).extend(data["sheets"].get(title, []))
    master = {}
    for m in data["master"]:
        master.setdefault(norm(m["name"]), []).append(m)
    sections = sorted({r["section"] for rows in data["sheets"].values() for r in rows if r["section"]})
    # Product -> price -> the sheets that carry it (how many menus agree on a price).
    agree = {}
    for title, rows in data["sheets"].items():
        for r in rows:
            p = column(r, None)[0]
            if title != WINE_SHEET and p is not None:
                agree.setdefault(r["names"][0], {}).setdefault(p, set()).add(title)
    report, audit = [], []
    for outlet in outlets:
        rows = by_outlet.get((outlet["hotelCode"], outlet["outletName"]))
        if not rows:
            continue
        label = outlet["outletName"] or "Oda Servisi"
        used, count = set(), {}
        for item in outlet["items"]:
            if not is_drink(item, sections):
                continue
            row, how = match(item, rows)
            old = item["price"]
            a = {"hotel": outlet["hotelCode"], "outlet": label, "category": " > ".join(item["catPath"]), "name": item["name"],
                 "old": old, "new": old, "how": how, "row": row, "col": "", "note": ""}
            audit.append(a)
            if row is None:
                a["status"] = "eşleşmedi" if how.startswith("Excel") else "belirsiz"
            else:
                used.add((row["sheet"], row["row"]))
                price, a["col"] = column(row, variant_of(item)[1])
                m = master_of(row, master)
                a["note"] = master_note(row, m)
                # The sheet stands alone against the cost chart: the chart and the menu's current price agree, and
                # fewer than three menu sheets carry the sheet's price for this product.
                lone = (m is not None and m["single"] is not None and price is not None and old is not None
                        and abs(m["single"] - old) < 0.005 and abs(m["single"] - price) > 0.5
                        and sum(1 for t in agree.get(row["names"][0], {}).get(price, ())) < 3)
                if price is None:
                    a["status"], a["how"] = "eşleşmedi", "Excel satırında bu ölçünün fiyatı yok"
                elif old is not None and abs(old - price) < 0.005:
                    a["status"] = "aynı"
                elif HOLD and (outlet["hotelCode"], label, item["name"]) not in HOLD_OK and old is not None and (price < old * HOLD_BELOW or lone):
                    # A cut this deep, or a price only this sheet carries against the cost chart, is more likely a
                    # slip of the sheet (LAGAVULIN 16 at 10 $ on the beach) than a decision.
                    a["status"], a["excel"] = "bekletildi", price
                    a["why"] = "maliyet tablosu ve mevcut fiyat aynı, yalnız bu sayfa farklı" if lone else "mevcut fiyatın %%%d'inin altında" % (HOLD_BELOW * 100)
                else:
                    a["status"], a["new"] = ("yeni" if old is None else "değişti"), price
                    item["price"] = price
                    if old is not None and (price < old * HOLD_BELOW or lone):
                        a["doubt"] = "maliyet tablosu ve eski fiyat aynı, yalnız bu sayfa farklı" if lone else "eski fiyatın %%%d'inin altında" % (HOLD_BELOW * 100)
            count[a["status"]] = count.get(a["status"], 0) + 1
        # Lines of the sheets that no item of this menu took: drinks the hotel sells here and the menu lacks.
        for r in rows:
            if (r["sheet"], r["row"]) not in used and not r.get("title"):
                audit.append({"hotel": outlet["hotelCode"], "outlet": label, "category": r["section"], "name": r["text"], "old": None,
                              "new": None, "how": "", "row": r, "col": "", "note": "", "status": "menüde yok"})
        report.append("%-8s %-20s excel: %s" % (outlet["hotelCode"], label, ", ".join("%d %s" % (n, s) for s, n in sorted(count.items()))))
    return report, audit


def master_of(row, master):
    """The cost chart's entry for a menu sheet line, or None."""
    if row["sheet"] == WINE_SHEET:
        return None
    for n in row["names"]:
        got = master.get(n) or find(n, master)
        if got:
            return got[0]
    return None


def master_note(row, m):
    """How a menu sheet line compares with the cost chart."""
    if row["sheet"] == WINE_SHEET:
        return ""
    if m is None:
        return "maliyet tablosunda yok"
    diffs = []
    if m["single"] is not None and row["single"] is not None and abs(m["single"] - row["single"]) > 0.5:
        diffs.append("single %s" % _money(m["single"]))
    if m["double"] is not None and row["double"] is not None and abs(m["double"] - row["double"]) > 0.5:
        diffs.append("double %s" % _money(m["double"]))
    return "ÇELİŞKİ: maliyet tablosunda (satır %d) %s $" % (m["row"], ", ".join(diffs)) if diffs else "maliyet tablosuyla aynı"


ANALIZ = os.path.join(HERE, "..", "..", "..", "docs", "analiz")
REPORT = os.path.join(ANALIZ, "2026-11-14-excel-icecek-fiyatlari.md")
REPORT_CSV = os.path.join(ANALIZ, "2026-11-14-excel-icecek-fiyatlari.csv")


def _money(v):
    return "" if v is None else ("%.2f" % v).rstrip("0").rstrip(".")


def _where(a):
    return "%s %s" % (a["hotel"].title(), a["outlet"]) if a["outlet"] == "Oda Servisi" else a["outlet"]


def _sheet(title):
    return title.replace("2025-26 ", "").replace("2025 ", "")


def _proof(row):
    """Where a price came from: sheet, row, the line and its three columns."""
    if row["sheet"] == WINE_SHEET:
        cols = "kadeh %s / şişe %s" % (_money(row["glass"]) or "—", _money(row["bottle"]) or "—")
    else:
        cols = "S %s / D %s / Ş %s" % (_money(row["single"]) or "—", _money(row["double"]) or "—", _money(row["bottle"]) or "—")
    return "%s satır %d: %s [%s]" % (_sheet(row["sheet"]), row["row"], row["text"][:60], cols)


def _table(lines, head, rows):
    lines += ["", "| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    lines += ["| " + " | ".join(str(c).replace("|", "/") for c in r) + " |" for r in rows]


def _merged(audit, key):
    """Audit rows that are the same finding on several outlets become one line naming the outlets."""
    out = {}
    for a in audit:
        out.setdefault(key(a), []).append(_where(a))
    return [k + (", ".join(dict.fromkeys(v)),) for k, v in out.items()]


def write_report(outlets, audit):
    sheets = json.load(io.open(DATA, encoding="utf8"))["sheets"]
    st = lambda s: [a for a in audit if a["status"] == s]
    matched = [a for a in audit if a["row"] is not None and a["status"] != "menüde yok"]
    L = ["# Excel içecek fiyatları ($) — eşleştirme denetimi, 14.11.2026", "",
         "Kaynak: `2025-2026 Royal & Premium & Diamond Hotel İçecek Menüleri Fiyatlı -YENİ ÇALIŞMA.xlsx` "
         "(özü `merit/scripts/menu-2026/menu_json/excel_prices.json`). Her satırın tam dökümü, Excel satır numarası ve "
         "Single / Double / şişe değerleriyle: `2026-11-14-excel-icecek-fiyatlari.csv` (noktalı virgüllü, Excel ile açılır).", "",
         "## Hangi sütun hangi fiyat", "",
         "- İçki sayfalarında başlık satırları **C = Single, D = Double, E = 70 Cl.** (aperatiflerde 100 Cl.) diyor; maliyet "
         "tablosuna (`2025-26 BEVERAGES`) göre Single 5 cl, Double 8 cl. Menüde ürün başına tek fiyat var ve oda servisinde "
         "\"5 cl\" yazıyor: **her içkide yalnız C (Single) sütunu** yazıldı. Double ve şişe fiyatı hiçbir ürüne yazılmadı.",
         "- Meşrubat, sıcak içecek, bira ve kokteyl bölümlerinde tek fiyat sütunu var (C, başlığı PRICE / GLASS).",
         "- Şarap sayfasında **C = kadeh (yalnız 15 şarapta), D = şişe**. Menüde bu şaraplar \"(Kadeh)\" ve \"(Şişe)\" diye iki "
         "ayrı ürün: kadeh ürünü C'yi, şişe ürünü ve tek satırlı şaraplar D'yi aldı. Kadeh ürününe şişe fiyatı yazılmaz.", "",
         "## Özet", ""]
    order = ["değişti", "yeni", "aynı", "bekletildi", "belirsiz", "eşleşmedi"]
    names = [o for o in dict.fromkeys(_where(a) for a in audit)]
    rows = []
    for n in names:
        mine = [a for a in audit if _where(a) == n]
        rows.append([n] + [sum(a["status"] == s for a in mine) for s in order] + [sum(a["status"] == "menüde yok" for a in mine)])
    rows.append(["**Toplam**"] + [len(st(s)) for s in order] + [len(st("menüde yok"))])
    _table(L, ["outlet", "değişti", "yeni fiyat", "zaten aynı", "bekletildi", "belirsiz", "Excel'de yok", "Excel'de var, menüde yok"], rows)
    cols = {}
    for a in matched:
        if a["status"] in ("değişti", "yeni", "aynı"):
            cols[a["col"]] = cols.get(a["col"], 0) + 1
    L += ["", "Fiyatın alındığı sütun (uygulanan + zaten aynı): " + "; ".join("%s: %d" % kv for kv in sorted(cols.items())) + ".",
          "Eşleşme türü: " + "; ".join("%s: %d" % (h, sum(a["how"] == h for a in matched)) for h in dict.fromkeys(a["how"] for a in matched)) + "."]

    doubt = [a for a in audit if a.get("doubt")]
    L += ["", "## 1. Excel esas alınarak uygulanan, önceki fiyattan çok farklı fiyatlar — Erkan 14.11.2026'da onayladı (%d satır)" % len(doubt), "",
          "Excel fiyatı eski fiyatın %%%d'inin altında, ya da yalnız bu sayfa maliyet tablosundan farklı. Excel esas alındığı için "
          "**uygulandı**; Erkan yeni fiyatların geçerli olduğunu onayladı." % (HOLD_BELOW * 100)]
    _table(L, ["kategori", "ürün", "eski", "yazılan", "neden şüpheli", "kanıt", "maliyet tablosu", "outletler"],
           _merged(doubt, lambda a: (a["category"], a["name"], _money(a["old"]), _money(a["new"]), a["doubt"], _proof(a["row"]), a["note"] or "—")))
    if st("bekletildi"):
        L += ["", "### Bekletilenler (%d satır)" % len(st("bekletildi"))]
        _table(L, ["kategori", "ürün", "mevcut", "excel", "neden bekletildi", "kanıt", "maliyet tablosu", "outletler"],
               _merged(st("bekletildi"), lambda a: (a["category"], a["name"], _money(a["old"]), _money(a["excel"]), a["why"], _proof(a["row"]), a["note"] or "—")))

    conflict = [a for a in matched if a["note"].startswith("ÇELİŞKİ") and a["status"] in ("değişti", "yeni", "aynı") and not a.get("doubt")]
    L += ["", "## 2. Menü sayfası ile maliyet tablosu çelişiyor (%d satır)" % len(conflict), "",
          "Aynı ürünün menü sayfasındaki Single fiyatı, aynı dosyadaki maliyet tablosundan farklı. Menü sayfasındaki fiyat "
          "uygulandı; hangisinin doğru olduğunu otel teyit etmeli."]
    _table(L, ["kategori", "ürün", "eski", "yazılan", "kanıt", "maliyet tablosu", "outletler"],
           _merged(conflict, lambda a: (a["category"], a["name"], _money(a["old"]) or "—", _money(a["new"]), _proof(a["row"]), a["note"])))

    L += ["", "## 3. Belirsiz: Excel aynı ürüne iki fiyat veriyor (%d satır)" % len(st("belirsiz")), "",
          "Outlet'in sayfasında aynı ad iki ayrı satırda farklı fiyatla geçiyor; hangisi olduğu seçilemediği için eski fiyat korundu."]
    _table(L, ["kategori", "ürün", "mevcut", "Excel", "outletler"],
           _merged(st("belirsiz"), lambda a: (a["category"], a["name"], _money(a["old"]) or "fiyatsız", a["how"].replace("belirsiz: ", ""))))

    loose = [a for a in matched if a["how"] not in ("ad", "ad + üzüm") or "Double" in a["col"]]
    L += ["", "## 4. Ad birebir değil: gözle kontrol edilecek eşleşmeler (%d satır)" % len(loose), "",
          "Yazım farkı, çeşit listesi, başlık satırı ya da başka bölümdeki aynı ad üzerinden kurulan eşleşmeler."]
    _table(L, ["kategori", "menüdeki ürün", "eşleşme", "Excel satırı", "sütun", "eski", "yeni", "durum", "outletler"],
           _merged(loose, lambda a: (a["category"], a["name"], a["how"], _proof(a["row"]), a["col"], _money(a["old"]) or "—", _money(a["new"]), a["status"])))

    changed = st("değişti") + st("yeni")
    L += ["", "## 5. Uygulanan değişiklikler (%d satır)" % len(changed)]
    _table(L, ["kategori", "ürün", "eski", "yeni", "sütun", "Excel satırı", "outletler"],
           _merged(changed, lambda a: (a["category"], a["name"], _money(a["old"]) or "—", _money(a["new"]), a["col"], _proof(a["row"]))))

    # Where the outlet's own sheet has no price, the same item on another sheet hints at one (not applied).
    def elsewhere(a):
        found = {}
        for title, rows in sheets.items():
            for r in rows:
                if norm(VARIANT.sub("", a["name"])) in r["names"] and r["single"] is not None:
                    found.setdefault(r["single"], []).append(_sheet(title))
        return "; ".join("%s $ (%s)" % (_money(p), ", ".join(sorted(set(t)))) for p, t in sorted(found.items()))
    kept = [a for a in st("eşleşmedi") if a["old"] is not None]
    L += ["", "## 6. Excel'de karşılığı yok, eski fiyatı duruyor (%d satır)" % len(kept), "",
          "Outlet'in Excel sayfasında bu ürün (ya da bu ölçünün fiyatı) yok; fiyat önceki kaynaktan (Micros / otel listesi) kaldı."]
    _table(L, ["kategori", "ürün", "duran fiyat", "neden", "başka sayfada (Single)", "outletler"],
           _merged(kept, lambda a: (a["category"], a["name"], _money(a["old"]), a["how"], elsewhere(a))))

    priced = {(a["hotel"], a["outlet"], a["category"], a["name"]): a for a in audit if a["status"] != "menüde yok"}
    unpriced = []
    for o in outlets:
        for r in o["items"]:
            if r["price"] is None:
                a = priced.get((o["hotelCode"], o["outletName"] or "Oda Servisi", " > ".join(r["catPath"]), r["name"]))
                unpriced.append({"hotel": o["hotelCode"], "outlet": o["outletName"] or "Oda Servisi", "category": " > ".join(r["catPath"]),
                                 "name": r["name"], "why": a["how"] if a else "içecek sayfası kapsamında değil (yemek)",
                                 "hint": elsewhere({"name": r["name"]}) if a else ""})
    L += ["", "## 7. Fiyatsız kalan ürünler (%d satır)" % len(unpriced), "",
          "\"başka sayfada\" sütunu yalnız öneridir, uygulanmadı."]
    _table(L, ["outlet", "kategori", "ürün", "neden", "başka sayfada (Single)"],
           [(_where(u), u["category"], u["name"], u["why"], u["hint"]) for u in unpriced])

    missing = st("menüde yok")
    L += ["", "## 8. Excel'de fiyatı var, menüde ürünü yok (%d satır)" % len(missing), "",
          "Outlet'in Excel sayfasındaki bu satırları menüdeki hiçbir ürün almadı. Menüye eklenmedi."]
    _table(L, ["bölüm", "Excel satırı", "outletler"], _merged(missing, lambda a: (a["category"], _proof(a["row"]))))
    io.open(REPORT, "w", encoding="utf8", newline="\n").write("\n".join(L) + "\n")

    with io.open(REPORT_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["otel", "outlet", "kategori", "ürün", "durum", "eski_fiyat", "yeni_fiyat", "bekleyen_excel_fiyatı", "eşleşme", "sütun",
                    "excel_sayfa", "excel_satır", "excel_bölüm", "excel_metin", "single_ya_da_kadeh", "double", "şişe", "not"])
        for a in audit:
            r = a["row"] or {}
            w.writerow([a["hotel"], a["outlet"], a["category"], a["name"], a["status"], _money(a["old"]), _money(a["new"]),
                        _money(a.get("excel")), a["how"], a["col"], _sheet(r["sheet"]) if r else "", r.get("row", ""), r.get("section", ""),
                        r.get("text", ""), _money(r.get("glass") if r.get("sheet") == WINE_SHEET else r.get("single")) if r else "",
                        _money(r.get("double")) if r else "", _money(r.get("bottle")) if r else "", a["note"]])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf8")
    d = extract(sys.argv[1])
    print("\n".join("%-34s %4d fiyatlı satır" % (k, len(v)) for k, v in d["sheets"].items()))
    print("maliyet tablosu: %d ürün" % len(d["master"]), "->", DATA)
