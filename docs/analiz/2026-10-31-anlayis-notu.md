# Merit Royal Dijital Operasyon Sistemi — Anlayış Notu ve Karar Listesi

**Tarih:** 31 Ekim 2026 · **Hazırlayan:** Claude (tasarım öncesi analiz) · **Durum:** Onay bekliyor

Bu not, kod yazılmadan önce "ne yapacağımızı" tek yerde sabitler. Kaynaklar:
`merit_proforma_teklif_sartname.pdf` (PRO-MR-2026-088), sizin 31.10 tarifiniz, `PLAN.md` + `DESIGN.md` + kök HTML prototipleri (Stitch soyu),
`MENNN/` (plan, Prisma taslağı, 55 ekranlık prototip, XP kabuğu) ve canlıdaki `D:\PROJELLER\minibarlatest` (Flask) kodu.

---

## 1. Hedef (sizin sözlerinizle, kısaltılmış)

Tek bir **Windows XP stili yönetici kabuğu** altında birleşen, Next.js + PostgreSQL + Prisma ile yazılacak dört modül:

| Modül | Kullanıcı | Özet |
|---|---|---|
| **Sistem Yöneticisi (çekirdek)** | Sistem yöneticisi, otel/outlet müdürleri | 3 otel, kat/oda/oda tipi, outlet, ürün, kullanıcı, rol ve **rol bazlı ekran/veri yetkisi**, canlı izleme (monitoring), raporlama. İleride başka web uygulamalarının "pencere" olarak takılabileceği bir "Merit OS" kabuğu. |
| **Minibar Takip** | Depo sorumlusu, kat sorumlusu, HK | `minibarlatest` ile **birebir aynı**: oda tipi → setup (konsept) → oda; depo → zimmet; oda kontrolü (kontrol noktaları), DND, MyBar misafir talebi, raporlar. |
| **QR Menü + QR Sipariş** | Misafir, garson, kasa, mutfak | A la carte dışı outletlerde masa QR'ı → menü; yöneticiden **fiyat göster/gizle** ve **sipariş aç/kapa**; sipariş → kasa + online garsonlara (masa ataması varsa o garsona) bildirim → onay → mutfak ekranı (KDS) + adisyon/sipariş yazıcısı. |
| **QR Oda Servisi** | Misafir, oda servisi mutfağı | Oda QR'ı → oda servisi menüsü → sipariş → oda servisi mutfağına anlık bildirim → dahili telefonla teyit (opsiyonel) → hazırlık/teslim. |

Ticari sınır: PRO-MR-2026-088 (9.500 USD). Donanım, PMS/ödeme entegrasyonu ve a la carte restoranlar kapsam dışı.

## 2. Tek doğru kaynak kararı

Belgeler birbiriyle 30'dan fazla noktada çelişiyor. Önerdiğim öncelik sırası:

