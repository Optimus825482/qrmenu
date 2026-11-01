# MENNN — Merit Royal Servis Platformu · Modüler Geliştirme Planı

> **Kapsam:** Minibar Takip, QR Menü, QR Sipariş ve QR Oda Servisi sistemlerinin Next.js + PostgreSQL + Prisma üzerinde modüler olarak geliştirilmesi.
> **Ticari referans:** ODK-2026-QRM-001 (Merit Royal — 3 otel, süresiz lisans + 12 ay servis ve bakım).
> **Arayüz ön tasarımları:** `prototip/index.html` (55 ekran: 36 yönetim paneli · 6 kat sorumlusu mobil · 6 misafir · 7 oturum/giriş, tıklanabilir HTML prototip).
> **Bu belge:** 31.10.2026 tarihli sürüm. Aşama sonlarında güncellenir.

---

## 1. Amaç ve Kapsam

Üç otelin (Merit Royal, Merit Royal Diamond, Merit Royal Premium) misafir servis ve minibar operasyonunu **tek panelden** yöneten dört sistemin geliştirilmesi.

| # | Sistem | Temel işlev | Kullanıcı |
|---|--------|-------------|-----------|
| 1 | **Minibar Takip** | Oda/kat/otel/ürün bazlı tüketim, zimmet, kişiselleştirme, DND takibi, raporlama | Depo sorumlusu, kat sorumlusu, housekeeping, yönetici |
| 2 | **QR Menü** | A la carte harici alanlarda ambiyansa özel görsel menü, garson çağırma | Misafir, garson |
| 3 | **QR Sipariş** | Misafir siparişi → garson ön onayı → mutfak fiş yazıcısı + KDS | Misafir, garson, mutfak |
| 4 | **QR Oda Servisi** | Oda QR'ından oda servisi talebi, opsiyonel telefon teyidi | Misafir, oda servisi birimi |
| — | **Çekirdek Panel** | Otel/outlet/kat/oda/kullanıcı/rol tanımları, komuta merkezi, raporlar, denetim | Sistem yöneticisi |

**Kapsam dışı (ayrı iş kalemi):** A la carte restoran POS (Alacarte, ODK-2026-ALC-001), PMS/muhasebe entegrasyonu, ödeme/tahsilat akışı, donanım tedariki.

---

## 2. Modüler Yapı (Klasör Mimarisi)

Her modül **kendi klasörü, kendi Prisma servis katmanı ve kendi ekran setiyle** geliştirilir. Modüller arası iletişim yalnızca `packages/core` üzerinden olur; bir modül diğerinin veritabanı tablosuna doğrudan yazmaz.

```
mennn/
├─ apps/
│  └─ web/                        # Next.js (App Router) — panel + misafir + mobil PWA
│     ├─ app/(admin)/             # yönetim paneli (yetki korumalı)
│     ├─ app/(staff)/             # kat sorumlusu / garson mobil ekranları (PWA)
│     ├─ app/(guest)/             # misafir arayüzü (çok dilli, QR ile açılır)
│     ├─ app/api/                 # route handlers (REST) + webhook'lar
│     └─ app/api/ws/              # gerçek zamanlı kanal (SSE/WebSocket)
├─ modules/
│  ├─ minibar/                    # tanımlar, zimmet, tüketim, kişiselleştirme, DND
│  │  ├─ server/  (service, repository, validation, jobs)
│  │  ├─ ui/      (ekran bileşenleri)
│  │  └─ api/     (route tanımları, yetki matrisi)
│  ├─ qr-menu/
│  ├─ qr-order/
│  ├─ qr-room-service/
│  ├─ user-tracking/              # online kullanıcı takibi, oturum monitörü, animasyonlu izleme
│  └─ reporting/                  # ortak rapor motoru (tüm modüllerden beslenir)
├─ packages/
│  ├─ core/                       # tenant (otel) bağlamı, RBAC, denetim günlüğü, QR imzalama
│  ├─ session/                    # giriş akışı (otel → outlet), oturum yaşam döngüsü, maksimum süre, otomatik çıkış
│  ├─ org/                        # modül bazlı outlet/rol tanımları, outlet ekipleri ve kullanıcı atamaları
│  ├─ notify/                     # push (web/mobil/saat), eskalasyon motoru, şablonlar
│  ├─ i18n/                       # TR/EN/DE/FR/IT/AR sözlükleri + otomatik dil algılama
│  ├─ print/                      # ESC/POS fiş üretimi, yazıcı kuyruğu, tekrar baskı
│  └─ ui/                         # ortak tasarım sistemi (panel + misafir teması)
├─ prisma/  (schema.prisma, migrations, seed.ts)
└─ docs/    (veri-modeli, iş akışları, kabul kriterleri)
```

**Modülerlik kuralları**

1. Her modül `tenantId` (otel) bağlamını **zorunlu** alır; otel dışı sorgu yazılamaz (Prisma middleware ile denetlenir).
2. Modüller arası veri paylaşımı yalnızca `packages/core` servisleri üzerinden (ör. raporlama modülü tüketim verisini `minibar` servisinden okur).
3. Bildirim, yazdırma, çoklu dil ve QR imzalama ortak paketlerdedir; her modül kendi kopyasını yazmaz.
4. Bir modül devre dışı bırakıldığında (ör. QR Oda Servisi kapalı) kalan modüller çalışmaya devam eder.
5. **Oturum ve yetki tek noktadan:** giriş, otel/outlet seçimi, online izleme ve otomatik çıkış `packages/session` içinde; hiçbir modül kendi oturum mantığını yazmaz.
6. **Outlet ve rol tanımları modüle bağlıdır** (`packages/org`): her modül kendi outletlerini ve rollerini tanımlar; kullanıcı–outlet–rol üçlüsü tek tabloda (`OutletMember`) tutulur.

---

## 3. Teknoloji Yığını ve Gerekçeleri

| Katman | Seçim | Gerekçe |
|--------|-------|---------|
| Uygulama | **Next.js (App Router), TypeScript** | Panel + misafir + mobil PWA tek kod tabanı; sunucu tarafı yetki kontrolü; SEO'suz kapalı sistem için hızlı |
| Veritabanı | **PostgreSQL** | İlişkisel bütünlük (oda–kat–konsept–ürün zinciri), güçlü raporlama (window fonksiyonları, materialized view) |
| ORM | **Prisma** | Şema tek kaynak, migration disiplini, tip güvenliği, seed ile varsayılan otel kayıtları |
| Gerçek zamanlı | **SSE + WebSocket (opsiyonel)** | Komuta merkezi canlı konum, sipariş kuyruğu, bildirim yayını |
| Bildirim | **Web Push + FCM/APNs + Wear OS (Data Layer)** | Garson ve kat sorumlusu akıllı saat bildirimi; çevrimdışı kuyruklama |
| Yazdırma | **ESC/POS (Ethernet/USB)** | Mutfak ve bar fişi, tekrar baskı, yerel kuyruk |
| Çoklu dil | **next-intl** + dil algılama ara katmanı | 6 dil, Arapça için RTL |
| Kimlik | Kurumsal hesap + **MFA**, cihaz eşleştirme | Rol bazlı erişim, oturum ve cihaz denetimi |
| Test | **Vitest** (birim) + **Playwright** (uçtan uca) | Kritik akışların (tüketim, sipariş onayı, kişiselleştirme) otomatik doğrulaması |
| Dağıtım | Docker + otel sahası sunucusu (edge) + yedek | İnternet kesintisinde operasyon durmaz |

