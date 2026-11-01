# MENNN — Merit Royal Servis Platformu

Minibar Takip, QR Menü, QR Sipariş ve QR Oda Servisi sistemlerinin ön arayüz tasarımları ve geliştirme planı.
Üç tesis **standart (varsayılan) kayıt** olarak tanımlıdır: **Merit Royal**, **Merit Royal Diamond**, **Merit Royal Premium**.

## Klasör içeriği

| Yol | İçerik |
|-----|--------|
| `prototip/index.html` | **Buradan başlayın.** Prototip paketinin giriş sayfası: ekran envanteri, kurallar, bağlantılar |
| `prototip/yonetim-paneli.html` | Yönetim paneli prototipi — **36 ekran** (3 otelin standart kaydı, uc kademeli akordeon menu, outlet modul atamalari (opsiyonel fiyati QR Menu/QR Siparis), outlete ozel menu tanimlama (gorsel/detay/alerjen/fiyat), adisyon toplamlari ve adisyon ciktisi, otel altinda outlet tanimlari, tanimlama akisi ve kurulum rehberi, rol tanimlari, yetki matrisi, modul girisi, modul bazli outlet ve rol tanimlari, outlet ekipleri ve kullanici atamalari, oturum/sure ayarlari, online kullanici takibi, minibar tanimlar akisi, zimmet/stok, tuketim, kisisellestirme, DND, QR menu kurgusu, garson onay kuyrugu, KDS, oda servisi, komuta merkezi, raporlar, kullanici/rol, sistem & denetim) |
| `prototip/yonetim-ek.js` | `yonetim-paneli.html` içine yüklenen ek modül kodu: merkezi yönetim, modül bazlı outlet/rol, outlet ekipleri, online takip ve oturum ayarları ekranları |
| `prototip/xp-masa.html` | XP masaüstü kabuğunun ikinci varyantı (masaüstü / tablet / mobil) |
| `prototip/yonetim-xp.html` | **Alternatif arayüz — Windows XP masaüstü:** çift tıkla açılan pencereler (her modül ayrı pencere, içinde otel seçimi), kategorili Başlat menüsü, sağ tuş menüsü (yenile · arka plan rengi · kısayol), sürükle-bırak kısayol ekleme/kaldırma, her işlemde onay penceresi; dar ekranda Android mobil kabuk (yalnızca izleme + raporlama, tanımlamalar Ayarlar'dan açılır; `?mobil=1` ile zorlanabilir) |
| `prototip/yonetim-outlet-menu.js` | **Outlet modül ataması ve outlete özel menü:** opsiyonel fiyatlı QR Menü / QR Sipariş ataması, kategori → alt kategori → grup → öğe ağacı (görsel, detay, alerjen, fiyat), fiyat gösterim anahtarı, adisyon kartları ve fiş çıktısı |
| `prototip/yonetim-menu.js` | **Akordeon menü sistemi:** MENU_TREE verisinden üretilen üç kademeli kategori ağacı, kardeş kategori kapatma, aktif yolun açılması, menü içi arama ve durum saklama |
| `prototip/yonetim-tanim.js` | Rol kataloğu (16 rol / 5 tip), ekran kataloğu (28 ekran), **yetki matrisi** (görüntüle/oluştur/düzenle/onayla/rapor), tanımlama akışı ve kurulum rehberi ekranları |
| `prototip/kat-formu.html` | Kat sorumlusu mobil prototipi — **6 ekran** (kat planı, oda QR okutma, kapı formu ile tüketim girişi, DND ara kaydı, kişiselleştirme karşılama, zimmetim + bildirimler) |
| `prototip/misafir.html` | Misafir arayüzü prototipi — **6 akış** (dil algılama, minibar kişiselleştirme, talep durumu, oda servisi, ambiyans temalı QR menü, QR sipariş + garson onayı durumu) |
| `prototip/oturum.html` | Personel giriş &amp; oturum prototipi — **7 ekran** (giriş + MFA, otel seçimi, outlet seçimi, çevrimiçi oturum ve süre sayacı, oturum kapandı, atama yok, süre aşımı). Gösterim hızı 600× seçilerek maksimum süre ve otomatik çıkış canlı izlenebilir |
| `prototip/xp-masa.html` | Alternatif yönetici kabuğu: masaüstü ve tablette XP masaüstü (pencere, CRUD onay, kısayol sürükle-bırak), mobilde Android izleme/rapor; tanımlar mobilde ayardan açılır |
| `PLAN.md` | Modüler geliştirme planı: mimari, modül kapsamı, iş akışları, faz/sprint planı, kabul kriterleri, riskler, karar bekleyen konular |
| `docs/veri-modeli.prisma` | Prisma şema taslağı (PostgreSQL) — 3 otelin varsayılan kaydı, tanım zinciri, zimmet, tüketim, DND, menü, sipariş, denetim |

## Prototipleri açma

Dosyaları çift tıklayarak tarayıcıda açabilirsiniz; kurulum gerekmez. En sağlıklı görünüm için Chrome/Edge önerilir.

Dil testleri (misafir arayüzü):

```
prototip/misafir.html            → dil tarayıcıdan otomatik algılanır (bulamazsa İngilizce)
prototip/misafir.html?lang=ar    → Arapça (sağdan sola yerleşim)
prototip/misafir.html?lang=de    → Almanca
```

Prototipleri tek tek görmek yerine paket giriş sayfasından gezmek için: `prototip/index.html`

## Prototipin kapsadığı kararlar

- **Oda tanımı:** oda numarası + oda tipi seçilir; minibar içeriği odanın konseptinden **otomatik** gelir, odaya ayrıca ürün girilmez.
- **Zimmet zinciri:** depo sorumlusu → kat sorumlusu → oda; bakiye eksiye düşmez, her hareket denetim günlüğüne yazılır.
- **DND:** tüketim girilemeyen oda için ara kayıt açılır, 120 dakika sonra otomatik uyarı üretilir.
- **Kişiselleştirme:** misafir aynı QR ile **günde 1 kez** ürün artırır/azaltır; talep kat sorumlusuna, depo sorumlusuna ve yöneticiye düşer.
- **QR sipariş:** misafir siparişi doğrudan mutfağa gitmez; garson ön onayından sonra fiş yazıcısına ve mutfak ekranına iletilir.
- **Opsiyonel fiyat:** fiyat kaydı outlete girilebilir; gösterim varsayılan kapalıdır ve outlet bazında açılır. Açık QR Sipariş outletinde adisyon toplamı görünür ve yazdırılır. Ödeme entegrasyonu yoktur.
- **Outlet modül ataması:** QR Menü ve QR Sipariş opsiyonel fiyatlı modüller olarak outlet bazında atanır; atamasız outlette menü tanımlanamaz ve QR hedefi görünmez.
- **Outlete özel menü:** kategori → alt kategori → grup → öğe ağacı outlete özeldir; her düğüme görsel yüklenir, öğeye detay, alerjen ve opsiyonel fiyat girilir.
- **Otel altında outlet tanımları:** otel tanımının hemen ardından outletler tanımlanır; minibar modülünde outlet karşılığı merkez depo veya kat bölgesidir; aynı alan farklı modüllerde ayrı outlet olabilir.
- **Merkezi yönetim hiyerarşisi:** ana tanımlar → otel seçimi → modül (QR Menü, QR Sipariş, QR Oda Servisi, Minibar Takip) → modülün kendi outletleri → modül rolleri → ekip ataması → canlı.
- **Outlet ekipleri:** komuta merkezinde kayıtlı kullanıcılar modül + outlet + rol seçilerek ekibe atanır; roller komuta merkezi tanımlarından oluşturulur.
- **Çoklu outlet:** bir kullanıcı birden fazla outlete veya minibar sistemine yazılabilir. Girişten hemen sonra oturum açacağı hedefi seçer ve yalnızca onun bildirimlerini alır.
- **Oturum süresi:** maksimum online süre (varsayılan 480 dk) aşılırsa sistem kullanıcıyı **otomatik çıkış** yaptırıp çevrimdışı duruma alır; süre bitmeden uyarı gönderilir.
- **Kullanıcı takip sistemi:** çevrimiçi kullanıcılar otel/outlet bazlı, animasyonlu olarak izlenir; geçen/kalan süre, son işlem ve zorla çıkış aynı ekrandadır.
- **Akordeon menü:** üç kademeli kategorize menü (ana kategori → alt kategori → ekran); bir kategori açılınca kardeşi kapanır, aktif ekranın yolu otomatik açılır, menü içi arama çalışır.
- **Tanımlama sırası ve bağımlılıklar:** otel → kat → oda (oda no + oda tipi) ile oda tipi → ürün grubu → ürün → konsept zincirleri oda tanımında birleşir; zincir atlanarak yapılan işlem engellenir, kurulum rehberi sıradaki adıma yönlendirir.
- **Alternatif XP masaüstü arayüzü:** modüller ayrı pencereler olarak açılır (içinde otel seçimi), kısayollar Başlat'tan masaüstüne sürüklenir, sağ tuşla masaüstü yenilenir ve arka plan teması değişir; mobilde Android görünümünde yalnızca izleme/raporlama vardır.
- **Rol ve yetki modeli:** roller tiplere ayrılır (Sistem / Yönetim / Outlet / Mutfak / Minibar); yetki **rol × otel × modül × ekran × işlem** düzeyinde verilir. Onay yetkisi olmayan kullanıcı siparişi mutfağa iletemez.

## Sonraki adım

1. Prototip üzerinden ekran bazlı geri bildirim toplanması (özellikle `PLAN.md` §17'deki 15 karar bekleyen konu).
2. Onay sonrası `PLAN.md` §11'deki fazlara göre Next.js + PostgreSQL + Prisma iskeletinin kurulması ve `docs/veri-modeli.prisma` taslağının migration'a dönüştürülmesi.
3. Ticari referans: **ODK-2026-QRM-001** proforma (yazılım lisansı + 12 ay servis ve bakım).

> Prototipler statik HTML'dir ve örnek (seed) veriyle çalışır; gerçek sistemde aynı ekranlar API/veritabanı üzerinden beslenir. Hiçbir sayfa üretim verisi içermez.
