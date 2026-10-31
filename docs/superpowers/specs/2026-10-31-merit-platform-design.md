# Merit Royal Dijital Operasyon Platformu — Tasarım Spesifikasyonu

**Sürüm:** 1.0 · **Tarih:** 31 Ekim 2026 · **Durum:** Kullanıcı incelemesi bekliyor
**Ticari referans:** PRO-MR-2026-088 (Merkezi Yönetici Paneli, Minibar Takip, QR Menü/Sipariş, QR Oda Servisi)
**Önceki belge:** `docs/analiz/2026-10-31-anlayis-notu.md` (kaynak çaprazlaması ve kararlar)

---

## 0. Özet

Merit Royal kompleksindeki üç otel (Merit Royal Diamond, Merit Royal, Merit Royal Premium) için tek veritabanı ve tek Next.js uygulaması üzerinde çalışan, **Windows XP stilinde bir yönetici kabuğu** ("Merit OS") altında birleşen dört modül geliştirilecek. Minibar modülü, canlıdaki Flask uygulaması `D:\PROJELLER\minibarlatest` ile aynı iş kurallarını (bu belgede sadeleştirilen noktalar hariç) uygular ve o sistemin tüm verisi yeni sisteme taşınır.

Kilit kararlar (kullanıcı, 31.10.2026): MyBar oda başına iş günü başına 1 talep (ayarlanabilir), zimmet **otel ortak havuzu**, oda kontrolünde yalnızca **+N ikame / Sarfiyat Yok / DND / MyBar karşılama**, doluluk Excel + günlük görevler + e-posta raporları dahil, ana depo-FIFO ve ML hariç, canlı veri **tamamen** göç eder.

---

## 1. Kapsam

### 1.1 Dahil
| Modül | İçerik |
|---|---|
| **Çekirdek / Merit OS** | 3 otel (seed, silinemez), kat, oda, oda tipi, outlet, masa, kullanıcı, rol, ekran kataloğu, yetki matrisi (rol × otel × modül × ekran × işlem), otel bazlı modül aç/kapa, oturum ve online kullanıcı takibi, bildirim merkezi, denetim günlüğü, ayarlar, XP masaüstü kabuğu + Android mobil görünüm, canlı izleme, rapor merkezi |
| **Minibar Takip** | Ürün grubu/ürün, setup (dolap içi/dışı), otel bazlı oda tipi–setup ataması, otel zimmet havuzu (giriş/iade/kullanım), oda kontrolü (+N ikame, Sarfiyat Yok, DND), doluluk Excel yükleme (inhouse/arrivals/departures), günlük kontrol görevleri + öncelik planı, kat sorumlusu depodan ek talep, oda QR üretimi/indirme, MyBar misafir talebi ve karşılama, kritik stok uyarıları, raporlar |
| **QR Menü + QR Sipariş** | Outlet'e modül ataması, menü ağacı (kategori → alt kategori → grup → öğe; görsel, detay, alerjen, opsiyonel fiyat, çeviri), "tükendi", ambiyans teması, masa QR'ı, misafir menü ve sepet, fiyat göster/gizle (sistem → outlet), sipariş aç/kapa, garson çağırma, sipariş → kasa/garson onayı → KDS + yazıcı, garson masa ataması |
| **QR Oda Servisi** | Oda QR'ı → oda servisi menüsü (otel bazlı oda servisi outleti), sipariş → oda servisi mutfak ekranı, opsiyonel telefon teyidi adımı, hazırlanıyor/yolda/teslim |
| **Altyapı** | SSE gerçek zaman, Web Push (opsiyonel), ESC/POS print gateway, pg-boss zamanlanmış işler, e-posta (SMTP), i18n (TR/EN/DE/RU/AR), göç scripti, testler |

### 1.2 Hariç (v1)
Donanım; PMS/folio/ödeme/muhasebe entegrasyonu; a la carte restoranlar; ana depo tedarik ve FIFO parti takibi; ML anomali tespiti; executive (superadmin) dashboard; geofence / Wi-Fi doğrulama / cihaz kara listesi; native akıllı saat uygulaması; MFA (altyapı hazır bırakılır); oda kontrolünde ekstra / sıfırla / setup dışı ürün ekleme; zaman ayarlı oda servisi, butler/yastık menüsü vb. ekstra IRD özellikleri.

---

## 2. Mimari

### 2.1 Teknoloji
| Katman | Seçim | Not |
|---|---|---|
| Uygulama | **Next.js 16 (App Router), React 19, TypeScript** | Server Components + Server Actions; Route Handlers yalnızca SSE, print-queue, health, web-push için |
| Veritabanı | **PostgreSQL 17** | Lokal geliştirme: mevcut `postgresql-x64-17` servisi |
| ORM | **Prisma 7** (`@prisma/client` + `@prisma/adapter-pg`) | Migration'lar repo'da; `prisma/seed.ts` |
| Stil | **Tailwind CSS 4** | XP kabuğu için ayrı token seti (`shell/theme`), saha/misafir için modern tema |
| Durum (istemci) | **Zustand** | Pencere yöneticisi, sepet, SSE istemcisi |
| Gerçek zaman | **SSE** (`/api/sse`) + **PostgreSQL LISTEN/NOTIFY** | Redis yok. Tek kanal `merit_events`, JSON yük |
| Zamanlanmış iş/kuyruk | **pg-boss** | Oturum süpürücü, DND gün sonu, günlük yükleme görevleri, e-posta raporları, print retry |
| Kimlik | **iron-session** (şifreli çerez) + **bcryptjs** | Sunucu tarafı `UserSession` tablosu online takip için |
| Doğrulama | **Zod** | Tüm Server Action ve API girdileri |
| i18n | **next-intl** | Misafir: tr/en/de/ru/ar (ar RTL); personel ve yönetici: tr |
| E-posta | **nodemailer** | SMTP ayarları DB'de |
| Excel | **exceljs** | Doluluk içe aktarma, rapor dışa aktarma |
| QR | **qrcode** | SVG/PNG; token HMAC-SHA256 ile imzalı |
| Yazdırma | `tools/print-gateway` (Node, `net.Socket`, cp857) | Otel yerel ağında çalışır, sunucudan kuyruğu çeker |
| Push | **web-push** (VAPID) | Garson/kat sorumlusu telefon bildirimi |
| Test | **Vitest** + **Playwright** | §13 |