---

## 4. Roller ve Yetki Modeli

`Role` + `UserScope` (otel/outlet/kat kapsamı) ikilisi ile çalışır; kullanıcı yalnızca kapsamındaki veriyi görür.

| Rol | Minibar tanım | Tüketim/zimmet | Sipariş onayı | Rapor | Kullanıcı yönetimi |
|-----|:---:|:---:|:---:|:---:|:---:|
| Sistem Yöneticisi | ✓ | ✓ | ✓ | ✓ | ✓ |
| Otel Müdürü | ✓ | – | – | ✓ | – |
| F&B Müdürü | – | – | ✓ | ✓ | – |
| Şef Garson / Süpervizör | – | – | ✓ | ✓ | – |
| Garson / Barmen / Butler | – | – | ✓ | – | – |
| Kat Sorumlusu | – | ✓ (kendi katı) | – | – | – |
| Depo Sorumlusu | – | ✓ (zimmet) | – | – | – |
| Housekeeping Süpervizörü | – | ✓ (rapor) | – | ✓ | – |
| KDS Operatörü | – | – | – | – | – |
| Otel IT | – | – | – | ✓ | – (destek) |

---

## 5. Veri Modeli

Tam taslak: **`docs/veri-modeli.prisma`**. Özet tablo grupları:

| Grup | Tablolar |
|------|----------|
| Tesis | `Hotel`, `Outlet`, `Floor`, `RoomType`, `Room`, `TableQr` |
| Minibar tanım | `ProductGroup`, `Product`, `Concept`, `ConceptItem` |
| İnsan | `Employee`, `EmployeeFloor`, `User`, `Role`, `Permission`, `UserScope`, `Device` |
| Stok | `StockAssignment` (zimmet), `StockMovement`, `StockCount` |
| Tüketim | `ConsumptionRecord`, `ConsumptionItem`, `ScanEvent` |
| Misafir talebi | `PersonalizationRequest`, `PersonalizationItem`, `RoomServiceRequest`, `RoomServiceItem` |
| Takip | `DndFollowUp`, `Notification`, `EscalationRule` |
| Menü | `Menu`, `MenuCategory`, `MenuGroup`, `MenuItem`, `MenuItemAllergen`, `MenuTheme` |
| Sipariş | `Order`, `OrderLine`, `OrderApproval`, `KitchenStation`, `Printer` |
| Yönetim | `AuditLog`, `BlacklistEntry`, `Setting` |

**İlkeler**

1. `Hotel` kaydı `isSystemDefault = true` olan üç tesisle **seed** ile oluşturulur; silinemez (`onDelete: Restrict`).
2. `Room → RoomType → Concept → ConceptItem → Product` zinciri tektir: odaya ayrıca ürün atanmaz, içerik konseptten gelir.
3. Tüm operasyon tabloları `hotelId` + `createdById` + `createdAt` taşır (oda/kat/otel kırılımlı raporlama).
4. `ConsumptionRecord` ve `StockMovement` **append-only**; düzeltme yeni kayıtla yapılır (denetim izi).
5. Kişisel veri: misafir adı/telefonu tutulmaz; `Room` numarası ve anonim `deviceFingerprint` kullanılır.

---

## 6. Modül Bazlı Fonksiyonel Kapsam

### 6.1 Minibar Takip (`modules/minibar`)

**Tanımlar (`Tanımlamalar` menüsü)** — prototipte MB-DEF-01…08
1. **Otel tanımla:** 3 varsayılan kayıt + güncelleme (ad, kod, tema, lokasyon).
2. **Kat tanımla:** otel seç → kat no/ad → kat sorumlusu ataması.
3. **Oda tipi tanımla:** kapasite + zorunlu konsept bağlantısı.
4. **Konsept tanımla:** oda tipine özel ürün + adet listesi (minibar içeriği).
5. **Ürün grubu tanımla**, 6. **Ürün tanımla** (birim, grup, iç birim değeri).
6. **Kat sorumlusu / depo sorumlusu tanımla:** otel + rol + kat ataması + vardiya.
7. **Oda tanımla:** oda no + oda tipi → konsept ve içerik otomatik; odaya özel QR üretilir.
8. Her tanım için sınırsız kayıt; değişiklikler denetim günlüğüne yazılır.

**Operasyon** — MB-OPS-01…04, MB-MOB-01…06
- Zimmet: depo sorumlusu → kat sorumlusu; bakiye eksiye düşemez.
- Tüketim: kat sorumlusu oda QR'ını okutur (kat formu), eksik ürünleri girer, zimmetinden düşer.
- Kişiselleştirme: misafir QR ile günde **1 kez** ürün artırır/azaltır; talep kat sorumlusu + depo sorumlusu + yöneticiye düşer; karşılandığında odaya kaydedilir.
- DND: oda DND ise ara kayıt; varsayılan 120 dk sonra otomatik uyarı (otel bazlı ayarlanabilir).
- Raporlar: oda, kat, ürün, personel, dönem kırılımları.

### 6.2 QR Menü (`modules/qr-menu`) — QRM-DEF-01/02

Otel → outlet → **QR Menü modül ataması** → outlete özel menü → kategori → alt kategori → grup → öğe. Her seviyeye görsel, detay, alerjen notu ve **opsiyonel fiyat kaydı** girilir. Fiyat gösterimi outlet bazında kapalı başlar: tutar veritabanında durur, misafir ekranında görünmez. Anahtar açılınca aynı kayıt menüde belirir. Ödeme entegrasyonu yoktur. Outlet ambiyansına uygun tema; misafir ekranı 6 dilde; garson çağır butonu ve QR okutulduğu anda garsonun masaya yönlendirilmesi.

### 6.3 QR Sipariş (`modules/qr-order`) — QRS-OPS-01/02

Sepet → gönder → **garson ön onayı** (kasa bildirimi dahil) → onaydan sonra mutfak fiş yazıcısı + KDS. Outlet’e QR Sipariş modülü ayrıca atanır; menü ağacı o outlete özeldir. `Outlet.priceDisplay` açıksa kayıtlı siparişin adisyonunda satır tutarları ve genel toplam basılır ve adisyon yazdırılır. Gösterim kapalıysa adisyon ürün ve adetle çıkar, tutar satırı basılmaz. Ödeme entegrasyonu yok. İptal/düzeltme şef garson ikinci onayı ister. Yazıcı bağlantısı kesilirse kuyruk yerelde tamponlanır.

### 6.4 QR Oda Servisi (`modules/qr-room-service`) — RS-OPS-01

Oda QR'ı → menü (saat kuralı) → talep → oda servisi ekranı + mutfak; **opsiyonel** telefon teyidi; SLA takibi ve gecikme eskalasyonu.

### 6.5 Çekirdek Panel (`packages/core` + `modules/reporting`) — ADM-01…05

Çok kiracılı yapı, RBAC, denetim günlüğü, QR imzalama, kara liste, komuta merkezi (canlı konum + akış), rapor merkezi, yedekleme ve tanılama.

