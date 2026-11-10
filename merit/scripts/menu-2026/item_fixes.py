# Item-level corrections for the two documents the first spelling pass did not cover (Premium pool snack menu,
# room service). Keyed by the document's Turkish name: (Turkish, English[, Turkish detail, English detail]).
ITEMS = {
    # --- Premium pool
    "Royal tost": ("Royal Tost", "Royal Toast"),
    "Cyprus tost": ("Kıbrıs Tostu", "Cyprus Toast"),
    "Panini tost": ("Panini Tost", "Panini Toast"),
    "Avşar tost": ("Avşar Tost", "Avşar Toast"),
    "Ayvalık tost": ("Ayvalık Tostu", "Ayvalık Toast"),
    "Mozarella caprice sandwich": ("Mozzarella Caprese Sandviç", "Mozzarella Caprese Sandwich"),
    "Italian Tuna": ("İtalyan Ton Balıklı Sandviç", "Italian Tuna Sandwich"),
    "Antioksidanlı yeşil salata": ("Antioksidanlı Yeşil Salata", "Antioxidant Green Salad"),
    "Ton balıklı salata": ("Ton Balıklı Salata", "Tuna Salad"),
    "Çoban salatası": ("Çoban Salatası", "Shepherd’s Salad"),
    "Kınoa Tabulleh": ("Kinoalı Tabule", "Quinoa Tabbouleh"),
    "Izgara Levrek Salatası": ("Izgara Levrek Salatası", "Grilled Sea Bass Salad"),
    "Enginar Kalpli Kıbrıs Salatası": ("Enginar Kalpli Kıbrıs Salatası", "Cyprus Salad with Artichoke Hearts"),
    "Peynirli Sigara böreği": ("Peynirli Sigara Böreği", "Cheese Pastry Rolls"),
    "Patates kızartması": ("Patates Kızartması", "French Fries"),
    "Piliç Finger": ("Piliç Finger", "Chicken Fingers"),
    "Kalamar Tava": ("Kalamar Tava", "Fried Calamari"),
    "Chicken buffalo wings": ("Buffalo Soslu Tavuk Kanat", "Buffalo Chicken Wings"),
    "Tavuklu Quesadilla": ("Tavuklu Quesadilla", "Chicken Quesadilla"),
    "Dana Etli Buritto": ("Dana Etli Burrito", "Beef Burrito"),
    "Kıtır Commo Tabağı": ("Çıtır Kombo Tabağı", "Crispy Combo Platter"),
    "Spagetti Bolonez": ("Spagetti Bolonez", "Spaghetti Bolognese"),
    "Spagetti Napoliten": ("Spagetti Napoliten", "Spaghetti Napoletana"),
    "Fusulli A La Pesto": ("Fusilli al Pesto", "Fusilli al Pesto"),
    "Penne Arabiatta": ("Penne Arrabbiata", "Penne Arrabbiata"),
    "Mantar soslu Tavuklu Tagliatelli": (
        "Mantar Soslu Tavuklu Tagliatelle", "Chicken Tagliatelle with Mushroom Sauce",
        "Şarap soslu, kremalı, mantarlı ve tavuklu tagliatelle",
        "Tagliatelle with wine sauce, cream, chicken and mushrooms"),
    "Türkmen mantısı": ("Türkmen Mantısı", "Turkmen Dumplings"),
    "Mac and cheese": ("Mac and Cheese", "Mac and Cheese"),
    "PIZZA ROYAL": ("Pizza Royal", "Pizza Royal"),
    "PIZZA PEPERONİ": ("Pizza Pepperoni", "Pizza Pepperoni"),
    "PIZZA FORMAGGİ": ("Pizza Quattro Formaggi", "Pizza Quattro Formaggi"),
    "PIZZA MARGARİTA": ("Pizza Margherita", "Pizza Margherita"),
    "PIZZA CHICKEN CALZONE": ("Tavuklu Calzone", "Chicken Calzone"),
    "SARIMSAKLI TEREYAĞLI EKMEK": ("Sarımsaklı Tereyağlı Ekmek", "Garlic Butter Bread"),
    "Konya Etli Ekmek": ("Konya Etli Ekmek", "Konya-Style Meat Flatbread"),
    "Kıymalı Kır Pidesi": ("Kıymalı Kır Pidesi", "Minced Meat Pide"),
    "Peynirli Pide": ("Peynirli Pide", "Cheese Pide"),
    "Kuşbaşılı Kaşarlı Pide": ("Kuşbaşılı Kaşarlı Pide", "Diced Beef and Cheese Pide"),
    "Tekirdağ bowl": ("Tekirdağ Bowl", "Tekirdağ Meatball Bowl"),
    "Sea bass bowl": ("Levrek Bowl", "Sea Bass Bowl"),
    "Peri peri bowl": ("Peri Peri Bowl", "Peri Peri Chicken Bowl"),
    "Kuzu şiş": ("Kuzu Şiş", "Lamb Skewer"),
    "Piliç Külbastı": ("Piliç Külbastı", "Chicken Cutlet"),
    "Piliç Şinitsel": (
        "Piliç Şnitzel", "Chicken Schnitzel",
        "Hardallı patates salatası, sote sebzeler, tereyağlı acı sos",
        "Mustard potato salad, sautéed vegetables, butter and chili sauce"),
    "Somon teriyaki": ("Somon Teriyaki", "Salmon Teriyaki"),
    "Fırın Sütlaç": ("Fırın Sütlaç", "Oven-Baked Rice Pudding"),
    "Meyveli turta": ("Meyveli Turta", "Fruit Tart"),
    "San sebastian cheesecake": ("San Sebastian Cheesecake", "San Sebastian Cheesecake"),
    "Dondurmalı & muz": ("Muzlu Dondurma", "Banana Split"),
    "Brownie (Ilık Servis Edilir)": ("Brownie (Ilık Servis Edilir)", "Brownie (Served Warm)"),
    "Mevsim Meyveleri": ("Mevsim Meyveleri", "Seasonal Fruits"),
    "Dondurma": ("Dondurma", "Ice Cream"),
    # --- room service
    "Penne All’arrabiata": ("Penne all’Arrabbiata", "Penne all’Arrabbiata"),
    "Spagetti Bolenez": ("Spagetti Bolonez", "Spaghetti Bolognese"),
    "Fettucine Alfredo": ("Fettuccine Alfredo", "Fettuccine Alfredo"),
    "Füme Burger": ("Füme Burger", "Smoked Burger"),
    "El Yapımı Kızarmış Sosis": ("El Yapımı Kızarmış Sosis", "House-made Fried Sausage"),
}

