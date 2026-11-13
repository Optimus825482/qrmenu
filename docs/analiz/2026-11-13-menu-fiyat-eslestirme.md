# Menü fiyat eşleştirmesi — 13.11.2026

Kaynak liste: `merit_tum_menuler.md` (08.11.2026). Sistem: yerel veritabanı (`merit`), etkin menü öğeleri.
Tam satır listesi: `2026-11-13-menu-fiyat-eslestirme.csv` (noktalı virgülle ayrılmış, Excel ile açılır).

## Fiyatı değişecek (18 satır, 10 farklı ürün)

| kategori | sistemdeki_ad | sistem_fiyat | liste_fiyat | fark | not | outletler |
|---|---|---|---|---|---|---|
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7.00 | 8.00 | +1.00 |  | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Tea Lounge, The Roof Garden |
| İRLANDA VİSKİLERİ | JAMESON | 15.00 | 20.00 | +5.00 |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| KONYAKLAR | REMY MARTIN LOUIS XIII | 350.00 | 5000.00 | +4650.00 | fark 3 kattan büyük (kadeh/şişe?) | The Roof Garden, Whiskey Lounge |
| ULUSLARARASI KOKTEYLLER | APEROL SPRITZ | 35.00 | 20.00 | -15.00 |  | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | WHISKEY SOUR | 35.00 | 20.00 | -15.00 |  | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | DAIQUIRI | 35.00 | 20.00 | -15.00 |  | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | NEGRONI | 35.00 | 20.00 | -15.00 |  | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | OLD FASHIONED | 35.00 | 20.00 | -15.00 |  | The Roof Garden |
| MALT VİSKİLER | GLENMORANGIE LASANTA 12 Y.O. | 40.00 | 30.00 | -10.00 |  | Whiskey Lounge |
| İSKOÇ VİSKİLER | THE NAKED GROUSE | 15.00 | 10.00 | -5.00 |  | Whiskey Lounge |

## Kontrol: aynı ad, farklı kategori (81 satır, 47 farklı ürün)

| kategori | sistemdeki_ad | sistem_fiyat | liste_kategori | liste_fiyat | outletler |
|---|---|---|---|---|---|
| RONNEFELDT POŞET ÇAYLAR | GREEN ANGEL |  | RONNEFELDT BİTKİ ÇAYLARI | 10.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT POŞET ÇAYLAR | WINTERDREAM |  | RONNEFELDT BİTKİ ÇAYLARI | 10.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT POŞET ÇAYLAR | PAPATYA |  | RONNEFELDT BİTKİ ÇAYLARI | 10.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT POŞET ÇAYLAR | ENGLISH BREAKFAST |  | RONNEFELDT BİTKİ ÇAYLARI | 10.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT POŞET ÇAYLAR | ROOIBOS VANİLYA |  | RONNEFELDT BİTKİ ÇAYLARI | 10.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | MORGENTAU |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | MASALA CHAI |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | VANILLA ROOIBOS |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | FRUITY CAMOMILE |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | REFRESHING MINT |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CREAM ORANGE |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | HUCKLEBERRY FRIEND |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | JASMINE PEARLS |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | EARL GREY |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | GREEN LEAF |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | IRISH WHISKEY CREAM |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | CHINESE SPRING |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | GET THE POWER |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | GINGER TWIST |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | WHITE YIN LONG |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CHOCOLATE HEAVEN |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | AYURVEDA HERBS & GINGER |  | RONNEFELDT DEMLEME ÇAYLAR | 20.00 | Cafe Verde, Tea Lounge |
| SOĞUK LEZZETLER | ROYAL DONDURMA |  | ROYAL DONDURMA | 5.00 | Cafe Verde, Tea Lounge |
| MALT VİSKİLER | OBAN 14 Y.O. |  | SINGLE MALT VİSKİ | 40.00 | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden |
| TATLILAR | Tiramisu |  | KLASİK | 60.00 | Diamond Pool Bar |
| TATLILAR | Taze Mevsim Meyveleri |  | TAZE MEVSİM MEYVESİ | 80.00 | Diamond Pool Bar |
| MEYVE SUYU | PORTAKAL | 7.00 | KLASİK | 60.00 | Diamond Pool Bar |
| MEYVE SUYU | ŞEFTALİ | 7.00 | KLASİK | 60.00 | Diamond Pool Bar |
| FRESH MEYVE SUYU | PORTAKAL | 10.00 | KLASİK | 60.00 | Diamond Pool Bar |
| FRESH MEYVE SUYU | KARPUZ |  | KLASİK | 60.00 | Diamond Pool Bar |
| FRESH MEYVE SUYU | KAVUN |  | KLASİK | 60.00 | Diamond Pool Bar |
| SICAK İÇECEKLER | CAPPUCCINO | 15.00 | KLASİK | 60.00 | Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | ÇİLEK | 20.00 | KLASİK | 60.00 | Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | KARPUZ | 20.00 | KLASİK | 60.00 | Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | KAVUN | 20.00 | KLASİK | 60.00 | Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | PORTAKAL | 20.00 | KLASİK | 60.00 | Diamond Pool Bar |
| DONDURMALAR | ÇİLEK |  | KLASİK | 60.00 | Diamond Pool Bar |
| DONDURMALAR | LİMON |  | KLASİK | 60.00 | Diamond Pool Bar |
| DONDURMALAR | KAVUN |  | KLASİK | 60.00 | Diamond Pool Bar |
| MILKSHAKES | ÇİLEK | 20.00 | KLASİK | 60.00 | Diamond Pool Bar |
| MILKSHAKES | LİMON | 20.00 | KLASİK | 60.00 | Diamond Pool Bar |
| MILKSHAKES | KAVUN | 20.00 | KLASİK | 60.00 | Diamond Pool Bar |
| SAĞLIKLI KÂSELER | Smoothie Kâse |  | HAFİF SABAH ATIŞTIRMALIKLARI | 21.00 | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SAĞLIKLI KÂSELER | Yulaf Kâsesi |  | HAFİF SABAH ATIŞTIRMALIKLARI | 21.00 | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SAĞLIKLI KÂSELER | Mısır Gevreği |  | HAFİF SABAH ATIŞTIRMALIKLARI | 15.00 | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SAĞLIKLI KÂSELER | Musli |  | HAFİF SABAH ATIŞTIRMALIKLARI | 18.00 | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SICAK İÇECEKLER | CAPPUCCINO | 15.00 | KLASİK | 80.00 | The Roof Garden |