### 6.6 Merkezi Otel &amp; Operasyon Yönetimi — modül girişi (`packages/org`) — ADM-06

Sistemin merkezindeki **ana tanımlar** (otel, kullanıcı, rol) tamamlandıktan sonra alt modüllere giriş **otel seçimi üzerinden** yapılır:

```
Ana tanımlar → Otel seç → Modül seç (QR Menü / QR Sipariş / QR Oda Servisi / Minibar Takip)
   → modülün kendi outletleri → modül rolleri → kullanıcı–outlet–rol ataması (outlet ekibi) → canlı
```

- Her otel için modüller ayrı açılıp kapatılabilir (`HotelModule`).
- Modül seçilmeden outlet, outlet seçilmeden ekip ataması yapılamaz; ekip atanmamış outlet canlıya alınamaz.
- Aynı fiziksel alan farklı modüllerde **ayrı outlet** olarak tanımlanabilir (ör. havuz barı hem QR Menü hem QR Sipariş outleti).
- Minibar modülünde outlet karşılığı **merkez depo** ve **kat bölgeleridir**; ekip ataması kat/depo sorumlusu rollerine yapılır.

### 6.7 Modül Bazlı Outlet ve Rol Tanımları · Outlet Ekipleri — ADM-07…09

| Ekran | İçerik |
|-------|--------|
| **Outlet tanımları (modül bazlı)** | Modüle özel alanlar: QR Menü → tema, masa/şezlong sayısı, menü dili · QR Sipariş → istasyon, fiş yazıcısı, garson ön onayı, VIP öncelik · QR Oda Servisi → servis saatleri, SLA, telefon teyidi · Minibar → bölge tipi (depo/kat), kat aralığı, zimmet kaynağı |
| **Rol tanımları (modül bazlı)** | Roller komuta merkezi tanımlarından oluşturulur ve bir modüle bağlanır; rolün yetkileri, giriş sonrası varsayılan ekranı ve rol bazlı maksimum online süresi tanımlanır |
| **Outlet ekipleri &amp; kullanıcı atama** | Komuta merkezinde **kayıtlı** kullanıcılar, modül + outlet + rol seçilerek ekibe eklenir. Bir kullanıcı birden fazla outlette farklı roller alabilir; atanmamış kullanıcılar ayrı havuzda listelenir |

**Kural:** outlet ekibi oluşturulmadan modül canlıya alınamaz; ataması yapılmamış kullanıcı sisteme girebilir fakat hiçbir modülde operasyonel yetki görmez.

### 6.8 Kullanıcı Takip Sistemi (online izleme) — ADM-10

- Sistemde **online** olan tüm kullanıcılar; otel ve **seçtikleri outlet** bazlı gruplanarak animasyonlu biçimde izlenir.
- Her oturum için: kullanıcı, rol (modül), otel, outlet, giriş saati, **geçen süre**, **kalan süre** ve son işlem gösterilir.
- Canlı aktivite akışı: kat formu okutma, sipariş onayı, kişiselleştirme karşılama, fiş baskısı, zimmet işlemleri (kullanıcı + otel + outlet etiketiyle).
- Yönetici, oturumu **zorla kapatabilir**; süre aşımında sistem otomatik kapatır ve kayıt "otomatik çıkış" olarak raporlanır.
- Rapor kırılımları: kullanıcı bazlı online süre, outlet bazlı eşzamanlı kullanıcı, süre aşımı sayısı, vardiya karşılaştırması (karar destek).

### 6.9 Oturum Yaşam Döngüsü ve Oturum Ayarları (`packages/session`) — AUTH-01…07, ADM-11

Giriş akışı:

```
1 · Kullanıcı adı + şifre (+ MFA)     → kimlik doğrulama
2 · OUTLET veya MİNİBAR seçimi         → girişten hemen sonra; otel, hedefin bağlı olduğu tesistir
3 · ONLINE                             → seçilen hedefin rolü ve bildirimleri açılır
4 · Çıkış                              → manuel · süre aşımı · hareketsizlik · vardiya sonu · yönetici zorlaması · tek cihaz
```

Komuta merkezi **Ayarlar** bölümünden yönetilen oturum kuralları:

| Ayar | Varsayılan | Açıklama |
|------|-----------|----------|
| `session.maxOnlineMinutes` | **480 dk** | Maksimum online kalma süresi; aşılırsa sistem otomatik çıkış yaptırır |
| `session.warnBeforeMinutes` | 60 dk | Süre bitmeden gönderilen uyarı eşiği (cihaz + ekran) |
| `session.idleLogoutMinutes` | 45 dk | Hareketsizlik sonrası otomatik çıkış |
| `session.autoLogout` | açık | Süre aşımında otomatik çıkışın açık/kapalı olması |
| `session.singleDevice` | açık | Aynı kullanıcı yalnızca tek cihazda online; yeni giriş eski oturumu kapatır |
| `session.forceLogoutAtShiftEnd` | açık | Vardiya bitiminde zorunlu çıkış |
| `session.outletPickAfterLogin` | zorunlu | Girişten hemen sonra outlet veya minibar sistemi seçilir; seçilmeden oturum açılmaz |
| `session.singleOutletAuto` | kapalı | Tek hedefi olan kullanıcıda da seçim ekranı gösterilir |
| Modül/rol bazlı süre | tanımsız | Tanımlanırsa sistem geneli süreyi geçersiz kılar (ör. minibar 600 dk) |

Tüm oturum hareketleri (`SessionEvent`) ve oturum kayıtları (`UserSession`) denetim günlüğüne işlenir; süre aşımı kayıtları raporlanır.

### 6.10 Yönetim menüsü bilgi mimarisi (akordeon) — ADM-12

Menü **üç kademeli akordeon** yapıdadır: ana kategori → alt kategori → ekran. Bir kategori açıldığında kardeş kategoriler kapanır (klasik akordeon);
aktif ekranın üst kategorileri otomatik açılır ve menü içi arama kutusu ağacı anında süzer. Yapı `yonetim-menu.js` içindeki `MENU_TREE` verisinden üretilir.

```
Genel             → Genel Bakış · Tanımlama Akışı & Kurulum Rehberi · Yönetim Menüsü Haritası · Komuta Merkezi
Tanımlar          → Otel       → Otel Tanımla · Kat Tanımla (otel → kat) · Oda Tanımla (kat → oda) · Outlet Tanımla (otel outletleri)
                  → Oda Tipi   → Oda Tipi Tanımla · Konsept Ata (oda tipine)
                  → Personel   → Kat / Depo Sorumlusu Tanımla
                  → Kullanıcı  → Kullanıcı Tanımla · Rol Tanımları · Yetki Tanımları
Ürün              → Ürün Grubu Tanımla · Ürün Tanımla · Konsept Tanımla
Merkezi Yönetim   → Modül Girişi (otel → modül) · Modül Bazlı Outlet Tanımları · Outlet Ekipleri & Kullanıcı Atama
Minibar Operasyon → Zimmet & Stok · Tüketim Kayıtları · Kişiselleştirme Talepleri · DND / Ara Kayıtlar
QR Menü           → Menü / Kategori / Öğe · Ambiyans & Tema
QR Sipariş        → Garson Onay Kuyruğu · Mutfak Ekranı (KDS)
QR Oda Servisi    → Oda Servisi Talepleri
Oturum & Takip    → Kullanıcı Takip (Online) · Oturum & Süre Ayarları
Raporlar & Sistem → Raporlar · Sistem & Denetim
```

