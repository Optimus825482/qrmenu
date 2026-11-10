# Category clean-up applied to one outlet's rows after pricing, image matching and spelling:
# the hotel's documents are kept, but headings are made consistent across the outlets and a category never mixes
# loose items with sub-headings.

# category heading (as it leaves spelling.py) -> (Turkish, English)
CATEGORY_NAMES = {
    "ATISTIRMALIKLAR": ("ATIŞTIRMALIKLAR", "SNACKS"),
    # Premium pool snack document (mixed case, loose English)
    "Çorbalar": ("ÇORBALAR", "SOUPS"),
    "Tost": ("TOSTLAR", "TOASTS"),
    "Sandviç": ("SANDVİÇLER", "SANDWICHES"),
    "Salatalar": ("SALATALAR", "SALADS"),
    "Kızartmalar": ("KIZARTMALAR", "FRIED SNACKS"),
    "Burger ve sıcak atıştırmalıklar": ("BURGER & SICAK ATIŞTIRMALIKLAR", "BURGERS & HOT SNACKS"),
    "Makarnalar": ("MAKARNALAR", "PASTAS"),
    "Pizza": ("PİZZALAR", "PIZZAS"),
    "Pide Çeşitleri": ("PİDELER", "PIDE & FLATBREADS"),
    "BOWLLAR": ("BOWLLAR", "BOWLS"),
    "Ana Yemekler": ("ANA YEMEKLER", "MAIN COURSES"),
    "Tatlı": ("TATLILAR", "DESSERTS"),
}
ENGLISH_NAMES = {"HOT BEVERAGES": "HOT DRINKS"}

FROZEN = ("SOĞUK LEZZETLER", "FROZEN TREATS")
# (category, item) -> new category (Turkish, English); None as item = every item of that category
MOVES = {
    ("SOĞUK KAHVELER", "FRUIT FROZENS"): FROZEN,
    ("SOĞUK KAHVELER", "MILKSHAKES"): FROZEN,
    ("SOĞUK KAHVELER", "SMOOTHIES"): FROZEN,
    ("ROYAL DONDURMA", None): FROZEN,
    ("MEŞRUBATLAR", "TAZE DEMLEME BİTKİ ÇAYLARI"): ("SICAK İÇECEKLER", "HOT DRINKS"),
    ("MEŞRUBATLAR", "3. NESİL KAHVELER"): ("SICAK İÇECEKLER", "HOT DRINKS"),
}
# (category, the category it must directly follow); first match that exists wins
PLACE_AFTER = [
    ("SOĞUK LEZZETLER", ["EV YAPIMI SOĞUK ÇAYLAR", "SOĞUK KAHVELER"]),
    ("ROMLAR", ["CİNLER"]),
]


def restructure(rows):
    # 1. names
    for r in rows:
        tr, en = list(r["catPath"]), list(r["catPathEn"])
        for i, name in enumerate(tr):
            if name in CATEGORY_NAMES:
                tr[i], en[i] = CATEGORY_NAMES[name]
            en[i] = ENGLISH_NAMES.get(en[i], en[i])
        r["catPath"], r["catPathEn"] = tr, en

    # 2. moves
    for r in rows:
        top = r["catPath"][0]
        target = MOVES.get((top, r["name"])) or MOVES.get((top, None))
        if target:
            r["catPath"], r["catPathEn"] = [target[0]], [target[1]]

    # 3. a category with loose items keeps no sub-headings: each sub-heading becomes a category right after it
    loose = {r["catPath"][0] for r in rows if len(r["catPath"]) == 1}
    order, promoted = [], {}
    for r in rows:
        top = r["catPath"][0]
        if top not in order:
            order.append(top)
        if len(r["catPath"]) > 1 and top in loose:
            sub = r["catPath"][1]
            promoted.setdefault(top, [])
            if sub not in promoted[top]:
                promoted[top].append(sub)
            r["catPath"], r["catPathEn"] = r["catPath"][1:], r["catPathEn"][1:]
    for top, subs in promoted.items():
        at = order.index(top) + 1
        for sub in subs:
            if sub in order:          # the document repeats the heading further down: merge into one
                order.remove(sub)
                at = order.index(top) + 1 + subs.index(sub)
            order.insert(min(at, len(order)), sub)
            at += 1
    for r in rows:
        if r["catPath"][0] not in order:
            order.append(r["catPath"][0])

    # 4. order rules
    for cat, anchors in PLACE_AFTER:
        if cat in order:
            anchor = next((a for a in anchors if a in order), None)
            if anchor:
                order.remove(cat)
                order.insert(order.index(anchor) + 1, cat)
    signature = next((c for c in order if "İMZA KOKTEYL" in c), None)
    world = "ULUSLARARASI KOKTEYLLER"
    if signature and world in order:
        at = min(order.index(signature), order.index(world))
        order.remove(signature)
        order.remove(world)
        order[at:at] = [signature, world]

    # 5. regroup in category order, sub-headings in their own first-seen order, duplicates merged
    out, seen = [], {}
    sub_order = {}
    for r in rows:
        sub_order.setdefault(r["catPath"][0], [])
        key = tuple(r["catPath"][1:])
        if key not in sub_order[r["catPath"][0]]:
            sub_order[r["catPath"][0]].append(key)
    for cat in order:
        for sub in sub_order.get(cat, []):
            for r in rows:
                if r["catPath"][0] != cat or tuple(r["catPath"][1:]) != sub:
                    continue
                key = (cat, sub, r["name"])
                if key in seen:       # same item listed twice after a merge: keep the fuller record
                    kept = seen[key]
                    for field in ("price", "imageUrl", "detail", "detailEn"):
                        if kept[field] is None and r[field] is not None:
                            kept[field] = r[field]
                    continue
                seen[key] = r
                out.append(r)
    # one English name per category heading
    english = {}
    for r in out:
        for tr, en in zip(r["catPath"], r["catPathEn"]):
            english.setdefault(tr, en)
    for r in out:
        r["catPathEn"] = [english[tr] for tr in r["catPath"]]
    return out