# description typos, applied to both languages (none of these is a Turkish word)
DETAIL_WORDS = [
    ("chesee", "cheese"), ("mozeralla", "mozzarella"), ("Mozerella", "Mozzarella"), ("mozarella", "mozzarella"),
    ("Mozarella", "Mozzarella"), ("croton", "croutons"), ("aragula", "arugula"), ("chedar", "cheddar"),
    ("Chedar", "Cheddar"), ("cheedar", "cheddar"), ("mexian", "Mexican"), ("Orion rings", "onion rings"),
    ("psrmesan", "parmesan"), ("permasan", "parmesan"), ("smoced", "smoked"), ("souce", "sauce"),
    ("edamamme", "edamame"), ("patato", "potato"), ("blackwheat", "buckwheat"), ("buck wheat", "buckwheat"),
    ("bolognaise", "bolognese"), ("Haloumi", "Halloumi"), ("withSpecial", "with special"),
    ("fried capari beans", "fried capers"), ("jack daniels", "Jack Daniel’s"), ("Jack daniels", "Jack Daniel’s"),
]
# English descriptions only
DETAIL_WORDS_EN = [("spagetti", "spaghetti"), ("cips", "fries"), ("crema", "cream"), ("hellim", "halloumi"),
                   ("Hellim", "Halloumi")]


def fix_item(row):
    hit = ITEMS.get(row["name"])
    if hit:
        row["name"], row["nameEn"] = hit[0], hit[1]
        if len(hit) > 2:
            row["detail"], row["detailEn"] = hit[2], hit[3]
    for field, words in (("detail", DETAIL_WORDS), ("detailEn", DETAIL_WORDS + DETAIL_WORDS_EN)):
        text = row.get(field)
        if text:
            for a, b in words:
                text = text.replace(a, b)
            # tidy the documents' loose punctuation: "a ,b" / "a,b" -> "a, b"
            text = " ".join(text.replace(" ,", ",").replace(",", ", ").split())
            row[field] = text.replace(" .", ".")
    return row