1. **Sizin tarifiniz** (31.10 mesajları) ve **PRO-MR-2026-088 şartnamesi** — kapsam ve iş kuralı için.
2. **`minibarlatest` canlı kodu** — minibar modülünün ekran ve kuralları için (dokümanları değil, kodun yaptığı; dokümanların çoğu Ekim 2025'te kalmış).
3. **MENNN planı + Prisma taslağı** — rol/yetki/oturum/outlet mimarisi için (en olgun model: 53 model, rol × otel × modül × ekran × işlem).
4. **Stitch soyu (PLAN.md/DESIGN.md/XP prototipi)** — görsel referans ve XP kabuğu davranışları için.
5. `Merit_Royal_Yazilim_Lisans_Proforma.html` (19.500 USD) — **geçersiz/eski** sayılır.

## 3. minibarlatest'te gerçekte ne var (dokümanlardan farklı noktalar)

Kodun yaptığı, belgelerin ve prototiplerin yazdığından farklı. "Birebir aynı" hedefi için bunlar kritik:

| Konu | Canlı kod (minibarlatest) | Prototip/plan/tarifiniz |
|---|---|---|
| MyBar günlük sınır | **Yok.** Aynı oda için istediği kadar talep açılabilir; tek sınır IP başına 30 istek/dk | "Günde en fazla 1 kez" (şartname, tarifiniz, tüm planlar) |
| MyBar ürün seçimi | **Yalnızca işaretleme (checkbox), adet yok**; her ürün 1 sayılır | "İlave ya da eksiltme yapabilir" (+/- adet) |
| MyBar bildirim | Uygulama içi bildirim, 4 role (kat, depo, sistem yön., admin); 10 sn polling; e-posta/push yok | Kat sorumlusu + depo + yönetici anlık (push) |
| Zimmet modeli | **Otel bazlı ortak havuz** (`otel_zimmet_stok`); kişi bazlı eski model paralel ama kopuk | Depo → kat sorumlusu **kişiye** zimmet (tarifiniz, planlar) |
| Oda kontrolü | "Minibar her zaman dolu" modeli: +N eklenen = tüketim ikamesi; ekstra; setup dışı ürün; sarfiyat yok; DND | Aynı (prototip "kapı formu") |
| DND | Günde oda başına tek kayıt, **2 kontrolle tamamlanır**; 120 dk sonra yeniden kontrol hedefi (zorlayıcı değil); gün sonu 23:59'da tamamlanmayanlar "incomplete" | 45 dk (Stitch) / 120 dk (MENNN) hatırlatıcı |
| Doluluk & görevlendirme | PMS Excel'i (inhouse/arrivals/departures) yüklenince günlük kontrol görevleri üretilir; öncelik planı (arrival −15 dk, departure +60 dk) | Hiçbir planda yok |
| Ana depo | Tedarik (ADT-…), FIFO partileri, stok hareketleri salt-okunur | Planlarda yalnızca "depo → kat arabası" |
| Oda tipi–setup | Setup **otele göre** oda tipine atanır; dolap içi/dolap dışı; dolap sayısı kadar çoğaltılır | Oda tipi ↔ tek konsept |
| QR token | 6 haneli rastgele sayı (tahmin edilebilir, çakışma kontrolü yok) | HMAC imzalı token |
| Roller | sistem_yoneticisi, admin, depo_sorumlusu, kat_sorumlusu (+ ulaşılamayan superadmin) | 16 rol / 5 tip |
| Diller (misafir) | TR, EN, DE, RU, AR (+ Google Translate ile not çevirisi) | 6–7 dil |
| ML anomali, e-posta raporları, executive dashboard | Var | Yok |

**Taşınmaması gereken hatalar (canlı kodda tespit edildi):** eksik ürünle talep kapatma çalışmıyor (alan adı uyumsuzluğu + TypeError); yönetici/depo için iptal ekranı yok; kat sorumlusu oda QR'ı okutunca 500; otel sahipliği kontrolleri eksik; sipariş önerisinde yanlış ürün id; onaylanan sipariş havuza yansımıyor; zimmet düşümü ile işlem kaydı ayrı transaction; DND eşiği servis=2 / cron=3; saat dilimi karışık (KKTC/UTC/`date.today()`); oda no sistem genelinde unique (otel bazlı olmalı).

## 4. Belgeler arası çelişkiler ve önerdiğim çözüm

| # | Çelişki | Öneri |
|---|---|---|
| 1 | Otel adları/oda sayıları: Diamond 273 (şartname) vs 302 (canlı); "Crystal Rocks/Premium", "Zephyros" adları | Seed: **Merit Royal Diamond, Merit Royal, Merit Royal Premium**; oda sayısı sabit değil, odalar panelden/Excel'den tanımlanır. Royal (125) ve Premium (130) odaları `minibarlatest/data/*.json`'dan içe aktarılabilir. |
| 2 | 18 outlet dağılımı 4 farklı şekilde | Outletler **seed'e gömülmez**, panelden tanımlanır. Ortak (Zephyros sahili gibi) outletler için `Outlet.hotelId` zorunlu kalır, ekip ataması çok otelden yapılabilir. |
| 3 | Fiyat gösterimi kapsamda mı | Tarifiniz net: **yöneticiden aktif/pasif**. Üç seviye: sistem varsayılanı → outlet → (ileride) öğe. Para birimi tek: EUR (ayarlanabilir). Ödeme yok. |
| 4 | SSE mi WebSocket mi, Redis var mı | **SSE + PostgreSQL LISTEN/NOTIFY**, Redis yok (geliştirme makinesinde de yok; tek sunucu). Zamanlanmış işler için `pg-boss` (Postgres tabanlı kuyruk). |
| 5 | DND süresi 25/45/120 dk | Ayar tablosunda otel bazlı, **varsayılan 120 dk** (canlı sistemle aynı), 2 kontrolle tamamlanma kuralı korunur. |
| 6 | Oturum süresi 480/600 dk, uyarı 60 dk, tek cihaz | Rol bazlı `maxOnlineMinutes` (minibar rolleri 600, diğerleri 480), uyarı 60 dk, **tek cihaz: yeni giriş eskisini kapatır**, hareketsizlik 45 dk. Hepsi ayar. |
| 7 | Sipariş onayı kim verir | Kasa **veya** online garsonlar (masa ataması varsa yalnızca o garson; yoksa outletteki tüm online garsonlar). Onaylayan kişi kaydedilir; şef garson ve üstü her masayı onaylayabilir. |
| 8 | Geofence / Wi-Fi doğrulama / kara liste (Stitch index.html) | **v1 kapsam dışı**; masa QR'ı HMAC imzalı token ile korunur, outlet bazlı "sipariş aç/kapa" anahtarı yeterli. |
| 9 | A la carte restoranlar | Kapsam dışı; outlet tipi listesinde yer almaz. |
| 10 | Monorepo (apps/packages) vs tek uygulama | **Tek Next.js uygulaması**, içeride `modules/` ve `packages/` mantığı klasörle; tek geliştirici için monorepo yükü gereksiz. |
| 11 | Garson akıllı saat (Apple Watch/WearOS) | Native uygulama yok. **Web Push** (telefon) + PWA; saat bildirimi telefonun push'unun saate yansımasıyla sağlanır. |
| 12 | XP kabuğu ana mı alternatif mi | Tarifiniz: **ana yönetici kabuğu XP**. Saha (kat sorumlusu, garson, KDS, kasa) ve misafir ekranları **modern mobil/dokunmatik** tasarım; XP'ye zorlanmaz. |
| 13 | Yazıcı | Yerel ağda çalışan küçük bir **Node "print gateway"** servisi (ESC/POS, TCP 9100, cp857) — aynı repoda `tools/print-gateway`. Sunucu sipariş fişini kuyruğa yazar, gateway çeker ve basar. |

## 5. Kabul ettiğim varsayımlar (itiraz yoksa böyle ilerleyeceğim)

- Yetki modeli: MENNN'deki **rol × otel × modül × ekran × işlem (V/O/D/A/R)**; ekranlar katalogda, yönetici matrisi düzenler. "Rol yönetiminde hangi veri gösterilecek" isteğiniz bununla karşılanır.
- Giriş akışı: kullanıcı adı + şifre → (birden fazla ataması varsa) otel/outlet seçimi → online. MFA v1'de yok (altyapı hazır bırakılır).
- Kat sorumlusu bir otele, depo sorumlusu bir veya birden fazla otele bağlı (canlı sistemle aynı).
- Misafir tarafında üyelik/form yok; QR token ile anonim. Diller: TR, EN, DE, RU, AR (RTL dahil); FR/IT sözlük eklenebilir.
- Zaman: tüm "gün" hesapları **Europe/Nicosia** iş gününe göre; DB'de UTC saklanır.
- Minibar fiyat/kâr alanları taşınır ama misafire asla gösterilmez (iç rapor amaçlı).
- Bildirim: tek `Notification` tablosu + SSE; kullanıcı bazlı okundu (rol-paylaşımlı okundu hatası taşınmaz). Web Push opsiyonel kanal.
- Denetim günlüğü (audit) her yazma işleminde.
- Test: Vitest (iş kuralı birim testleri) + Playwright (kritik uçtan uca akışlar).

## 6. Karar bekleyen konular (tasarımı kilitleyenler)

**K1 — MyBar kuralı.** Canlı sistemde günlük sınır ve adet yok; tarifinizde "günde 1 kez, ilave/eksiltme" var. Hangisi?
  (a) Tarifiniz: günde 1 talep (oda+iş günü unique), ürün bazında +/- adet; (b) canlı sistemle birebir: sınırsız, yalnızca işaretleme; (c) ikisi ayar: varsayılan (a), yöneticiden kapatılabilir.
  **Önerim: (c).**

**K2 — Zimmet modeli.** Canlı: otel ortak havuzu. Tarifiniz: depo sorumlusu → kat sorumlusu kişisel zimmet.
  (a) Kişisel zimmet (her kat sorumlusunun kendi bakiyesi; oda kontrolü ondan düşer); (b) otel havuzu (canlı); (c) ikisi: depo → kat sorumlusu kişisel zimmet, havuz raporu toplamdan türetilir.
  **Önerim: (a)** — tarifinize ve "zimmet" kelimesinin anlamına uyar; canlıdaki kopuk kişisel model zaten bu niyetin izi.

**K3 — minibarlatest'in "ekstra" parçaları kapsamda mı?** Doluluk Excel yükleme + günlük görev/öncelik planı; ana depo tedarik + FIFO; e-posta raporları; ML anomali; executive dashboard.
  **Önerim:** doluluk + görevler + ana depo/FIFO + e-posta raporları **evet** (oda kontrol akışının parçası); **ML anomali ve executive dashboard v1'de hayır** (ortak monitoring/rapor modülü bunları karşılar).

**K4 — Veri göçü.** Canlı minibarlatest verisi (oteller, katlar, odalar, ürünler, setup'lar, kullanıcılar, geçmiş işlemler) yeni sisteme taşınacak mı?
  **Önerim:** tanımlar (otel/kat/oda/oda tipi/ürün grubu/ürün/setup/kullanıcı) için **göç scripti yazılır**; işlem geçmişi taşınmaz (eski sistem arşiv olarak kalır).

## 7. Alınan kararlar (31.10.2026, kullanıcı)

- **K1 MyBar:** ayarlanabilir; varsayılan oda başına iş günü başına 1 talep, +/- adet.
- **K2 Zimmet:** otel ortak havuzu (canlı sistemle aynı); depo sorumlusu havuza doğrudan giriş/iade yapar, kullanım kişi bazında loglanır.
- **K3 Kapsam:** doluluk Excel + günlük görevler + e-posta raporları DAHİL; ana depo tedarik/FIFO, ML anomali, executive dashboard HARİÇ.
- **K4 Göç:** canlı veritabanının tamamı (tanımlar + işlem geçmişi) yedekten taşınır.
- **K5 Oda kontrolü sadeleştirme:** **ekstra, sıfırla ve setup dışı ürün ekleme kaldırılır.** Kalan işlemler: +N ikame (tüketim), sarfiyat yok, DND, MyBar karşılama.
- Mimari: Yaklaşım A (tek Next.js 16 uygulaması, Prisma 7, PostgreSQL 17, SSE + LISTEN/NOTIFY, pg-boss, yerel print gateway).

Kararlar netleşince: tasarım bölümleri (mimari, veri modeli, modül akışları, XP kabuğu, gerçek zaman, yazdırma, test) → yazılı spec → uygulama planı.