**Menü tasarım kuralları:** (1) Kategori başlıkları sayaç taşır (tanımlı oda, ürün, online kullanıcı, atama bekleyen). (2) Her satır tek bir iş adımına karşılık gelir;
aynı ekranın iki kopyası farklı etiketle sunulmaz. (3) İş bağlamı farklıysa aynı ekrana ikinci yol verilebilir — örneğin **Konsept**, hem *Tanımlar → Oda Tipi*
altında "oda tipine atama" amacıyla, hem *Ürün* altında "içerik tanımlama" amacıyla yer alır. (4) Menü durumu tarayıcıda saklanır; kullanıcı döndüğünde son açık kategoriler geri gelir.

### 6.11 Tanımlama sırası, bağımlılık kuralları ve kurulum rehberi — ADM-15

Sistem üç zincir üzerine kurulur ve zincirler **oda tanımında birleşir**:

```
A · FİZİKSEL YAPI          B · MİNİBAR İÇERİĞİ               C · YETKİLENDİRME
Otel                       Ürün grubu                        Rol tanımla
  ↓                          ↓                                 ↓
Kat tanımla                Ürün tanımla (gruba bağlı)        Yetki ver (otel × modül × ekran × işlem)
  ↓                          ↓                                 ↓
Oda tanımla                Konsept tanımla (ürün + adet)     Kullanıcı tanımla
(oda no + oda tipi)          ↓                                 ↓
                           Konsepti oda tipine ata           Outlet ekibine ata
                                      ↘         ↙
                              ODAYA OTOMATİK ATANAN
                          STANDART MİNİBAR İÇERİĞİ VE MİKTARI
```

**Bağımlılık / engelleme kuralları**

| Kural | Sonuç |
|-------|-------|
| Otel seçilmeden kat, oda, ürün, konsept tanımlanamaz | engellenir |
| Kat olmadan oda açılamaz | engellenir |
| Oda tipi olmadan oda tanımlanamaz (oda tipi → konsept bağlantısı zorunlu) | engellenir |
| Ürün grubu olmadan ürün, ürün olmadan konsept oluşturulamaz | engellenir |
| Konsepti atanmamış oda tipiyle oda açılamaz | engellenir |
| Rol tanımlanmadan yetki verilemez; yetkisiz rol hiçbir ekran göremez | engellenir |
| Outlet ekibi atanmamış outlet canlıya alınamaz | engellenir |
| Zimmeti olmayan kat sorumlusu oda ikamesi yapamaz | engellenir |

**Kurulum rehberi (ADM-15):** 11 maddelik kontrol listesi canlı veriden hesaplanır (otel, oda tipi, konsept, kat, oda, ürün grubu, ürün, rol, yetki, kullanıcı ataması,
tüm outletlerde ekip), tamamlanma yüzdesi gösterilir ve **tamamlanmamış ilk adım** "Sıradaki adım →" düğmesiyle doğrudan ilgili ekrana bağlanır.
Engellenen işlemde kullanıcıya hangi adımın eksik olduğu söylenir ve o ekrana kısayol verilir.

### 6.12 Rol ve yetki modeli — ADM-13, ADM-14

Yetki zinciri: **rol × otel × modül × ekran × işlem**.

- **Rol tanımları (ADM-13):** 16 başlangıç rolü beş tipte sınıflandırılır — *Sistem* (Sistem Yöneticisi, Otel IT) · *Yönetim* (Otel Müdürü, F&B Müdürü) ·
  *Outlet* (Şef Garson/Süpervizör, Garson, Barmen, Butler, Outlet Görevlisi, Oda Servisi Görevlisi) · *Mutfak* (Mutfak Şefi, Mutfak Personeli, KDS Operatörü) ·
  *Minibar* (Kat Sorumlusu/Kat Formu, Depo Sorumlusu, Housekeeping Süpervizörü). Her rol; tipi, erişebileceği modüller, yetki profili ve giriş sonrası varsayılan ekranıyla kaydedilir.
- **Yetki tanımları (ADM-14):** Seçilen rol için önce otel ve modül erişimi açılır; ardından modülün ekranları satır satır listelenir ve
  **V** (görüntüle) · **O** (oluştur) · **D** (düzenle) · **A** (onayla) · **R** (rapor) işlem tipleri işaretlenir. Alt bölümde rol × modül yetki özet matrisi yer alır.
- **Onay kuralı:** onay yetkisi (A) olmayan kullanıcı sipariş veya talep oluşturabilir fakat mutfağa iletemez; ikinci kademe onay devreye girer.
- **Sınırlar:** Sistem Yöneticisi tüm ekranlarda tam yetkilidir ve kendi yetkisini kısıtlayamaz; yetkisiz erişim denemesi denetim günlüğüne yazılır.
- **İlişki:** rol kataloğu kullanıcıdan **önce** tanımlanır; kullanıcı tanımlanırken rol ve otel kapsamı verilir, modül/outlet bazlı çalışma ise
  Outlet Ekipleri ekranındaki **kullanıcı–outlet–rol** atamasıyla kurulur. Bir kullanıcı birden fazla role sahip olabilir; oturumda seçtiği outletin rolü geçerlidir.

### 6.13 Otel altındaki outlet tanımları ve kullanıcı ataması — ADM-16

Otel tanımından (**Tanımlar → Otel**) hemen sonra gelen adım **outlet tanımlarıdır**. Outletler otele ve modüle bağlıdır:

- **Outlet = modül + tip.** Aynı fiziksel alan farklı modüllerde ayrı outlet olarak tanımlanır (havuz barı hem QR Menü hem QR Sipariş outleti olabilir).
- **Minibar modülünde outlet = bölge.** Minibar Takip modülünde outletler **merkez depo** ve **kat bölgesi**dir; kat sorumlusu kat bölgesine, depo sorumlusu merkez depoya atanır.
- **Modüle özel alanlar:** QR Menü → tema, masa/şezlong sayısı, menü dili · QR Sipariş → istasyon, fiş yazıcısı, garson ön onayı · QR Oda Servisi → servis saatleri, SLA, telefon teyidi · Minibar → bölge tipi (depo/kat), kat aralığı, zimmet kaynağı.
- **Kullanıcı ataması:** kayıtlı sistem kullanıcıları outlet **veya minibar bölgesine**, modül rolüyle atanır (`OutletMember`). Bir kullanıcı **birden fazla** outlette/bölgede ve farklı rollerle görev alabilir.
- **Ekip zorunluluğu:** ekip atanmamış outlet canlıya alınamaz ve giriş ekranındaki seçim listesinde görünmez.
- **Ataması olmayan kullanıcı:** sisteme girebilir fakat seçim listesi boş kalır ve hiçbir modülde operasyonel yetki görmez.
- **Kapsam kontrolü:** kullanıcı yalnızca kapsamındaki (atamalı olduğu) otelin outletlerine atanabilir.