### 2.2 Dağıtım
Tek Node süreci (Next.js standalone) + PostgreSQL + (otel LAN'ında) print-gateway. Bulut veya on-premise aynı paket. Ortam değişkenleri: `DATABASE_URL`, `SESSION_SECRET`, `QR_HMAC_SECRET`, `PRINT_GATEWAY_KEY`, `VAPID_*`, `APP_BASE_URL`, `TZ=Europe/Nicosia`.

### 2.3 Klasör yapısı
```
merit/
├─ prisma/                 schema.prisma · migrations/ · seed.ts
├─ src/
│  ├─ app/
│  │  ├─ (admin)/admin/           XP kabuğu (tek sayfa; pencereler istemci bileşeni)
│  │  ├─ (staff)/                 /giris  /secim  /kat/*  /depo/*  /garson/*  /kasa/*  /kds/*  /oda-servisi/*
│  │  ├─ (guest)/q/[token]/       misafir: oda QR (MyBar + oda servisi), masa QR (menü + sipariş)
│  │  └─ api/                     sse/ · print-queue/ · push/ · health/
│  ├─ shell/                      XP pencere yöneticisi, app registry, Başlat, görev çubuğu, Android kabuk
│  ├─ modules/
│  │  ├─ core/                    hotels, floors, rooms, outlets, users, roles, permissions, sessions, settings, notifications, audit
│  │  ├─ minibar/                 products, setups, stock, room-check, dnd, mybar, occupancy, tasks, stock-requests, reports
│  │  ├─ menu/                    menu tree, themes, translations, table QR
│  │  ├─ order/                   orders (masa + oda servisi), approvals, kds, waiter calls, print jobs
│  │  └─ reporting/               ortak rapor motoru, Excel/PDF, e-posta raporları
│  └─ lib/                        prisma.ts · auth.ts · rbac.ts · realtime.ts (notify/listen) · jobs.ts (pg-boss)
│                                 time.ts (iş günü) · qr.ts · print/escpos.ts · mail.ts · result.ts · i18n/
├─ tools/print-gateway/           bağımsız Node servisi
├─ scripts/migrate-from-minibarlatest/   legacy → yeni şema ETL
├─ tests/ (unit, e2e)
└─ docs/
```
Her modül: `server/` (servisler, Server Action'lar, zod şemaları), `ui/` (bileşenler), `screens.ts` (ekran kataloğu kayıtları), `apps.ts` (XP uygulama kayıtları), `events.ts` (yayınladığı SSE olayları).

**Modülerlik kuralları**
1. Modüller birbirinin tablolarına doğrudan yazmaz; paylaşım `modules/core` servisleri ve `lib/*` üzerinden.
2. Her servis çağrısı `Ctx { user, session, hotelIds[], activeHotelId?, activeOutletId? }` alır; otel dışı veri sorgulanamaz (servis katmanında zorunlu `hotelId` filtresi).
3. Her yazma işlemi: Zod → yetki (`can`) → transaction → audit → (gerekiyorsa) `publish(event)`.
4. Bir modül kapalıyken (`HotelModule.enabled=false`) o otelde ekranları, QR hedefleri ve işleri devre dışı kalır; diğer modüller etkilenmez.

---

## 3. Veri modeli

Model adları İngilizce, tablo adları `@@map` ile snake_case, enum değerleri Türkçe iş diline yakın. Tüm tablolarda `id String @id @default(cuid())`, `createdAt`, gerektiğinde `updatedAt`. Zaman damgaları UTC saklanır; "iş günü" hesapları `Europe/Nicosia` ile yapılır (§10).

### 3.1 Çekirdek
| Model | Alanlar / kurallar |
|---|---|
| `Hotel` | code (MRD/MR/MRP) unique, name, logoUrl?, address?, phone?, isSystemDefault (true → silinemez), isActive, emailFlags (bildirim/uyarı/rapor/sistem) |
| `HotelModule` | hotelId, moduleKey `MINIBAR|QR_MENU|QR_ORDER|ROOM_SERVICE`, enabled; unique(hotelId, moduleKey) |
| `Floor` | hotelId, number Int, name, isActive; unique(hotelId, number) |
| `RoomType` | hotelId, name, cabinetCount Int=0, isActive; unique(hotelId, name) |
| `Room` | hotelId, floorId, roomTypeId?, number String, capacity?, qrToken unique?, qrGeneratedAt?, guestMessage? (≤500), isActive; unique(hotelId, number) |
| `Outlet` | hotelId, name, type `HAVUZ|BAR|SAHIL|SALON|BAHCE|SPA|CABANA|ODA_SERVISI|GENEL`, hasMenu, hasOrdering, orderingEnabled (anlık aç/kapa), priceDisplay `INHERIT|SHOW|HIDE`, themeId?, printerId?, kdsEnabled, phoneConfirmRequired (yalnız ODA_SERVISI), isActive; unique(hotelId, name). Oda servisi = otel başına tek `ODA_SERVISI` outleti |
| `OutletTable` | outletId, label, qrToken unique, isActive; unique(outletId, label) |
| `User` | username unique, passwordHash, fullName, email?, phone?, roleId, hotelId? (birincil otel; kat sorumlusu için zorunlu), supervisorId? (kat sorumlusunun depo sorumlusu), isActive, lastLoginAt, prefs Json (XP düzeni, tema) |
| `UserHotel` | userId, hotelId; unique — depo sorumlusu/yönetici çok otel kapsamı |
| `OutletMember` | userId, outletId, roleId?, isActive; unique(userId, outletId) |
| `TableAssignment` | outletId, tableId, userId, isActive; aktif atama masa başına en fazla 1 |
| `Role` | code unique (R-SYS, R-OTM, R-FBM, R-SGF, R-GAR, R-BAR, R-BUT, R-OUT, R-ODS, R-MUS, R-MUP, R-KDS, R-KAS, R-KAT, R-DEP, R-HKS, R-ITT), name, kind `SISTEM|YONETIM|OUTLET|MUTFAK|MINIBAR`, maxOnlineMinutes?, defaultScreen?, isSystem |
| `AppScreen` | code unique (MB-KAT, QS-KUY, …), moduleKey (CORE dahil), name, path, group, sortOrder, isActive |
| `RoleScreenPermission` | roleId, screenId, hotelId?, canView/canCreate/canEdit/canApprove/canReport; unique(roleId, screenId, hotelId) |
| `RoleModuleAccess` | roleId, hotelId?, moduleKey, enabled; unique |
| `UserSession` | userId, hotelId, outletId?, roleId, deviceLabel?, status `ONLINE|UYARI|CIKTI|DUSURULDU`, loginAt, lastSeenAt, expiresAt, warnedAt?, logoutAt?, logoutReason `MANUEL|SURE_ASIMI|HAREKETSIZLIK|ZORUNLU|TEK_CIHAZ|SISTEM`, ip, userAgent; index(status, expiresAt) |
| `SessionEvent` | sessionId, event, detail Json |
| `Setting` | hotelId? (null = sistem), key, value Json; unique(hotelId, key). Anahtarlar §11 |
| `Notification` | userId (alıcı), hotelId?, type, title, body, refType?, refId?, isRead, readAt?; index(userId, isRead, createdAt). Alıcı başına bir satır |
| `PushSubscription` | userId, endpoint unique, p256dh, auth, userAgent, lastUsedAt |
| `AuditLog` | userId?, hotelId?, action, entity, entityId?, before Json?, after Json?, ip?; index(createdAt), index(entity, entityId) |
| `QrScanLog` | roomId?, tableId?, userId?, kind `MISAFIR|PERSONEL|SISTEM`, ok, error?, ip, userAgent |

### 3.2 Minibar
| Model | Alanlar / kurallar |
|---|---|
| `ProductGroup` | name unique, description?, isActive |
| `Product` | groupId, code unique?, name, barcode unique?, unit="Adet", criticalLevel Int=10, purchasePrice?, salePrice? (Decimal 10,2; misafire gösterilmez), isActive |
| `Setup` | name unique, description?, isInsideCabinet Boolean=true, isActive |
| `SetupItem` | setupId, productId, qty Int≥1; unique(setupId, productId) |
| `RoomTypeSetup` | hotelId, roomTypeId, setupId; @@id(hotelId, roomTypeId, setupId) |
| `HotelStock` | hotelId, productId, totalQty, usedQty, remainingQty, criticalLevel Int=50; unique(hotelId, productId); CHECK remainingQty ≥ 0. Durum: 0 → STOKOUT, ≤k → KRITIK, ≤1.5k → DIKKAT, aksi NORMAL |
| `HotelStockMovement` | hotelId, productId, userId, type `GIRIS|IADE|KULLANIM|MYBAR|DUZELTME|GOC`, qty (işaretli), refType?, refId?, note? ; index(hotelId, productId, createdAt). Canlıdaki `personel_zimmet_kullanim` + depo girişleri burada birleşir |
| `MinibarTransaction` | hotelId, roomId, userId, type `SETUP_KONTROL|SARFIYAT_YOK|MYBAR_KARSILAMA|LEGACY`, legacyType? (göçte orijinal `islem_tipi`), note?, occurredAt; index(roomId, occurredAt), index(hotelId, occurredAt) |
| `MinibarTransactionItem` | transactionId, productId, setupId?, setupQty, startStock, endStock, consumed, added, purchasePrice?, salePrice? |
| `RoomCheck` | roomId, userId, checkDate Date, startedAt, endedAt?, type `URUN_EKLENDI|SARFIYAT_YOK|DND|ACIK`; index(roomId, checkDate), index(userId, checkDate) |
| `RoomDnd` | hotelId, roomId, date Date, count Int, firstAt, lastAt, status `AKTIF|TAMAMLANDI|IPTAL|EKSIK`, taskItemId?; unique(roomId, date) |
| `RoomDndCheck` | dndId, no Int (0 = iptal kaydı), userId, at, note? |
| `MybarRequest` | hotelId, roomId, businessDate Date, status `BEKLEMEDE|TAMAMLANDI|IPTAL`, language, note? (orijinal), noteTr? (çeviri), seenById?, seenAt?, completedById?, completedAt?, closeNote?, closedWithMissing Boolean, cancelledById?, cancelledAt?, cancelNote?, idempotencyKey unique, clientIp; index(hotelId, status), index(roomId, businessDate) |
| `MybarRequestItem` | requestId, productId, requestedQty Int≥1, deliveredQty Int=0 |
| `GuestRecord` | hotelId, roomId, uploadId?, batchCode, guestCount, arrivalDate, arrivalTime?, departureDate, departureTime?, kind `IN_HOUSE|ARRIVAL|DEPARTURE` |
| `OccupancyUpload` | hotelId, code unique, fileName, kind, status `YUKLENDI|ISLENIYOR|TAMAMLANDI|HATA|SILINDI`, totalRows, okRows, errorRows, errors Json, userId |
| `UploadTask` | hotelId, date, kind, status, uploadId?; unique(hotelId, date, kind) |
| `DailyTask` | hotelId, date, type `INHOUSE_KONTROL|ARRIVAL_KONTROL|DEPARTURE_KONTROL`, status `BEKLIYOR|DEVAM|TAMAMLANDI|DND_BEKLIYOR|EKSIK`, completedAt?; unique(hotelId, date, type) |
| `DailyTaskItem` | taskId, roomId, guestRecordId?, status (aynı enum), arrivalTime?, departureTime?, priority Int=999, checkedAt?, dndCount, lastDndAt?, note? |
| `TaskStatusLog` | taskItemId, from, to, userId?, note? |
| `StockRequest` | hotelId, code unique (KST-YYYYMMDD-NNNN), requestedById, handledById?, status `BEKLEMEDE|ONAYLANDI|TESLIM_EDILDI|REDDEDILDI|IPTAL`, note?, rejectReason?, approvedAt?, deliveredAt? |
| `StockRequestItem` | requestId, productId, requestedQty, approvedQty?, deliveredQty?, urgency `NORMAL|ACIL` |
| `EmailSetting` | tek satır (sistem): smtpHost, port, user, passwordEnc, tls, ssl, senderEmail, senderName, isActive |
| `EmailLog` | to, userId?, subject, kind, status `GONDERILDI|HATA|BEKLEMEDE`, error?, trackingId unique, refType?, refId? |

### 3.3 Menü ve sipariş
| Model | Alanlar / kurallar |
|---|---|
| `MenuNode` | outletId, parentId?, kind `KATEGORI|ALT_KATEGORI|GRUP|OGE`, name, detail?, imageUrl?, price Decimal(10,2)?, currency="EUR", allergens String[], isAvailable (tükendi=false), sortOrder, isActive; index(outletId, parentId). Hiyerarşi kuralı servis katmanında: OGE yalnız GRUP altında, GRUP yalnız ALT_KATEGORI altında, ALT_KATEGORI yalnız KATEGORI altında, KATEGORI kökte |
| `MenuNodeTranslation` | nodeId, lang, name, detail?; unique(nodeId, lang) |
| `MenuTheme` | name, bg, accent, soft, textOnAccent, isDefault |
| `Order` | hotelId, outletId, kind `MASA|ODA_SERVISI`, tableId?, roomId?, orderNo Int (otel+gün bazlı sayaç), status (§7), guestLanguage, pricesShown Boolean, currency, subtotal Decimal?, note?, approvedById?, approvedAt?, rejectReason?, phoneConfirmedById?, phoneConfirmedAt?, readyAt?, servedAt?, cancelledAt?, idempotencyKey unique, clientIp; index(outletId, status, createdAt) |
| `OrderItem` | orderId, menuNodeId, nameSnapshot, qty, unitPrice?, note? |
| `OrderEvent` | orderId, userId?, from, to, note?, at |
| `WaiterCall` | outletId, tableId, type `GARSON|HESAP|DIGER`, status `ACIK|YANITLANDI|KAPANDI`, resolvedById?, resolvedAt?; 60 sn üstü açık çağrı ekranda kırmızı |
| `Printer` | hotelId, outletId?, name, ip, port=9100, codepage="cp857", paperWidth=80, isActive, lastSeenAt?, lastStatus? |
| `PrintJob` | printerId, orderId?, kind `FIS|TEST`, payload Json (satırlar; ESC/POS gateway'de üretilir), status `KUYRUKTA|BASILIYOR|BASILDI|HATA`, attempts, error?, printedAt? |

### 3.4 Veritabanı düzeyi kısıtlar (Prisma dışı, migration SQL'i)
- `mybar_requests`: günlük sınır **yalnızca servis katmanında** uygulanır (oda satırı `SELECT … FOR UPDATE` ile kilitlenir, aynı iş gününde İPTAL dışı talep varsa 409). Veritabanında unique indeks **konulmaz**, çünkü `mybar.dailyLimit` otel bazında kapatılabilir. Sorgu için normal indeks `(room_id, business_date)`.
- `hotel_stock.remaining_qty >= 0` CHECK.
- `orders.order_no` için `(hotel_id, business_date)` bazlı sayaç tablosu `order_counters`.

---

## 4. Yetki, kimlik ve oturum

### 4.1 Yetki
- Yetki = `RoleScreenPermission(role, screen, hotel?)` × işlem (`V` görüntüle, `O` oluştur, `D` düzenle, `A` onayla, `R` rapor). `hotelId=null` satırı tüm oteller için geçerli; otel satırı varsa o öncelikli.
- `can(ctx, screenCode, action, hotelId?)`: rol modül erişimi → otel modülü açık mı → ekran yetkisi → otel kapsamı (`UserHotel`/birincil otel). Her Server Action ilk satırda çağırır; başarısızlık `AuditLog(action="YETKISIZ_DENEME")` yazar.
- Seed: 17 rol, 30 ekran, profil bazlı varsayılan matris (TAM: V,O,D,A,R · ISLET: V,O,D,A · SAHA: V,O,D · IZLE: V,R). Onay (`A`) yalnız şef garson ve üstü, kasa, F&B müdürü, sistem yöneticisi.
- Veri görünürlüğü: kat sorumlusu kendi oteli; depo sorumlusu `UserHotel` otelleri; outlet rolleri aktif oturumun outleti; yönetim rolleri kapsamındaki oteller; sistem yöneticisi tümü.

### 4.2 Giriş akışı
1. `/giris`: kullanıcı adı + şifre (bcrypt), 5 deneme/dk IP sınırı.
2. Atamalar toplanır: `OutletMember` (QR modülleri) + minibar bölgesi (kat sorumlusu → oteli; depo → otelleri). Tek seçenek varsa otomatik (ayar `session.singleTargetAuto`, varsayılan true), çoklu ise `/secim`. Ataması olmayan kullanıcı girer, "atama yok" ekranı görür (yönetici roller doğrudan `/admin`).
3. `UserSession` ONLINE; `expiresAt = loginAt + maxOnlineMinutes` (rol → ayar → varsayılan 480; minibar rolleri 600). Aynı kullanıcının açık oturumları `TEK_CIHAZ` ile kapatılır.
4. `lastSeenAt` her istek/heartbeat'te güncellenir. pg-boss işi (her dakika): kalan ≤ 60 dk → `UYARI` + bildirim (bir kez); `expiresAt` geçti → `SURE_ASIMI`; `lastSeenAt` > 45 dk → `HAREKETSIZLIK`. Çıkışta çerez geçersiz, açık işler (onay bekleyen siparişler) outletteki diğer online kullanıcılara düşer.
5. Online kullanıcı takip ekranı (CR-ONL): otel/outlet/modül filtreleri, kalan süre, son işlem, **zorla çıkış** (`ZORUNLU`), canlı akış (SSE `session.*`).

---

## 5. Merit OS (XP kabuğu)

### 5.1 Davranış
- `/admin` tek sayfa. Masaüstü (duvar kağıdı: Bliss/Klasik/Royal Gold/Gümüş), simgeler (serbest konum, ızgaraya hizalama), görev çubuğu (Başlat, açık pencereler, tepside PostgreSQL/SSE/yazıcı durumu ve saat), Başlat menüsü (sol: kategoriler GENEL / MİNİBAR / QR MENÜ / QR SİPARİŞ / ODA SERVİSİ / RAPORLAR / SİSTEM; sağ: yer imleri, Ayarlar, Oturumu Kapat).
- Pencere: başlık çubuğu (sürükle, çift tık büyüt), küçült/büyüt/kapat, sağ-alt köşeden boyutlandır (min 360×240), z-sırası odakla artar, cascade açılış, menü çubuğu (Dosya/Görünüm/Yardım) ve durum çubuğu ("Otel: … · Kullanıcı: … · Son güncelleme").
- **Otel = pencere bağlamı:** pencere açılışında (çok otel kapsamı varsa) otel kartı seçimi; pencere başlığı "Uygulama · Otel"; aynı uygulama farklı otellerle birden fazla pencere. Tek otel kapsamı → otomatik.
- Sağ tık: masaüstünde Yenile / Duvar kağıdı / Simgeleri hizala / Özellikler; simgede Aç / Kısayolu kaldır / Özellikler.
- Sürükle-bırak: Başlat öğesi masaüstüne bırakılır → onay → kısayol; simge Geri Dönüşüm'e → kaldır (geri alınabilir).
- Onay pencereleri: kaydet/sil/onayla/zorla çıkış gibi değiştiren işlemlerde XP tarzı Evet/Hayır (Enter/Esc). Ayarlardan "basit işlemlerde onay sorma" kapatılabilir; **silme ve onay işlemlerinde her zaman sorulur**.
- Kalıcılık: simge konumları, açık pencereler ve boyutları, duvar kağıdı → `User.prefs.shell` (sunucu) + localStorage önbellek.
- Dar ekran (<760px) veya `?mobil=1`: **Android kabuk** — alt sekmeler İzleme / Raporlar / Bildirimler / Ayarlar; tanımlama ekranları yalnızca Ayarlar'daki anahtar açıkken (varsayılan kapalı, oturum süresince).

### 5.2 Uygulama kaydı (sözleşme)
```ts
type AppDefinition = {
  id: string;                       // 'minibar.oda-kontrol'
  title: string; icon: string;      // XP ikon seti
  moduleKey: ModuleKey | 'CORE';
  screenCode: string;               // AppScreen.code — görünürlük bu yetkiye bağlı
  category: 'GENEL'|'MINIBAR'|'QR_MENU'|'QR_ORDER'|'ROOM_SERVICE'|'RAPOR'|'SISTEM';
  needsHotel: boolean;              // pencere içinde otel bağlamı ister
  window: { w: number; h: number; minW?: number; minH?: number; resizable?: boolean };
  kind: 'component' | 'iframe';
  component?: () => Promise<{ default: React.ComponentType<AppProps> }>;  // lazy
  url?: string;                     // iframe tipi (gelecek dış web uygulamaları)
  mobile?: 'none' | 'readonly' | 'full';
};
type AppProps = { hotelId?: string; windowId: string; close(): void; setStatus(text: string): void };
```
Modüller `apps.ts` ile kendi kayıtlarını `shell/registry` içine ekler. Dış uygulama: `kind:'iframe'`, `url`, kabuk oturum belirtecini `postMessage` ile paylaşır (v1'de yalnızca sözleşme + örnek "Hakkında" iframe penceresi).

### 5.3 Çekirdek uygulamalar
Komuta Merkezi (canlı KPI + olay akışı), Tanımlamalar (otel/kat/oda/oda tipi/outlet/masa/kullanıcı/rol/yetki matrisi/ekranlar; **kurulum rehberi** ve bağımlılık uyarıları), Online Kullanıcılar, Bildirimler, Denetim Günlüğü, Ayarlar, Rapor Merkezi, Yazıcılar.

---

## 6. Minibar modülü

### 6.1 Tanımlar
- Sıra ve bağımlılık: otel → kat → oda tipi (dolap sayısı) → oda (oda no otel bazında unique) · ürün grubu → ürün → setup (dolap içi/dışı) → setup içeriği → **otel bazlı oda tipi–setup ataması**. Oda tipi olmayan oda, içeriği olmayan setup atanamaz; kurulum rehberi eksik adımı gösterir.
- Oda kontrol listesi kuralı: oda tipine atanmış dolap içi setup'lar `cabinetCount` kadar ("MINI – Dolap 1/2…", 0 ise 1), dolap dışı setup tek; sıralama önce dolap içi.
- Oda QR: HMAC imzalı 22+ karakter token; tek/toplu üretim, yenileme eskisini geçersiz kılar; SVG/PNG indirme, ZIP (`{Otel}_{Kat}_Oda{no}_QR.svg`), yazdırma şablonu; `guestMessage` (≤500).

### 6.2 Otel zimmet havuzu
- Depo sorumlusu: **Havuza Giriş** (ürün, miktar 1–10000, not) → `HotelStock.total/remaining += n`, `Movement(GIRIS)`; **İade** (en fazla `remaining`) → `Movement(IADE)`; **Düzeltme** yalnız sistem yöneticisi (`DUZELTME`, açıklama zorunlu).
- Kullanım: oda kontrolü ve MyBar karşılama `remaining -= n`, `used += n`, `Movement(KULLANIM|MYBAR, userId)`. Yetersizse işlem reddedilir ("Stokta X adet var"). **Tek transaction**, `HotelStock` satırı `FOR UPDATE`.
- Kritik seviye: havuz başına `criticalLevel` (varsayılan 50; depo ve kat sorumlusu güncelleyebilir). Uyarılar "Stoklarım / Kritik Stoklar" ekranlarında ve kritik altına düşüşte depo sorumlusuna bildirim (günde bir kez ürün başına).
- Kat sorumlusu **ek talep** (`StockRequest`): otomatik öneri (kritik × 1.5 − kalan) + manuel; depo onaylar/reddeder/teslim eder; **teslim havuza GIRIS yazar** (canlıdaki kopukluk giderilir). Talep ve sonuçları bildirim.

### 6.3 Oda kontrolü (kontrol noktası)
Giriş: kat planı/kat doluluk ekranındaki oda kartı, görev listesi veya QR okutma (`/kat/qr` kamera → token → oda; başka otelin odası reddedilir).
1. `kontrolBaslat(roomId)`: personelin açık `RoomCheck(ACIK)` kayıtları kapatılmaz **silinir** (canlı davranış), yeni ACIK kayıt.
2. Ekran: oda no/tipi, kontrol durumu rozeti (Kontrol Edildi / DND n/2 / Sarfiyat Yok / Bekliyor), bekleyen MyBar talebi kartı, setup akordiyonları; her ürün: setup adedi, bugün eklenen (+n), **+1…+min(setup, 4)** butonları (havuz yetmiyorsa pasif).
3. **+N ikame** (`SETUP_KONTROL`): sunucu kuralı `bugünEklenen(room, product, tüm personel) + N ≤ setupQty × dolapKopyaSayısı`; `consumed = N`, `added = N`, `startStock = setupQty − N`, `endStock = setupQty`; havuzdan düşer; `RoomCheck.type=URUN_EKLENDI`, `endedAt`; otel görevi varsa oda kalemi TAMAMLANDI; aktif DND otomatik tamamlanır; 2 sn onay bildirimi.
4. **Sarfiyat Yok**: onay → `MinibarTransaction(SARFIYAT_YOK)` (kalem yok), `RoomCheck(SARFIYAT_YOK)`, görev kalemi TAMAMLANDI, DND otomatik tamamlanır, depo sorumlusuna bildirim.
5. **DND**: §6.4.
6. **Sil**: kat sorumlusu yalnız kendi ve **bugünkü** işlemini silebilir; eklenen miktar havuza iade (`Movement(IADE, ref)`), görev durumu yeniden hesaplanır.
7. Doluluk engel değildir (boş odaya da kontrol yapılabilir); ekranda "boş oda" uyarısı gösterilir.

### 6.4 DND
- `RoomDnd` oda+iş günü başına tek kayıt; her işaretleme `count++`, `RoomDndCheck(no)`, `RoomCheck(DND)`.
- `count ≥ dnd.minChecks` (varsayılan **2**) → TAMAMLANDI; bağlı görev kalemi TAMAMLANDI ("n kez DND"); altındaysa görev kalemi DND_BEKLIYOR.
- Hatırlatma: `lastAt + dnd.recheckMinutes` (varsayılan **120**) geçince kat sorumlusuna bildirim (pg-boss, dakikalık tarama); öncelik planında hedef zaman.
- Ürün ikamesi veya Sarfiyat Yok girilirse aktif DND otomatik TAMAMLANDI (`no=count+1`, "otomatik").
- Gün sonu 23:59 (Nicosia): TAMAMLANMAMIŞ DND → `EKSIK`, görev kalemi EKSIK, depo sorumlusuna özet bildirim. **Eşik tek kaynaktan** (`dnd.minChecks`).
- Depo/yönetici her DND'de tek bildirim alır (çift bildirim yok).

### 6.5 Doluluk ve görevler
- Depo sorumlusu PMS Excel'i yükler: tip algılama (`Dep.Time` → departures; `Hsk.St.`/`Arr.Time` → arrivals; tarih analizi → in-house; P4001 formatı 8. satır başlık), önizleme (sorunlar, eklenecekler), yükleme. Oda otel içinde `number` ile eşleşir; tanımsız oda → hatalı satır (otomatik oluşturma yok). UPSERT: aynı oda+tip+çakışan tarih → güncelle.
- Her gün 00:01 otel × tip için `UploadTask` üretilir; 10:00 ve 18:00 eksik yükleme uyarıları (bildirim + e-posta bayrağı).
- Üç dosya da yüklenince `DailyTask` ×3 (otel bazlı; kat sorumlusu atanmaz): in-house (`arrival ≤ bugün ≤ departure`), arrival (`arrival = bugün`, varış saati), departure (`departure = bugün`, çıkış saatine göre öncelik). Kat sorumlusuna "N yeni görev" bildirimi.
- Öncelik planı: 1) aynı gün çıkış+giriş çakışması (<180 dk kritik) 2) arrival −15 dk 3) departure +60 dk 4) in-house 5) DND tekrar; aynı tipte kalan dakika → kat → oda.
- Görev kalemi tamamlanma: ikame / sarfiyat yok / DND≥eşik. Ana görev: tüm kalemler tamam → TAMAMLANDI, biri tamam veya DND → DEVAM.
- Misafir kaydı silinince: tamamlanan kalemlerde referans NULL, bekleyenler silinir, boş görev silinir. Excel dosyaları 4 gün sonra silinir.
- Kat doluluk ekranı: filtreler (Tümü/Dolu/Boş/Bugün Giriş/Bugün Çıkış), kartta durum, kalan gün, saatler, kontrol durumu, DND sayacı, MyBar zili.

