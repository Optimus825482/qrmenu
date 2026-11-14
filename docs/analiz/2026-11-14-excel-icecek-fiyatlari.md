# Excel içecek fiyatları ($) — eşleştirme denetimi, 14.11.2026

Kaynak: `2025-2026 Royal & Premium & Diamond Hotel İçecek Menüleri Fiyatlı -YENİ ÇALIŞMA.xlsx` (özü `merit/scripts/menu-2026/menu_json/excel_prices.json`). Her satırın tam dökümü, Excel satır numarası ve Single / Double / şişe değerleriyle: `2026-11-14-excel-icecek-fiyatlari.csv` (noktalı virgüllü, Excel ile açılır).

## Hangi sütun hangi fiyat

- İçki sayfalarında başlık satırları **C = Single, D = Double, E = 70 Cl.** (aperatiflerde 100 Cl.) diyor; maliyet tablosuna (`2025-26 BEVERAGES`) göre Single 5 cl, Double 8 cl. Menüde ürün başına tek fiyat var ve oda servisinde "5 cl" yazıyor: **her içkide yalnız C (Single) sütunu** yazıldı. Double ve şişe fiyatı hiçbir ürüne yazılmadı.
- Meşrubat, sıcak içecek, bira ve kokteyl bölümlerinde tek fiyat sütunu var (C, başlığı PRICE / GLASS).
- Şarap sayfasında **C = kadeh (yalnız 15 şarapta), D = şişe**. Menüde bu şaraplar "(Kadeh)" ve "(Şişe)" diye iki ayrı ürün: kadeh ürünü C'yi, şişe ürünü ve tek satırlı şaraplar D'yi aldı. Kadeh ürününe şişe fiyatı yazılmaz.

## Özet


| outlet | değişti | yeni fiyat | zaten aynı | bekletildi | belirsiz | Excel'de yok | Excel'de var, menüde yok |
|---|---|---|---|---|---|---|---|
| Diamond Oda Servisi | 9 | 0 | 151 | 0 | 0 | 19 | 85 |
| Diamond Lobby Bar | 8 | 6 | 155 | 0 | 0 | 21 | 1 |
| Diamond Pool Bar | 14 | 16 | 150 | 0 | 3 | 3 | 8 |
| Tea Lounge | 3 | 34 | 19 | 0 | 0 | 15 | 5 |
| Whiskey Lounge | 6 | 9 | 211 | 0 | 0 | 3 | 11 |
| The Steakhouse | 32 | 0 | 69 | 0 | 0 | 27 | 21 |
| Royal Oda Servisi | 9 | 0 | 151 | 0 | 0 | 19 | 85 |
| Royal Lobby Bar | 8 | 6 | 155 | 0 | 0 | 21 | 1 |
| Blue Sea Beach Bar | 13 | 18 | 150 | 0 | 3 | 3 | 7 |
| The Roof Garden | 9 | 5 | 140 | 0 | 1 | 47 | 11 |
| Royal Mandarin | 32 | 0 | 69 | 0 | 0 | 27 | 21 |
| Bella Merit | 32 | 0 | 69 | 0 | 0 | 27 | 21 |
| Premium Oda Servisi | 9 | 0 | 151 | 0 | 0 | 19 | 85 |
| Premium Lobby Bar | 8 | 6 | 155 | 0 | 0 | 21 | 1 |
| Cafe Verde | 3 | 34 | 19 | 0 | 0 | 104 | 5 |
| **Toplam** | 195 | 134 | 1814 | 0 | 7 | 376 | 368 |

Fiyatın alındığı sütun (uygulanan + zaten aynı): C kadeh: 30; C single: 1833; D (yalnız Double sütunu dolu): 7; D şişe: 273.
Eşleşme türü: ad: 1937; ad (başka bölüm): 22; yakın ad: 107; çeşit: 47; ad + üzüm: 18; ad (kısaltılmış): 9; yakın ad + açıklama: 3.

## 1. Excel esas alınarak uygulanan, önceki fiyattan çok farklı fiyatlar — Erkan 14.11.2026'da onayladı (27 satır)

Excel fiyatı eski fiyatın %60'inin altında, ya da yalnız bu sayfa maliyet tablosundan farklı. Excel esas alındığı için **uygulandı**; Erkan yeni fiyatların geçerli olduğunu onayladı.

| kategori | ürün | eski | yazılan | neden şüpheli | kanıt | maliyet tablosu | outletler |
|---|---|---|---|---|---|---|---|
| ALKOLLÜ İÇECEKLER > APERATİFLER | LIMONCELLO | 20 | 10 | eski fiyatın %60'inin altında | IN ROOM DINING BEV. MENU satır 63: LEMONCELLO [S 10 / D 15 / Ş 160] | maliyet tablosunda yok | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| APERATİFLER | LIMONCELLO | 20 | 10 | eski fiyatın %60'inin altında | LOBBY BARS MENU satır 63: LEMONCELLO [S 10 / D 15 / Ş 160] | maliyet tablosunda yok | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MALT VİSKİLER | GLENFIDDICH 12 Y.O. | 30 | 40 | maliyet tablosu ve eski fiyat aynı, yalnız bu sayfa farklı | BEACH BEVERAGE MENU satır 244: GLENFIDDICH 12 Y.O. [S 40 / D 50 / Ş 400] | ÇELİŞKİ: maliyet tablosunda (satır 145) single 30, double 40 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| MALT VİSKİLER | LAGAVULIN DE 1995 16 Y.O. | 50 | 10 | eski fiyatın %60'inin altında | BEACH BEVERAGE MENU satır 245: LAGAVULIN DE 1995 16 Y.O. [S 10 / D 15 / Ş 175] | maliyet tablosunda yok | Diamond Pool Bar, Blue Sea Beach Bar |
| MALT VİSKİLER | TALISKER 10 Y.O. | 30 | 20 | maliyet tablosu ve eski fiyat aynı, yalnız bu sayfa farklı | BEACH BEVERAGE MENU satır 246: TALISKER 10 Y.O. [S 20 / D 30 / Ş 200] | ÇELİŞKİ: maliyet tablosunda (satır 153) single 30, double 40 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| MALT VİSKİLER | MACALLAN 12 Y.O. | 40 | 10 | maliyet tablosu ve eski fiyat aynı, yalnız bu sayfa farklı | BEACH BEVERAGE MENU satır 247: MACALLAN 12 Y.O. [S 10 / D 15 / Ş 175] | ÇELİŞKİ: maliyet tablosunda (satır 149) single 40, double 60 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| İRLANDA VİSKİLERİ | JAMESON | 15 | 10 | maliyet tablosu ve eski fiyat aynı, yalnız bu sayfa farklı | BEACH BEVERAGE MENU satır 269: JAMESON [S 10 / D 15 / Ş 175] | ÇELİŞKİ: maliyet tablosunda (satır 213) single 15, double 20 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| APERATİFLER | LIMONCELLO | 20 | 10 | eski fiyatın %60'inin altında | WHISKEY LOUNGE satır 27: LEMONCELLO [S 10 / D 15 / Ş 160] | maliyet tablosunda yok | Whiskey Lounge |
| KIRMIZI ŞARAPLAR > FRANCE | GRAND C RESERVE | 100 | 50 | eski fiyatın %60'inin altında | ROYALS WINE MENU satır 143: GRAND C RESERVE [kadeh — / şişe 50] | — | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | SEMASKA CÔTES-DU RHÔNE VILLAGES | 100 | 50 | eski fiyatın %60'inin altında | ROYALS WINE MENU satır 146: SEMASKA COTES- DU RHONE VILLAGES [kadeh — / şişe 50] | — | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | BRILLA PROSECCO BRUT | 200 | 100 | eski fiyatın %60'inin altında | ROYALS WINE MENU satır 361: BRILLA PROSECCO BRUT [kadeh — / şişe 100] | — | The Steakhouse |
| APERATİFLER | LIMONCELLO | 20 | 10 | eski fiyatın %60'inin altında | THE ROOF GARDEN satır 91: LEMONCELLO [S 10 / D 15 / Ş 160] | maliyet tablosunda yok | The Roof Garden |
| RED WINES > FRANCE | GRAND C RESERVE | 100 | 50 | eski fiyatın %60'inin altında | ROYALS WINE MENU satır 143: GRAND C RESERVE [kadeh — / şişe 50] | — | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | SEMASKA CÔTES-DU RHÔNE VILLAGES | 100 | 50 | eski fiyatın %60'inin altında | ROYALS WINE MENU satır 146: SEMASKA COTES- DU RHONE VILLAGES [kadeh — / şişe 50] | — | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | BRILLA PROSECCO BRUT | 200 | 100 | eski fiyatın %60'inin altında | ROYALS WINE MENU satır 361: BRILLA PROSECCO BRUT [kadeh — / şişe 100] | — | Royal Mandarin, Bella Merit |

## 2. Menü sayfası ile maliyet tablosu çelişiyor (12 satır)

Aynı ürünün menü sayfasındaki Single fiyatı, aynı dosyadaki maliyet tablosundan farklı. Menü sayfasındaki fiyat uygulandı; hangisinin doğru olduğunu otel teyit etmeli.

| kategori | ürün | eski | yazılan | kanıt | maliyet tablosu | outletler |
|---|---|---|---|---|---|---|
| SOĞUK İÇECEKLER > GAZLI İÇECEKLER | ENERJİ İÇECEĞİ | 8 | 8.4 | IN ROOM DINING BEV. MENU satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | ÇELİŞKİ: maliyet tablosunda (satır 287) single 7 $ | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7 | 8.4 | LOBBY BARS MENU satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | ÇELİŞKİ: maliyet tablosunda (satır 287) single 7 $ | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7 | 8.4 | BEACH BEVERAGE MENU satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | ÇELİŞKİ: maliyet tablosunda (satır 287) single 7 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | SICAK ÇİKOLATA | 15 | 15 | TEA LOUNGE MENU satır 21: SICAK ÇİKOLATA / HOT CHOCOLATE [S 15 / D — / Ş —] | ÇELİŞKİ: maliyet tablosunda (satır 387) single 20 $ | Tea Lounge |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7 | 8.4 | THE ROOF GARDEN satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | ÇELİŞKİ: maliyet tablosunda (satır 287) single 7 $ | The Roof Garden |
| BİRALAR | HEINEKEN | 10 | 10 | THE ROOF GARDEN satır 81: HEINEKEN [S 10 / D — / Ş —] | ÇELİŞKİ: maliyet tablosunda (satır 16) single 15 $ | The Roof Garden |
| SICAK İÇECEKLER | SICAK ÇİKOLATA | 15 | 15 | CAFE VERDE PREMIUM satır 21: SICAK ÇİKOLATA / HOT CHOCOLATE [S 15 / D — / Ş —] | ÇELİŞKİ: maliyet tablosunda (satır 387) single 20 $ | Cafe Verde |

## 3. Belirsiz: Excel aynı ürüne iki fiyat veriyor (7 satır)

Outlet'in sayfasında aynı ad iki ayrı satırda farklı fiyatla geçiyor; hangisi olduğu seçilemediği için eski fiyat korundu.

| kategori | ürün | mevcut | Excel | outletler |
|---|---|---|---|---|
| FRESH MEYVE SUYU | PORTAKAL | 10 | Excel'de satır 26 = 10 $, satır 47 = 20 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | GREYFURT | 10 | Excel'de satır 26 = 10 $, satır 47 = 20 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | ELMA | 10 | Excel'de satır 26 = 10 $, satır 47 = 20 $ | Diamond Pool Bar, Blue Sea Beach Bar |
| MEŞRUBATLAR | FRESH MEYVE SUYU | 10 | Excel'de satır 26 = 10 $, satır 45 = 20 $ | The Roof Garden |

## 4. Ad birebir değil: gözle kontrol edilecek eşleşmeler (195 satır)

Yazım farkı, çeşit listesi, başlık satırı ya da başka bölümdeki aynı ad üzerinden kurulan eşleşmeler.