**Giriş davranışı (zorunlu seçim).** Çoklu ataması olan kullanıcı oturum açmak için:

```
Giriş (şifre + MFA)  →  OTURUM AÇACAĞI HEDEFİ SEÇ  →  oturum ONLINE
                        hedef listesi otel başlıkları altında gruplanır:
                        her otelin outletleri + (varsa) "Minibar sistemi" bölgeleri
```

- Otel ve outlet seçimi **zorunludur**; seçim yapılmadan oturum başlamaz (`session.outletPickAfterLogin = zorunlu`).
- Tek hedefi (tek outleti/minibar bölgesi) olan kullanıcıda da seçim ekranı gösterilir (`session.singleOutletAuto = kapalı`); böylece yanlış hedefle oturum açma riski kalmaz.
- Hedef listesi **otel başlıkları altında gruplanır**; otel, seçilen kaydın bağlı olduğu tesisten türetilir, ayrıca bir otel adımı istenmez.
- Oturum yalnızca **seçilen hedefin** ekranlarını, taleplerini ve bildirimlerini gösterir; başka outlet veya bölgenin verisi görünmez.
- Hedef değiştirmek isteyen kullanıcı oturumu kapatıp yeni seçim yapar; her seçim `SessionEvent: OTEL_SECIM / OUTLET_SECIM` olarak kayda geçer.
### 6.14 Outlet'e modül ataması ve outlete özel menü tanımlama — ADM-17

Outlet tanımı ve kullanıcı atamalarının ardından, otel altındaki outletlere **ayrıca modül atanır**:

- **Opsiyonel fiyatlı modüller:** **QR Menü** ve **QR Sipariş** outlet bazında atanır; bu iki modül opsiyonel ve fiyatlıdır (outlet başına bedel, EUR).
  Atanmayan outlet bu modüllerle çalışmaz: menü tanımlanamaz, giriş ekranında QR hedefi çıkmaz.
- **Outlete özel menü ağacı:** Modül atanan outlet seçilerek **kategori → alt kategori → grup → menü öğesi** ağacı tanımlanır. Ağaç düğüm bazlıdır
  (`MenuNode`: her düğümün tipi KAT/ALT/GRUP/ÖĞE, parent bağlantısı ve **görseli** vardır); böylece kategorilere, alt kategorilere ve gruplara ayrı ayrı görsel yüklenebilir.
- **Menü öğesi detayları:** Öğe adı, **detay bilgisi**, **alerjen bilgisi** (çoklu seçim) ve **opsiyonel fiyat** kaydedilir. Fiyatı olmayan öğe yayınlanabilir.
- **Fiyat gösterimi anahtarı (outlet bazlı):** Fiyat kaydedilse bile gösterim **kapalı** başlar. Açıldığında misafir menüsünde fiyat, sepette ara toplam ve
  adisyon toplamı görünür; kapatıldığında ekran fiyatsız (her şey dahil) moduna döner. Aynı outlet için gösterim istenildiği zaman kapatılıp açılabilir.
- Menü tanımı yapılmamış QR outlet "menüsüz outlet" olarak işaretlenir ve kurulum rehberinde eksik adım olarak görünür.

### 6.15 Fiyat gösterimi ve adisyon — ADM-18

- **Adisyon oluşumu:** Fiyat gösterimi **açık** QR Sipariş outletlerinde kaydedilen her sipariş için adisyon oluşur: kalem, adet, **birim fiyat, satır tutarı** ve **adisyon toplamı**.
- **Adisyon çıktısı:** Adisyon fiş yazıcısına gönderilir (ESC/POS); kopya adisyon alma ve dışa aktarma desteklenir. Çıktısı alınmayan adisyonlar "fiş bekliyor" olarak listelenir.
- **Kapalı outletler:** Fiyat gösterimi kapalı outletlerde adisyon yalnızca **ürün + adet** içerir; tutar satırı oluşmaz ve fişte toplam basılmaz.
- **Fiyatsız kalem:** Butler ikramı gibi fiyatsız kalemler adisyonda 0,00 satırı olarak yer alır ve toplama etki etmez.
- **Ödeme yok:** Adisyon yalnızca iç operasyon ve mahsup kaydı içindir; hiçbir ekranda ödeme/tahsilat adımı yoktur.
- **Karar destek:** Adisyon tutarları outlet, saat ve ürün kırılımında raporlanır; ortalama adisyon tutarı ve ürün gelir katkısı outlet kârlılık analizine girer.
### 6.16 Alternatif arayüz: Windows XP masaüstü (yonetim-xp.html) — ARAYÜZ-XP

Sistem yöneticisi için standart panelin **alternatifi** olarak Windows XP masaüstü metaforunda ikinci bir kabuk hazırlanmıştır:

- **Masaüstü ve pencereler:** Simgelere **çift tıklanarak** pencereler açılır; pencereler taşınabilir, boyutlandırılabilir, simge durumuna küçültülür ve
  görev çubuğunda düğme olarak listelenir. Her **modül ayrı bir penceredir**; pencere içindeki **otel seçicisiyle modülün içinde her otel ayrı bir sistem**
  olarak çalışır (veriler otel bazlı filtrelenir, alt bilgi çubuğunda aktif otel görünür).