## Benzer adla eşleşen (yazım farkı) (65 satır, 23 farklı ürün)

| sistemdeki_ad | liste_ad | sistem_fiyat | liste_fiyat | durum | outletler |
|---|---|---|---|---|---|
| ŞEFTALİLİ SOĞUK ÇAY | ŞEFTALİ SOĞUK ÇAY | 20.00 | 20.00 | AYNI (benzer ad) | Cafe Verde, Tea Lounge |
| SMOOTHIES | SMOOTHIE | 20.00 | 20.00 | AYNI (benzer ad) | Cafe Verde, Tea Lounge |
| BATIDA DE CÔCO | BATI DE COCO | 20.00 | 20.00 | AYNI (benzer ad) | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| SKINOS | SKINOSS | 20.00 | 20.00 | AYNI (benzer ad) | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden, Whiskey Lounge |
| GRANDE ABSENTE | GRANDE ABSENTH | 20.00 | 20.00 | AYNI (benzer ad) | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden, Whiskey Lounge |
| JUSTERINI & BROOKS RARE | JUSTERINI & BROOKS BARE | 10.00 | 10.00 | AYNI (benzer ad) | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| LIMONCELLO | LEMONCELLO | 20.00 | 20.00 | AYNI (benzer ad) | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden, Whiskey Lounge |
| RUSSIAN STANDARD | RUSSIAN STANDART | 10.00 | 10.00 | AYNI (benzer ad) | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| ABSOLUT VANILLA | ABSOLUT VANİLYA | 10.00 | 10.00 | AYNI (benzer ad) | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| DOM BÉNÉDICTINE | DOM BENETICTINE | 20.00 | 20.00 | AYNI (benzer ad) | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden, Whiskey Lounge |
| Tavuk Şnitzel | Tavuk Şinitzel |  | 24.00 | FİYAT EKLENECEK (benzer ad) | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| Penne all’Arrabbiata | Penne All’arrabiata |  | 25.00 | FİYAT EKLENECEK (benzer ad) | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| Spagetti Bolonez | Spagetti Bolenez |  | 30.00 | FİYAT EKLENECEK (benzer ad) | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| Fettuccine Alfredo | Fettucine Alfredo |  | 25.00 | FİYAT EKLENECEK (benzer ad) | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ARDBEG 10 Y.O. | ARDBERG 10 Y.O. | 30.00 | 30.00 | AYNI (benzer ad) | The Roof Garden, Whiskey Lounge |
| MAGNOLYA | MAGNOLİA |  | 35.00 | FİYAT EKLENECEK (benzer ad) | The Roof Garden |
| CLASE AZUL PLATA | CLASSE AZUL PLATA | 40.00 | 40.00 | AYNI (benzer ad) | Whiskey Lounge |
| CLASE AZUL REPOSADO | CLASSE AZUL REPOSADO | 90.00 | 90.00 | AYNI (benzer ad) | Whiskey Lounge |
| KAVALAN DISTILLERY SELECT | KAVALAN DISTTILLERY SELECT | 20.00 | 20.00 | AYNI (benzer ad) | Whiskey Lounge |
| KAVALAN CONCERTMASTER | KAVALAN CONCERT MASTER | 30.00 | 30.00 | AYNI (benzer ad) | Whiskey Lounge |
| CAOL ILA 12 Y.O. | COAL ILA 12 Y.O. | 30.00 | 30.00 | AYNI (benzer ad) | Whiskey Lounge |
| BENRIACH 10 Y.O. | BENRIARCH 10 Y.O. |  | 30.00 | FİYAT EKLENECEK (benzer ad) | Whiskey Lounge |
| BENRIACH 12 Y.O. | BENRIARCH 12 Y.O. |  | 30.00 | FİYAT EKLENECEK (benzer ad) | Whiskey Lounge |

## Fiyatı eklenecek (sistemde fiyat yok, listede var) (234 satır, 79 farklı ürün)