### 6.6 MyBar (misafir talebi)
- Misafir `/q/{roomToken}` → dil (`?lang` → `Accept-Language` → en), RTL (ar) → oda bilgisi + `guestMessage` → setup ürünleri (grup sekmeleri; birden fazla setup'ta aynı ürün → en yüksek adet) → her ürün için **adet 0..maxQty** (`mybar.maxQtyPerItem`, varsayılan setup adedi; `mybar.quantityMode=TICK` ise yalnız işaretleme) → not (≤500, bleach benzeri temizleme) → gönder.
- Sunucu: hız sınırı 30/dk/IP; token doğrulama; `mybar.dailyLimit` (varsayılan **true**) → oda satırı `FOR UPDATE`, bugünkü iş gününde İPTAL dışı talep varsa 409 "Bugün bu odadan talep gönderildi"; en az 1 ürün veya not; `idempotencyKey` (istemci üretir) ile çift gönderim önlenir; not Türkçeye çevrilir (sağlayıcı soyutlanır: Google gtx varsayılan, 3.5 sn zaman aşımı, başarısızsa orijinal) → `MybarRequest(BEKLEMEDE)`.
- Bildirim fan-out: otelin kat sorumluları (ve online olanlara push), otelin depo sorumluları, yönetim rolleri → `Notification` satırları + SSE `mybar.created`. Kat sorumlusu ekranında **zorunlu onay penceresi** (sıralı, sesli); "Gördüm" → `seenBy/seenAt`.
- Karşılama (oda kontrol ekranı): kalem başına istenen/eklenen/kalan, havuz stoğu, adet seçici; "Tümünü Karşıla" / "Seçilenleri Ekle" → `MinibarTransaction(MYBAR_KARSILAMA)` kalemleri `consumed=0, added=n`, havuzdan `Movement(MYBAR)`; `deliveredQty` güncellenir (karşılanma **talep kalemlerinden** izlenir, zamana dayalı tahmin yok).
- Kapatma: tüm kalemler `delivered ≥ requested` → TAMAMLANDI; eksik varsa `closedWithMissing=true` + açıklama (≥10 karakter, ≥3 kelime) zorunlu. İptal: depo/yönetim rolleri (açıklama zorunlu) — **yönetici ekranında iptal butonu vardır**. Kat sorumlusu iptal edemez.
- Listeler: kat sorumlusu (kendi oteli, bekleyen + son 7 gün), depo/yönetici (KPI: bekleyen, görülmemiş, bugün tamamlanan/iptal; filtreler; 200 satır sayfalı). Tüm işlemlerde otel sahipliği doğrulanır.

### 6.7 Minibar raporları
Tüketim (otel/kat/oda/ürün/personel, tarih aralığı), gün sonu (personel bazlı eklenen), oda bazlı tüketim, kat bazlı rapor, zimmet havuzu durumu/hareketleri, kritik stok, görev performansı (tip × otel, oran), DND raporu, MyBar raporu (görülme/karşılanma süreleri), doluluk raporu. Excel/PDF. E-posta: 08:00 günlük görev raporu, 08:05 günlük sarfiyat raporu (otel bayrakları + kullanıcı `emailOptIn`).

---

## 7. QR Menü ve QR Sipariş

### 7.1 Tanımlar
- Outlet'e modül: `hasMenu`, `hasOrdering` (sipariş için menü zorunlu). `orderingEnabled` anlık aç/kapa (kapalıyken misafir sepeti görmez, "şu an sipariş alınmıyor").
- Fiyat gösterimi: `Setting(hotel, 'price.display') ∈ SHOW|HIDE` (varsayılan HIDE) → `Outlet.priceDisplay` INHERIT/SHOW/HIDE. Etkin değer menü, sepet, fiş ve KDS'de kullanılır; sipariş anında `pricesShown` dondurulur. Para birimi `Setting('price.currency')` = EUR.
- Menü ağacı CRUD, görsel yükleme (`/public/uploads/{outlet}/…`, 2 MB, webp'e dönüştürme), çeviri (tr/en/de/ru/ar), alerjen seti (gluten, süt, yumurta, kuruyemiş, deniz ürünü, alkol, soya, susam), **tükendi** anahtarı anlık SSE ile misafir ekranına yansır. Fotoğrafsız öğe menüde gösterilir ama uyarı rozeti alır (zorunluluk yok).
- Masa QR: `OutletTable` imzalı token; toplu üretim/indirme; etiket (Ş-14, CAB-03).
- Garson masa ataması (`TableAssignment`): kasa/şef garson ekranından; vardiya başında toplu, anlık değişiklik.

### 7.2 Misafir akışı
`/q/{tableToken}` → dil → outlet teması → kategori ağacı → öğe detayı (görsel, açıklama, alerjen, fiyat*) → sepet (adet, not) → **Siparişi Gönder** (`orderingEnabled` ve modül açık ise) → durum ekranı (Gönderildi → Onaylandı → Hazır → Servis) SSE ile canlı; **Garson Çağır** (WaiterCall). Sipariş durum sayfası `localStorage`'daki idempotencyKey ile yeniden açılabilir.

### 7.3 Sipariş durumları (MASA)
`GONDERILDI` → `ONAYLANDI` (kasa veya yetkili garson; aynı anda KDS + PrintJob) → `HAZIR` (KDS) → `SERVIS_EDILDI` (garson) · `REDDEDILDI` (onaycı, sebep) · `IPTAL` (onaydan sonra şef garson/kasa, sebep). Her geçiş `OrderEvent`.
- Onay kuyruğu alıcıları: outletin online **kasa** oturumları + masa ataması varsa **o garson**, yoksa outletteki tüm online garsonlar; şef garson/F&B müdürü her masayı görür. 2 dk içinde onay yoksa eskalasyon bildirimi şef garsona (ayar).
- KDS ekranı (`/kds`): outlet bazlı, sütunlar Yeni/Hazırlanıyor/Hazır, geçen süre renkleri (0–5 yeşil, 5–10 sarı, 10+ kırmızı), "Hazır" → garsona push + SSE, ses.
- Kasa ekranı (`/kasa`): masa durumları, onay kuyruğu, çağrılar (60 sn üstü kırmızı), masa ataması, fiş yeniden basma, yazıcı durumu.
- Garson ekranı (`/garson`, PWA): atanmış masalar, onay kuyruğu, çağrılar, "servis edildi", outlet değiştir.

### 7.4 Fiş
Onayda `PrintJob(FIS)`: başlık (otel/outlet), sipariş no, masa, saat, garson, kalemler (ad × adet, not), `pricesShown` ise birim/tutar/toplam ve "Ödeme belgesi değildir", değilse fiyatsız; kesim. Gateway cp857 ile basar; hata → 3 deneme, sonra kasaya bildirim ve "yeniden bas" düğmesi.

---

## 8. QR Oda Servisi
- Her otelde `Outlet(type=ODA_SERVISI)` (seed ile oluşturulur, menü boş); menü ağacı aynı yapı; fiyat kuralı aynı.
- Misafir `/q/{roomToken}` oda sayfasında iki kart: **MyBar** (minibar modülü açıksa) ve **Oda Servisi** (modül açıksa). Oda servisi menüsü → sepet → gönder → durum ekranı.
- Durumlar: `GONDERILDI` → (`phoneConfirmRequired` ise) `TEYIT_BEKLIYOR` → `ONAYLANDI` (hazırlanıyor) → `HAZIR` → `YOLDA` → `TESLIM_EDILDI` · `IPTAL` (sebep). Teyit adımı kapalıysa GONDERILDI doğrudan oda servisi ekranında "Onayla" ile ONAYLANDI olur.
- Oda servisi ekranı (`/oda-servisi`): yeni talepler anlık (SSE + ses), oda no + dahili numara gösterimi, "Telefonla teyit edildi" düğmesi, hazır/yolda/teslim, isteğe bağlı yazıcı. SLA sayaçları (ayar `rs.slaMinutes`, varsayılan 30) ve rapor.

---

## 9. Gerçek zaman, bildirim, yazdırma

### 9.1 Olay yayını
`publish(event)` transaction commit sonrası `NOTIFY merit_events, '{type, hotelId, outletId?, roomId?, userIds?, payload}'`. Tek uzun ömürlü `pg` istemcisi `LISTEN` eder, bellek içi EventEmitter'a dağıtır. `/api/sse` (Route Handler, Node runtime) oturumdan kapsamı okur (hotelIds, outletId, userId, rol) ve yalnız eşleşen olayları yazar; 25 sn'de bir `ping`. Çoklu süreçte de çalışır (her süreç kendi LISTEN'ı).
Olay tipleri: `notification.created`, `mybar.created|seen|completed|cancelled`, `order.created|approved|ready|served|rejected|cancelled`, `call.created|resolved`, `menu.availability`, `price.display`, `stock.critical`, `dnd.*`, `task.*`, `session.*`, `print.*`, `scan.room|table` (radar).

### 9.2 Bildirim
`notify({recipients: userIds | {hotelId, roles[]}, type, title, body, ref})` → alıcı başına `Notification` + SSE + (abone ise) Web Push. Okundu kullanıcı bazlı. Bildirim merkezi (çan) tüm ekranlarda; son 7 gün. Push izni personel ekranlarında istenir; VAPID anahtarları ortam değişkeni.

### 9.3 Yazdırma
`tools/print-gateway`: `.env` (API_URL, GATEWAY_KEY, HOTEL_CODE), 2 sn'de bir `GET /api/print-queue?hotel=` (yalnız KUYRUKTA), `BASILIYOR` kilidi, ESC/POS üretimi (init, hizalama, çift boy başlık, satırlar, kesim; cp857), `TCP ip:port` 3 sn zaman aşımı, sonuç `POST /api/print-queue/{id}` (BASILDI/HATA + mesaj). Yazıcı ping durumu `Printer.lastSeenAt/lastStatus` → Yazıcılar penceresi ve kasa ekranı. "Test fişi" düğmesi.

---

## 10. Zaman ve iş günü
`lib/time.ts`: `businessDate(d = now) = formatInTimeZone(d, 'Europe/Nicosia', 'yyyy-MM-dd')`. MyBar günlük sınır, DND günlük kayıt, görev tarihi, raporlardaki "bugün", gün sonu işleri hep bu fonksiyonla. Cron tanımları pg-boss'ta `tz: 'Europe/Nicosia'`. DB'de `timestamptz`; `Date` tipli alanlar iş günüdür.

## 11. Ayar anahtarları (varsayılanlar)
`session.maxOnlineMinutes=480`, `session.minibarMaxOnlineMinutes=600`, `session.warnBeforeMinutes=60`, `session.idleMinutes=45`, `session.singleDevice=true`, `session.singleTargetAuto=true`, `shell.confirmSimpleActions=true`, `shell.mobileDefinitions=false`,
`mybar.dailyLimit=true`, `mybar.quantityMode=QTY|TICK (QTY)`, `mybar.maxQtyPerItem=setup`, `mybar.translateNotes=true`,
`dnd.minChecks=2`, `dnd.recheckMinutes=120`, `stock.defaultCriticalLevel=50`, `stock.requestSafetyFactor=1.5`,
`price.display=HIDE`, `price.currency=EUR`, `order.approvalEscalationMinutes=2`, `order.callAlertSeconds=60`, `rs.slaMinutes=30`,
`email.*` bayrakları, `occupancy.fileRetentionDays=4`, `qr.baseUrl`.
Otel satırı sistem satırını ezer; ekran: Ayarlar penceresi (sekmeli), değişiklikler audit + SSE `settings.changed`.

---

## 12. Veri göçü (`scripts/migrate-from-minibarlatest`)
- Girdi: canlı PostgreSQL yedeği `minibar_legacy` adıyla lokal sunucuya restore edilir (`pg_restore`). Script `LEGACY_DATABASE_URL` ve `DATABASE_URL` ile çalışır; **idempotent** (`legacy_id_map(entity, legacyId, newId)` tablosu), kuru çalıştırma (`--dry-run`) ve fark raporu (`migration-report.md`).
- Eşleme (özet):

| Legacy | Yeni | Not |
|---|---|---|
| `oteller` | `Hotel` | 3 otel; `code` ad eşlemesiyle (Diamond→MRD, Royal→MR, Premium→MRP); logo base64 → dosya |
| `katlar` / `odalar` / `oda_tipleri` | `Floor` / `Room` / `RoomType` | oda tipi global → otel başına kopya (kullanıldığı oteller); `oda_no` otel bazlı unique'e; `qr_kod_token` korunur (eski 6 haneli tokenlar **geçerli kalır**, yeniden üretim önerilir) |
| `urun_gruplari` / `urunler` | `ProductGroup` / `Product` | fiyat/kâr alanları taşınır |
| `setuplar` / `setup_icerik` / `oda_tipi_setup` | `Setup` / `SetupItem` / `RoomTypeSetup` | tekrar eden setup_icerik satırları toplanır |
| `kullanicilar` / `kullanici_otel` | `User` / `UserHotel` | rol eşlemesi: sistem_yoneticisi→R-SYS, admin→R-OTM, depo_sorumlusu→R-DEP, kat_sorumlusu→R-KAT; Werkzeug `pbkdf2:sha256` hash'leri **doğrulanabilir** şekilde taşınır (auth, legacy hash'i ilk girişte bcrypt'e yükseltir) |
| `otel_zimmet_stok` / `personel_zimmet_kullanim` | `HotelStock` / `HotelStockMovement` | kullanım tipleri → KULLANIM/MYBAR/IADE/DUZELTME; girişler `GOC` tipi açılış hareketi |
| `personel_zimmet*`, `zimmet_sablon*` | — | Yalnız arşiv tablosu `legacy_personel_zimmet` (JSON) olarak saklanır |
| `minibar_islemleri` / `minibar_islem_detay` | `MinibarTransaction(+Item)` | `setup_kontrol`→SETUP_KONTROL, `sarfiyat_yok`→SARFIYAT_YOK, MyBar kaynaklı `ekstra_ekleme`→MYBAR_KARSILAMA (talep eşleşmesiyle), diğerleri `LEGACY` + `legacyType` |
| `oda_kontrol_kayitlari` | `RoomCheck` | |
| `oda_dnd_kayitlari` / `oda_dnd_kontrolleri` / `dnd_kontroller` | `RoomDnd` / `RoomDndCheck` | eski görev bağlı DND'ler kayıt+kontrol olarak birleştirilir |
| `minibar_dolum_talepleri` / `_detay` | `MybarRequest(+Item)` | `requestedQty=1`; durumlar beklemede/tamamlandi/iptal; `businessDate` talep tarihinden |
| `misafir_kayitlari` / `dosya_yuklemeleri` / `yukleme_gorevleri` | `GuestRecord` / `OccupancyUpload` / `UploadTask` | |
| `gunluk_gorevler` / `gorev_detaylari` / `gorev_durum_loglari` | `DailyTask(+Item)` / `TaskStatusLog` | yükleme tipi görevler `UploadTask`'a |
| `kat_sorumlusu_siparis_talepleri` (+detay) | `StockRequest(+Item)` | |
| `bildirimler` | `Notification` | rol hedefli satırlar o roldeki kullanıcılara açılır (okundu durumu rol bazlı kopyalanır) |
| `audit_logs`, `sistem_loglari`, `qr_kod_okutma_loglari` | `AuditLog`, `QrScanLog` | |
| `email_ayarlari` / `email_loglari` | `EmailSetting` / `EmailLog` | |
| `ana_depo_*`, `urun_stok`, `stok_fifo_*`, `stok_hareketleri`, ML, developer tabloları | — | taşınmaz (kapsam dışı); yedek arşivde kalır |
- Doğrulama: satır sayıları, havuz bakiyesi (`total − used = remaining`), oda/talep/işlem eşleşmeleri; rapor üretilir.

---

## 13. Hata yönetimi ve test

### 13.1 Hata yönetimi
- Server Action'lar `Result<T, DomainError>` döner (`ok`, `error.code`, `error.message`, `fieldErrors`); UI kodu çeviriyle gösterir. İstisnalar yalnız beklenmeyen hatalarda; `error.id` ile loglanır.
- Alan kuralları (stok yeterliliği, günlük sınır, durum geçişleri) transaction içinde, satır kilidiyle; çakışma → `CONFLICT`.
- Misafir gönderimlerinde `idempotencyKey`; tekrar gönderim aynı kaydı döner.
- SSE kopunca istemci üstel geri çekilme ile yeniden bağlanır; bağlantı yokken sayfa son durumu gösterir ve "çevrimdışı" rozeti çıkar. Saha formları gönderim sırasında kuyruklanmaz (v1), yalnız yeniden deneme düğmesi.
- Yazıcı hataları kuyrukta kalır, kasaya bildirim.

### 13.2 Testler
- **Vitest (birim/servis, gerçek Postgres test DB'si):** tüketim kuralı ve günlük setup sınırı; havuz düşümü/iade/yetersiz stok; DND sayacı, eşik, otomatik tamamlanma, gün sonu; MyBar günlük sınır (açık/kapalı), idempotency, karşılama ve kapatma kuralları; görev üretimi ve öncelik planı; `can()` matrisi; oturum süresi/uyarı/tek cihaz; fiyat gösterimi çözümleme (sistem→outlet); sipariş durum makinesi ve onay alıcıları; iş günü hesapları (gece yarısı, yaz saati).
- **Playwright (e2e):** giriş → outlet seçimi → online; oda kontrol +1 → havuz düşer → rapor; MyBar misafir gönderimi → kat sorumlusu onay penceresi → karşılama → kapatma; aynı odadan ikinci talep 409; masa QR → sipariş → kasa onayı → KDS → hazır → servis; fiyat anahtarı → misafir menüsü anında değişir; XP kabuğu: pencere aç/kapat/sürükle, kısayol ekle, yetkisiz simge görünmez; zorla çıkış.
- **Göç testi:** örnek legacy dump ile script → doğrulama raporu sıfır fark.

---

## 14. Alt projeler ve teslimatlar
| # | Alt proje | Teslimat |
|---|---|---|
| P0 | İskelet | Next.js 16 + Prisma 7 + Tailwind 4 kurulumu, Prisma şeması (tüm modeller), seed (3 otel, roller, ekranlar, ayarlar, oda servisi outletleri, ilk sistem yöneticisi), auth + oturum, `can()`, `lib/*`, XP kabuğu çekirdeği (masaüstü, pencere, Başlat, görev çubuğu, registry) + "Komuta Merkezi" penceresi, SSE altyapısı, pg-boss, CI (lint/tip/test) |
| P1 | Çekirdek tanımlar ve oturum | Otel/kat/oda/oda tipi/outlet/masa/kullanıcı/rol/yetki matrisi/ekran kataloğu pencereleri, kurulum rehberi, giriş akışı ve `/secim`, online kullanıcı takibi, bildirim merkezi, denetim günlüğü, ayarlar, Android kabuk |
| P2 | Minibar tanımlar + göç | Ürün grubu/ürün/setup/atama pencereleri, oda QR üretimi, havuz giriş/iade, `scripts/migrate-from-minibarlatest` ve doğrulama |
| P3 | Minibar operasyon | Kat sorumlusu PWA (kat planı, kat doluluk, QR okuyucu, oda kontrolü, DND, stoklarım, kritik, ek talep, işlemlerim), depo ekranları (havuz, talepler, doluluk yükleme), görevler ve öncelik planı, DND işleri |
| P4 | MyBar + bildirim | Misafir oda sayfası (5 dil), MyBar talep/karşılama/kapatma/iptal ekranları, zorunlu onay penceresi, Web Push |
| P5 | QR Menü + Sipariş | Menü ağacı/çeviri/tema/masa QR pencereleri, fiyat ve sipariş anahtarları, misafir menü + sepet + durum, garson/kasa/KDS ekranları, masa ataması, print gateway ve Yazıcılar penceresi |
| P6 | Oda servisi | Oda servisi menüsü, misafir akışı, oda servisi ekranı, teyit adımı, SLA |
| P7 | Raporlar + e-posta + izleme | Rapor merkezi (tüm raporlar, Excel/PDF), SMTP ve zamanlanmış e-postalar, Komuta Merkezi canlı radar ve KPI'lar |
| P8 | Kabul | E2E paket, yük denemesi (300 misafir + 40 personel), kullanım kılavuzları, kurulum belgesi (bulut/on-prem), eğitim verisi |

Her alt proje için `superpowers:writing-plans` ile ayrı uygulama planı yazılır; P0 → P1 → P2 → P3 → P4 sıralı, P5 ve P6 P1 sonrası paralel yürütülebilir, P7 ve P8 sonda.

## 15. Kabul kriterleri (özet)
1. 3 otel seed'de, silinemez; otel bazlı modül kapatılabilir.
2. Yetkisiz ekran/veri erişimi engellenir ve günlüğe yazılır; XP'de yetkisiz simge görünmez.
3. Oturum: azami süre, uyarı, hareketsizlik, tek cihaz, zorla çıkış kuralları çalışır; online liste ≤2 sn gecikme.
4. Oda kontrolü: +N → havuz düşer → rapor birebir; günlük setup sınırı sunucuda; Sarfiyat Yok ve DND görev kalemini kapatır; DND 2 kontrolle tamamlanır, 120 dk hatırlatma, gün sonu EKSIK.
5. MyBar: aynı odadan aynı iş gününde ikinci talep reddedilir (ayar açıkken); talep ≤3 sn içinde kat sorumlusunda görünür; eksik kapatma açıklama ister; iptal yalnız depo/yönetim.
6. Doluluk: 3 dosya yüklenince görevler üretilir; öncelik planı doğru sıralar.
7. QR sipariş: onaysız sipariş KDS/yazıcıya gitmez; onay kasa veya atanmış garson; fiyat kapalıyken misafir, fiş ve KDS'de tutar yok; `orderingEnabled=false` iken sipariş alınmaz.
8. Oda servisi: teyit adımı ayara göre var/yok; durumlar misafir ekranında canlı.
9. Göç: tüm eşlenen tablolarda satır sayıları ve bakiyeler raporda sıfır fark; eski QR tokenları çalışır.
10. Misafir ekranları 5 dilde, AR RTL; XP kabuğu dar ekranda Android görünümüne düşer.

## 16. Açık noktalar (uygulama sırasında netleşecek)
- Canlı yedeğin gerçek şeması (sürüm farkları) göç eşlemesini etkileyebilir; script esnek kolon kontrolü yapar.
- 18 outletin kesin listesi ve otellere dağılımı otel tarafından panelden girilecek.
- Not çevirisi sağlayıcısı (Google gtx uç noktası resmi değildir); kapatılabilir ayar.
- Yazıcı marka/modeli ve kod sayfası sahada doğrulanacak (varsayılan cp857).