- **CRUD ve onay:** Her pencerede listeler ve formlar bulunur; ekleme/silme/durum değiştirme gibi **her işlemde onay penceresi** gösterilir
  (Ayarlar'dan kapatılabilir). Tanımlar penceresi gezgin yapısındadır: Otel → Kat → Oda · Oda Tipi · Konsept · Ürün Grubu · Ürün · Kullanıcı · Rol & Yetki.
- **Başlat menüsü:** Menü öğeleri kategorili (Genel · Minibar Takip · QR Menü · QR Sipariş · QR Oda Servisi). Öğeler **sürüklenip masaüstüne bırakılarak**
  kısayol yapılır; masaüstü simgesine sağ tıklayıp **Masaüstünden Kaldır** ile silinir (her ikisi de onaylı).
- **Sağ tuş menüsü (masaüstü):** **Yenile**, **arka plan rengi/tema** (XP Mavi · Yeşil Tepeler · Kurumsal Gri · Koyu), simgeleri hizala.
- **Tablet / masaüstü:** Varsayılan olarak tüm özellikler görüntülenir; pencereler dokunmatik sürükleme ile de taşınır.
- **Mobil (Android görünümü):** Dar ekran otomatik olarak (veya `?mobil=1` ile) Android kabuğa geçer. Mobilde **tanımlama ekranları kapalıdır**;
  yalnızca **izleme ve raporlama** kullanılır. İstisna **Ayarlar → Mobilde tanımlama ekranları** anahtarından geçici olarak açılabilir
  (`SETTINGS.mobileDefs`, varsayılan pasif). Mobil kabuk: durum çubuğu + uygulama çubuğu + otel çipleri + alt gezinme (İzleme · Raporlar · Tanımlar · Ayarlar).
- **Kurulum bağımlılığı:** Modül pencereleri, tanımları eksik otelde "⚠ kat/oda tanımı eksik" uyarısı gösterir; tanımlar önce Tamımlar penceresinden tamamlanır.
- **Teknik not:** `yonetim-xp.html` tek dosyalık, kendi örnek verisiyle çalışan bağımsız bir kabuktur; mevcut `yonetim-paneli.html`'in yerini almaz,
  kullanıcı tercihiyle seçilen alternatif arayüzdür. Pencere/simge durumları tarayıcıda saklanabilir.





---

## 7. İş Akışları (Kritik Yollar)

### 7.1 Minibar tüketimi (kat formu)
```
Kat sorumlusu → Oda QR okut (ScanEvent)
   → Odayı ve konsepti sistem getirir
   → Eksik ürünler girilir
   → Zimmet bakiyesi kontrol edilir (yetersizse engel + ikmal talebi)
   → ConsumptionRecord + ConsumptionItem yazılır
   → StockMovement (zimmetten düşüm)
   → Oda/kat/otel toplamları güncellenir → rapor
```

### 7.2 DND ara kaydı
```
Oda DND → ConsumptionRecord oluşmaz, DndFollowUp (status=BEKLIYOR) açılır
   → +120 dk (job) → status=ALARM + Notification (kat sorumlusu, kat ekranı, süpervizör)
   → Sonraki okutmada status=TAMAM, deneme sayısı artar
```

### 7.3 Minibar kişiselleştirme (günde 1 hak)
```
Misafir QR → dil otomatik algılanır (yoksa EN)
   → Konsept ürünleri listelenir, artır/azalt seçilir
   → Gün içinde ikinci deneme engellenir (roomId + gün tekil)
   → PersonalizationRequest → kat sorumlusu + depo sorumlusu + yönetici bildirimi
   → Kat sorumlusu okutur, karşılanan adetleri girer
   → Zimmetten düşüm + oda kaydı + status=TAMAM/KISMEN
```

### 7.4 QR sipariş
```
Misafir sepeti gönderir (Order status=SENT)
   → Garson cihazı + akıllı saat + ana kasa bildirimi (≤3 sn)
   → Garson onaylar (OrderApproval) → status=APPROVED
   → Printer kuyruğu (ESC/POS) + KDS yayını
   → SERVED → adisyon verisi (ürün + adet + masa/oda kimliği)
```

### 7.5 Zimmet dağıtımı
```
Depo sorumlusu ürün + adet seçer → StockAssignment (kat sorumlusuna)
   → Kat sorumlusu bakiyesi artar; hareket denetim günlüğüne yazılır
```

### 7.6 Oturum yaşam döngüsü (giriş → online → otomatik çıkış)
```
Kullanıcı giriş yapar (şifre + MFA)
   → Atamalı olduğu outletler ve minibar sistemi, bağlı otelin adıyla listelenir
   → OUTLET veya MİNİBAR seçilir (SessionEvent: OUTLET_SECIM); otel bu kayıttan gelir
   → Seçim yapılmadan UserSession açılmaz
   → UserSession açılır: status=ONLINE, hotelId = hedefin oteli, expiresAt = loginAt + maxOnlineMinutes
   → OutletMember kaydındaki rol ile varsayılan ekran açılır, bildirimler başlar
   → Süre bitmeden warnBeforeMinutes önce → uyarı (WARN, cihaz + ekran)
   → Süre dolarsa → status=CIKTI, logoutReason=SURE_ASIMI (sistem otomatik çıkış)
   Alternatif kapanışlar: MANUEL · HAREKETSIZLIK · VARDIYA_SONU · ZORUNLU · TEK_CIHAZ
   → Tüm hareketler SessionEvent + AuditLog; online izleme ekranında canlı görünür
```

---

## 8. Bildirim ve Gerçek Zamanlı Katman

| Olay | Kanal | Gecikme hedefi |
|------|-------|----------------|
| Yeni sipariş / garson çağrısı | Mobil push + akıllı saat + panel | ≤ 3 sn |
| Sipariş onayı sonrası | KDS + fiş yazıcı | ≤ 2 sn |
| Kişiselleştirme talebi | Kat sorumlusu + depo + yönetici | ≤ 2 sn |
| DND uyarısı | Kat sorumlusu + kat ekranı + süpervizör | job tetiklemeli |
| Eskalasyon | Kural tabanlı (90 sn / 3 dk / 5 dk) | anında |

Çevrimdışı: cihaz kuyruğu + sunucu tarafı açık talep kaydı; bağlantı dönüşünde sıralı iletim.

---

## 9. Güvenlik, KVKK ve Denetim

- Rol bazlı erişim + kapsam (otel/outlet/kat); sunucu tarafı zorunlu kontrol.
- MFA (yönetici/müdür), cihaz eşleştirme, kayıp cihazı uzaktan kapatma.
- QR kimlikleri HMAC ile imzalı; tesis dışı kullanım tespitinde **30 gün kara liste**.
- Kişisel veri toplanmaz; tercihler yalnızca misafir cihazında (yerel çerez).
- `AuditLog` append-only; iptal/düzeltmeler ikinci onay gerektirir.
- TLS, şifreli yedek, günlük yedek + haftalık harici kopya, geri dönüş tatbikatı.

---

## 10. Çoklu Dil ve Çoklu Kiracı

- **Diller:** TR, EN, DE, FR, IT, AR (misafir) · TR, EN (personel). Algılama: `Accept-Language` / `navigator.language`; eşleşme yoksa **EN**. Arapça RTL.
- İçerik (menü öğesi, açıklama, alerjen) çevirileri veri düzeyinde tutulur (`MenuItemTranslation`).
- **Kiracı (tenant):** her sorgu `hotelId` ile sınırlı; kompleks geneli raporlar yalnızca yönetici rolünde.

---

## 11. Faz ve Sprint Planı

| Faz | Süre | İçerik | Çıktı |
|-----|------|--------|-------|
| **F0 · Hazırlık** | 1 hafta | Depo, CI, ortam, tasarım sistemi, şema iskeleti, seed (3 otel) | Çalışan iskelet + varsayılan otel kayıtları |
| **F1 · Çekirdek** | 2 hafta | Çok kiracılı yapı, RBAC, kullanıcı/rol, denetim günlüğü, QR imzalama | Panel iskeleti, giriş, yetki matrisi |
| **F1.5 · Kurumsal yapı, rol/yetki & oturum** | 2 hafta | Akordeon menü bilgi mimarisi, modül bazlı outlet ve rol tanımları, rol × otel × modül × ekran yetki motoru, outlet ekipleri ve kullanıcı atamaları, giriş akışı (otel → outlet), oturum yaşam döngüsü, maksimum online süre + otomatik çıkış, online kullanıcı takip ekranları, tanımlama rehberi | ADM-06…15, AUTH-01…07 |
| **F2 · Minibar tanımlar** | 2 hafta | Otel/kat/oda tipi/konsept/ürün grubu/ürün/personel/oda tanımları | MB-DEF-01…08 |
| **F3 · Minibar operasyon** | 3 hafta | Zimmet, kat formu PWA, tüketim, DND + job, bildirim altyapısı | MB-OPS-01…04, MB-MOB-01…06 |
| **F4 · Misafir minibar** | 1,5 hafta | Çok dilli misafir arayüzü, kişiselleştirme (günde 1), talep karşılama | GST-01…03 |
| **F5 · QR Menü + Sipariş** | 3 hafta | Menü ağacı/görsel/tema, misafir menü, sepet, garson onayı, KDS + yazıcı | QRM-DEF-01/02, QRS-OPS-01/02, GST-05/06 |
| **F6 · Oda Servisi + Rapor + Komuta** | 2,5 hafta | Oda servisi, rapor motoru, komuta merkezi canlı izleme, eskalasyon | RS-OPS-01, ADM-02/03 |
| **F7 · Kabul & eğitim** | 2 hafta | Uçtan uca test, yük testi, saha kalibrasyonu, rol bazlı eğitim, canlı geçiş | Kabul tutanağı, kılavuzlar |

**Toplam: ≈ 19 hafta** (F0–F7 + F1.5). Paralel yürütülebilir işler (tasarım sistemi, i18n, oturum & bildirim altyapısı) ile **15–16 haftaya** indirilebilir.
Ticari teklifteki 12 haftalık takvim, F1–F6'nın sıkıştırılmış (paralel) sürümüne karşılık gelir; sezon takvimi önceliğine göre kapsam sırası değiştirilebilir.

**Mevcut durum:** F0 çıktısının arayüz kısmı tamamlandı — `prototip/` altındaki **55 ekranlık** tıklanabilir HTML ön tasarım **+ alternatif Windows XP masaüstü kabuğu** (masaüstü/pencere/başlat/sağ tuş/sürükle-bırak + Android mobil görünümü) (3 otel varsayılan kayıt, modül girişi, modül bazlı outlet/rol tanımları, outlet ekipleri, oturum akışı, online kullanıcı takibi, tanım akışları, komuta merkezi, kat formu, misafir arayüzü) müşteri onayına hazır.

---

## 12. Kabul Kriterleri ve Test Stratejisi

| # | Kriter | Ölçüm |
|---|--------|-------|
| 1 | 3 otel varsayılan kayıt olarak yüklü | Seed sonrası panelde 3 tesis, silme engeli testi |
| 2 | Tanım zinciri bütünlüğü | Oda tipi olmayan oda, konsepti olmayan oda tipi oluşturulamaz |
| 3 | Uçtan uca tüketim | Kat formu → zimmet düşümü → oda/kat/otel raporu birebir |
| 4 | DND akışı | Ara kayıt + zamanlanmış uyarı + kapama testi |
| 5 | Kişiselleştirme sınırı | Aynı odada gün içinde ikinci talep reddedilir |
| 6 | Sipariş onayı | Onaysız sipariş mutfağa/yazıcıya ulaşmaz |
| 6b | Opsiyonel fiyat ve adisyon | Fiyat gösterimi kapalıyken kayıtlı tutar menüde ve adisyonda görünmez; açık QR Sipariş outletinde adisyon toplamı basılır ve yazdırılır |
| 7 | Bildirim gecikmesi | ≤ 3 sn (web/mobil/saat) |
| 8 | Eşzamanlı yük | 300 misafir talebi + 40 personel cihazı kayıpsız |
| 9 | Çoklu dil | 6 dilde misafir ekranı; AR RTL doğru |
| 10 | Yetki sınırı | Kapsam dışı veri erişimi engellenir; denetim günlüğünde görünür |
| 11 | Kesinti dayanıklılığı | Ağ kesintisinde kuyruk + dönüşte otomatik gönderim |
| 12 | Rapor doğruluğu | 20 oda örneklemi sayımla birebir |
| 13 | Merkezi yönetim hiyerarşisi | Otel → modül → outlet → ekip sırası zorunlu; ekipsiz outlet canlıya alınamaz |
| 14 | Modül bazlı outlet/rol | Aynı fiziksel alan iki modülde ayrı outlet; rol modüle bağlı tanımlanır |
| 15 | Giriş akışı | Kullanıcı girişten hemen sonra atanmış outlet veya minibar sisteminden birini seçer; seçim olmadan oturum açılmaz |
| 16 | Çoklu outlet | Birden fazla outlette ataması olan kullanıcı yalnızca seçtiği outletin verisini ve bildirimlerini görür |
| 17 | Atamasız kullanıcı | Giriş yapabilir fakat hiçbir modülde operasyonel yetki görmez (boş seçim ekranı) |
| 18 | Otomatik çıkış | Maksimum online süre aşımında oturum otomatik kapanır; sebep SURE_ASIMI olarak kaydedilir |
| 19 | Online kullanıcı takibi | Otel/outlet bazlı online liste ve canlı aktivite akışı ≤ 2 sn gecikme ile güncellenir |
| 20 | Zorunlu çıkış | Yönetici oturumu kapatabilir; kayıt ZORUNLU sebebiyle denetim günlüğünde görünür |
| 21 | Menü bilgi mimarisi | Üç kademeli akordeon menü; kategori açıldığında kardeşi kapanır, aktif ekranın yolu otomatik açılır, arama süzgeci çalışır |
| 22 | Tanımlama sırası | Bağımlılık kuralları uygulanır: kat olmadan oda, oda tipi olmadan oda, ürün olmadan konsept, konsept olmadan oda tipi oluşturulamaz |
| 23 | Kurulum rehberi | Kontrol listesi tamamlanma yüzdesini hesaplar ve tamamlanmamış ilk adıma doğrudan yönlendirir |
| 24 | Rol kataloğu | Roller tiplere (Sistem/Yönetim/Outlet/Mutfak/Minibar) göre tanımlanır; yetkisiz rol hiçbir ekran göremez |
| 25 | Yetki matrisi | Yetki rol × otel × modül × ekran × işlem (V/O/D/A/R) düzeyinde verilir; onay yetkisi olmayan kullanıcı işlemi tamamlayamaz |
| 26 | Yetkisiz erişim | Yetkisi olmayan ekran veya veri açılamaz; deneme denetim günlüğüne yazılır |
| 27 | Otel altında outlet tanımı | Otel tanımından sonra outlet tanımlanabilir; modüle özel alanlar kaydedilir |
| 28 | Minibar bölgesi ataması | Kat sorumlusu kat bölgesine, depo sorumlusu merkez depoya atanabilir; bölgeler giriş listesinde outlet gibi görünür |
| 29 | Çoklu atama ve zorunlu outlet seçimi | Birden fazla outleti olan kullanıcı girişten sonra outletini seçmeden oturum açamaz; oturum yalnızca seçilen outletin verisini gösterir |
| 30 | Outlet modül ataması | QR Menü ve QR Sipariş outlet bazında atanır; atamasız outlette menü tanımlanamaz ve QR hedefi görünmez |
| 31 | Outlete özel menü | Kategori → alt kategori → grup → öğe ağacı outlet bazlı tanımlanır; her düğüme görsel yüklenebilir |
| 32 | Öğe detay / alerjen / fiyat | Detay, alerjen (çoklu) ve opsiyonel fiyat kaydedilir; fiyat gösterimi outlete özel açılıp kapatılabilir |
| 33 | Adisyon | Fiyat gösterimi açık outletlerde adisyonda satır tutarları ve toplam görünür, adisyon çıktısı alınabilir; kapalı outlette tutar oluşmaz |
| 34 | XP masaüstü arayüzü | Simgeye çift tıkla pencere açılır; başlat menüsü kategorilidir; sağ tuşta yenile/tema/kısayol vardır; kısayollar sürükle-bırak ile eklenir/kaldırılır (onaylı) |
| 35 | Modül = pencere, otel = bağlam | Her modül ayrı penceredir; pencere içi otel seçicisiyle veriler otel bazlı filtrelenir; tanımları eksik otelde uyarı görünür |
| 36 | Onay pencereleri | Tüm CRUD işlemlerinde onay penceresi gösterilir; Ayarlar'dan kapatılabilir |
| 37 | Mobil Android kabuk | Mobilde yalnızca izleme ve raporlama; tanımlama ekranları Ayarlar'dan geçici olarak açılabilir; dar ekranda otomatik geçiş |

**Test:** birim (kural/zimmet hesapları), entegrasyon (Prisma + servis), uçtan uca (Playwright ile sipariş/tüketim/kişiselleştirme), yük (k6), güvenlik (yetki sızma testi).

---

## 13. Altyapı ve Donanım Gereksinimleri (otel tarafı)

- Kararlı Wi-Fi kapsaması: havuz, sahil, iskele, lounge, spa, katlar.
- Sunucu: otel içi mini PC/endüstriyel sunucu + UPS (edge), yedekli disk.
- Mutfak/bar: ESC/POS fiş yazıcı (Ethernet tercih), 220 V priz.
- KDS/outlet ekranı: 21" endüstriyel dokunmatik veya 10" Android tablet.
- Personel: Android/iOS cihaz + akıllı saat (Wear OS).
- QR taşıyıcıları: şezlong/masa için kırılmaz plaka, oda için laminasyonlu etiket.

> Donanım teklif kapsamı dışındadır; bilgi listesi için teklif dokümanı Bölüm 14.3.

---

## 14. Riskler ve Önlemler

| Risk | Etki | Önlem |
|------|------|-------|
| Wi-Fi kapsama zayıflığı (sahil/iskele) | Geofence ve sipariş gecikmesi | Saha ölçümü + ayrı SSID + AP planı (F0'da ölçüm) |
| Menü/görsel içeriğinin gecikmesi | Takvim kayması | İçerik şablonu ve toplu içe aktarma (F2'de teslim) |
| Yazıcı/ekran uyumsuzluğu | Sipariş kaybı | F5'te saha testi, yerel kuyruk, tekrar baskı |
| Personel adaptasyonu | Kayıt eksikliği | Rol bazlı eğitim + kat planı ekranı + performans raporu |
| Akıllı saat marka farklılıkları | Bildirim gecikmesi | Desteklenen marka/model listesi + telefon yedek kanalı |
| Misafir cihaz çeşitliliği | QR açılmaması | Sunucu taraflı hafif mobil web, tarayıcı uyum matrisi |
| KVKK itirazı | İtibar | Veri minimizasyonu, yalnızca yerel çerez, yazılı politika |

---

## 15. Teslim Edilecekler

1. `prototip/` — 35 ekranlık tıklanabilir HTML ön tasarım (bu depoda hazır).
2. `docs/veri-modeli.prisma` — Prisma şema taslağı (bu depoda hazır).
3. `PLAN.md` — bu belge.
4. Geliştirme sonrası: çalışan sistem (edge + panel + PWA + misafir), `prisma/seed.ts`, migration dosyaları, API dokümantasyonu, rol bazlı kullanım kılavuzları, yedekleme/geri dönüş prosedürü, kabul test raporu.

---

## 16. Çalışma Disiplini

- **Dal stratejisi:** `main` (üretim) · `develop` · `feature/<modül>-<konu>` · `release/*`.
- **Commit:** Conventional Commits; her PR en az bir gözden geçirme + test.
- **Ortamlar:** `dev` (yerel, Docker) · `staging` (otel sahası test) · `prod` (canlı).
- **Kalite kapıları:** lint + tip kontrolü + birim test + uçtan uca test yeşil olmadan birleştirme yok.
- **Sürümleme:** SemVer; modül başına changelog.

---

## 17. Karar Bekleyen Konular (müşteri onayı)

1. DND uyarı süresi varsayılanı (öneri: **120 dk**) ve otel bazlı farklılaştırma.
2. Kişiselleştirme hakkı: gerçekten günde 1 kez mi, konaklama başına mı? (öneri: günde 1)
3. QR Oda Servisi'nde telefon teyidi zorunlu mu, opsiyonel mi? (öneri: opsiyonel, birim sorumlusu seçer)
4. Ürün "birim değer" alanının kapsamı (yalnızca iç rapor mu, maliyet analizi mi).
5. Faz sırası: sezon öncesi QR Menü + Sipariş mi, minibar mı önce canlıya alınacak?
6. Misafir ekranlarında hangi diller zorunlu (öneri: TR/EN/DE/FR/IT/AR).
7. PMS entegrasyonu bu aşamada kapsamda mı? (teklifte opsiyonel kalem)
8. Maksimum online süre varsayılanı (öneri: **480 dk**) ve uyarı eşiği (öneri: **60 dk**) onayı.
9. Tek cihaz kuralı: aynı kullanıcının iki cihazda online olması engellensin mi? (öneri: **engellensin**, yeni giriş eski oturumu kapatsın)
10. Ataması yapılmamış kullanıcı: sisteme girişi tamamen engellensin mi, yoksa girip "atama yok" bilgisi mi görsün? (öneri: **girip bilgilendirilir**)
11. Minibar kat sorumlusu için online süre 8–10 saatlik vardiyaya göre farklılaştırılsın mı? (öneri: **600 dk** modül/rol bazlı)
12. Yetki granülerliği: ekran bazlı mı, yoksa ekran × işlem (V/O/D/A/R) bazlı mı olsun? (öneri: **ekran × işlem**)
13. Onay yetkisi (A) iki kademe kuralında: garson yalnızca düzeltsin, onayı şef garson ve üzeri versin mi? (öneri: **evet**)
14. Aynı ekranın iki kategoriden erişimi (Konsept örneği) korunsun mu, tek yol mu bırakılsın? (öneri: **iki yol korunsun**)
15. Menü durumu (açık kategoriler) cihaz bazlı mı kullanıcı bazlı mı saklansın? (öneri: **cihaz bazlı**)
16. Tek outleti olan kullanıcıda outlet otomatik seçilsin mi, seçim ekranı yine gösterilsin mi? (öneri: **tek seçenekte otomatik**, çoklu seçenekte zorunlu seçim)
17. Fiyat para birimi ve biçimi: prototipte ham değer (240) EUR olarak görünüyor; kuruş ayrımıyla "2,40" biçimi mi kullanılacak? (öneri: **EUR, ondalıklı**)
18. Opsiyonel fiyatlı modül bedelleri (QR Menü / QR Sipariş) outlet başına aylık mı, tek seferlik lisans mı? Teklife nasıl yansıtılır? (karar gerekli)
19. XP masaüstü arayüzü üretimde ana kabuk mu alternatif mi olsun? (öneri: **alternatif**, kullanıcı tercihi Ayarlar'dan seçilir)
20. Mobilde tanımlama ekranlarının varsayılan durumu kapalı mı kalsın? (öneri: **kapalı**; ihtiyaç halinde geçici açma)