| kategori | sistemdeki_ad | liste_fiyat | liste_pb | outletler |
|---|---|---|---|---|
| SICAK İÇECEKLER | MATCHA ÇAYI | 20.00 | USD | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | COFFEE CORTADO | 15.00 | USD | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | FLAT WHITE | 15.00 | USD | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | TAZE DEMLEME BİTKİ ÇAYLARI | 7.00 | USD | Cafe Verde, Tea Lounge |
| VOTKALAR | SMIRNOFF NORTH | 10.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden, Whiskey Lounge |
| LİKÖRLER | UNDERBERG | 20.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| LİKÖRLER | WENNEKER APRICOT BRANDY | 20.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| LİKÖRLER | FRANGELICO | 20.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| İMZA KOKTEYLLER | PORT | 35.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| İMZA KOKTEYLLER | THE PASSION | 35.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| İMZA KOKTEYLLER | HARMONY | 35.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | 35.00 | USD | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| KAHVALTI | Güne Başlangıç Tabağı (1 kişilik) | 43.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTI | Klasik Kahvaltı (2 kişilik) | 56.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTI | Yöresel Anadolu Kahvaltısı (2 kişilik) | 85.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTI | Sağlıklı Kahvaltı | 60.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | El Yapımı Izgara Sucuk | 25.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | Börek Tabağı | 23.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | El Yapımı Kızarmış Sosis | 25.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | Sahanda Yumurta | 10.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | Tereyağlı Omlet | 10.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | Yumurta Akından Omlet | 18.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | Menemen | 18.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| KAHVALTIYA İLAVE YİYECEKLER | Yumurta Benedict | 25.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TOSTLAR | Kaşarlı Tost | 20.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TOSTLAR | Sucuklu Kaşarlı Tost | 22.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TOSTLAR | Kıbrıs Tostu | 24.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TOSTLAR | Sanayi Tostu | 18.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ÇORBALAR | Mercimek Çorbası | 20.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ÇORBALAR | Domates Çorbası | 20.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SALATALAR | Yeşil Bahçe Salatası | 18.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SALATALAR | İstanbul Salatası | 18.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SALATALAR | Sezar Salata | 30.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SALATALAR | Kinoalı Tabule Salatası | 15.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SALATALAR | Çoban Salata | 15.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SALATALAR | Yunan Salatası | 16.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SALATALAR | Narenciyeli Avokado Salatası | 28.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| BAŞLANGIÇLAR | Şarap Tabağı (2 kişilik) | 50.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| BAŞLANGIÇLAR | Geleneksel Türk Meze Seçkisi | 15.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| BAŞLANGIÇLAR | Dana Carpaccio | 37.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| BAŞLANGIÇLAR | Tereyağlı Karides Tava | 30.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| BAŞLANGIÇLAR | Kalamar Tava | 28.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| BAŞLANGIÇLAR | Tavuk Finger | 19.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SANDVİÇ & BURGER | Club Sandwich | 24.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SANDVİÇ & BURGER | Katsu Sando | 40.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SANDVİÇ & BURGER | Kruvasan Sandviç | 25.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SANDVİÇ & BURGER | Soğuk Sandviç | 15.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SANDVİÇ & BURGER | Hamburger | 22.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SANDVİÇ & BURGER | Cheeseburger | 23.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SANDVİÇ & BURGER | Füme Burger | 32.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| MAKARNA & RİSOTTO | Spaghetti Pomodoro | 20.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| MAKARNA & RİSOTTO | El Yapımı Mantı | 15.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| MAKARNA & RİSOTTO | Yabani Mantarlı Risotto | 48.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| MAKARNA & RİSOTTO | Deniz Mahsullü Risotto | 28.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Tekirdağ Köfte | 21.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Izgara Kasap Köfte | 21.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Taze Kekikli Kuzu Pirzolası | 38.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Karabiberli Bonfile | 42.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Piliç Bonfile | 24.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Kuzey Atlantik Somon Filetosu | 28.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Levrek Izgara | 28.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Izgara Karides | 30.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ANA YEMEKLER | Günün Ev Yemeği | 25.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | Türk Kahvesi ile Hazırlanmış Tiramisu | 19.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | Profiterol | 15.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | Cheesecake | 28.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | Fırın Sütlaç | 18.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | Royal Baklava | 35.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | El Yapımı Çikolata Seçkisi | 22.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | Orman Meyveleri | 25.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| TATLILAR | Taze Mevsim Meyveleri | 20.00 | USD | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| SOĞUK KAHVELER | ICED COFFEE CREAM | 20.00 | USD | Tea Lounge |
| THE ROOF GARDEN İMZA KOKTEYLLER | GARDEN | 35.00 | USD | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | PANDOMİM | 35.00 | USD | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | DİLEK TAŞI | 35.00 | USD | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | GRASS | 35.00 | USD | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | AMARETTO SOUR | 20.00 | USD | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | 20.00 | USD | The Roof Garden |
| MALT VİSKİLER | OBAN 14 Y.O. | 40.00 | USD | Whiskey Lounge |

## Listede 0,00 yazan (85 satır, 44 farklı ürün)