| kategori | menüdeki ürün | eşleşme | Excel satırı | sütun | eski | yeni | durum | outletler |
|---|---|---|---|---|---|---|---|---|
| SOĞUK İÇECEKLER > SULAR | SU CAM 330 ml. | ad (başka bölüm) | IN ROOM DINING BEV. MENU satır 14: SU / WATER 330 ml. [S 5 / D — / Ş —] | C single | 5 | 5 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > SULAR | SAN PELLEGRINO | ad (başka bölüm) | IN ROOM DINING BEV. MENU satır 10: SAN PELLEGRINO [S 8.4 / D — / Ş —] | C single | 8 | 8.4 | değişti | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > SULAR | SODA | ad (başka bölüm) | IN ROOM DINING BEV. MENU satır 9: SODA / MINERAL WATER [S 5 / D — / Ş —] | C single | 5 | 5 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > MEYVE SUYU & SOĞUK ÇAY | MEYVE SUYU | ad (başka bölüm) | IN ROOM DINING BEV. MENU satır 6: MEYVE SUYU / FRUIT JUICE [S 7 / D — / Ş —] | C single | 7 | 7 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > MEYVE SUYU & SOĞUK ÇAY | LİMONATA | ad (başka bölüm) | IN ROOM DINING BEV. MENU satır 20: LİMONATA / LEMONADE [S 10 / D — / Ş —] | C single | 5 | 10 | değişti | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > APERATİFLER | LIMONCELLO | yakın ad | IN ROOM DINING BEV. MENU satır 63: LEMONCELLO [S 10 / D 15 / Ş 160] | C single | 20 | 10 | değişti | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > VOTKALAR | RUSSIAN STANDARD | yakın ad | IN ROOM DINING BEV. MENU satır 67: RUSSIAN STANDART [S 10 / D 15 / Ş 150] | C single | 10 | 10 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > TEKİLALAR | MILAGRO REPOSADO | yakın ad | IN ROOM DINING BEV. MENU satır 129: MILAGRA REPOSADO [S 10 / D 20 / Ş 150] | C single | 10 | 10 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > LİKÖRLER | DOM BÉNÉDICTINE | yakın ad | IN ROOM DINING BEV. MENU satır 187: DOM BENETICTINE [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > LİKÖRLER | GRANDE ABSENTE | yakın ad | IN ROOM DINING BEV. MENU satır 185: GRANDE ABSENTH [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > LİKÖRLER | SKINOS | yakın ad | IN ROOM DINING BEV. MENU satır 178: SKINOSS [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > LİKÖRLER | BATIDA DE CÔCO | yakın ad | IN ROOM DINING BEV. MENU satır 177: BATI DE COCO [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > LİKÖRLER | UNDERBERG | ad | IN ROOM DINING BEV. MENU satır 156: UNDERBERG [S — / D 20 / Ş —] | D (yalnız Double sütunu dolu) | 20 | 20 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > İSKOÇ VİSKİLER | JUSTERINI & BROOKS RARE | yakın ad | IN ROOM DINING BEV. MENU satır 276: JUSTERINI & BROOKS BARE [S 10 / D 15 / Ş 175] | C single | 10 | 10 | aynı | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MEŞRUBATLAR | FRESH MEYVE SUYU | ad (başka bölüm) | LOBBY BARS MENU satır 26: FRESH MEYVE SUYU/ FRESH FRUIT JUICE ← PORTAKAL, GREYFURT, HA [S 10 / D — / Ş —] | C single | 10 | 10 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| APERATİFLER | LIMONCELLO | yakın ad | LOBBY BARS MENU satır 63: LEMONCELLO [S 10 / D 15 / Ş 160] | C single | 20 | 10 | değişti | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| VOTKALAR | RUSSIAN STANDARD | yakın ad | LOBBY BARS MENU satır 67: RUSSIAN STANDART [S 10 / D 15 / Ş 150] | C single | 10 | 10 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| TEKİLALAR | MILAGRO REPOSADO | yakın ad | LOBBY BARS MENU satır 118: MILAGRA REPOSADO [S 10 / D 20 / Ş 150] | C single | 10 | 10 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | UNDERBERG | ad | LOBBY BARS MENU satır 140: UNDERBERG [S — / D 20 / Ş —] | D (yalnız Double sütunu dolu) | — | 20 | yeni | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | BATIDA DE CÔCO | yakın ad | LOBBY BARS MENU satır 155: BATI DE COCO [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | SKINOS | yakın ad | LOBBY BARS MENU satır 156: SKINOSS [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | GRANDE ABSENTE | yakın ad | LOBBY BARS MENU satır 163: GRANDE ABSENTH [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | DOM BÉNÉDICTINE | yakın ad | LOBBY BARS MENU satır 165: DOM BENETICTINE [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| İSKOÇ VİSKİLER | JUSTERINI & BROOKS RARE | yakın ad | LOBBY BARS MENU satır 206: JUSTERINI & BROOKS BARE [S 10 / D 15 / Ş 175] | C single | 10 | 10 | aynı | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| FRESH MEYVE SUYU | HAVUÇ | çeşit | BEACH BEVERAGE MENU satır 26: PORTAKAL, GREYFURT, HAVUÇ, ELMA [S 10 / D — / Ş —] | C single | 10 | 10 | aynı | Diamond Pool Bar |
| FRESH MEYVE SUYU | KARPUZ | çeşit | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | C single | — | 20 | yeni | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KAVUN | çeşit | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | C single | — | 20 | yeni | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KİVİ | çeşit | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | C single | — | 20 | yeni | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KARIŞIK | çeşit | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | C single | 10 | 20 | değişti | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | ÇİLEK | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | ELMA | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | KARPUZ | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | KAVUN | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | KİVİ | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | MUZ-SÜT-BAL | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | MUZ | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | NANE-LİMON | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | PORTAKAL | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SERİNLETİCİ SMOOTHIE | SALATALIK | çeşit | BEACH BEVERAGE MENU satır 52: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | VANİLYA | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | DAMLA SAKIZ | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | KAKAO | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | ÇİKOLATA | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | KARAMEL | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | ÇİLEK | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | VİŞNE | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | LİMON | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| MILKSHAKES | KAVUN | çeşit | BEACH BEVERAGE MENU satır 62: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | BLOODY MARY | yakın ad | BEACH BEVERAGE MENU satır 94: BLOODY MARRY [S 35 / D — / Ş —] | C single | — | 35 | yeni | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | CAIPIRINHA | yakın ad | BEACH BEVERAGE MENU satır 96: CAIRPIRINHA [S 35 / D — / Ş —] | C single | 35 | 35 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | LONG ISLAND ICED TEA | yakın ad | BEACH BEVERAGE MENU satır 102: LONG ISLAND ICE TEA [S 35 / D — / Ş —] | C single | — | 35 | yeni | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | LYNCHBURG LEMONADE | yakın ad | BEACH BEVERAGE MENU satır 104: LYNCBURG LEMONADE [S 35 / D — / Ş —] | C single | 20 | 35 | değişti | Diamond Pool Bar, Blue Sea Beach Bar |
| LİKÖRLER | BATIDA DE CÔCO | yakın ad | BEACH BEVERAGE MENU satır 220: BATI DE COCO [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| LİKÖRLER | GRANDE ABSENTE | yakın ad | BEACH BEVERAGE MENU satır 226: GRANDE ABSENTH [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| İSKOÇ VİSKİLER | JUSTERINI & BROOKS RARE | yakın ad | BEACH BEVERAGE MENU satır 255: JUSTERINI & BROOKS BARE [S 10 / D 15 / Ş 175] | C single | 10 | 10 | aynı | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | TAZE DEMLEME BİTKİ ÇAYLARI | ad (başka bölüm) | TEA LOUNGE MENU satır 28: TAZE DEMLEME BİTKİ ÇAYLARI / FRESHLY BREWED HERBAL TEAS ← KI [S 7 / D — / Ş —] | C single | — | 7 | yeni | Tea Lounge |
| SICAK İÇECEKLER | 3. NESİL KAHVELER | ad (başka bölüm) | TEA LOUNGE MENU satır 33: 3. NESİL KAHVELER / THIRD GENERATION COFFEES ← CHEMEX , V60  [S 20 / D — / Ş —] | C single | — | 20 | yeni | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | GREEN ANGEL | yakın ad | TEA LOUNGE MENU satır 39: GREEN ANGLE [S 10 / D — / Ş —] | C single | — | 10 | yeni | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | HUCKLEBERRY FRIEND | yakın ad | TEA LOUNGE MENU satır 75: HUCCKLEBERRY FRIEND [S 20 / D — / Ş —] | C single | — | 20 | yeni | Tea Lounge |
| SOĞUK KAHVELER | AFFOGATO | yakın ad | TEA LOUNGE MENU satır 125: AFFAGATO [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Tea Lounge |
| APERATİFLER | LIMONCELLO | yakın ad | WHISKEY LOUNGE satır 27: LEMONCELLO [S 10 / D 15 / Ş 160] | C single | 20 | 10 | değişti | Whiskey Lounge |
| VOTKALAR | RUSSIAN STANDARD | yakın ad | WHISKEY LOUNGE satır 31: RUSSIAN STANDART [S 10 / D 15 / Ş 150] | C single | 10 | 10 | aynı | Whiskey Lounge |
| TEKİLALAR | MILAGRO REPOSADO | yakın ad | WHISKEY LOUNGE satır 92: MILAGRA REPOSADO [S 10 / D 20 / Ş 150] | C single | 10 | 10 | aynı | Whiskey Lounge |
| TEKİLALAR | CLASE AZUL PLATA | yakın ad | WHISKEY LOUNGE satır 94: CLASSE AZUL PLATA [S 40 / D 60 / Ş 600] | C single | 40 | 40 | aynı | Whiskey Lounge |
| TEKİLALAR | CLASE AZUL REPOSADO | yakın ad | WHISKEY LOUNGE satır 95: CLASSE AZUL REPOSADO [S 90 / D 150 / Ş 1000] | C single | 90 | 90 | aynı | Whiskey Lounge |
| LİKÖRLER | UNDERBERG | ad | WHISKEY LOUNGE satır 119: UNDERBERG [S — / D 20 / Ş —] | D (yalnız Double sütunu dolu) | — | 20 | yeni | Whiskey Lounge |
| LİKÖRLER | BATIDA DE CÔCO | yakın ad | WHISKEY LOUNGE satır 140: BATI DE COCO [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Whiskey Lounge |
| LİKÖRLER | SKINOS | yakın ad | WHISKEY LOUNGE satır 141: SKINOSS [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Whiskey Lounge |
| LİKÖRLER | GRANDE ABSENTE | yakın ad | WHISKEY LOUNGE satır 148: GRANDE ABSENTH [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Whiskey Lounge |
| LİKÖRLER | DOM BÉNÉDICTINE | yakın ad | WHISKEY LOUNGE satır 150: DOM BENETICTINE [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | Whiskey Lounge |
| DÜNYA VİSKİLERİ | KAVALAN DISTILLERY SELECT | yakın ad | WHISKEY LOUNGE satır 160: KAVALAN DISTTILLERY SELECT [S 20 / D 30 / Ş 200] | C single | 20 | 20 | aynı | Whiskey Lounge |
| DÜNYA VİSKİLERİ | KAVALAN CONCERTMASTER | yakın ad | WHISKEY LOUNGE satır 162: KAVALAN CONCERT MASTER [S 30 / D 40 / Ş 250] | C single | 30 | 30 | aynı | Whiskey Lounge |
| MALT VİSKİLER | CAOL ILA 12 Y.O. | yakın ad | WHISKEY LOUNGE satır 191: COAL ILA 12 Y.O. [S 30 / D 40 / Ş 250] | C single | 30 | 30 | aynı | Whiskey Lounge |
| MALT VİSKİLER | ARDBEG 10 Y.O. | yakın ad | WHISKEY LOUNGE satır 193: ARDBERG 10 Y.O. [S 30 / D 40 / Ş 250] | C single | 30 | 30 | aynı | Whiskey Lounge |
| MALT VİSKİLER | BENRIACH 10 Y.O. | yakın ad | WHISKEY LOUNGE satır 195: BENRIARCH 10 Y.O. [S 30 / D 40 / Ş 250] | C single | — | 30 | yeni | Whiskey Lounge |
| MALT VİSKİLER | BENRIACH 12 Y.O. | yakın ad | WHISKEY LOUNGE satır 196: BENRIARCH 12 Y.O. [S 30 / D 40 / Ş 250] | C single | — | 30 | yeni | Whiskey Lounge |
| İSKOÇ VİSKİLER | JUSTERINI & BROOKS RARE | yakın ad | WHISKEY LOUNGE satır 238: JUSTERINI & BROOKS BARE [S 10 / D 15 / Ş 175] | C single | 10 | 10 | aynı | Whiskey Lounge |
| KIRMIZI ŞARAPLAR > TÜRKİYE | SUVLA | ad (kısaltılmış) | ROYALS WINE MENU satır 71: SUVLA RESERVE [kadeh — / şişe 100] | D şişe | 100 | 100 | aynı | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | EPICURO Z-ELEBRATE OLD ZINFANDEL | yakın ad | ROYALS WINE MENU satır 79: EPICURO Z-ELEBRATE OLD ZINDANFEL [kadeh — / şişe 50] | D şişe | 70 | 50 | değişti | The Steakhouse |
| KIRMIZI ŞARAPLAR > CHILE | PUERTO VIEJO RESERVE | yakın ad | ROYALS WINE MENU satır 132: PUERTO VIEJO RESEREVE [kadeh — / şişe 50] | D şişe | 70 | 50 | değişti | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | CHEVAL NOIR BORDEAUX ROUGE RED WINE (Kadeh) | ad (kısaltılmış) | ROYALS WINE MENU satır 140: CHEVAL NOIR BORDEAUX ROUGE [kadeh 20 / şişe 70] | C kadeh | 15 | 20 | değişti | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | CHEVAL NOIR BORDEAUX ROUGE RED WINE (Şişe) | ad (kısaltılmış) | ROYALS WINE MENU satır 140: CHEVAL NOIR BORDEAUX ROUGE [kadeh 20 / şişe 70] | D şişe | 70 | 70 | aynı | The Steakhouse |
| BEYAZ ŞARAPLAR > ITALY | RICOSSA GAVI | yakın ad | ROYALS WINE MENU satır 197: RICOSA GAVI [kadeh — / şişe 100] | D şişe | 100 | 100 | aynı | The Steakhouse |
| BEYAZ ŞARAPLAR > ITALY | LA SCOLCA GAVI DEI GAVI | yakın ad | ROYALS WINE MENU satır 200: LA SCOLCA GAVI DE GAVI [kadeh — / şişe 150] | D şişe | 150 | 150 | aynı | The Steakhouse |
| BEYAZ ŞARAPLAR > NEW ZEALAND | CLOUDY BAY | yakın ad + açıklama | ROYALS WINE MENU satır 237: CLOUD BAY [kadeh — / şişe 100] | D şişe | 120 | 100 | değişti | The Steakhouse |
| ROSÉ ŞARAPLAR > FRANCE | CHATEUA D'ESCLANS WHISPERING ANGEL ROSÉ | yakın ad | ROYALS WINE MENU satır 323: CHATEAU D'ESCLANS WHISPERING ANGEL ROSE [kadeh — / şişe 200] | D şişe | 200 | 200 | aynı | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | BAGLIETTI GOLD EDITION BLANC DE BLANCS | yakın ad | ROYALS WINE MENU satır 376: BAGLIETTI GOLD EDITION BLAC DE BLANCS [kadeh — / şişe 60] | D şişe | 60 | 60 | aynı | The Steakhouse |
| APERATİFLER | LIMONCELLO | yakın ad | THE ROOF GARDEN satır 91: LEMONCELLO [S 10 / D 15 / Ş 160] | C single | 20 | 10 | değişti | The Roof Garden |
| LİKÖRLER | SKINOS | yakın ad | THE ROOF GARDEN satır 167: SKINOSS [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | The Roof Garden |
| LİKÖRLER | GRANDE ABSENTE | yakın ad | THE ROOF GARDEN satır 172: GRANDE ABSENTH [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | The Roof Garden |
| LİKÖRLER | DOM BÉNÉDICTINE | yakın ad | THE ROOF GARDEN satır 174: DOM BENETICTINE [S 20 / D 30 / Ş 175] | C single | 20 | 20 | aynı | The Roof Garden |
| MALT VİSKİLER | ARDBEG 10 Y.O. | yakın ad | THE ROOF GARDEN satır 188: ARDBERG 10 Y.O. [S 30 / D 40 / Ş 250] | C single | 30 | 30 | aynı | The Roof Garden |
| RED WINES > TÜRKİYE | SUVLA | ad (kısaltılmış) | ROYALS WINE MENU satır 71: SUVLA RESERVE [kadeh — / şişe 100] | D şişe | 100 | 100 | aynı | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | EPICURO Z-ELEBRATE ZINFANDEL | yakın ad | ROYALS WINE MENU satır 79: EPICURO Z-ELEBRATE OLD ZINDANFEL [kadeh — / şişe 50] | D şişe | 70 | 50 | değişti | Royal Mandarin, Bella Merit |
| RED WINES > CHILE | PUERTO VIEJO RESERVE | yakın ad | ROYALS WINE MENU satır 132: PUERTO VIEJO RESEREVE [kadeh — / şişe 50] | D şişe | 70 | 50 | değişti | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | CHEVAL NOIR BORDEAUX ROUGE RED WINE (Kadeh) | ad (kısaltılmış) | ROYALS WINE MENU satır 140: CHEVAL NOIR BORDEAUX ROUGE [kadeh 20 / şişe 70] | C kadeh | 15 | 20 | değişti | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | CHEVAL NOIR BORDEAUX ROUGE RED WINE (Şişe) | ad (kısaltılmış) | ROYALS WINE MENU satır 140: CHEVAL NOIR BORDEAUX ROUGE [kadeh 20 / şişe 70] | D şişe | 70 | 70 | aynı | Royal Mandarin, Bella Merit |
| WHITE WINES > ITALY | RICOSSA GAVI | yakın ad | ROYALS WINE MENU satır 197: RICOSA GAVI [kadeh — / şişe 100] | D şişe | 100 | 100 | aynı | Royal Mandarin, Bella Merit |
| WHITE WINES > ITALY | LA SCOLCA GAVI DEI GAVI | yakın ad | ROYALS WINE MENU satır 200: LA SCOLCA GAVI DE GAVI [kadeh — / şişe 150] | D şişe | 150 | 150 | aynı | Royal Mandarin, Bella Merit |
| WHITE WINES > NEW ZEALAND | CLOUDY BAY | yakın ad + açıklama | ROYALS WINE MENU satır 237: CLOUD BAY [kadeh — / şişe 100] | D şişe | 120 | 100 | değişti | Royal Mandarin, Bella Merit |
| ROSÉ WINES > FRANCE | CHATEUA D'ESCLANS WHISPERING ANGEL ROSÉ | yakın ad | ROYALS WINE MENU satır 323: CHATEAU D'ESCLANS WHISPERING ANGEL ROSE [kadeh — / şişe 200] | D şişe | 200 | 200 | aynı | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | BAGLIETTI GOLD EDITION BLANC DE BLANCS | yakın ad | ROYALS WINE MENU satır 376: BAGLIETTI GOLD EDITION BLAC DE BLANCS [kadeh — / şişe 60] | D şişe | 60 | 60 | aynı | Royal Mandarin, Bella Merit |
| SICAK İÇECEKLER | TAZE DEMLEME BİTKİ ÇAYLARI | ad (başka bölüm) | CAFE VERDE PREMIUM satır 28: TAZE DEMLEME BİTKİ ÇAYLARI / FRESHLY BREWED HERBAL TEAS ← KI [S 7 / D — / Ş —] | C single | — | 7 | yeni | Cafe Verde |
| SICAK İÇECEKLER | 3. NESİL KAHVELER | ad (başka bölüm) | CAFE VERDE PREMIUM satır 33: 3. NESİL KAHVELER / THIRD GENERATION COFFEES ← CHEMEX , V60  [S 20 / D — / Ş —] | C single | — | 20 | yeni | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | GREEN ANGEL | yakın ad | CAFE VERDE PREMIUM satır 39: GREEN ANGLE [S 10 / D — / Ş —] | C single | — | 10 | yeni | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | HUCKLEBERRY FRIEND | yakın ad | CAFE VERDE PREMIUM satır 75: HUCCKLEBERRY FRIEND [S 20 / D — / Ş —] | C single | — | 20 | yeni | Cafe Verde |
| SOĞUK KAHVELER | AFFOGATO | yakın ad | CAFE VERDE PREMIUM satır 125: AFFAGATO [S 20 / D — / Ş —] | C single | 20 | 20 | aynı | Cafe Verde |

## 5. Uygulanan değişiklikler (329 satır)

| kategori | ürün | eski | yeni | sütun | Excel satırı | outletler |
|---|---|---|---|---|---|---|
| SICAK İÇECEKLER > KAHVELER | TÜRK KAHVESİ | 10 | 20 | C single | IN ROOM DINING BEV. MENU satır 37: TÜRK KAHVESİ / TURKISH COFFEE [S 20 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER > SALEP & SICAK ÇİKOLATA | SICAK ÇİKOLATA | 15 | 20 | C single | IN ROOM DINING BEV. MENU satır 41: SICAK ÇİKOLATA / HOT CHOCOLATE [S 20 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > SULAR | SAN PELLEGRINO | 8 | 8.4 | C single | IN ROOM DINING BEV. MENU satır 10: SAN PELLEGRINO [S 8.4 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > GAZLI İÇECEKLER | ENERJİ İÇECEĞİ | 8 | 8.4 | C single | IN ROOM DINING BEV. MENU satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > MEYVE SUYU & SOĞUK ÇAY | LİMONATA | 5 | 10 | C single | IN ROOM DINING BEV. MENU satır 20: LİMONATA / LEMONADE [S 10 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > BİRALAR | HEINEKEN | 10 | 15 | C single | IN ROOM DINING BEV. MENU satır 50: HEINEKEN [S 15 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > APERATİFLER | LIMONCELLO | 20 | 10 | C single | IN ROOM DINING BEV. MENU satır 63: LEMONCELLO [S 10 / D 15 / Ş 160] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > MALT VİSKİLER | OBAN 14 Y.O. | 40 | 30 | C single | IN ROOM DINING BEV. MENU satır 237: OBAN 14 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > İRLANDA VİSKİLERİ | JAMESON | 20 | 15 | C single | IN ROOM DINING BEV. MENU satır 296: JAMESON [S 15 / D 20 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MEŞRUBATLAR | SAN PELLEGRINO | 8 | 8.4 | C single | LOBBY BARS MENU satır 10: SAN PELLEGRINO [S 8.4 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MEŞRUBATLAR | LİMONATA | 5 | 10 | C single | LOBBY BARS MENU satır 20: LİMONATA / LEMONADE [S 10 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7 | 8.4 | C single | LOBBY BARS MENU satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| SICAK İÇECEKLER | ESPRESSO, RISTRETTO, LUNGO | 10 | 15 | C single | LOBBY BARS MENU satır 31: ESPRESSO, RISTRETTO, LUNGO [S 15 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| SICAK İÇECEKLER | TÜRK KAHVESİ | 10 | 20 | C single | LOBBY BARS MENU satır 37: TÜRK KAHVESİ / TURKISH COFFEE [S 20 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| SICAK İÇECEKLER | SICAK ÇİKOLATA | 15 | 20 | C single | LOBBY BARS MENU satır 41: SICAK ÇİKOLATA / HOT CHOCOLATE [S 20 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| BİRALAR | HEINEKEN | 10 | 15 | C single | LOBBY BARS MENU satır 50: HEINEKEN [S 15 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| APERATİFLER | LIMONCELLO | 20 | 10 | C single | LOBBY BARS MENU satır 63: LEMONCELLO [S 10 / D 15 / Ş 160] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MEŞRUBATLAR | SAN PELLEGRINO | 8 | 8.4 | C single | BEACH BEVERAGE MENU satır 10: SAN PELLEGRINO [S 8.4 / D — / Ş —] | Diamond Pool Bar |
| MEŞRUBATLAR | LİMONATA | 5 | 10 | C single | BEACH BEVERAGE MENU satır 20: LİMONATA / LEMONADE [S 10 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7 | 8.4 | C single | BEACH BEVERAGE MENU satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KARIŞIK | 10 | 20 | C single | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | TÜRK KAHVESİ | 10 | 20 | C single | BEACH BEVERAGE MENU satır 35: TÜRK KAHVESİ / TURKISH COFFEE [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | FILTER COFFEE | 15 | 20 | C single | BEACH BEVERAGE MENU satır 39: FILTER COFFEE [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | SICAK ÇİKOLATA | 15 | 20 | C single | BEACH BEVERAGE MENU satır 43: SICAK ÇİKOLATA / HOT CHOCOLATE [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | LYNCHBURG LEMONADE | 20 | 35 | C single | BEACH BEVERAGE MENU satır 104: LYNCBURG LEMONADE [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| BİRALAR | HEINEKEN | 10 | 15 | C single | BEACH BEVERAGE MENU satır 128: HEINEKEN [S 15 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| MALT VİSKİLER | GLENFIDDICH 12 Y.O. | 30 | 40 | C single | BEACH BEVERAGE MENU satır 244: GLENFIDDICH 12 Y.O. [S 40 / D 50 / Ş 400] | Diamond Pool Bar, Blue Sea Beach Bar |
| MALT VİSKİLER | LAGAVULIN DE 1995 16 Y.O. | 50 | 10 | C single | BEACH BEVERAGE MENU satır 245: LAGAVULIN DE 1995 16 Y.O. [S 10 / D 15 / Ş 175] | Diamond Pool Bar, Blue Sea Beach Bar |
| MALT VİSKİLER | TALISKER 10 Y.O. | 30 | 20 | C single | BEACH BEVERAGE MENU satır 246: TALISKER 10 Y.O. [S 20 / D 30 / Ş 200] | Diamond Pool Bar, Blue Sea Beach Bar |
| MALT VİSKİLER | MACALLAN 12 Y.O. | 40 | 10 | C single | BEACH BEVERAGE MENU satır 247: MACALLAN 12 Y.O. [S 10 / D 15 / Ş 175] | Diamond Pool Bar, Blue Sea Beach Bar |
| İRLANDA VİSKİLERİ | JAMESON | 15 | 10 | C single | BEACH BEVERAGE MENU satır 269: JAMESON [S 10 / D 15 / Ş 175] | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | TÜRK KAHVESİ | 10 | 20 | C single | TEA LOUNGE MENU satır 8: TÜRK KAHVESİ / TURKISH COFFEE [S 20 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | DAMLA SAKIZLI TÜRK KAHVESİ | 15 | 20 | C single | TEA LOUNGE MENU satır 9: DAMLA SAKIZLI TÜRK KAHVESİ / TURKISH COFFEE WITH MASTIC GUM [S 20 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | FİLTRE KAHVE | 15 | 20 | C single | TEA LOUNGE MENU satır 10: FİLTRE KAHVE / FILTER COFFEE [S 20 / D — / Ş —] | Tea Lounge |
| BİRALAR | HEINEKEN | 10 | 15 | C single | WHISKEY LOUNGE satır 11: HEINEKEN [S 15 / D — / Ş —] | Whiskey Lounge |
| APERATİFLER | LIMONCELLO | 20 | 10 | C single | WHISKEY LOUNGE satır 27: LEMONCELLO [S 10 / D 15 / Ş 160] | Whiskey Lounge |
| LİKÖRLER | WENNEKER CREME DE MENTHE | 30 | 20 | C single | WHISKEY LOUNGE satır 122: WENNEKER CREME DE MENTHE [S 20 / D 30 / Ş 175] | Whiskey Lounge |
| MALT VİSKİLER | GLENMORANGIE LASANTA 12 Y.O. | 40 | 30 | C single | WHISKEY LOUNGE satır 213: GLENMORANGIE LASANTA 12 Y.O. [S 30 / D 40 / Ş 250] | Whiskey Lounge |
| İSKOÇ VİSKİLER | THE NAKED GROUSE | 15 | 10 | C single | WHISKEY LOUNGE satır 232: THE NAKED GROUSE [S 10 / D 15 / Ş 175] | Whiskey Lounge |
| İSKOÇ VİSKİLER | JOHNNIE WALKER DOUBLE BLACK | 30 | 20 | C single | WHISKEY LOUNGE satır 248: JOHNNIE WALKER DOUBLE BLACK [S 20 / D 40 / Ş 250] | Whiskey Lounge |
| KAV ŞARAPLARI > ITALY | SASSICAIA | 990 | 880 | D şişe | ROYALS WINE MENU satır 43: SASSICAIA [kadeh — / şişe 880] | The Steakhouse |
| KIRMIZI ŞARAPLAR > TÜRKİYE | SARAFİN (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 50: SARAFİN CABERNET SAUVIGNON [kadeh 25 / şişe 100] | The Steakhouse |
| KIRMIZI ŞARAPLAR > TÜRKİYE | KAVAKLIDERE SELECTION (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 59: KAVAKLIDERE SELECTION [kadeh 25 / şişe 100] | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | CIABOT DEL CONTE BAROLO | 120 | 100 | D şişe | ROYALS WINE MENU satır 76: CIABOT DEL CONTE BAROLO [kadeh — / şişe 100] | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | EPICURO Z-ELEBRATE OLD ZINFANDEL | 70 | 50 | D şişe | ROYALS WINE MENU satır 79: EPICURO Z-ELEBRATE OLD ZINDANFEL [kadeh — / şişe 50] | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | DUCA DI SARAGNANO CHIANTI RISERVA | 70 | 50 | D şişe | ROYALS WINE MENU satır 85: DUCA DI SARAGNANO CHIANTI RISERVA [kadeh — / şişe 50] | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | CASA DEFRÀ AMARONE DELLA VALPOLICELLA | 120 | 100 | D şişe | ROYALS WINE MENU satır 91: CASA DEFRA AMARONE DELLA VALPOLICELLA [kadeh — / şişe 100] | The Steakhouse |
| KIRMIZI ŞARAPLAR > CHILE | PUERTO VIEJO RESERVE | 70 | 50 | D şişe | ROYALS WINE MENU satır 132: PUERTO VIEJO RESEREVE [kadeh — / şişe 50] | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | CHEVAL NOIR BORDEAUX ROUGE RED WINE (Kadeh) | 15 | 20 | C kadeh | ROYALS WINE MENU satır 140: CHEVAL NOIR BORDEAUX ROUGE [kadeh 20 / şişe 70] | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | GRAND C RESERVE | 100 | 50 | D şişe | ROYALS WINE MENU satır 143: GRAND C RESERVE [kadeh — / şişe 50] | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | SEMASKA CÔTES-DU RHÔNE VILLAGES | 100 | 50 | D şişe | ROYALS WINE MENU satır 146: SEMASKA COTES- DU RHONE VILLAGES [kadeh — / şişe 50] | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | CHATEAU LA COURONNE SAINT- ÉMILION GRAND CRU | 100 | 70 | D şişe | ROYALS WINE MENU satır 149: CHATEAU LA COURONNE SAINT-EMILION GRAND CRU [kadeh — / şişe 70] | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | LA CÔTE DE L'ANGE CHATEAUNEUF DU PAPE | 140 | 130 | D şişe | ROYALS WINE MENU satır 152: LA COTE DE L'ANGE CHATEAUNEUF DU PAPE [kadeh — / şişe 130] | The Steakhouse |
| BEYAZ ŞARAPLAR > TÜRKİYE | SARAFİN (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 168: SARAFİN SAUVIGNON BLANC [kadeh 25 / şişe 100] | The Steakhouse |
| BEYAZ ŞARAPLAR > TÜRKİYE | KAVAKLIDERE SELECTION (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 174: KAVAKLIDERE SELECTION [kadeh 25 / şişe 100] | The Steakhouse |
| BEYAZ ŞARAPLAR > PORTUGAL | MONTE DO CARRAPATELO | 50 | 70 | D şişe | ROYALS WINE MENU satır 222: MONTE DO CARRAPATELO [kadeh — / şişe 70] | The Steakhouse |
| BEYAZ ŞARAPLAR > NEW ZEALAND | CLOUDY BAY | 120 | 100 | D şişe | ROYALS WINE MENU satır 237: CLOUD BAY [kadeh — / şişe 100] | The Steakhouse |
| BEYAZ ŞARAPLAR > FRANCE | CHEVAL NOIR BORDEAUX (Kadeh) | 15 | 20 | C kadeh | ROYALS WINE MENU satır 253: CHEVAL NOIR BORDEAUX [kadeh 20 / şişe 70] | The Steakhouse |
| BEYAZ ŞARAPLAR > FRANCE | LE BIJOU | 70 | 50 | D şişe | ROYALS WINE MENU satır 256: LE BIJOU [kadeh — / şişe 50] | The Steakhouse |
| BEYAZ ŞARAPLAR > FRANCE | THOMAS LABILLE CHABLIS PREMIER CRU | 120 | 100 | D şişe | ROYALS WINE MENU satır 268: THOMAS LABILLE CHABLIS PREMIER CRU [kadeh — / şişe 100] | The Steakhouse |
| ROSÉ ŞARAPLAR > TÜRKİYE | SARAFİN (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 287: SARAFIN MERLOT, CABERNET FRANC [kadeh 25 / şişe 100] | The Steakhouse |
| ROSÉ ŞARAPLAR > ITALY | 11 MINUTES PASQUA | 70 | 100 | D şişe | ROYALS WINE MENU satır 298: 11 MINUTES PASQUA [kadeh — / şişe 100] | The Steakhouse |
| ROSÉ ŞARAPLAR > FRANCE | CHEVAL NOIR BORDEAUX ROSÉ (Kadeh) | 15 | 20 | C kadeh | ROYALS WINE MENU satır 308: CHEVAL NOIR BORDEAUX ROSE [kadeh 20 / şişe 70] | The Steakhouse |
| PORTO & YARI TATLI ŞARAPLAR > PORTUGAL | MARTHA'S RUBY PORT WINE | 70 | 100 | D şişe | ROYALS WINE MENU satır 340: MARTHA'S RUBY PORT WINE [kadeh — / şişe 100] | The Steakhouse |
| PORTO & YARI TATLI ŞARAPLAR > PORTUGAL | MARTHA'S TAWNY PORT WINE | 70 | 100 | D şişe | ROYALS WINE MENU satır 343: MARTHA'S TAWNY PORT WINE [kadeh — / şişe 100] | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | NOBILIS PROSECCO EXTRA DRY | 50 | 60 | D şişe | ROYALS WINE MENU satır 358: NOBILIS PROSECCO EXTRA DRY [kadeh 15 / şişe 60] | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | BRILLA PROSECCO BRUT | 200 | 100 | D şişe | ROYALS WINE MENU satır 361: BRILLA PROSECCO BRUT [kadeh — / şişe 100] | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | BRILLA PROSECCO ROSÉ | 200 | 120 | D şişe | ROYALS WINE MENU satır 364: BRILLA PROSECCO ROSE [kadeh — / şişe 120] | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | BOTTEGA GOLD PROSECCO BRUT | 150 | 250 | D şişe | ROYALS WINE MENU satır 367: BOTTEGA GOLD PROSECCO BRUT [kadeh — / şişe 250] | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | BOTTEGA ROSÉ GOLD PROSECCO | 150 | 250 | D şişe | ROYALS WINE MENU satır 370: BOTTEGA ROSE GOLD PROSECCO [kadeh — / şişe 250] | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > FRANCE | DOM PERIGNON BRUT CHAMPAGNE | 1650 | 2650 | D şişe | ROYALS WINE MENU satır 402: DOM PERIGNON BRUT CHAMPAGNE [kadeh — / şişe 2650] | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > FRANCE | DOM PERIGNON ROSÉ BRUT CHAMPAGNE | 2550 | 3850 | D şişe | ROYALS WINE MENU satır 405: DOM PERIGNON ROSE BRUT CHAMPAGNE [kadeh — / şişe 3850] | The Steakhouse |
| MEŞRUBATLAR | SAN PELLEGRINO | 8 | 8.4 | C single | THE ROOF GARDEN satır 10: SAN PELLEGRINO [S 8.4 / D — / Ş —] | The Roof Garden |
| MEŞRUBATLAR | LİMONATA | 5 | 10 | C single | THE ROOF GARDEN satır 20: LİMONATA / LEMONADE [S 10 / D — / Ş —] | The Roof Garden |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7 | 8.4 | C single | THE ROOF GARDEN satır 21: ENERJİ İÇECEĞİ / ENERGY DRINK [S 8.4 / D — / Ş —] | The Roof Garden |
| SICAK İÇECEKLER | ESPRESSO, RISTRETTO, LUNGO | 10 | 15 | C single | THE ROOF GARDEN satır 31: ESPRESSO, RISTRETTO, LUNGO [S 15 / D — / Ş —] | The Roof Garden |
| SICAK İÇECEKLER | TÜRK KAHVESİ | 10 | 20 | C single | THE ROOF GARDEN satır 37: TÜRK KAHVESİ / TURKISH COFFEE [S 20 / D — / Ş —] | The Roof Garden |
| SICAK İÇECEKLER | SICAK ÇİKOLATA | 15 | 20 | C single | THE ROOF GARDEN satır 41: SICAK ÇİKOLATA / HOT CHOCOLATE [S 20 / D — / Ş —] | The Roof Garden |
| APERATİFLER | LIMONCELLO | 20 | 10 | C single | THE ROOF GARDEN satır 91: LEMONCELLO [S 10 / D 15 / Ş 160] | The Roof Garden |
| MALT VİSKİLER | GLENMORANGIE 12 Y.O. | 40 | 30 | C single | THE ROOF GARDEN satır 199: GLENMORANGIE 12 Y.O. [S 30 / D 40 / Ş 250] | The Roof Garden |
| İSKOÇ VİSKİLER | JOHNNIE WALKER DOUBLE BLACK | 30 | 20 | C single | THE ROOF GARDEN satır 217: JOHNNIE WALKER DOUBLE BLACK [S 20 / D 40 / Ş 250] | The Roof Garden |
| RARE VINTAGE WINES > ITALY | SASSICAIA | 990 | 880 | D şişe | ROYALS WINE MENU satır 43: SASSICAIA [kadeh — / şişe 880] | Royal Mandarin, Bella Merit |
| RED WINES > TÜRKİYE | SARAFİN (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 50: SARAFİN CABERNET SAUVIGNON [kadeh 25 / şişe 100] | Royal Mandarin, Bella Merit |
| RED WINES > TÜRKİYE | KAVAKLIDERE SELECTION (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 59: KAVAKLIDERE SELECTION [kadeh 25 / şişe 100] | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | CIABOT DEL CONTE BAROLO | 120 | 100 | D şişe | ROYALS WINE MENU satır 76: CIABOT DEL CONTE BAROLO [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | EPICURO Z-ELEBRATE ZINFANDEL | 70 | 50 | D şişe | ROYALS WINE MENU satır 79: EPICURO Z-ELEBRATE OLD ZINDANFEL [kadeh — / şişe 50] | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | DUCA DI SARAGNANO CHIANTI RISERVA | 70 | 50 | D şişe | ROYALS WINE MENU satır 85: DUCA DI SARAGNANO CHIANTI RISERVA [kadeh — / şişe 50] | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | CASA DEFRÀ AMARONE DELLA VALPOLICELLA | 120 | 100 | D şişe | ROYALS WINE MENU satır 91: CASA DEFRA AMARONE DELLA VALPOLICELLA [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| RED WINES > CHILE | PUERTO VIEJO RESERVE | 70 | 50 | D şişe | ROYALS WINE MENU satır 132: PUERTO VIEJO RESEREVE [kadeh — / şişe 50] | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | CHEVAL NOIR BORDEAUX ROUGE RED WINE (Kadeh) | 15 | 20 | C kadeh | ROYALS WINE MENU satır 140: CHEVAL NOIR BORDEAUX ROUGE [kadeh 20 / şişe 70] | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | GRAND C RESERVE | 100 | 50 | D şişe | ROYALS WINE MENU satır 143: GRAND C RESERVE [kadeh — / şişe 50] | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | SEMASKA CÔTES-DU RHÔNE VILLAGES | 100 | 50 | D şişe | ROYALS WINE MENU satır 146: SEMASKA COTES- DU RHONE VILLAGES [kadeh — / şişe 50] | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | CHATEAU LA COURONNE SAINT- ÉMILION GRAND CRU | 100 | 70 | D şişe | ROYALS WINE MENU satır 149: CHATEAU LA COURONNE SAINT-EMILION GRAND CRU [kadeh — / şişe 70] | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | LA CÔTE DE L'ANGE CHATEAUNEUF DU PAPE | 140 | 130 | D şişe | ROYALS WINE MENU satır 152: LA COTE DE L'ANGE CHATEAUNEUF DU PAPE [kadeh — / şişe 130] | Royal Mandarin, Bella Merit |
| WHITE WINES > TÜRKİYE | SARAFİN (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 168: SARAFİN SAUVIGNON BLANC [kadeh 25 / şişe 100] | Royal Mandarin, Bella Merit |
| WHITE WINES > TÜRKİYE | KAVAKLIDERE SELECTION (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 174: KAVAKLIDERE SELECTION [kadeh 25 / şişe 100] | Royal Mandarin, Bella Merit |
| WHITE WINES > PORTUGAL | MONTE DO CARRAPATELO | 50 | 70 | D şişe | ROYALS WINE MENU satır 222: MONTE DO CARRAPATELO [kadeh — / şişe 70] | Royal Mandarin, Bella Merit |
| WHITE WINES > NEW ZEALAND | CLOUDY BAY | 120 | 100 | D şişe | ROYALS WINE MENU satır 237: CLOUD BAY [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| WHITE WINES > FRANCE | CHEVAL NOIR BORDEAUX (Kadeh) | 15 | 20 | C kadeh | ROYALS WINE MENU satır 253: CHEVAL NOIR BORDEAUX [kadeh 20 / şişe 70] | Royal Mandarin, Bella Merit |
| WHITE WINES > FRANCE | LE BIJOU | 70 | 50 | D şişe | ROYALS WINE MENU satır 256: LE BIJOU [kadeh — / şişe 50] | Royal Mandarin, Bella Merit |
| WHITE WINES > FRANCE | THOMAS LABILLE CHABLIS PREMIER CRU | 120 | 100 | D şişe | ROYALS WINE MENU satır 268: THOMAS LABILLE CHABLIS PREMIER CRU [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| ROSÉ WINES > TÜRKİYE | SARAFİN (Kadeh) | 20 | 25 | C kadeh | ROYALS WINE MENU satır 287: SARAFIN MERLOT, CABERNET FRANC [kadeh 25 / şişe 100] | Royal Mandarin, Bella Merit |
| ROSÉ WINES > ITALY | 11 MINUTES PASQUA | 70 | 100 | D şişe | ROYALS WINE MENU satır 298: 11 MINUTES PASQUA [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| ROSÉ WINES > FRANCE | CHEVAL NOIR BORDEAUX ROSÉ (Kadeh) | 15 | 20 | C kadeh | ROYALS WINE MENU satır 308: CHEVAL NOIR BORDEAUX ROSE [kadeh 20 / şişe 70] | Royal Mandarin, Bella Merit |
| PORTO & SEMI SWEET WINES > PORTUGAL | MARTHA'S RUBY PORT WINE | 70 | 100 | D şişe | ROYALS WINE MENU satır 340: MARTHA'S RUBY PORT WINE [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| PORTO & SEMI SWEET WINES > PORTUGAL | MARTHA'S TAWNY PORT WINE | 70 | 100 | D şişe | ROYALS WINE MENU satır 343: MARTHA'S TAWNY PORT WINE [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | NOBILIS PROSECCO EXTRA DRY | 50 | 60 | D şişe | ROYALS WINE MENU satır 358: NOBILIS PROSECCO EXTRA DRY [kadeh 15 / şişe 60] | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | BRILLA PROSECCO BRUT | 200 | 100 | D şişe | ROYALS WINE MENU satır 361: BRILLA PROSECCO BRUT [kadeh — / şişe 100] | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | BRILLA PROSECCO ROSÉ | 200 | 120 | D şişe | ROYALS WINE MENU satır 364: BRILLA PROSECCO ROSE [kadeh — / şişe 120] | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | BOTTEGA GOLD PROSECCO BRUT | 150 | 250 | D şişe | ROYALS WINE MENU satır 367: BOTTEGA GOLD PROSECCO BRUT [kadeh — / şişe 250] | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | BOTTEGA ROSÉ GOLD PROSECCO | 150 | 250 | D şişe | ROYALS WINE MENU satır 370: BOTTEGA ROSE GOLD PROSECCO [kadeh — / şişe 250] | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > FRANCE | DOM PERIGNON BRUT CHAMPAGNE | 1650 | 2650 | D şişe | ROYALS WINE MENU satır 402: DOM PERIGNON BRUT CHAMPAGNE [kadeh — / şişe 2650] | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > FRANCE | DOM PERIGNON ROSÉ BRUT CHAMPAGNE | 2550 | 3850 | D şişe | ROYALS WINE MENU satır 405: DOM PERIGNON ROSE BRUT CHAMPAGNE [kadeh — / şişe 3850] | Royal Mandarin, Bella Merit |
| SICAK İÇECEKLER | TÜRK KAHVESİ | 10 | 20 | C single | CAFE VERDE PREMIUM satır 8: TÜRK KAHVESİ / TURKISH COFFEE [S 20 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | DAMLA SAKIZLI TÜRK KAHVESİ | 15 | 20 | C single | CAFE VERDE PREMIUM satır 9: DAMLA SAKIZLI TÜRK KAHVESİ / TURKISH COFFEE WITH MASTIC GUM [S 20 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | FİLTRE KAHVE | 15 | 20 | C single | CAFE VERDE PREMIUM satır 10: FİLTRE KAHVE / FILTER COFFEE [S 20 / D — / Ş —] | Cafe Verde |
| MEŞRUBATLAR | SU 330 ml. | — | 5 | C single | LOBBY BARS MENU satır 14: SU / WATER 330 ml. [S 5 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| VOTKALAR | SMIRNOFF NORTH | — | 10 | C single | LOBBY BARS MENU satır 69: SMIRNOFF NORTH [S 10 / D 15 / Ş 150] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | UNDERBERG | — | 20 | D (yalnız Double sütunu dolu) | LOBBY BARS MENU satır 140: UNDERBERG [S — / D 20 / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | WENNEKER APRICOT BRANDY | — | 20 | C single | LOBBY BARS MENU satır 142: WENNEKER APRICOT BRANDY [S 20 / D 30 / Ş 175] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| LİKÖRLER | FRANGELICO | — | 20 | C single | LOBBY BARS MENU satır 167: FRANGELICO [S 20 / D 30 / Ş 175] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MALT VİSKİLER | OBAN 14 Y.O. | — | 30 | C single | LOBBY BARS MENU satır 187: OBAN 14 Y.O. [S 30 / D 40 / Ş 250] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MEŞRUBATLAR | SU 330 ml. | — | 5 | C single | BEACH BEVERAGE MENU satır 14: SU / WATER 330 ml. [S 5 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KARPUZ | — | 20 | C single | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KAVUN | — | 20 | C single | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| FRESH MEYVE SUYU | KİVİ | — | 20 | C single | BEACH BEVERAGE MENU satır 47: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | CHOCOLATE MOCHA | — | 20 | C single | BEACH BEVERAGE MENU satır 33: CHOCOLATE MOCHA [S 20 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | ENGLISH BREAKFAST TEA | — | 10 | C single | BEACH BEVERAGE MENU satır 37: ENGLISH BREAKFAST TEA [S 10 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| İMZA KOKTEYLLER | PORT | — | 35 | C single | BEACH BEVERAGE MENU satır 79: PORT [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | BLOODY MARY | — | 35 | C single | BEACH BEVERAGE MENU satır 94: BLOODY MARRY [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | COSMOPOLITAN | — | 35 | C single | BEACH BEVERAGE MENU satır 98: COSMOPOLITAN [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | LONG ISLAND ICED TEA | — | 35 | C single | BEACH BEVERAGE MENU satır 102: LONG ISLAND ICE TEA [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | MARGARITA | — | 35 | C single | BEACH BEVERAGE MENU satır 106: MARGARITA [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | MOJITO | — | 35 | C single | BEACH BEVERAGE MENU satır 110: MOJITO [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | — | 35 | C single | BEACH BEVERAGE MENU satır 116: ESPRESSO MARTINI [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ULUSLARARASI KOKTEYLLER | FRENCH 75 | — | 35 | C single | BEACH BEVERAGE MENU satır 118: FRENCH 75 [S 35 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| VOTKALAR | SMIRNOFF NORTH | — | 10 | C single | BEACH BEVERAGE MENU satır 155: SMIRNOFF NORTH [S 10 / D 15 / Ş 150] | Diamond Pool Bar, Blue Sea Beach Bar |
| LİKÖRLER | FRANGELICO | — | 20 | C single | BEACH BEVERAGE MENU satır 227: FRANGELICO [S 20 / D 30 / Ş 175] | Diamond Pool Bar, Blue Sea Beach Bar |
| SICAK İÇECEKLER | MATCHA ÇAYI | — | 20 | C single | TEA LOUNGE MENU satır 7: MATCHA ÇAYI / MATCHA TEA [S 20 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | KAFEİNSİZ KAHVE | — | 20 | C single | TEA LOUNGE MENU satır 11: KAFEİNSİZ KAHVE / DECAFFEINATED COFFEE [S 20 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | ESPRESSO LUNGO | — | 15 | C single | TEA LOUNGE MENU satır 13: ESPRESSO LUNGO [S 15 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | COFFEE CORTADO | — | 20 | C single | TEA LOUNGE MENU satır 15: COFFEE CORTADO [S 20 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | FLAT WHITE | — | 20 | C single | TEA LOUNGE MENU satır 16: FLAT WHITE [S 20 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | HİNDİSTAN CEVİZİ SÜTLÜ MATCHA LATTE | — | 20 | C single | TEA LOUNGE MENU satır 20: HİNDİSTAN CEVİZİ SÜTLÜ MATCHA LATTE / COCONUT MATCHA LATTE [S 20 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | TAZE DEMLEME BİTKİ ÇAYLARI | — | 7 | C single | TEA LOUNGE MENU satır 28: TAZE DEMLEME BİTKİ ÇAYLARI / FRESHLY BREWED HERBAL TEAS ← KI [S 7 / D — / Ş —] | Tea Lounge |
| SICAK İÇECEKLER | 3. NESİL KAHVELER | — | 20 | C single | TEA LOUNGE MENU satır 33: 3. NESİL KAHVELER / THIRD GENERATION COFFEES ← CHEMEX , V60  [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | GREEN ANGEL | — | 10 | C single | TEA LOUNGE MENU satır 39: GREEN ANGLE [S 10 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | WINTERDREAM | — | 10 | C single | TEA LOUNGE MENU satır 41: WINTERDREAM [S 10 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | NANE & PEPPERMINT | — | 10 | C single | TEA LOUNGE MENU satır 43: NANE & PEPPERMINT [S 10 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | PAPATYA | — | 10 | C single | TEA LOUNGE MENU satır 45: PAPATYA / CAMOMILE [S 10 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | ENGLISH BREAKFAST | — | 10 | C single | TEA LOUNGE MENU satır 47: ENGLISH BREAKFAST [S 10 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | ROOIBOS VANİLYA | — | 10 | C single | TEA LOUNGE MENU satır 49: ROOIBOS VANİLYA / ROOIBOS VANILLA [S 10 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | MORGENTAU | — | 20 | C single | TEA LOUNGE MENU satır 54: MORGENTAU [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | MASALA CHAI | — | 20 | C single | TEA LOUNGE MENU satır 57: MASALA CHAI [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | VANILLA ROOIBOS | — | 20 | C single | TEA LOUNGE MENU satır 60: VANILLA ROOIBOS [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | CHILL OUT WITH HERBS | — | 20 | C single | TEA LOUNGE MENU satır 63: CHILL OUT WITH HERBS [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | FRUITY CAMOMILE | — | 20 | C single | TEA LOUNGE MENU satır 66: FRUITY CAMOMILE [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | REFRESHING MINT | — | 20 | C single | TEA LOUNGE MENU satır 69: REFRESHING MINT [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CREAM ORANGE | — | 20 | C single | TEA LOUNGE MENU satır 72: ROOIBOS CREAM ORANGE [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | HUCKLEBERRY FRIEND | — | 20 | C single | TEA LOUNGE MENU satır 75: HUCCKLEBERRY FRIEND [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | JASMINE PEARLS | — | 20 | C single | TEA LOUNGE MENU satır 78: JASMINE PEARLS [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | EARL GREY | — | 20 | C single | TEA LOUNGE MENU satır 81: EARL GREY [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | GREEN LEAF | — | 20 | C single | TEA LOUNGE MENU satır 84: GREEN LEAF [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | IRISH WHISKEY CREAM | — | 20 | C single | TEA LOUNGE MENU satır 87: IRISH WHISKEY CREAM [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | CHINESE SPRING | — | 20 | C single | TEA LOUNGE MENU satır 90: CHINESE SPRING [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | GET THE POWER | — | 20 | C single | TEA LOUNGE MENU satır 93: GET THE POWER [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | GINGER TWIST | — | 20 | C single | TEA LOUNGE MENU satır 96: GINGER TWIST [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | WHITE YIN LONG | — | 20 | C single | TEA LOUNGE MENU satır 99: WHITE YIN LONG [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CHOCOLATE HEAVEN | — | 20 | C single | TEA LOUNGE MENU satır 102: ROOIBOS CHOCOLATE HEAVEN [S 20 / D — / Ş —] | Tea Lounge |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | AYURVEDA HERBS & GINGER | — | 20 | C single | TEA LOUNGE MENU satır 105: AYURVEDA HERBS & GINGER [S 20 / D — / Ş —] | Tea Lounge |
| SOĞUK KAHVELER | ICED COFFEE CREAM | — | 20 | C single | TEA LOUNGE MENU satır 119: ICED COFFEE CREAM [S 20 / D — / Ş —] | Tea Lounge |
| SOĞUK KAHVELER | WHITE CHOCOLATE MOCHA | — | 20 | C single | TEA LOUNGE MENU satır 122: WHITE CHOCOLATE MOCHA [S 20 / D — / Ş —] | Tea Lounge |
| VOTKALAR | SMIRNOFF NORTH | — | 10 | C single | WHISKEY LOUNGE satır 33: SMIRNOFF NORTH [S 10 / D 15 / Ş 150] | Whiskey Lounge |
| LİKÖRLER | UNDERBERG | — | 20 | D (yalnız Double sütunu dolu) | WHISKEY LOUNGE satır 119: UNDERBERG [S — / D 20 / Ş —] | Whiskey Lounge |
| LİKÖRLER | WENNEKER APRICOT BRANDY | — | 20 | C single | WHISKEY LOUNGE satır 123: WENNEKER APRICOT BRANDY [S 20 / D 30 / Ş 175] | Whiskey Lounge |
| LİKÖRLER | FRANGELICO | — | 20 | C single | WHISKEY LOUNGE satır 152: FRANGELICO [S 20 / D 30 / Ş 175] | Whiskey Lounge |
| MALT VİSKİLER | BENRIACH 10 Y.O. | — | 30 | C single | WHISKEY LOUNGE satır 195: BENRIARCH 10 Y.O. [S 30 / D 40 / Ş 250] | Whiskey Lounge |
| MALT VİSKİLER | BENRIACH 12 Y.O. | — | 30 | C single | WHISKEY LOUNGE satır 196: BENRIARCH 12 Y.O. [S 30 / D 40 / Ş 250] | Whiskey Lounge |
| MALT VİSKİLER | OBAN 14 Y.O. | — | 30 | C single | WHISKEY LOUNGE satır 200: OBAN 14 Y.O. [S 30 / D 40 / Ş 250] | Whiskey Lounge |
| ULUSLARARASI KOKTEYLLER | AMARETTO SOUR | — | 35 | C single | WHISKEY COCKTAIL MENU satır 18: AMARETTO SOUR [S 35 / D — / Ş —] | Whiskey Lounge |
| ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | — | 35 | C single | WHISKEY COCKTAIL MENU satır 30: ESPRESSO MARTINI [S 35 / D — / Ş —] | Whiskey Lounge |
| İMZA KOKTEYLLER | ROYAL | — | 35 | C single | BEACH BEVERAGE MENU satır 81: ROYAL [S 35 / D — / Ş —] | Blue Sea Beach Bar |
| İMZA KOKTEYLLER | PASSION | — | 35 | C single | BEACH BEVERAGE MENU satır 83: PASSION [S 35 / D — / Ş —] | Blue Sea Beach Bar |
| MEŞRUBATLAR | SU 330 ml. | — | 5 | C single | THE ROOF GARDEN satır 14: SU / WATER 330 ml. [S 5 / D — / Ş —] | The Roof Garden |
| VOTKALAR | SMIRNOFF NORTH | — | 10 | C single | THE ROOF GARDEN satır 96: SMIRNOFF NORTH [S 10 / D 15 / Ş 150] | The Roof Garden |
| MALT VİSKİLER | OBAN 14 Y.O. | — | 30 | C single | THE ROOF GARDEN satır 190: OBAN 14 Y.O. [S 30 / D 40 / Ş 250] | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | AMARETTO SOUR | — | 35 | C single | THE ROOF GARDEN satır 232: AMARETTO SOUR [S 35 / D — / Ş —] | The Roof Garden |
| ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | — | 35 | C single | THE ROOF GARDEN satır 240: ESPRESSO MARTINI [S 35 / D — / Ş —] | The Roof Garden |
| SICAK İÇECEKLER | MATCHA ÇAYI | — | 20 | C single | CAFE VERDE PREMIUM satır 7: MATCHA ÇAYI / MATCHA TEA [S 20 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | KAFEİNSİZ KAHVE | — | 20 | C single | CAFE VERDE PREMIUM satır 11: KAFEİNSİZ KAHVE / DECAFFEINATED COFFEE [S 20 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | ESPRESSO LUNGO | — | 15 | C single | CAFE VERDE PREMIUM satır 13: ESPRESSO LUNGO [S 15 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | COFFEE CORTADO | — | 20 | C single | CAFE VERDE PREMIUM satır 15: COFFEE CORTADO [S 20 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | FLAT WHITE | — | 20 | C single | CAFE VERDE PREMIUM satır 16: FLAT WHITE [S 20 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | HİNDİSTAN CEVİZİ SÜTLÜ MATCHA LATTE | — | 20 | C single | CAFE VERDE PREMIUM satır 20: HİNDİSTAN CEVİZİ SÜTLÜ MATCHA LATTE / COCONUT MATCHA LATTE [S 20 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | TAZE DEMLEME BİTKİ ÇAYLARI | — | 7 | C single | CAFE VERDE PREMIUM satır 28: TAZE DEMLEME BİTKİ ÇAYLARI / FRESHLY BREWED HERBAL TEAS ← KI [S 7 / D — / Ş —] | Cafe Verde |
| SICAK İÇECEKLER | 3. NESİL KAHVELER | — | 20 | C single | CAFE VERDE PREMIUM satır 33: 3. NESİL KAHVELER / THIRD GENERATION COFFEES ← CHEMEX , V60  [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | GREEN ANGEL | — | 10 | C single | CAFE VERDE PREMIUM satır 39: GREEN ANGLE [S 10 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | WINTERDREAM | — | 10 | C single | CAFE VERDE PREMIUM satır 41: WINTERDREAM [S 10 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | NANE & PEPPERMINT | — | 10 | C single | CAFE VERDE PREMIUM satır 43: NANE & PEPPERMINT [S 10 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | PAPATYA | — | 10 | C single | CAFE VERDE PREMIUM satır 45: PAPATYA / CAMOMILE [S 10 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | ENGLISH BREAKFAST | — | 10 | C single | CAFE VERDE PREMIUM satır 47: ENGLISH BREAKFAST [S 10 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT POŞET ÇAYLAR | ROOIBOS VANİLYA | — | 10 | C single | CAFE VERDE PREMIUM satır 49: ROOIBOS VANİLYA / ROOIBOS VANILLA [S 10 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | MORGENTAU | — | 20 | C single | CAFE VERDE PREMIUM satır 54: MORGENTAU [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | MASALA CHAI | — | 20 | C single | CAFE VERDE PREMIUM satır 57: MASALA CHAI [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | VANILLA ROOIBOS | — | 20 | C single | CAFE VERDE PREMIUM satır 60: VANILLA ROOIBOS [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | CHILL OUT WITH HERBS | — | 20 | C single | CAFE VERDE PREMIUM satır 63: CHILL OUT WITH HERBS [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | FRUITY CAMOMILE | — | 20 | C single | CAFE VERDE PREMIUM satır 66: FRUITY CAMOMILE [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | REFRESHING MINT | — | 20 | C single | CAFE VERDE PREMIUM satır 69: REFRESHING MINT [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CREAM ORANGE | — | 20 | C single | CAFE VERDE PREMIUM satır 72: ROOIBOS CREAM ORANGE [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | HUCKLEBERRY FRIEND | — | 20 | C single | CAFE VERDE PREMIUM satır 75: HUCCKLEBERRY FRIEND [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | JASMINE PEARLS | — | 20 | C single | CAFE VERDE PREMIUM satır 78: JASMINE PEARLS [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | EARL GREY | — | 20 | C single | CAFE VERDE PREMIUM satır 81: EARL GREY [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | GREEN LEAF | — | 20 | C single | CAFE VERDE PREMIUM satır 84: GREEN LEAF [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | IRISH WHISKEY CREAM | — | 20 | C single | CAFE VERDE PREMIUM satır 87: IRISH WHISKEY CREAM [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | CHINESE SPRING | — | 20 | C single | CAFE VERDE PREMIUM satır 90: CHINESE SPRING [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | GET THE POWER | — | 20 | C single | CAFE VERDE PREMIUM satır 93: GET THE POWER [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | GINGER TWIST | — | 20 | C single | CAFE VERDE PREMIUM satır 96: GINGER TWIST [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | WHITE YIN LONG | — | 20 | C single | CAFE VERDE PREMIUM satır 99: WHITE YIN LONG [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CHOCOLATE HEAVEN | — | 20 | C single | CAFE VERDE PREMIUM satır 102: ROOIBOS CHOCOLATE HEAVEN [S 20 / D — / Ş —] | Cafe Verde |
| RONNEFELDT BİTKİ ÇAYLARI > RONNEFELDT TAZE DEMLEME ÇAYLAR | AYURVEDA HERBS & GINGER | — | 20 | C single | CAFE VERDE PREMIUM satır 105: AYURVEDA HERBS & GINGER [S 20 / D — / Ş —] | Cafe Verde |
| SOĞUK KAHVELER | ICED COFFEE CREAM | — | 20 | C single | CAFE VERDE PREMIUM satır 119: ICED COFFEE CREAM [S 20 / D — / Ş —] | Cafe Verde |
| SOĞUK KAHVELER | WHITE CHOCOLATE MOCHA | — | 20 | C single | CAFE VERDE PREMIUM satır 122: WHITE CHOCOLATE MOCHA [S 20 / D — / Ş —] | Cafe Verde |

## 6. Excel'de karşılığı yok, eski fiyatı duruyor (283 satır)

Outlet'in Excel sayfasında bu ürün (ya da bu ölçünün fiyatı) yok; fiyat önceki kaynaktan (Micros / otel listesi) kaldı.

| kategori | ürün | duran fiyat | neden | başka sayfada (Single) | outletler |
|---|---|---|---|---|---|
| SICAK İÇECEKLER > KAHVELER | SINGLE ESPRESSO | 10 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER > KAHVELER | DOUBLE ESPRESSO | 15 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER > ÇAYLAR | DEMLEME ÇAY | 7 | Excel sayfasında yok | 7 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER > ÇAYLAR | TAZE DEMLEME BİTKİ ÇAYLARI | 7 | Excel sayfasında yok | 7 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER > ÇAYLAR | RONNEFELDT BİTKİ ÇAYLARI | 10 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > GAZLI İÇECEKLER | COCA COLA ZERO | 5 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > GAZLI İÇECEKLER | LOKAL ENERJİ İÇECEĞİ | 7 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > MEYVE SUYU & SOĞUK ÇAY | ICE TEA ŞEFTALİ | 5 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SOĞUK İÇECEKLER > MEYVE SUYU & SOĞUK ÇAY | ICE TEA LİMON | 5 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > İMZA KOKTEYLLER | AURA | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, WHISKEY COCKTAIL MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > İMZA KOKTEYLLER | HARMONY | 35 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > İMZA KOKTEYLLER | ILLUSION | 35 | Excel sayfasında yok | 35 $ (THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > İMZA KOKTEYLLER | THE PASSION | 35 | Excel sayfasında yok |  | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > İMZA KOKTEYLLER | PORT | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > ULUSLARARASI KOKTEYLLER | OLD FASHIONED | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > ULUSLARARASI KOKTEYLLER | NEGRONI | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > ULUSLARARASI KOKTEYLLER | WHISKEY SOUR | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| ALKOLLÜ İÇECEKLER > ULUSLARARASI KOKTEYLLER | APEROL SPRITZ | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İMZA KOKTEYLLER | ILLUSION | 35 | Excel sayfasında yok | 35 $ (THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Lobby Bar, Diamond Pool Bar, Royal Lobby Bar, Blue Sea Beach Bar, Premium Lobby Bar, Cafe Verde |
| İMZA KOKTEYLLER | AURA | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, WHISKEY COCKTAIL MENU) | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar, Cafe Verde |
| ULUSLARARASI KOKTEYLLER | APEROL SPRITZ | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar, Cafe Verde |
| ULUSLARARASI KOKTEYLLER | WHISKEY SOUR | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar, Cafe Verde |
| ULUSLARARASI KOKTEYLLER | DAIQUIRI | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar, Cafe Verde |
| ULUSLARARASI KOKTEYLLER | NEGRONI | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar, Cafe Verde |
| ULUSLARARASI KOKTEYLLER | OLD FASHIONED | 35 | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar, Cafe Verde |
| MEŞRUBATLAR | MEYVE SUYU | 7 | Excel sayfasında yok | 7 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | SODA | 5 | Excel sayfasında yok | 5 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | SAN PELLEGRINO | 8 | Excel sayfasında yok | 8.4 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | AYRAN | 5 | Excel sayfasında yok | 5 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | BRITVIC | 5 | Excel sayfasında yok | 5 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | SU 750 ml. | 7 | Excel sayfasında yok |  | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | COCA COLA | 5 | Excel sayfasında yok | 5 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | SPRITE | 5 | Excel sayfasında yok | 5 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | FANTA | 5 | Excel sayfasında yok | 5 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | ICE TEA | 5 | Excel sayfasında yok | 5 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | LİMONATA | 5 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | ENERJİ İÇECEĞİ | 7 | Excel sayfasında yok | 8.4 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | ŞALGAM SUYU | 5 | Excel sayfasında yok | 5 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN) | Tea Lounge, Cafe Verde |
| MEŞRUBATLAR | FRESH MEYVE SUYU | 10 | Excel sayfasında yok | 10 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN); 20 $ (THE ROOF GARDEN) | Tea Lounge, Blue Sea Beach Bar |
| KAV ŞARAPLARI > FRANCE | CHATEAU CHEVAL NOIR SAINT - ÉMILION GRAND CRU | 120 | Excel sayfasında yok |  | The Steakhouse |
| KAV ŞARAPLARI > FRANCE | CHATEAU CORBIN SAINT - ÉMILION GRAND CRU | 120 | Excel sayfasında yok |  | The Steakhouse |
| KAV ŞARAPLARI > FRANCE | CHATEAU CONNÉTABLE TALBOT SAINT - JULIEN | 140 | Excel sayfasında yok |  | The Steakhouse |
| KAV ŞARAPLARI > FRANCE | CHATEAU DASSAULT SAINT- ÉMILION GRAND CRU | 190 | Excel sayfasında yok |  | The Steakhouse |
| KAV ŞARAPLARI > FRANCE | CHATEAU CLERC MILON GRAND CRU | 400 | Excel sayfasında yok |  | The Steakhouse |
| KAV ŞARAPLARI > FRANCE | CHATEAU BEYCHEVELLE GRAND VIN | 500 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | MASCA DEL TACCO PIANO CHIUSO RISERVA | 120 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | LOMBARDO NERO D'ALTURA | 100 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | TEATRO LATINO IL COVO | 100 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | TEATRO LATINO MESCA | 100 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > ITALY | ANNO DOMINI BATISTA | 100 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > SPAIN | FAUSTINO 1 GRAN RESERVA | 120 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > ARGENTINA | CLAROSCURO BODEGA DE ARTE | 70 | Excel sayfasında yok |  | The Steakhouse |
| KIRMIZI ŞARAPLAR > FRANCE | LOUIS JADOT BEAUNE PREMIER CRU | 230 | Excel sayfasında yok |  | The Steakhouse |
| BEYAZ ŞARAPLAR > ITALY | ANNO DOMINI SOTTOVOCE SAUVIGNON | 100 | Excel sayfasında yok |  | The Steakhouse |
| BEYAZ ŞARAPLAR > ITALY | TESSARI BINE LONGHE SOAVE CLASSICO | 100 | Excel sayfasında yok |  | The Steakhouse |
| BEYAZ ŞARAPLAR > ITALY | LOMBARDO BIANCO D'ALTURA | 100 | Excel sayfasında yok |  | The Steakhouse |
| BEYAZ ŞARAPLAR > ITALY | EPICURO VERMENTINO | 50 | Excel sayfasında yok |  | The Steakhouse |
| BEYAZ ŞARAPLAR > SPAIN | FAUSTINO RESERVA V | 70 | Excel sayfasında yok |  | The Steakhouse |
| ROSÉ ŞARAPLAR > TÜRKİYE | VERANO BLUSH | 70 | Excel sayfasında yok |  | The Steakhouse |
| ROSÉ ŞARAPLAR > ITALY | CASA DEFRA PINOT GRIGIO ROSÉ | 70 | Excel sayfasında yok |  | The Steakhouse |
| ROSÉ ŞARAPLAR > FRANCE | CHATEAU D’ESCLANS ROCK ANGEL ROSÉ | 200 | Excel sayfasında yok |  | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | BAGLIETTI ROSÉ GOLD EDITION | 60 | Excel sayfasında yok |  | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | SAN GIOVANNI PERINI PROSECCO EXTRA DRY (Kadeh) | 15 | Excel sayfasında yok |  | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | SAN GIOVANNI PERINI PROSECCO EXTRA DRY (Şişe) | 50 | Excel sayfasında yok |  | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | SAN GIOVANNI PERINI PROSECCO BRUT ROSÉ (Kadeh) | 15 | Excel sayfasında yok |  | The Steakhouse |
| KÖPÜKLÜ ŞARAPLAR & ŞAMPANYALAR > ITALY | SAN GIOVANNI PERINI PROSECCO BRUT ROSÉ (Şişe) | 50 | Excel sayfasında yok |  | The Steakhouse |
| SOĞUK KAHVELER | COLD BREW | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| SOĞUK KAHVELER | FRAPPE | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| SOĞUK KAHVELER | FRAPPUCCINO | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| SOĞUK KAHVELER | AFFOGATO | 20 | Excel sayfasında yok |  | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | SOĞUK MATCHA ÇAYI | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | ŞEFTALİLİ SOĞUK ÇAY | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | ELMALI YEŞİL ÇAY | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | LİMONLU SOĞUK ÇAY | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| EV YAPIMI SOĞUK ÇAYLAR | BÖĞÜRTLENLİ HİBİSKUS ÇAYI | 20 | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) | The Roof Garden |
| KONYAKLAR | HENNESSY X.O. | 70 | Excel sayfasında yok | 70 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | The Roof Garden |
| KONYAKLAR | REMY MARTIN LOUIS XIII | 350 | Excel sayfasında yok | 350 $ (IN ROOM DINING BEV. MENU, WHISKEY LOUNGE) | The Roof Garden |
| KONYAKLAR | HENNESSY V.S. | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | The Roof Garden, Cafe Verde |
| KONYAKLAR | HENNESSY V.S.O.P. | 30 | Excel sayfasında yok | 30 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | The Roof Garden |
| İSKOÇ VİSKİLER | JOHNNIE WALKER KING GEORGE V | 280 | Excel sayfasında yok | 280 $ (IN ROOM DINING BEV. MENU, WHISKEY LOUNGE) | The Roof Garden |
| RARE VINTAGE WINES > FRANCE | CHATEAU CHEVAL NOIR SAINT - ÉMILION GRAND CRU | 120 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES > FRANCE | CHATEAU CORBIN SAINT - ÉMILION GRAND CRU | 120 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES > FRANCE | CHATEAU CONNÉTABLE TALBOT SAINT - JULIEN | 140 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES > FRANCE | CHATEAU DASSAULT SAINT- ÉMILION GRAND CRU | 190 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES > FRANCE | CHATEAU CLERC MILON GRAND CRU | 400 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES > FRANCE | CHATEAU BEYCHEVELLE GRAND VIN | 500 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | MASCA DEL TACCO PIANO CHIUSO RISERVA | 120 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | LOMBARDO NERO D'ALTURA | 100 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | TEATRO LATINO IL COVO | 100 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | TEATRO LATINO MESCA | 100 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > ITALY | ANNO DOMINI BATISTA | 100 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > SPAIN | FAUSTINO 1 GRAN RESERVA | 120 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > ARGENTINA | CLAROSCURO BODEGA DE ARTE | 70 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| RED WINES > FRANCE | LOUIS JADOT BEAUNE PREMIER CRU | 230 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| WHITE WINES > ITALY | ANNO DOMINI SOTTOVOCE SAUVIGNON | 100 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| WHITE WINES > ITALY | TESSARI BINE LONGHE SOAVE CLASSICO | 100 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| WHITE WINES > ITALY | LOMBARDO BIANCO D'ALTURA | 100 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| WHITE WINES > ITALY | EPICURO VERMENTINO | 50 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| WHITE WINES > SPAIN | FAUSTINO RESERVA V | 70 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| ROSÉ WINES > TÜRKİYE | VERANO BLUSH | 70 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| ROSÉ WINES > ITALY | CASA DEFRA PINOT GRIGIO ROSE | 70 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| ROSÉ WINES > FRANCE | CHATEAU D’ESCLANS ROCK ANGEL ROSÉ | 200 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | BAGLIETTI ROSÉ GOLD EDITION | 60 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | SAN GIOVANNI PERINI PROSECCO EXTRA DRY (Kadeh) | 15 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | SAN GIOVANNI PERINI PROSECCO EXTRA DRY (Şişe) | 50 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | SAN GIOVANNI PERINI PROSECCO BRUT ROSÉ (Kadeh) | 15 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| SPARKLING WINES & CHAMPAGNES > ITALY | SAN GIOVANNI PERINI PROSECCO BRUT ROSÉ (Şişe) | 50 | Excel sayfasında yok |  | Royal Mandarin, Bella Merit |
| BİRALAR | EFES PILSEN | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | BECK'S | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | MILLER | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | TUBORG | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | BUD | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | HEINEKEN | 10 | Excel sayfasında yok | 10 $ (THE ROOF GARDEN); 15 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | BUDWEISER | 10 | Excel sayfasında yok | 10 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | CARLSBERG | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BİRALAR | CORONA | 15 | Excel sayfasında yok | 15 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| APERATİFLER | MARTINI BIANCO | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| APERATİFLER | MARTINI ROSSO | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| APERATİFLER | MARTINI EXTRA DRY | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| APERATİFLER | CAMPARI | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| APERATİFLER | APEROL | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| VOTKALAR | SMIRNOFF RED | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| VOTKALAR | ABSOLUT BLUE | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| VOTKALAR | ABSOLUT VANILLA | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| VOTKALAR | ABSOLUT CITRON | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| VOTKALAR | BELVEDERE | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| VOTKALAR | GREY GOOSE SUPER PREMIUM | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| CİNLER | BOMBAY SAPPHIRE | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| CİNLER | BEEFEATER | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| CİNLER | BEEFEATER PINK | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| CİNLER | GORDON'S | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| CİNLER | HENDRICK'S | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| CİNLER | TANQUERAY NO:10 | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| ROMLAR | CAPTAIN MORGAN WHITE | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| ROMLAR | BACARDI CARTA BLANCA | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| ROMLAR | BACARDI CARTA NEGRA (BLACK) | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| ROMLAR | BACARDI CARTA ORO (GOLD) | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| ROMLAR | RON ZACAPA 23 | 40 | Excel sayfasında yok | 40 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| TEKİLALAR | OLMECA GOLD | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| TEKİLALAR | OLMECA SILVER | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| TEKİLALAR | MILAGRO SILVER | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| TEKİLALAR | MILAGRO REPOSADO | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU) | Cafe Verde |
| KONYAKLAR | NAPOLEON V.S.O.P. | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| KONYAKLAR | COURVOISIER V.S. | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | CHAMBORD | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | SOUTHERN COMFORT | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | CARDINAL MELON | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | KAHLUA | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | BAILEYS IRISH CREAM | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | AMARETTO DISARONNO ORIGINALE | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | SAMBUCA | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | TIA MARIA | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | FERNET BRANCA | 20 | Excel sayfasında yok | 20 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | JÄGERMEISTER | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | GRAND MARNIER | 20 | Excel sayfasında yok | 20 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | SAFARI | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | ARCHERS | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | BATIDA DE CÔCO | 20 | Excel sayfasında yok |  | Cafe Verde |
| LİKÖRLER | SKINOS | 20 | Excel sayfasında yok |  | Cafe Verde |
| LİKÖRLER | PASSOA | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | COINTREAU | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | PISANG AMBON | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | PIMM'S | 20 | Excel sayfasında yok | 20 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | DRAMBUIE | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | SHERIDAN'S | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| LİKÖRLER | GRANDE ABSENTE | 20 | Excel sayfasında yok |  | Cafe Verde |
| BOURBON & TENNESSEE VİSKİLER | JIM BEAM WHITE | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BOURBON & TENNESSEE VİSKİLER | JACK DANIEL'S NO:7 | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| BOURBON & TENNESSEE VİSKİLER | JACK DANIEL'S HONEY | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| MALT VİSKİLER | TALISKER 10 Y.O. | 30 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU); 30 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| MALT VİSKİLER | LAGAVULIN DE 1995 16 Y.O. | 50 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU); 50 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| MALT VİSKİLER | GLENFIDDICH 12 Y.O. | 30 | Excel sayfasında yok | 30 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE); 40 $ (BEACH BEVERAGE MENU) | Cafe Verde |
| MALT VİSKİLER | MACALLAN 12 Y.O. | 40 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU); 40 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| İSKOÇ VİSKİLER | BALLANTINE'S | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) | Cafe Verde |
| İSKOÇ VİSKİLER | JUSTERINI & BROOKS RARE | 10 | Excel sayfasında yok |  | Cafe Verde |
| İSKOÇ VİSKİLER | CHIVAS REGAL 12 Y.O. | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| İSKOÇ VİSKİLER | JOHNNIE WALKER RED LABEL | 10 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| İSKOÇ VİSKİLER | JOHNNIE WALKER BLACK LABEL 12 Y.O. | 20 | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |
| İRLANDA VİSKİLERİ | JAMESON | 15 | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU); 15 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) | Cafe Verde |

## 7. Fiyatsız kalan ürünler (250 satır)

"başka sayfada" sütunu yalnız öneridir, uygulanmadı.

| outlet | kategori | ürün | neden | başka sayfada (Single) |
|---|---|---|---|---|
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ENGLISH BREAKFAST | Excel sayfasında yok | 10 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | EARL GREY | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | MORGENTAU | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | REFRESHING MINT | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | FRUITY CAMOMILE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | AYURVEDA HERBS & GINGER | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ROOIBOS CREAM ORANGE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | SWEET BERRIES | Excel sayfasında yok |  |
| Diamond Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ROYAL WHITE TEA | Excel sayfasında yok |  |
| Diamond Lobby Bar | İMZA KOKTEYLLER | PORT | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU) |
| Diamond Lobby Bar | İMZA KOKTEYLLER | THE PASSION | Excel sayfasında yok |  |
| Diamond Lobby Bar | İMZA KOKTEYLLER | HARMONY | Excel sayfasında yok |  |
| Diamond Lobby Bar | ULUSLARARASI KOKTEYLLER | AMARETTO SOUR | Excel sayfasında yok | 35 $ (THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |
| Diamond Lobby Bar | ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |
| Diamond Pool Bar | ÇORBALAR | Mercimek Çorbası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | ÇORBALAR | Domates Çorbası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TOSTLAR | Kaşarlı Tost | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TOSTLAR | Sucuklu Kaşarlı Tost | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TOSTLAR | Royal Tost | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TOSTLAR | Sanayi Tostu | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SALATALAR | Yeşil Bahçe Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SALATALAR | İstanbul Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SALATALAR | Sezar Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SALATALAR | Kinoalı Tabule Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SALATALAR | Çoban Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SALATALAR | Yunan Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SALATALAR | Narenciyeli Avokado Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | BAŞLANGIÇLAR | Dana Carpaccio | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | BAŞLANGIÇLAR | Tereyağlı Karides Tava | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | BAŞLANGIÇLAR | Kalamar Tava | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | BAŞLANGIÇLAR | Viyana Şnitzeli | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | BAŞLANGIÇLAR | Tavuk Fingers | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SANDVİÇLER & BURGERLER | Kulüp Sandviç | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SANDVİÇLER & BURGERLER | Katsu Sando | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SANDVİÇLER & BURGERLER | Soğuk Sandviç | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SANDVİÇLER & BURGERLER | Hamburger | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SANDVİÇLER & BURGERLER | Cheeseburger | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | SANDVİÇLER & BURGERLER | Royal Burger | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | MAKARNALAR & RİSOTTOLAR | Penne all’Arrabbiata | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | MAKARNALAR & RİSOTTOLAR | Spagetti Pomodoro | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | MAKARNALAR & RİSOTTOLAR | Spagetti Bolonez | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | MAKARNALAR & RİSOTTOLAR | Fettuccine Alfredo | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | MAKARNALAR & RİSOTTOLAR | El Yapımı Mantı | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | Tiramisu | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | Profiterol | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | Cheesecake | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | Fırın Sütlaç | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | Merit Royal Baklava | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | El Yapımı Çikolata Seçkisi | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | Taze Mevsim Meyveleri | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | TATLILAR | Krep / Pankek / Waffle | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | MEYVE SUYU | GREYFURT | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | VANİLYA | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | DAMLA SAKIZ | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | KAKAO | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | ÇİKOLATA | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | KARAMEL | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | ÇİLEK | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | VİŞNE | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | LİMON | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | KAVUN | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | MUZ | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | DONDURMALAR | AHUDUDU | içecek sayfası kapsamında değil (yemek) |  |
| Diamond Pool Bar | İMZA KOKTEYLLER | THE PASSION | Excel sayfasında yok |  |
| Diamond Pool Bar | İMZA KOKTEYLLER | HARMONY | Excel sayfasında yok |  |
| Tea Lounge | MEŞRUBATLAR | SU 330 ml. | Excel sayfasında yok |  |
| Tea Lounge | SOĞUK LEZZETLER | ROYAL DONDURMA | içecek sayfası kapsamında değil (yemek) |  |
| Whiskey Lounge | İMZA KOKTEYLLER | PORT | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU) |
| Whiskey Lounge | İMZA KOKTEYLLER | THE PASSION | Excel sayfasında yok |  |
| Whiskey Lounge | İMZA KOKTEYLLER | HARMONY | Excel sayfasında yok |  |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ENGLISH BREAKFAST | Excel sayfasında yok | 10 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | EARL GREY | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | MORGENTAU | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | REFRESHING MINT | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | FRUITY CAMOMILE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | AYURVEDA HERBS & GINGER | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ROOIBOS CREAM ORANGE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | SWEET BERRIES | Excel sayfasında yok |  |
| Royal Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ROYAL WHITE TEA | Excel sayfasında yok |  |
| Royal Lobby Bar | İMZA KOKTEYLLER | PORT | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU) |
| Royal Lobby Bar | İMZA KOKTEYLLER | THE PASSION | Excel sayfasında yok |  |
| Royal Lobby Bar | İMZA KOKTEYLLER | HARMONY | Excel sayfasında yok |  |
| Royal Lobby Bar | ULUSLARARASI KOKTEYLLER | AMARETTO SOUR | Excel sayfasında yok | 35 $ (THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |
| Royal Lobby Bar | ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |
| Blue Sea Beach Bar | ATIŞTIRMALIKLAR | Hellim Çıtırları | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ATIŞTIRMALIKLAR | Tempura Tabağı | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ATIŞTIRMALIKLAR | Kıtır Pane Basketi | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ATIŞTIRMALIKLAR | Kalamar Tava | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ATIŞTIRMALIKLAR | Şnitzel | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ATIŞTIRMALIKLAR | Acılı Tavuk Kanatları | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ATIŞTIRMALIKLAR | Kentucky | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | SALATALAR | Sezar Salata | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | SALATALAR | Karpuzlu Ezine Peynirli Akdeniz Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | SALATALAR | Avokado Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | SALATALAR | Deniz Ürünleri Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | SALATALAR | Royal Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | HAMBURGERLER | Chef Burger | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | HAMBURGERLER | Cheese Burger | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | HAMBURGERLER | Tavuk Burger | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TOST & SANDVİÇ | Sanayi Tost | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TOST & SANDVİÇ | Kavurmalı Tost | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TOST & SANDVİÇ | Steak Sandwich | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | MAKARNALAR | Spagetti Napoliten | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | MAKARNALAR | Fettuccine Alfredo | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | MAKARNALAR | Spagetti Bolonez | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | MAKARNALAR | Penne Arrabbiata | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | MAKARNALAR | Türkmen Mantısı | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ANA YEMEKLER | Tekirdağ Köfte Izgara | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ANA YEMEKLER | Piliç Şaşlık | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ANA YEMEKLER | Royal Köfte | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ANA YEMEKLER | Levrek Izgara | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | ANA YEMEKLER | Kanat Izgara | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TATLILAR | Magnolia | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TATLILAR | San Sebastian Cheesecake | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TATLILAR | Fırın Sütlaç | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TATLILAR | Brownie | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | TATLILAR | Meyve Tabağı | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | VANİLYA | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | DAMLA SAKIZ | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | KAKAO | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | ÇİKOLATA | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | KARAMEL | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | ÇİLEK | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | VİŞNE | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | LİMON | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | KAVUN | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | MUZ | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | DONDURMALAR | AHUDUDU | içecek sayfası kapsamında değil (yemek) |  |
| Blue Sea Beach Bar | İMZA KOKTEYLLER | HARMONY | Excel sayfasında yok |  |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | MORGENTAU | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | MASALA CHAI | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | VANILLA ROOIBOS | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | CHILL OUT WITH HERBS | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | FRUITY CAMOMILE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | REFRESHING MINT | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CREAM ORANGE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | HUCKLEBERRY FRIEND | Excel sayfasında yok |  |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | JASMINE PEARLS | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | EARL GREY | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | GREEN LEAF | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | IRISH WHISKEY CREAM | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | CHINESE SPRING | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | GET THE POWER | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | GINGER TWIST | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | WHITE YIN LONG | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | ROOIBOS CHOCOLATE HEAVEN | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | RONNEFELDT TAZE DEMLEME ÇAYLAR | AYURVEDA HERBS & GINGER | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | SOĞUK KAHVELER | ICED COFFEE CREAM | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | SOĞUK KAHVELER | WHITE CHOCOLATE MOCHA | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | GARDEN | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | THE PASSION | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | MAGNOLYA | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | YOU AND ME | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | ÇAKISTES | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | CONCIERTO | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | FOR | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | FOR AS FIRE | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | PANDOMİM | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | DİLEK TAŞI | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | GRASS | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | APERITIVO | Excel sayfasında yok |  |
| The Roof Garden | THE ROOF GARDEN İMZA KOKTEYLLER | BAZAAR | Excel sayfasında yok |  |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ENGLISH BREAKFAST | Excel sayfasında yok | 10 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | EARL GREY | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | MORGENTAU | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | REFRESHING MINT | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | FRUITY CAMOMILE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | AYURVEDA HERBS & GINGER | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ROOIBOS CREAM ORANGE | Excel sayfasında yok | 20 $ (CAFE VERDE PREMIUM, TEA LOUNGE MENU) |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | SWEET BERRIES | Excel sayfasında yok |  |
| Premium Lobby Bar | RONNEFELDT POŞET ÇAYLAR | ROYAL WHITE TEA | Excel sayfasında yok |  |
| Premium Lobby Bar | İMZA KOKTEYLLER | PORT | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU) |
| Premium Lobby Bar | İMZA KOKTEYLLER | THE PASSION | Excel sayfasında yok |  |
| Premium Lobby Bar | İMZA KOKTEYLLER | HARMONY | Excel sayfasında yok |  |
| Premium Lobby Bar | ULUSLARARASI KOKTEYLLER | AMARETTO SOUR | Excel sayfasında yok | 35 $ (THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |
| Premium Lobby Bar | ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |
| Premium Pool Bar | ÇORBALAR | Mercimek Çorbası | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TOSTLAR | Royal Tost | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TOSTLAR | Kıbrıs Tostu | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TOSTLAR | Panini Tost | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TOSTLAR | Avşar Tost | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TOSTLAR | Ayvalık Tostu | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SANDVİÇLER | Steak Sandwich | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SANDVİÇLER | Mozzarella Caprese Sandviç | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SANDVİÇLER | İtalyan Ton Balıklı Sandviç | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SALATALAR | Antioksidanlı Yeşil Salata | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SALATALAR | Ton Balıklı Salata | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SALATALAR | Çoban Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SALATALAR | Kinoalı Tabule | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SALATALAR | Tavuklu Sezar Salata | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SALATALAR | Izgara Levrek Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | SALATALAR | Enginar Kalpli Kıbrıs Salatası | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | KIZARTMALAR | Panelenmiş Balık & Patates Kızartması | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | KIZARTMALAR | Peynirli Sigara Böreği | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | KIZARTMALAR | Patates Kızartması | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | KIZARTMALAR | Piliç Finger | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | KIZARTMALAR | Kalamar Tava | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BURGER & SICAK ATIŞTIRMALIKLAR | Royal Burger | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BURGER & SICAK ATIŞTIRMALIKLAR | Buffalo Soslu Tavuk Kanat | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BURGER & SICAK ATIŞTIRMALIKLAR | Tavuklu Quesadilla | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BURGER & SICAK ATIŞTIRMALIKLAR | Dana Etli Burrito | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BURGER & SICAK ATIŞTIRMALIKLAR | Çıtır Kombo Tabağı | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | MAKARNALAR | Spagetti Bolonez | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | MAKARNALAR | Spagetti Napoliten | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | MAKARNALAR | Fusilli al Pesto | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | MAKARNALAR | Penne Arrabbiata | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | MAKARNALAR | Mantar Soslu Tavuklu Tagliatelle | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | MAKARNALAR | Türkmen Mantısı | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | MAKARNALAR | Mac and Cheese | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİZZALAR | Pizza Royal | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİZZALAR | Pizza Quattro Stagioni | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİZZALAR | Pizza Pepperoni | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİZZALAR | Pizza Quattro Formaggi | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİZZALAR | Pizza Margherita | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİZZALAR | Tavuklu Calzone | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİZZALAR | Sarımsaklı Tereyağlı Ekmek | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİDELER | Konya Etli Ekmek | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİDELER | Kıymalı Kır Pidesi | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİDELER | Peynirli Pide | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİDELER | Kuşbaşılı Kaşarlı Pide | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | PİDELER | Lahmacun | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BOWLLAR | Tekirdağ Bowl | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BOWLLAR | Levrek Bowl | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | BOWLLAR | Peri Peri Bowl | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | ANA YEMEKLER | Kasap Köfte | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | ANA YEMEKLER | Kuzu Şiş | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | ANA YEMEKLER | Piliç Külbastı | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | ANA YEMEKLER | Piliç Şnitzel | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | ANA YEMEKLER | Somon Teriyaki | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | ANA YEMEKLER | Izgara Levrek | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | Fırın Sütlaç | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | Meyveli Turta | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | San Sebastian Cheesecake | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | Muzlu Dondurma | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | Brownie (Ilık Servis Edilir) | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | Mevsim Meyveleri | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | Waffle | içecek sayfası kapsamında değil (yemek) |  |
| Premium Pool Bar | TATLILAR | Dondurma | içecek sayfası kapsamında değil (yemek) |  |
| Cafe Verde | MEŞRUBATLAR | SU 330 ml. | Excel sayfasında yok |  |
| Cafe Verde | SOĞUK LEZZETLER | ROYAL DONDURMA | içecek sayfası kapsamında değil (yemek) |  |
| Cafe Verde | VOTKALAR | SMIRNOFF NORTH | Excel sayfasında yok | 10 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, THE ROOF GARDEN, WHISKEY LOUNGE) |
| Cafe Verde | LİKÖRLER | UNDERBERG | Excel sayfasında yok |  |
| Cafe Verde | LİKÖRLER | WENNEKER APRICOT BRANDY | Excel sayfasında yok | 20 $ (IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) |
| Cafe Verde | LİKÖRLER | BOLS ELDERFLOWER | Excel sayfasında yok |  |
| Cafe Verde | LİKÖRLER | FRANGELICO | Excel sayfasında yok | 20 $ (BEACH BEVERAGE MENU, IN ROOM DINING BEV. MENU, LOBBY BARS MENU, WHISKEY LOUNGE) |
| Cafe Verde | İMZA KOKTEYLLER | PORT | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU) |
| Cafe Verde | İMZA KOKTEYLLER | THE PASSION | Excel sayfasında yok |  |
| Cafe Verde | İMZA KOKTEYLLER | HARMONY | Excel sayfasında yok |  |
| Cafe Verde | ULUSLARARASI KOKTEYLLER | AMARETTO SOUR | Excel sayfasında yok | 35 $ (THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |
| Cafe Verde | ULUSLARARASI KOKTEYLLER | ESPRESSO MARTINI | Excel sayfasında yok | 35 $ (BEACH BEVERAGE MENU, THE ROOF GARDEN, WHISKEY COCKTAIL MENU) |

## 8. Excel'de fiyatı var, menüde ürünü yok (368 satır)

Outlet'in Excel sayfasındaki bu satırları menüdeki hiçbir ürün almadı. Menüye eklenmedi.

| bölüm | Excel satırı | outletler |
|---|---|---|
| MEŞRUBATLAR / SOFT DRINKS | IN ROOM DINING BEV. MENU satır 11: AYRAN [S 5 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MEŞRUBATLAR / SOFT DRINKS | IN ROOM DINING BEV. MENU satır 15: SU / WATER 750 ml. [S 7 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MEŞRUBATLAR / SOFT DRINKS | IN ROOM DINING BEV. MENU satır 19: ICE TEA [S 5 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MEŞRUBATLAR / SOFT DRINKS | IN ROOM DINING BEV. MENU satır 22: ŞALGAM SUYU / TURNIP JUICE [S 5 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| FRESH MEYVE SUYU / FRESH FRUIT JUICE | IN ROOM DINING BEV. MENU satır 26: PORTAKAL, GREYFURT, HAVUÇ, ELMA [S 10 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER / HOT DRINKS | IN ROOM DINING BEV. MENU satır 31: ESPRESSO, RISTRETTO, LUNGO [S 15 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER / HOT DRINKS | IN ROOM DINING BEV. MENU satır 38: KLASİK TÜRK ÇAYI / TURKISH TEA [S 7 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| SICAK İÇECEKLER / HOT DRINKS | IN ROOM DINING BEV. MENU satır 39: BİTKİ ÇAYLARI / HERBAL TEA [S 7 / D — / Ş —] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| VOTKALAR / VODKAS | IN ROOM DINING BEV. MENU satır 70: TITO'S [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| VOTKALAR / VODKAS | IN ROOM DINING BEV. MENU satır 74: ABSOLUT MANGO [S 10 / D 15 / Ş 150] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| VOTKALAR / VODKAS | IN ROOM DINING BEV. MENU satır 75: ABSOLUT MANDARIN [S 10 / D 15 / Ş 150] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| VOTKALAR / VODKAS | IN ROOM DINING BEV. MENU satır 76: ABSOLUT ELYX [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| VOTKALAR / VODKAS | IN ROOM DINING BEV. MENU satır 83: GREY GOOSE VX [S 40 / D 50 / Ş 500] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| VOTKALAR / VODKAS | IN ROOM DINING BEV. MENU satır 84: SUICIDE [S 20 / D 30 / Ş 200] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| VOTKALAR / VODKAS | IN ROOM DINING BEV. MENU satır 86: CRYSTAL HEAD [S 20 / D 30 / Ş 200] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| CİNLER / GINS | IN ROOM DINING BEV. MENU satır 102: MALFY LEMON [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| CİNLER / GINS | IN ROOM DINING BEV. MENU satır 103: STIRLING PINK [S 10 / D 20 / Ş 150] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| TEKİLALAR / TEQUILAS | IN ROOM DINING BEV. MENU satır 127: EL JIMADOR REPOSADO [S 10 / D 20 / Ş 150] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| TEKİLALAR / TEQUILAS | IN ROOM DINING BEV. MENU satır 130: HERRADURA PLATA [S 40 / D 50 / Ş 350] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| TEKİLALAR / TEQUILAS | IN ROOM DINING BEV. MENU satır 131: CLASSE AZUL PLATA [S 40 / D 60 / Ş 600] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| TEKİLALAR / TEQUILAS | IN ROOM DINING BEV. MENU satır 132: CLASSE AZUL REPOSADO [S 90 / D 150 / Ş 1000] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| KONYAKLAR / COGNACS | IN ROOM DINING BEV. MENU satır 151: REMY MARTIN PRIME CELLAR SELECTION NO 16 [S 70 / D 80 / Ş 700] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| KONYAKLAR / COGNACS | IN ROOM DINING BEV. MENU satır 152: REMY MARTIN LOUIS XIII [S 350 / D 400 / Ş 5000] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| LİKÖRLER / LIQUEURS | IN ROOM DINING BEV. MENU satır 158: WENNEKER CREME DE CASSIS [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| LİKÖRLER / LIQUEURS | IN ROOM DINING BEV. MENU satır 159: WENNEKER CREME DE MENTHE [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| LİKÖRLER / LIQUEURS | IN ROOM DINING BEV. MENU satır 167: BROGANS [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| LİKÖRLER / LIQUEURS | IN ROOM DINING BEV. MENU satır 168: MOLLY'S IRISH CREAM [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| LİKÖRLER / LIQUEURS | IN ROOM DINING BEV. MENU satır 169: LITCHAO [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| LİKÖRLER / LIQUEURS | IN ROOM DINING BEV. MENU satır 174: WENNEKER HAZELNUT [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| DÜNYA VİSKİLERİ / WORLD WHISKIES | IN ROOM DINING BEV. MENU satır 193: HIBIKI JAPANESE HARMONY [S 105 / D 120 / Ş 1000] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| DÜNYA VİSKİLERİ / WORLD WHISKIES | IN ROOM DINING BEV. MENU satır 194: HIBIKI 17 Y.O. [S 105 / D 120 / Ş 1000] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| DÜNYA VİSKİLERİ / WORLD WHISKIES | IN ROOM DINING BEV. MENU satır 195: THE YAMAZAKI [S 175 / D 189 / Ş 1750] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| DÜNYA VİSKİLERİ / WORLD WHISKIES | IN ROOM DINING BEV. MENU satır 196: CANADIAN CLUB [S 70 / D 85 / Ş 700] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| DÜNYA VİSKİLERİ / WORLD WHISKIES | IN ROOM DINING BEV. MENU satır 197: KAVALAN DISTTILLERY SELECT [S 20 / D 30 / Ş 200] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| DÜNYA VİSKİLERİ / WORLD WHISKIES | IN ROOM DINING BEV. MENU satır 198: KAVALAN CLASSIC [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| DÜNYA VİSKİLERİ / WORLD WHISKIES | IN ROOM DINING BEV. MENU satır 199: KAVALAN CONCERT MASTER [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 206: JACK DANIEL'S FIRE [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 208: JACK DANIEL'S APPLE [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 212: JACK DANIEL'S 150 ANNIVERSARY [S 50 / D 60 / Ş 500] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 214: WOODFORD RYE [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 218: ELIJAH CRAIG [S 20 / D 30 / Ş 200] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 219: BASIL HAYDEN'S [S 40 / D 50 / Ş 350] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 220: KNOB CREEK [S 40 / D 50 / Ş 400] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| BOURBON & TENNESSEE VİSKİLER / BOURBON & TENNESSEE WHISKIES | IN ROOM DINING BEV. MENU satır 221: BOOKER'S [S 50 / D 60 / Ş 525] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 225: AUCHENTOSHAN [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 226: JURA 10 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 228: COAL ILA 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 229: LAPHROAIG 10 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 230: ARDBERG 10 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 231: HIGHLAND PARK 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 232: BENRIARCH 10 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 233: BENRIARCH 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 235: GLENKINCHIE 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 236: CARDHU 12 Y.O. [S 50 / D 60 / Ş 400] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 245: MACALLAN 18 Y.O. [S 90 / D 100 / Ş 800] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 246: MACALLAN ESTATE RESERVE [S 110 / D 120 / Ş 1000] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 247: DALMORE 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 248: DALMORE 15 Y.O. [S 40 / D 50 / Ş 350] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 250: GLENMORANGIE LASANTA 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 251: GLENMORANGIE 14 Y.O. [S 40 / D 50 / Ş 350] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 252: GLENMORANGIE SIGNET [S 70 / D 80 / Ş 600] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 254: GLENLIVET 15 Y.O. [S 40 / D 50 / Ş 350] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 255: GLENLIVET 1824 [S 50 / D 60 / Ş 400] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 256: GLENLIVET 18 Y.O. [S 70 / D 80 / Ş 600] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 257: BOWMORE 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 258: BOWMORE 15 Y.O. [S 40 / D 50 / Ş 350] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 259: BOWMORE 18 Y.O. [S 50 / D 60 / Ş 400] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 260: DALWHINNIE 15 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 261: ABERLOUR 12 Y.O. [S 30 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 262: ABERLOUR 18 Y.O. [S 50 / D 60 / Ş 400] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MALT VİSKİLER / MALT WHISKIES | IN ROOM DINING BEV. MENU satır 264: SINGLETON 18 Y.O. [S 50 / D 60 / Ş 400] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 268: WHITE HORSE [S 10 / D 15 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 270: THE NAKED GROUSE [S 10 / D 15 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 271: DEWAR'S WHITE LABEL [S 10 / D 15 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 273: BALLANTINE'S 7 Y.O. [S 10 / D 15 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 278: CHIVAS REGAL EXTRA 13 Y.O. [S 10 / D 15 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 282: CHIVAS REGAL ULTIS [S 70 / D 80 / Ş 700] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 286: JOHNNIE WALKER DOUBLE BLACK [S 20 / D 40 / Ş 250] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 288: JOHNNIE WALKER SWING [S 20 / D 30 / Ş 200] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 289: JOHNNIE WALKER GREEN LABEL [S 40 / D 50 / Ş 400] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 291: JOHNNIE WALKER BLUE LABEL [S 100 / D 120 / Ş 1000] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İSKOÇ VİSKİLER / SCOTCH WHISKIES | IN ROOM DINING BEV. MENU satır 292: JOHNNIE WALKER KING GEORGE V [S 280 / D 300 / Ş 2800] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İRLANDA VİSKİLERİ / IRISH WHISKIES | IN ROOM DINING BEV. MENU satır 297: JAMESON BLACK BARREL [S 20 / D 30 / Ş 200] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İRLANDA VİSKİLERİ / IRISH WHISKIES | IN ROOM DINING BEV. MENU satır 299: BUSHMILLS ORIGINAL [S 20 / D 30 / Ş 175] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| İRLANDA VİSKİLERİ / IRISH WHISKIES | IN ROOM DINING BEV. MENU satır 300: BUSHMILLS BLACK BUSH [S 20 / D 30 / Ş 200] | Diamond Oda Servisi, Royal Oda Servisi, Premium Oda Servisi |
| MEŞRUBATLAR / SOFT DRINKS | LOBBY BARS MENU satır 15: SU / WATER 750 ml. [S 7 / D — / Ş —] | Diamond Lobby Bar, Royal Lobby Bar, Premium Lobby Bar |
| MEŞRUBATLAR / SOFT DRINKS | BEACH BEVERAGE MENU satır 6: MEYVE SUYU / FRUIT JUICE [S 7 / D — / Ş —] | Diamond Pool Bar |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | BEACH BEVERAGE MENU satır 67: LAPİTOS [S 15 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | BEACH BEVERAGE MENU satır 69: VASİLYA [S 15 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | BEACH BEVERAGE MENU satır 71: MİRTİ [S 15 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | BEACH BEVERAGE MENU satır 73: KARAVA [S 15 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | BEACH BEVERAGE MENU satır 75: FTERİHA [S 15 / D — / Ş —] | Diamond Pool Bar, Blue Sea Beach Bar |
| İMZA KOKTEYLLER / SIGNATURE COCKTAILS | BEACH BEVERAGE MENU satır 81: ROYAL [S 35 / D — / Ş —] | Diamond Pool Bar |
| İMZA KOKTEYLLER / SIGNATURE COCKTAILS | BEACH BEVERAGE MENU satır 83: PASSION [S 35 / D — / Ş —] | Diamond Pool Bar |
| FRUIT FROZENS | TEA LOUNGE MENU satır 131: MEVSİM MEYVELERİ, MEYVE PÜRESİ [S 20 / D — / Ş —] | Tea Lounge |
| MILKSHAKES | TEA LOUNGE MENU satır 136: DONDURMA, SÜT, AROMALI SOS, KREMA, DONDURMA KÜLAHI [S 20 / D — / Ş —] | Tea Lounge |
| MILKSHAKES | TEA LOUNGE MENU satır 138: VANİLYA, ÇİLEK, ÇİKOLATA, OREO, KARAMEL [S 20 / D — / Ş —] | Tea Lounge |
| SMOOTHIES | TEA LOUNGE MENU satır 143: MEVSİM MEYVELERİ, MEYVE PÜRESİ [S 20 / D — / Ş —] | Tea Lounge |
| ROYAL DONDURMA / ROYAL ICE CREAM | TEA LOUNGE MENU satır 165: KAYMAK, KARAMEL, VANİLYA, BLUE SKY, DAMLA SAKIZI, NANE, MUZ, [S 5 / D — / Ş —] | Tea Lounge |
| BİRALAR / BEERS | WHISKEY LOUNGE satır 15: GUINNESS [S 15 / D — / Ş —] | Whiskey Lounge |
| BİRALAR / BEERS | WHISKEY LOUNGE satır 16: KRONENBOURG 1664 BLANC [S 15 / D — / Ş —] | Whiskey Lounge |
| BİRALAR / BEERS | WHISKEY LOUNGE satır 17: WEIHENSTEPHENER [S 15 / D — / Ş —] | Whiskey Lounge |
| TEKİLALAR / TEQUILAS | WHISKEY LOUNGE satır 90: EL JIMADOR REPOSADO [S 10 / D 20 / Ş 150] | Whiskey Lounge |
| SICAK ALKOLLÜ KOKTEYLLER / ALCOHOLIC HOT COCKTAILS | WHISKEY COCKTAIL MENU satır 6: CAPTAIN HOT TODDY [S 25 / D — / Ş —] | Whiskey Lounge |
| SICAK ALKOLLÜ KOKTEYLLER / ALCOHOLIC HOT COCKTAILS | WHISKEY COCKTAIL MENU satır 9: IRISH COFFEE [S 25 / D — / Ş —] | Whiskey Lounge |
| SICAK ALKOLLÜ KOKTEYLLER / ALCOHOLIC HOT COCKTAILS | WHISKEY COCKTAIL MENU satır 12: FRENCH COFFEE [S 25 / D — / Ş —] | Whiskey Lounge |
| İMZA KOKTEYLLER / SIGNATURE COCKTAILS | WHISKEY COCKTAIL MENU satır 42: TWO OF US [S 35 / D — / Ş —] | Whiskey Lounge |
| İMZA KOKTEYLLER / SIGNATURE COCKTAILS | WHISKEY COCKTAIL MENU satır 45: KYRENIA [S 35 / D — / Ş —] | Whiskey Lounge |
| İMZA KOKTEYLLER / SIGNATURE COCKTAILS | WHISKEY COCKTAIL MENU satır 51: CURE [S 35 / D — / Ş —] | Whiskey Lounge |
| İMZA KOKTEYLLER / SIGNATURE COCKTAILS | WHISKEY COCKTAIL MENU satır 57: SILENCE & SECRET [S 35 / D — / Ş —] | Whiskey Lounge |
| RARE VINTAGE WINES | ROYALS WINE MENU satır 8: CHATEAU CHEVAL NOIR ST. EMILION GRAND CRU [kadeh — / şişe 120] | The Steakhouse, Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES | ROYALS WINE MENU satır 14: CHATEAU CORBIN ST. EMILION GRAND CRU [kadeh — / şişe 120] | The Steakhouse, Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES | ROYALS WINE MENU satır 17: CHATEAU CONNETABLE TALBOT ST. JULIEN [kadeh — / şişe 140] | The Steakhouse, Royal Mandarin, Bella Merit |
| RARE VINTAGE WINES | ROYALS WINE MENU satır 20: CHATEAU DASSAULT ST.EMILION GRAND CRU [kadeh — / şişe 190] | The Steakhouse, Royal Mandarin, Bella Merit |
| red wınes | ROYALS WINE MENU satır 53: SARAFİN MERLOT [kadeh 25 / şişe 100] | The Steakhouse, Royal Mandarin, Bella Merit |
| red wınes | ROYALS WINE MENU satır 56: SARAFİN SHIRAZ [kadeh 25 / şişe 100] | The Steakhouse, Royal Mandarin, Bella Merit |
| red wınes | ROYALS WINE MENU satır 68: SEVİLEN 900 [kadeh — / şişe 100] | The Steakhouse, Royal Mandarin, Bella Merit |
| red wınes | ROYALS WINE MENU satır 82: ANTICO PORTICO PRIMITIVO SALENTO 1950 [kadeh — / şişe 100] | The Steakhouse, Royal Mandarin, Bella Merit |
| red wınes | ROYALS WINE MENU satır 94: LAMBORGHINI CENTANNI ROSSO [kadeh — / şişe 50] | The Steakhouse, Royal Mandarin, Bella Merit |
| red wınes | ROYALS WINE MENU satır 97: MUSSO BARBARESCO [kadeh — / şişe 150] | The Steakhouse, Royal Mandarin, Bella Merit |
| red wınes | ROYALS WINE MENU satır 155: LOUIS JADOT BEAUJOLAIS - VILLAGES [kadeh — / şişe 70] | The Steakhouse, Royal Mandarin, Bella Merit |
| whıte wınes | ROYALS WINE MENU satır 171: SARAFİN CHARDONNAY [kadeh 25 / şişe 100] | The Steakhouse, Royal Mandarin, Bella Merit |
| whıte wınes | ROYALS WINE MENU satır 183: KAVAKLIDERE COTES D'AVANOS [kadeh — / şişe 100] | The Steakhouse, Royal Mandarin, Bella Merit |
| whıte wınes | ROYALS WINE MENU satır 186: SEVİLEN İSA BEY [kadeh — / şişe 70] | The Steakhouse, Royal Mandarin, Bella Merit |
| whıte wınes | ROYALS WINE MENU satır 189: SEVİLEN İSA BEY [kadeh — / şişe 70] | The Steakhouse, Royal Mandarin, Bella Merit |
| whıte wınes | ROYALS WINE MENU satır 194: KORNELL FLORIAN BRIGL MÜLLER THURGA [kadeh — / şişe 100] | The Steakhouse, Royal Mandarin, Bella Merit |
| whıte wınes | ROYALS WINE MENU satır 203: LAMBORGHINI TENUTA CENTANINI [kadeh — / şişe 50] | The Steakhouse, Royal Mandarin, Bella Merit |
| whıte wınes | ROYALS WINE MENU satır 240: CLOUD BAY [kadeh — / şişe 120] | The Steakhouse, Royal Mandarin, Bella Merit |
| rose wınes | ROYALS WINE MENU satır 290: VERONA BLUSH [kadeh — / şişe 70] | The Steakhouse, Royal Mandarin, Bella Merit |
| sparklıng wınes & champagnes | ROYALS WINE MENU satır 355: BERTELETTI PROSECCO ROSE EXTRA DRY [kadeh 15 / şişe 60] | The Steakhouse, Royal Mandarin, Bella Merit |
| sparklıng wınes & champagnes | ROYALS WINE MENU satır 373: BERTELETTI SPUMANTE PROSECCO EXTRA DRY [kadeh — / şişe 60] | The Steakhouse, Royal Mandarin, Bella Merit |
| MEŞRUBATLAR / SOFT DRINKS | BEACH BEVERAGE MENU satır 10: SAN PELLEGRINO [S 8.4 / D — / Ş —] | Blue Sea Beach Bar |
| FRESH MEYVE SUYU / FRESH FRUIT JUICE | BEACH BEVERAGE MENU satır 26: PORTAKAL, GREYFURT, HAVUÇ, ELMA [S 10 / D — / Ş —] | Blue Sea Beach Bar |
| FRESH MEYVE SUYU/ FRESH FRUIT JUICE | THE ROOF GARDEN satır 26: PORTAKAL, GREYFURT, HAVUÇ, ELMA [S 10 / D — / Ş —] | The Roof Garden |
| FRESH MEYVE SUYU / FRESH FRUIT JUICE | THE ROOF GARDEN satır 45: GREYFURT, ELMA, KARPUZ, KAVUN, KİVİ, PORTAKAL, KARIŞIK [S 20 / D — / Ş —] | The Roof Garden |
| SERİNLETİCİ SMOOTHIE / REFRESHMENT SMOOTHIES | THE ROOF GARDEN satır 50: ÇİLEK, ELMA, KARPUZ, KAVUN, KİVİ, MUZ-SÜT-BAL, MUZ, NANE-LİM [S 20 / D — / Ş —] | The Roof Garden |
| MILKSHAKES | THE ROOF GARDEN satır 55: VANİLYA, DAMLA SAKIZ, KAKAO, ÇİKOLATA, KARAMEL, ÇİLEK, VİŞNE [S 20 / D — / Ş —] | The Roof Garden |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | THE ROOF GARDEN satır 60: LAPİTOS [S 20 / D — / Ş —] | The Roof Garden |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | THE ROOF GARDEN satır 64: MİRTİ [S 15 / D — / Ş —] | The Roof Garden |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | THE ROOF GARDEN satır 66: KARAVA [S 15 / D — / Ş —] | The Roof Garden |
| ALKOLSÜZ KOKTEYLLER / NON ALCHOLIC COCKTAILS | THE ROOF GARDEN satır 68: FTERİHA [S 15 / D — / Ş —] | The Roof Garden |
| KONYAKLAR / COGNACS | THE ROOF GARDEN satır 150: REMY MARTIN LOUIS XIII (WHISKEY LOUNGE ALINDI) [S 350 / D 400 / Ş 5000] | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER / THE ROOF GARDEN SIGNATURES COCKTAILS | THE ROOF GARDEN satır 249: LOST & FOUND [S 35 / D — / Ş —] | The Roof Garden |
| THE ROOF GARDEN İMZA KOKTEYLLER / THE ROOF GARDEN SIGNATURES COCKTAILS | THE ROOF GARDEN satır 251: AVANT-GARDE [S 35 / D — / Ş —] | The Roof Garden |
| FRUIT FROZENS | CAFE VERDE PREMIUM satır 131: MEVSİM MEYVELERİ, MEYVE PÜRESİ [S 20 / D — / Ş —] | Cafe Verde |
| MILKSHAKES | CAFE VERDE PREMIUM satır 136: DONDURMA, SÜT, AROMALI SOS, KREMA, DONDURMA KÜLAHI [S 20 / D — / Ş —] | Cafe Verde |
| MILKSHAKES | CAFE VERDE PREMIUM satır 138: VANİLYA, ÇİLEK, ÇİKOLATA, OREO, KARAMEL [S 20 / D — / Ş —] | Cafe Verde |
| SMOOTHIES | CAFE VERDE PREMIUM satır 143: MEVSİM MEYVELERİ, MEYVE PÜRESİ [S 20 / D — / Ş —] | Cafe Verde |
| ROYAL DONDURMA / ROYAL ICE CREAM | CAFE VERDE PREMIUM satır 165: KAYMAK, KARAMEL, VANİLYA, BLUE SKY, DAMLA SAKIZI, NANE, MUZ, [S 5 / D — / Ş —] | Cafe Verde |