| kategori | sistemdeki_ad | sistem_fiyat | outletler |
|---|---|---|---|
| SALATALAR | Royal Salatası |  | Blue Sea Beach Bar |
| İMZA KOKTEYLLER | PORT |  | Blue Sea Beach Bar, Diamond Pool Bar |
| İMZA KOKTEYLLER | ROYAL |  | Blue Sea Beach Bar |
| İMZA KOKTEYLLER | AURA | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İMZA KOKTEYLLER | ILLUSION | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İMZA KOKTEYLLER | HARMONY |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | APEROL SPRITZ | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | BELLINI | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | BLOODY MARY |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | CAIPIRINHA | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | COSMOPOLITAN |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | DAIQUIRI | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | LONG ISLAND ICED TEA |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | MARGARITA |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | WHISKEY SOUR | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | MOJITO |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | NEGRONI | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | OLD FASHIONED | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | FRENCH 75 |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ROMLAR | CAPTAIN MORGAN WHITE | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ROMLAR | CAPTAIN MORGAN DARK | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ROMLAR | HAVANA CLUB 3 ANOS | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ROMLAR | BACARDI CARTA BLANCA | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ROMLAR | BACARDI CARTA NEGRA (BLACK) | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ROMLAR | BACARDI CARTA ORO (GOLD) | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ROMLAR | MALIBU CARIBBEAN RUM | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | NAPOLEON V.S.O.P. | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | HENNESSY V.S. | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | COURVOISIER V.S. | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | REMY MARTIN V.S. | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | JIM BEAM BLACK | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | JIM BEAM WHITE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | JACK DANIEL'S NO:7 | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | JACK DANIEL'S HONEY | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MALT VİSKİLER | GLENFIDDICH 12 Y.O. | 30.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | FAMOUS GROUSE | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | BALLANTINE'S | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | JUSTERINI & BROOKS RARE | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | CHIVAS REGAL 12 Y.O. | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | JOHNNIE WALKER RED LABEL | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | JOHNNIE WALKER BLACK LABEL 12 Y.O. | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İRLANDA VİSKİLERİ | JAMESON | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İMZA KOKTEYLLER | THE PASSION |  | Diamond Pool Bar |

## Sistemde var, listede yok (436 satır, 270 farklı ürün)

| kategori | sistemdeki_ad | sistem_fiyat | outletler |
|---|---|---|---|
| ATIŞTIRMALIKLAR | Kentucky |  | Blue Sea Beach Bar |
| ANA YEMEKLER | Tekirdağ Köfte Izgara |  | Blue Sea Beach Bar |
| ANA YEMEKLER | Royal Köfte |  | Blue Sea Beach Bar |
| ANA YEMEKLER | Levrek Izgara |  | Blue Sea Beach Bar |
| ANA YEMEKLER | Kanat Izgara |  | Blue Sea Beach Bar |
| MEŞRUBATLAR | SU 330 ml. |  | Blue Sea Beach Bar, Cafe Verde, Diamond Lobby Bar, Diamond Pool Bar, Premium Lobby Bar, Royal Lobby Bar, Tea Lounge, The Roof Garden |
| MEŞRUBATLAR | SU 750 ml. | 7.00 | Blue Sea Beach Bar, Cafe Verde, Diamond Pool Bar, Tea Lounge, The Roof Garden |
| MEŞRUBATLAR | ICE TEA (PEACH, LEMON) | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | FRESH MEYVE SUYU | 10.00 | Blue Sea Beach Bar, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Tea Lounge, The Roof Garden |
| SICAK İÇECEKLER | CHOCOLATE MOCHA |  | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | ENGLISH BREAKFAST TEA |  | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | FILTER COFFEE | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | MACCHIATO | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | NESCAFE | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | SICAK ÇİKOLATA | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar, The Roof Garden |
| FRESH MEYVE SUYU | GREYFURT | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| FRESH MEYVE SUYU | ELMA | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| FRESH MEYVE SUYU | KARPUZ |  | Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KAVUN |  | Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KİVİ |  | Blue Sea Beach Bar, Diamond Pool Bar |
| FRESH MEYVE SUYU | PORTAKAL | 10.00 | Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KARIŞIK | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | ÇİLEK | 20.00 | Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | ELMA | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | KARPUZ | 20.00 | Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | KAVUN | 20.00 | Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | KİVİ | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | MUZ-SÜT-BAL | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | MUZ | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | NANE-LİMON | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SERİNLETİCİ SMOOTHIE | PORTAKAL | 20.00 | Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | SALATALIK | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | VANİLYA |  | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | DAMLA SAKIZ |  | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | KAKAO |  | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | ÇİKOLATA |  | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | KARAMEL |  | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | ÇİLEK |  | Blue Sea Beach Bar |
| DONDURMALAR | VİŞNE |  | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | LİMON |  | Blue Sea Beach Bar |
| DONDURMALAR | KAVUN |  | Blue Sea Beach Bar |
| DONDURMALAR | MUZ |  | Blue Sea Beach Bar, Diamond Pool Bar |
| DONDURMALAR | AHUDUDU |  | Blue Sea Beach Bar, Diamond Pool Bar |
| MILKSHAKES | VANİLYA | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MILKSHAKES | DAMLA SAKIZ | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MILKSHAKES | KAKAO | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MILKSHAKES | ÇİKOLATA | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MILKSHAKES | KARAMEL | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MILKSHAKES | ÇİLEK | 20.00 | Blue Sea Beach Bar |
| MILKSHAKES | VİŞNE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MILKSHAKES | LİMON | 20.00 | Blue Sea Beach Bar |
| MILKSHAKES | KAVUN | 20.00 | Blue Sea Beach Bar |
| İMZA KOKTEYLLER | PASSION |  | Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | LYNCHBURG LEMONADE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| ULUSLARARASI KOKTEYLLER | WHITE & BLACK RUSSIAN | 35.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | KETEL ONE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | BELVEDERE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | BELUGA NOBLE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | BELUGA GOLD | 40.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | HAKU | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | GREY GOOSE SUPER PREMIUM | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | CIROC | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | HENDRICK'S | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | TANQUERAY NO:10 | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | TANQUERAY CLASSIC | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | THE BOTANIST | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | ROKU | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | MONKEY 47 | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | MALFY | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | MALFY GRAPEFRUIT | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | PATRON ANEJO | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | PATRON SILVER | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | DON JULIO BLANCO | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | DON JULIO 1942 | 60.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | HENNESSY V.S.O.P. | 30.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | HENNESSY X.O. | 70.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | COURVOISIER V.S.O.P. | 40.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | COURVOISIER X.O. | 70.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | REMY MARTIN V.S.O.P. | 30.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| KONYAKLAR | REMY MARTIN X.O. | 70.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | WENNEKER CREME DE CASSIS | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar, Whiskey Lounge |
| BOURBON & TENNESSEE VİSKİLER | JACK DANIEL'S SINGLE BARREL | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | GENTLEMAN JACK | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | WOODFORD RESERVE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | BULLEIT BOURBON | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | BULLEIT RYE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BOURBON & TENNESSEE VİSKİLER | MAKER'S MARK | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MALT VİSKİLER | LAGAVULIN DE 1995 16 Y.O. | 50.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MALT VİSKİLER | TALISKER 10 Y.O. | 30.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MALT VİSKİLER | MACALLAN 12 Y.O. | 40.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | MONKEY SHOULDER | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | DIMPLE 15 Y.O. | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | CHIVAS REGAL 15 Y.O. | 40.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | CHIVAS REGAL 18 Y.O. | 50.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | CHIVAS REGAL 21 Y.O. | 70.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | CHIVAS REGAL 25 Y.O. | 80.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | JOHNNIE WALKER GOLD RESERVE | 40.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | JOHNNIE WALKER 18 Y.O. | 50.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| İSKOÇ VİSKİLER | JOHNNIE WALKER BLUE LABEL | 100.00 | Blue Sea Beach Bar, Diamond Lobby Bar, Diamond Pool Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | NANE & PEPPERMINT |  | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | FİLTRE KAHVE | 15.00 | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | KAFEİNSİZ KAHVE |  | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | ESPRESSO | 10.00 | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | ESPRESSO LUNGO |  | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | HİNDİSTAN CEVİZİ SÜTLÜ MATCHA LATTE |  | Cafe Verde, Tea Lounge |
| SICAK İÇECEKLER | 3. NESİL KAHVELER |  | Cafe Verde, Tea Lounge |
| MEŞRUBATLAR | AYRAN | 5.00 | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Tea Lounge, The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | CHILL OUT WITH HERBS |  | Cafe Verde, Tea Lounge, The Roof Garden |
| MEŞRUBATLAR | ICE TEA | 5.00 | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Tea Lounge, The Roof Garden |
| MEŞRUBATLAR | ŞALGAM SUYU | 5.00 | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Tea Lounge, The Roof Garden |
| SOĞUK KAHVELER | ICED COFFEE CREAM |  | Cafe Verde, The Roof Garden |
| SOĞUK KAHVELER | WHITE CHOCOLATE MOCHA |  | Cafe Verde, Tea Lounge, The Roof Garden |
| SOĞUK LEZZETLER | FRUIT FROZENS | 20.00 | Cafe Verde, Tea Lounge, The Roof Garden |
| VOTKALAR | ABSOLUT CITRON | 10.00 | Cafe Verde |
| ROMLAR | RON ZACAPA 23 | 40.00 | Cafe Verde |
| LİKÖRLER | BOLS ELDERFLOWER |  | Cafe Verde |
| ULUSLARARASI KOKTEYLLER | AMARETTO SOUR |  | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| ULUSLARARASI KOKTEYLLER | DAIQUIRI | 35.00 | Cafe Verde, Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, Whiskey Lounge |
| SICAK İÇECEKLER | ESPRESSO, RISTRETTO, LUNGO | 10.00 | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden |
| SICAK İÇECEKLER | KLASİK TÜRK ÇAYI | 7.00 | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden |
| SICAK İÇECEKLER | BİTKİ ÇAYLARI | 7.00 | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar, The Roof Garden |
| RONNEFELDT POŞET ÇAYLAR | ENGLISH BREAKFAST |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | EARL GREY |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | MORGENTAU |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | REFRESHING MINT |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | FRUITY CAMOMILE |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | AYURVEDA HERBS & GINGER |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | ROOIBOS CREAM ORANGE |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | SWEET BERRIES |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| RONNEFELDT POŞET ÇAYLAR | ROYAL WHITE TEA |  | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| MALT VİSKİLER | MACALLAN 18 Y.O. | 90.00 | Diamond Lobby Bar, Premium Lobby Bar, Royal Lobby Bar |
| ÇORBALAR | Domates Çorbası |  | Diamond Pool Bar |
| TOSTLAR | Kaşarlı Tost |  | Diamond Pool Bar |
| TOSTLAR | Sucuklu Kaşarlı Tost |  | Diamond Pool Bar |
| TOSTLAR | Sanayi Tostu |  | Diamond Pool Bar |
| SALATALAR | Yeşil Bahçe Salatası |  | Diamond Pool Bar |
| SALATALAR | İstanbul Salatası |  | Diamond Pool Bar |
| SALATALAR | Sezar Salatası |  | Diamond Pool Bar |
| SALATALAR | Kinoalı Tabule Salatası |  | Diamond Pool Bar |
| SALATALAR | Yunan Salatası |  | Diamond Pool Bar |
| SALATALAR | Narenciyeli Avokado Salatası |  | Diamond Pool Bar |
| BAŞLANGIÇLAR | Dana Carpaccio |  | Diamond Pool Bar |
| BAŞLANGIÇLAR | Tereyağlı Karides Tava |  | Diamond Pool Bar |
| BAŞLANGIÇLAR | Viyana Şnitzeli |  | Diamond Pool Bar |
| BAŞLANGIÇLAR | Tavuk Fingers |  | Diamond Pool Bar |
| SANDVİÇLER & BURGERLER | Kulüp Sandviç |  | Diamond Pool Bar |
| SANDVİÇLER & BURGERLER | Katsu Sando |  | Diamond Pool Bar |
| SANDVİÇLER & BURGERLER | Soğuk Sandviç |  | Diamond Pool Bar |
| SANDVİÇLER & BURGERLER | Hamburger |  | Diamond Pool Bar |
| SANDVİÇLER & BURGERLER | Cheeseburger |  | Diamond Pool Bar |
| MAKARNALAR & RİSOTTOLAR | Penne all’Arrabbiata |  | Diamond Pool Bar |
| MAKARNALAR & RİSOTTOLAR | Spagetti Pomodoro |  | Diamond Pool Bar |
| MAKARNALAR & RİSOTTOLAR | Fettuccine Alfredo |  | Diamond Pool Bar |
| MAKARNALAR & RİSOTTOLAR | El Yapımı Mantı |  | Diamond Pool Bar |
| TATLILAR | Profiterol |  | Diamond Pool Bar |
| TATLILAR | Cheesecake |  | Diamond Pool Bar |
| TATLILAR | Merit Royal Baklava |  | Diamond Pool Bar |
| TATLILAR | El Yapımı Çikolata Seçkisi |  | Diamond Pool Bar |
| TATLILAR | Krep / Pankek / Waffle |  | Diamond Pool Bar |
| MEŞRUBATLAR | SODA / MINERAL WATER | 5.00 | Diamond Pool Bar |
| MEYVE SUYU | ANANAS | 7.00 | Diamond Pool Bar |
| MEYVE SUYU | DOMATES | 7.00 | Diamond Pool Bar |
| MEYVE SUYU | ELMA | 7.00 | Diamond Pool Bar |
| MEYVE SUYU | GREYFURT |  | Diamond Pool Bar |
| MEYVE SUYU | KAYISI | 7.00 | Diamond Pool Bar |
| MEYVE SUYU | KIZILCIK | 7.00 | Diamond Pool Bar |
| MEYVE SUYU | NAR | 7.00 | Diamond Pool Bar |
| MEYVE SUYU | VİŞNE | 7.00 | Diamond Pool Bar |
| FRESH MEYVE SUYU | HAVUÇ | 10.00 | Diamond Pool Bar |
| TOSTLAR | Krep, Pancake ve Waffle |  | Merit Royal Diamond Oda Servisi, Merit Royal Oda Servisi, Merit Royal Premium Oda Servisi |
| ÇORBALAR | Mercimek Çorbası |  | Premium Pool Bar |
| TOSTLAR | Royal Tost |  | Premium Pool Bar |
| TOSTLAR | Kıbrıs Tostu |  | Premium Pool Bar |
| TOSTLAR | Panini Tost |  | Premium Pool Bar |
| TOSTLAR | Avşar Tost |  | Premium Pool Bar |
| TOSTLAR | Ayvalık Tostu |  | Premium Pool Bar |
| SANDVİÇLER | Mozzarella Caprese Sandviç |  | Premium Pool Bar |
| SANDVİÇLER | İtalyan Ton Balıklı Sandviç |  | Premium Pool Bar |
| SALATALAR | Antioksidanlı Yeşil Salata |  | Premium Pool Bar |
| SALATALAR | Ton Balıklı Salata |  | Premium Pool Bar |
| SALATALAR | Çoban Salatası |  | Premium Pool Bar |
| SALATALAR | Kinoalı Tabule |  | Premium Pool Bar |
| SALATALAR | Tavuklu Sezar Salata |  | Premium Pool Bar |
| SALATALAR | Izgara Levrek Salatası |  | Premium Pool Bar |
| SALATALAR | Enginar Kalpli Kıbrıs Salatası |  | Premium Pool Bar |
| KIZARTMALAR | Panelenmiş Balık & Patates Kızartması |  | Premium Pool Bar |
| KIZARTMALAR | Peynirli Sigara Böreği |  | Premium Pool Bar |
| KIZARTMALAR | Patates Kızartması |  | Premium Pool Bar |
| KIZARTMALAR | Piliç Finger |  | Premium Pool Bar |
| BURGER & SICAK ATIŞTIRMALIKLAR | Royal Burger |  | Premium Pool Bar |
| BURGER & SICAK ATIŞTIRMALIKLAR | Buffalo Soslu Tavuk Kanat |  | Premium Pool Bar |
| BURGER & SICAK ATIŞTIRMALIKLAR | Tavuklu Quesadilla |  | Premium Pool Bar |
| BURGER & SICAK ATIŞTIRMALIKLAR | Dana Etli Burrito |  | Premium Pool Bar |
| BURGER & SICAK ATIŞTIRMALIKLAR | Çıtır Kombo Tabağı |  | Premium Pool Bar |
| MAKARNALAR | Fusilli al Pesto |  | Premium Pool Bar |
| MAKARNALAR | Mantar Soslu Tavuklu Tagliatelle |  | Premium Pool Bar |
| MAKARNALAR | Mac and Cheese |  | Premium Pool Bar |
| PİZZALAR | Pizza Royal |  | Premium Pool Bar |
| PİZZALAR | Pizza Quattro Stagioni |  | Premium Pool Bar |
| PİZZALAR | Pizza Pepperoni |  | Premium Pool Bar |
| PİZZALAR | Pizza Quattro Formaggi |  | Premium Pool Bar |
| PİZZALAR | Tavuklu Calzone |  | Premium Pool Bar |
| PİZZALAR | Sarımsaklı Tereyağlı Ekmek |  | Premium Pool Bar |
| PİDELER | Konya Etli Ekmek |  | Premium Pool Bar |
| PİDELER | Kıymalı Kır Pidesi |  | Premium Pool Bar |
| PİDELER | Kuşbaşılı Kaşarlı Pide |  | Premium Pool Bar |
| PİDELER | Lahmacun |  | Premium Pool Bar |
| BOWLLAR | Tekirdağ Bowl |  | Premium Pool Bar |
| BOWLLAR | Levrek Bowl |  | Premium Pool Bar |
| BOWLLAR | Peri Peri Bowl |  | Premium Pool Bar |
| ANA YEMEKLER | Kasap Köfte |  | Premium Pool Bar |
| ANA YEMEKLER | Kuzu Şiş |  | Premium Pool Bar |
| ANA YEMEKLER | Piliç Külbastı |  | Premium Pool Bar |
| ANA YEMEKLER | Piliç Şnitzel |  | Premium Pool Bar |
| ANA YEMEKLER | Somon Teriyaki |  | Premium Pool Bar |
| TATLILAR | Meyveli Turta |  | Premium Pool Bar |
| TATLILAR | Muzlu Dondurma |  | Premium Pool Bar |
| TATLILAR | Brownie (Ilık Servis Edilir) |  | Premium Pool Bar |
| TATLILAR | Mevsim Meyveleri |  | Premium Pool Bar |
| TATLILAR | Waffle |  | Premium Pool Bar |
| TATLILAR | Dondurma |  | Premium Pool Bar |
| MEŞRUBATLAR | MEYVE SUYU | 7.00 | The Roof Garden |
| MEŞRUBATLAR | LİMONATA | 5.00 | The Roof Garden |
| SICAK İÇECEKLER | AMERICANO | 15.00 | The Roof Garden |
| SICAK İÇECEKLER | CAFE LATTE | 15.00 | The Roof Garden |
| SICAK İÇECEKLER | TÜRK KAHVESİ | 10.00 | The Roof Garden |
| SICAK İÇECEKLER | SALEP | 20.00 | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | MORGENTAU |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | MASALA CHAI |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | VANILLA ROOIBOS |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | FRUITY CAMOMILE |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | REFRESHING MINT |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CREAM ORANGE |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | HUCKLEBERRY FRIEND |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | JASMINE PEARLS |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | EARL GREY |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | GREEN LEAF |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | IRISH WHISKEY CREAM |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | CHINESE SPRING |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | GET THE POWER |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | GINGER TWIST |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | WHITE YIN LONG |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CHOCOLATE HEAVEN |  | The Roof Garden |
| RONNEFELDT TAZE DEMLEME ÇAYLAR | AYURVEDA HERBS & GINGER |  | The Roof Garden |
| SOĞUK KAHVELER | COLD BREW | 20.00 | The Roof Garden |
| SOĞUK KAHVELER | FRAPPE | 20.00 | The Roof Garden |
| SOĞUK KAHVELER | FRAPPUCCINO | 20.00 | The Roof Garden |
| SOĞUK KAHVELER | AFFOGATO | 20.00 | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | SOĞUK MATCHA ÇAYI | 20.00 | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | ŞEFTALİLİ SOĞUK ÇAY | 20.00 | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | ELMALI YEŞİL ÇAY | 20.00 | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | LİMONLU SOĞUK ÇAY | 20.00 | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | BÖĞÜRTLENLİ HİBİSKUS ÇAYI | 20.00 | The Roof Garden |
| SOĞUK LEZZETLER | MILKSHAKES | 20.00 | The Roof Garden |
| SOĞUK LEZZETLER | SMOOTHIES | 20.00 | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | THE PASSION |  | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | YOU AND ME |  | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | ÇAKISTES |  | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | CONCIERTO |  | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | FOR |  | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | FOR AS FIRE |  | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | APERITIVO |  | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER | BAZAAR |  | The Roof Garden |
| CİNLER | MALFY LEMON | 20.00 | Whiskey Lounge |
| LİKÖRLER | WENNEKER CREME DE MENTHE | 30.00 | Whiskey Lounge |
| LİKÖRLER | BROGANS | 20.00 | Whiskey Lounge |
| LİKÖRLER | MOLLY'S IRISH CREAM | 20.00 | Whiskey Lounge |
| LİKÖRLER | LITCHAO | 20.00 | Whiskey Lounge |
| LİKÖRLER | WENNEKER HAZELNUT | 20.00 | Whiskey Lounge |
| BOURBON & TENNESSEE VİSKİLER | JACK DANIEL'S 150 ANNIVERSARY | 50.00 | Whiskey Lounge |

## Listede fiyatı belirtilmemiş (167 satır, 101 farklı ürün)

| kategori | sistemdeki_ad | sistem_fiyat | outletler |
|---|---|---|---|
| ATIŞTIRMALIKLAR | Hellim Çıtırları |  | Blue Sea Beach Bar |
| ATIŞTIRMALIKLAR | Tempura Tabağı |  | Blue Sea Beach Bar |
| ATIŞTIRMALIKLAR | Kıtır Pane Basketi |  | Blue Sea Beach Bar |
| ATIŞTIRMALIKLAR | Kalamar Tava |  | Blue Sea Beach Bar |
| ATIŞTIRMALIKLAR | Şnitzel |  | Blue Sea Beach Bar |
| ATIŞTIRMALIKLAR | Acılı Tavuk Kanatları |  | Blue Sea Beach Bar |
| SALATALAR | Sezar Salata |  | Blue Sea Beach Bar |
| SALATALAR | Karpuzlu Ezine Peynirli Akdeniz Salatası |  | Blue Sea Beach Bar |
| SALATALAR | Avokado Salatası |  | Blue Sea Beach Bar |
| SALATALAR | Deniz Ürünleri Salatası |  | Blue Sea Beach Bar |
| HAMBURGERLER | Chef Burger |  | Blue Sea Beach Bar |
| HAMBURGERLER | Cheese Burger |  | Blue Sea Beach Bar |
| HAMBURGERLER | Tavuk Burger |  | Blue Sea Beach Bar |
| TOST & SANDVİÇ | Sanayi Tost |  | Blue Sea Beach Bar |
| TOST & SANDVİÇ | Kavurmalı Tost |  | Blue Sea Beach Bar |
| TOST & SANDVİÇ | Steak Sandwich |  | Blue Sea Beach Bar |
| MAKARNALAR | Spagetti Napoliten |  | Blue Sea Beach Bar, Premium Pool Bar |
| MAKARNALAR | Fettuccine Alfredo |  | Blue Sea Beach Bar |
| MAKARNALAR | Spagetti Bolonez |  | Blue Sea Beach Bar, Premium Pool Bar |
| MAKARNALAR | Penne Arrabbiata |  | Blue Sea Beach Bar, Premium Pool Bar |
| MAKARNALAR | Türkmen Mantısı |  | Blue Sea Beach Bar, Premium Pool Bar |
| ANA YEMEKLER | Piliç Şaşlık |  | Blue Sea Beach Bar |
| TATLILAR | Magnolia |  | Blue Sea Beach Bar |
| TATLILAR | San Sebastian Cheesecake |  | Blue Sea Beach Bar, Premium Pool Bar |
| TATLILAR | Fırın Sütlaç |  | Blue Sea Beach Bar, Diamond Pool Bar, Premium Pool Bar |
| TATLILAR | Brownie |  | Blue Sea Beach Bar |
| TATLILAR | Meyve Tabağı |  | Blue Sea Beach Bar |
| MEŞRUBATLAR | MEYVE SUYU | 7.00 | Blue Sea Beach Bar |
| MEŞRUBATLAR | SODA | 5.00 | Blue Sea Beach Bar |
| MEŞRUBATLAR | AYRAN | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | BRITVIC | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | COCA COLA | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | SPRITE | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | FANTA | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | LİMONATA | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| MEŞRUBATLAR | ŞALGAM SUYU | 5.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | AMERICANO | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | CAPPUCCINO | 15.00 | Blue Sea Beach Bar |
| SICAK İÇECEKLER | CAFE LATTE | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | TÜRK KAHVESİ | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | KLASİK TÜRK ÇAYI | 7.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | ESPRESSO | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| SICAK İÇECEKLER | BİTKİ ÇAYLARI | 7.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | EFES PILSEN | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | BECK'S | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | MILLER | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | HEINEKEN | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | TUBORG | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | BUD | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | CARLSBERG | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| BİRALAR | CORONA | 15.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| APERATİFLER | MARTINI BIANCO | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| APERATİFLER | MARTINI ROSSO | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| APERATİFLER | MARTINI EXTRA DRY | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| APERATİFLER | CAMPARI | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| APERATİFLER | APEROL | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | SMIRNOFF RED | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | SMIRNOFF NORTH |  | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | ABSOLUT BLUE | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | ABSOLUT VANILLA | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| VOTKALAR | ABSOLUT CITRON | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | BOMBAY SAPPHIRE | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | BEEFEATER | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | BEEFEATER PINK | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| CİNLER | GORDON'S | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | OLMECA GOLD | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | OLMECA SILVER | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | MILAGRO SILVER | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| TEKİLALAR | MILAGRO REPOSADO | 10.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | CHAMBORD | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | SOUTHERN COMFORT | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | CARDINAL MELON | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | KAHLUA | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | BAILEYS IRISH CREAM | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | AMARETTO DISARONNO ORIGINALE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | SAMBUCA | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | TIA MARIA | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | JÄGERMEISTER | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | SAFARI | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | ARCHERS | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | BATIDA DE CÔCO | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | PASSOA | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | COINTREAU | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | PISANG AMBON | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | DRAMBUIE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | SHERIDAN'S | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | GRANDE ABSENTE | 20.00 | Blue Sea Beach Bar, Diamond Pool Bar |
| LİKÖRLER | FRANGELICO |  | Blue Sea Beach Bar, Diamond Pool Bar |
| ÇORBALAR | Mercimek Çorbası |  | Diamond Pool Bar |
| TOSTLAR | Royal Tost |  | Diamond Pool Bar |
| SALATALAR | Çoban Salatası |  | Diamond Pool Bar |
| BAŞLANGIÇLAR | Kalamar Tava |  | Diamond Pool Bar |
| SANDVİÇLER & BURGERLER | Royal Burger |  | Diamond Pool Bar |
| MAKARNALAR & RİSOTTOLAR | Spagetti Bolonez |  | Diamond Pool Bar |
| MEŞRUBATLAR | SAN PELLEGRINO | 8.00 | Diamond Pool Bar |
| SANDVİÇLER | Steak Sandwich |  | Premium Pool Bar |
| KIZARTMALAR | Kalamar Tava |  | Premium Pool Bar |
| PİZZALAR | Pizza Margherita |  | Premium Pool Bar |
| PİDELER | Peynirli Pide |  | Premium Pool Bar |
| ANA YEMEKLER | Izgara Levrek |  | Premium Pool Bar |
