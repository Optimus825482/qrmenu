# Tutarlılık denetimi — belgeler ile depo arasındaki farklar (2 Kasım 2026)

Kapsam: `main` @ `b52da3b` ("tamam"), salt okunur denetim. Test, lint, build ve git yazma işlemi çalıştırılmadı; "geçiyor / kırık" hükümleri yalnız mevcut günlüklerden (`.superpowers/sdd/baseline-*.log`) veya kod okumasından çıkarıldı. `gh run list` ile yalnız GitHub Actions durumu okundu.

## 0. Yönetici özeti

- `b52da3b` ("tamam", 255 dosya, +45 109 satır, 2.11 20:03) P2–P4, P6, P7 ve kabuk işlerinin **tamamını tek commit** olarak getiriyor. `ilerleme-data.js` bu işlere 02.11 03:30–09:25 saatleri veriyor, ancak bu saatlerde commit yok; zaman damgaları git ile doğrulanamıyor.
- Aynı commit'te **minibar/MyBar/rapor/e-posta/iş testi yok**. Yalnız oda servisi için birim testleri eklenmiş (`room-order`, `room-order-machine`, `room-state`, `room-recipients`, `rs-schema`, `guest-state-rs`, ayrıca `menu-access`, `admin-rooms`). e2e'de minibar/oda servisi senaryosu yok.
- P2/P3/P4/P7 kodu planlardan bağımsız bir prototip (`minibarService.ts` 1874 satır, `/depo/*` ve `/kat/*` büyük istemci sayfaları). Planlardaki `pool.ts`, `checklist.ts`, `stockStatus.ts`, DND servisi, rapor motoru, e-posta kuyruğu, radar servisi dosyaları yok. `/api/minibar/*` yüzeyinde yetki denetimi yok.
- GitHub Actions: son 13 koşunun 13'ü `failure`; `check` işi 0 adımla bitiyor (runner/hesap kaynaklı görünüyor, kod hatası değil). CI hiç yeşile dönmedi; yeşil olsa bile baseline'daki 27 birim test hatası ve lint hataları kapıyı geçirmezdi.
- Belge çelişkilerinin çoğu `docs/DEVIR.md` §1/§1a'da (P5 "main'e birleştirilmedi", P2–P8 "uygulanmadı", T10 "sıradaki" vb.).

Sayımlar (ayrıntı aşağıda):

| Konu | Sonuç |
|---|---|
| `ilerleme-data.js` iddiaları (17 `done` görev + 6 başlık iddiası = 23) | 2 doğrulandı, 17 kısmen, 4 doğrulanamadı/çelişkili |
| 02.11 günlük satırlarından ek 7 iddia | 4 doğrulandı, 2 kısmen, 1 doğrulanamadı |
| Ertelenmiş madde kaydı (§3.1–§3.5, 53 madde) | 19 kapalı, 34 açık; ayrıca 7 yeni açık madde (§3.6) |
| Spec §15 (10 kriter) | 4 karşılandı (uygulandı+test), 3 uygulandı ama testsiz/kısmi, 3 eksik/çelişkili |

## 1. İddia ve kod karşılaştırması

Hüküm anahtarı: **D** = kodda var ve iddiayla uyumlu; **K** = kod var ama iddia kapsamının önemli kısmı eksik/yanlış; **Y** = iddia doğrulanamadı veya kodla çelişiyor. "Test" sütunu `merit/tests` altında ilgili test olup olmadığını gösterir.

### 1.1 P2 – Minibar tanımları ve veri göçü

| # | `ilerleme-data.js` görevi | Hüküm | Kanıt / eksik | Test |
|---|---|---|---|---|
| 1 | Ürün grubu, ürün, setup, oda tipi–setup atama pencereleri (fiyatsız) | K | Servis `minibarDefinitionsService.ts` (1021 sat.), 7 route `src/app/api/minibar/definitions/*`, ekran `src/app/depo/tanimlar/page.tsx` (1954 sat., iframe uygulaması `minibar.tanim`). Route'ların hiçbirinde `assertCan`/`can` yok; 7 tanım route'unda kimlik denetimi hiç yok. "Fiyatsız" yalnız arayüz için doğru: `Product.purchasePrice/salePrice` hâlâ yazılıyor/dönüyor (`minibarDefinitionsService.ts:187-188,240-241`, `depoService.ts:93,269,276`). Ürün/grup/setup otelden bağımsız global. Kurulum rehberi adımı bağlanmamış (`kurulum.md` "9. P2 ile gelir"). | Yok |
| 2 | Oda QR üretimi (HMAC), SVG/PNG/ZIP, yazdırma şablonu | K | HMAC token (`generateQrToken("ROOM")`, `roomQr.ts:74,128`), tekli SVG/PNG (`/api/qr/room/[roomId]`), otel ZIP (`/api/qr/hotel/[hotelId]/room-zip`), pencere `RoomQrWindow.tsx`. **Yazdırma şablonu yok** (roomQr/RoomQrWindow/RoomQrModal içinde "print/yazdır" geçmiyor; `/api/qr/room` altında baskı sayfası yok). Misafir mesajı yok. Yetki yalnız `ctx.hotelIds.includes()`; `MB-KF` ekran kodu denetlenmiyor. | Yok |
| 3 | Otel zimmet havuzu: giriş, iade, düzeltme, kritik seviye | K | `depoService.adjustHotelConsignmentStock` (giriş/düzeltme, `StockMovementType`), `HotelStock.criticalLevel`, `/depo/stok`. Yok: `pool.ts`, ayrı iade akışı, kritik seviye bildirimi (`minibar/server` içinde bildirim yok), yetki, satır kilidi (okuma-sonra-yazma). Her isteğe bağlı sahte stok tohumu: `ensureHotelStockSeed` (`minibarService.ts:27`, çağrılar `:280,569`) ürün başına 120 adet yazıyor. | Yok |
| 4 | Göç scripti: tanımlar + işlem geçmişi, doğrulama raporu | Y | `scripts/migrate-minibar-data.ts` yalnız 9 adım: otel eşleme (kod sabit DIAMOND/PREMIUM/ROYAL), grup, ürün, setup, setup kalemi, kat, oda tipi, oda tipi–setup, oda. **Taşınmayan:** kullanıcılar, otel logoları, zimmet/havuz bakiyeleri, minibar işlemleri, MyBar, oda kontrolleri, DND, doluluk, görevler, QR/denetim günlükleri, ek talepler, e-posta. `--dry-run`, `legacy_id_map`, satır sayısı/bakiye raporu yok; eşleme ada göre (`findFirst({where:{name}})`). Dosya adı spec'teki `scripts/migrate-from-minibarlatest` değil. **Satır 4'te sabit Postgres şifresi** (`LEGACY_URL`), commit'li ve GitHub'a itilmiş. | Yok |

### 1.2 P3 – Minibar operasyonu

| # | Görev | Hüküm | Kanıt / eksik | Test |
|---|---|---|---|---|
| 1 | Kat PWA `/kat`: kat planı, kat doluluk, kamera QR okuyucu | K | `src/app/kat/page.tsx`, `kat/doluluk/[floorId]`, `kat/qr`, `RoomQrModal.tsx`. QR okuyucu yalnız `getUserMedia` + `BarcodeDetector` (`RoomQrModal.tsx:32-93`; Safari/Firefox'ta desteklenmez, `html5-qrcode` bağımlılığı yok). `/kat` için ayrı manifest yok (`api/manifest` yalnız `garson`, `guest`). `/kat` ve `/depo` sayfaları istemci bileşeni; sunucu tarafı oturum doğrulaması yok, `proxy.ts` yalnız çerez varlığına bakıyor. | Yok |
| 2 | Oda kontrolü: +N ikame, Sarfiyat Yok, DND (2 kontrol, 120 dk, gün sonu) | Y | +N ve Sarfiyat Yok var (`submitRoomCheck`, `minibarService.ts:715-833`). **DND kodda 3 kontrol / 60 dk sabit** (`:934-942`); `dnd.minChecks`(2) / `dnd.recheckMinutes`(120) ayarları tanımlı (`settings-defs.ts:22-23,61-62`) ama hiçbir yerde okunmuyor. **23:59 işi sayıp loglamaktan ibaret**, EKSIK'e çevirmiyor (`minibarJobs.ts:397-410`). İş günü UTC gece yarısı (`minibarService.ts:17`), `lib/time.ts` kullanılmıyor. Günlük setup sınırı sunucuda yok (`maxTargetQty` yalnız görüntü, `:1312`). Havuz düşümü satır kilidi olmadan okuma-sonra-yazma (`:728-748`). Rapor sayfası "3x DND ile kapananlar" gösteriyor (`depo/raporlar/page.tsx:476`). | Yok |
| 3 | Stoklarım, kritik stoklar, depodan ek talep; işlemlerim | K | Yalnız "işlemlerim" (`kat/islemlerim/page.tsx`) ve düzeltme onayı (`kat/duzeltme-onay`) var. Stoklarım, Kritik Stoklar, Ek Talep, Ürün Geçmişi ekranları ve `StockRequest` servisi yok (modelin kodda kullanımı sıfır). | Yok |
| 4 | Depo ekranları: havuz, talepler, doluluk Excel (inhouse/arrivals/departures) | K | Havuz (`/depo/stok`), doluluk yükleme (`/depo/doluluk-yukle`, `occupancyUploadService.ts`, `exceljs`) var; **talepler ekranı yok** (`MB-TAL` ekran kodu `screens.ts:28`'de var, sayfa yok). Yükleme yetkisi `can()` yerine sabit rol kodu listesi (`occupancy/upload/route.ts:14`: R-SYS, R-DEP, R-FBM, **R-OTM**). | Yok |
| 5 | Günlük görevler, akıllı tavsiye iş planı; 10:00 doluluk ve 09:00 günlük rapor e-postası | K | `priority-plan` route, `tavsiye-is-plani` sayfası, `minibarJobs.ts` e-posta işleri var. **00:01 "görev üretimi" gerçek görev üretmiyor:** `runDailyTaskGeneration` yalnız `ensureSampleOccupancySeed` çağırıyor (`minibarJobs.ts:379-391`), ilk 45 odaya **uydurma** inhouse/arrival/departure verisi yazıyor (`minibarService.ts:57-…`). `UploadTask` üretimi yok. 10:00/18:00 uyarısı yalnız e-posta (bildirim yok). | Yok |

### 1.3 P4 – MyBar ve bildirimler

| # | Görev | Hüküm | Kanıt / eksik | Test |
|---|---|---|---|---|
| 1 | Misafir oda sayfası (TR/EN/DE/RU/AR, RTL) ve MyBar talebi | K | `MybarGuestScreen.tsx` (5 dil, kendi sözlüğü, RTL), `(guest)/q/[token]/layout.tsx:88` ROOM → MyBar. API `/api/minibar/mybar/request` **token doğrulamaz**: `roomId` + `hotelId` sorgu/gövde parametresi alır, hız sınırı yok, IP `x-forwarded-for` ilk girdisi (sahtelenebilir). Günlük sınır her zaman 1 (`mybar.dailyLimit` okunmuyor); `mybar.translateNotes` okunmuyor. `guest.ipRateMultiplier` yok. | Yok |
| 2 | Zorunlu onay penceresi, karşılama, kapatma, iptal | K | `PersistentMybarModal.tsx` + `POST /api/minibar/mybar/confirm` var; modal **15 sn yoklama** (`:85`), SSE yok. `confirmMybarRequest` (`minibarService.ts:1207`) yalnız durumu TAMAMLANDI yapıyor: havuzdan düşmüyor, `MYBAR_KARSILAMA` işlemi yazmıyor, "Gördüm", açıklamalı eksik kapatma, depo/yönetim iptali yok; "MyBar Talepleri" depo penceresi yok (`MB-PERS` yalnız ekran kodu). | Yok |
| 3 | Web Push kanalı | Y | Kodda yok: `public/sw.js` içinde `push` olayı yok, abonelik route'u yok, VAPID env yok, `web-push` hiçbir kaynak dosyada kullanılmıyor (yalnız `package.json` ve üretilmiş Prisma istemcisi). `PushSubscription` modeli var, kullanılmıyor. | Yok |

### 1.4 P6 – Oda servisi

| # | Görev | Hüküm | Kanıt / eksik | Test |
|---|---|---|---|---|
| 1 | Oda servisi menüsü, şema migration'ı, misafir akışı | K | Migration `20261102033000_p6_oda_servisi` (orders SLA/teslim kolonları, `rooms.extension`), pencereler `roomServiceApps.ts` (`rs.menu/tema/kayitlar/rapor`), sunucu akışı `roomService/roomOrder.ts`, `roomState.ts`, API `/api/q/[token]/order` (ROOM dalı). **Misafir arayüzü yok:** ROOM token'ı yalnız `MybarGuestScreen` gösteriyor; oda servisi kartı/menü/seçimler/durum sayfası çizilmiyor (`RoomPlaceholder.tsx` yer tutucu). | Birim: `room-order`, `room-order-machine`, `room-state`, `room-recipients`, `rs-schema`, `guest-state-rs` |
| 2 | Mutfak/servis ekranı, telefon teyidi, teslim, SLA göstergesi | D | `(ops)/oda-servisi/{page,OdaServisiClient,teyit,teslim}`, `transitions.ts` (TEYIT_BEKLIYOR), teyit outlet bayrağından (`phoneConfirmRequired`, `roomState.ts:122`). SLA yalnız **okuma anında** hesaplanıyor: `slaWarnedAt/slaBreachedAt` hiçbir yerde yazılmıyor, SLA tarama/eskalasyon işi `jobs.ts`'te yok (plan T6). | Makine/alıcı birim testleri; e2e yok |

### 1.5 P7 – Rapor, e-posta, izleme

| # | Görev | Hüküm | Kanıt / eksik | Test |
|---|---|---|---|---|
| 1 | Rapor merkezi: tüketim, zimmet, görev, DND, MyBar, anormal | K | `CentralReportsWindow.tsx` + `centralReports.ts` (`CR-RAP`, `core/apps.ts:191`), `/depo/raporlar`, `abnormalConsumptionService.ts` (14 günlük hareketli ortalama var). **Dışa aktarım yalnız CSV** (`CentralReportsWindow.tsx:78-100`); Excel/PDF yok, `pdfkit` bağımlılığı yok. MyBar/zimmet hareketi/kritik stok/oturum raporları yok. | Yok |
| 2 | SMTP motoru, 10:00 doluluk ve 09:00 özet e-postası | K | `lib/mailer.ts` yalnız `process.env.SMTP_*` okuyor (DB ayarı, sır kutusu, test gönderimi, kuyruk, yeniden deneme, `EmailLog` yok; `EmailSetting/EmailLog` modelleri kullanılmıyor). SMTP yoksa "MAIL MOCK" olarak `true` döner (gönderildi sayılır). Alıcılar: tüm SISTEM/MINIBAR/YONETIM kullanıcıları, **otel kapsamı ve `email.*Enabled` bayrakları yok sayılıyor** (`minibarJobs.ts:46-62,205-217`). Saat 09:00 (plan 08:00/08:05). | Yok |
| 3 | Komuta Merkezi canlı radar, KPI, PDF/Excel dışa aktarım | K | `commandCenter.ts:15-127` radar (doluluk %, aktif MyBar, geciken oda servisi, bekleyen POS) + `CommandCenter.tsx`. Kat ısı haritası, metrik kaydı, mobil İzleme yok; PDF/Excel yok (CSV). | `commandCenter.test.ts` (eski KPI) |

### 1.6 Başlık iddiaları (`headline`, 02.11 09:30)

| İddia | Hüküm | Not |
|---|---|---|
| "P2–P7 tüm eksik modüller tamamlandı" | Y | Bölüm 1.1–1.5 ile çelişiyor; `.superpowers/sdd/2026-11-02-son-kontrol/progress.md` R2 satırı da aynı sonuca varmış ("0/28 Done, ~14 Partial"). |
| Oda QR Motoru | K | Yazdırma şablonu ve misafir mesajı yok (1.1 #2). |
| Oda Servisi Operasyon & SLA Portalı (`/oda-servisi`) | D | Ekran var; SLA eskalasyon/tarama işi yok (1.4 #2). |
| Merkezi Raporlama (CR-RAP) | K | Yalnız CSV, planlanan 15 rapor yok. |
| Canlı Komuta Radarı | K | 4 sayaç; ısı haritası/mobil yok. |
| Arka plan zamanlanmış işleri | K | 5 cron kayıtlı (`jobs.ts`): 00:01 sahte veri, 23:59 işlevsiz, 09:00 ve 10:00/18:00 e-postalar bayraksız. |

### 1.7 02.11 günlük satırlarından ek iddialar

| Satır | Hüküm | Not |
|---|---|---|
| 07:45 "5 Ana Kategori Klasörü" | D | `CategoryFolderWindow.tsx`; uygulamalarda 7 kategori kodu var (GENEL, KULLANICI, MINIBAR, OUTLET, QR_ORDER, ROOM_SERVICE, SISTEM), "5" yaklaşık. |
| 08:15 "19 ikon" Luna paketi | D | `shell/icons.tsx` ~20 ikon tanımı; sayım kesin değil. |
| 08:35 "fiyat/maliyet/TL temizlendi" | K | Arayüz sayfalarında fiyat yok, ama servis ve API fiyat/maliyet hesaplıyor/dönüyor (1.1 #1). |
| 08:45 Anormal Tüketim Motoru | D | `abnormalConsumptionService.ts` (oda bazlı + ürün bazlı 14 gün). Test yok. |
| 08:55 Excel yükleme yetkisi R-DEP/R-FBM/R-SYS "kilitlendi" | K | Sabit rol listesinde ayrıca R-OTM var; RBAC matrisiyle (`can`) bağlı değil. |
| 09:05 Kasa tablet / QR okutunca anlık bildirim, "Misafir Masada", "Masa Bilgisi & Adisyon Aç" | D | `GarsonClient.tsx:137,150`, `TableBoard.tsx`, `KasaClient.tsx` (kod incelemesi; çalıştırılmadı). |
| 09:25 "ESLint ve TypeScript sıfır hata" | Y | Doğrulanamadı: 01.11 baseline lint 4 hata (`baseline-check.log`); ardından `next.config.ts` build'de tip denetimini kapattı (`ignoreBuildErrors: true`, cea5f99). Bu denetimde lint/tsc çalıştırılmadı. |

### 1.8 P8

`ilerleme-data.js` P8'i `active`/`pending` gösteriyor ve bu doğru: `docs/kabul/` boştu; kabul paketi, yük denemesi, `seed-demo.ts`, kılavuzlar, eğitim verisi yok. Kısmen var olan: nginx/systemd/yedek yönergesi (`docs/kurulum.md` §5-8). "Uçtan uca kabul paketi ve yük denemesi" `active` ama karşılığında kod yok.

## 2. `docs/DEVIR.md` doğruluğu

Hangisi doğru? **İlerleme de DEVIR tablosu da tam doğru değil.** Kod P2–P4, P6, P7 için var (prototip kalitesinde, planla uyumsuz); "uygulanmadı" yanlış, "tamamlandı" da yanlış. P8 uygulanmadı (DEVIR doğru). P5 ve Menü Tasarım Merkezi `main`'de.

| Yer | Eski cümle | Düzeltme |
|---|---|---|
| Üst bilgi (satır 3) | "Tarih: 31 Ekim 2026" | Belge 1–2 Kasım olaylarını da içeriyor; tarih/sürüm satırı güncellenmeli. |
| §1 tablo, P5 satırı | "dal `p5/qr-menu`; `main`'e birleştirme kullanıcı onayını bekliyor" | `p5/qr-menu` ile `main` aynı geçmişte; Menü Tasarım Merkezi ve Docker commit'leri `main` üzerinde, `origin/main` ve `origin/p5/qr-menu` var. Birleştirildi ve itildi. |
| §1 tablo, P2/P3/P4/P6/P7 | "Plan yazıldı…, uygulanmadı" | Kod `b52da3b`'de var; satır "prototip var, plana uygun değil, üretime kapalı" olmalı (bkz. §1). |
| §1 tablo, P8 | "uygulanmadı" | Doğru. |
| §1 tablo | Menü Tasarım Merkezi ve Docker/Coolify satırları yok | Eklenmeli (commit'ler `93b4098`…`ab21642`, `07df645`…`4d6376c`). |
| §1 satır 22 | "migration numarası `ls prisma/migrations`" | Adlandırma karıştı: `0001`–`0021`, sonra zaman damgalı (`20261101082744_menudes`, `20261101131500_…`, `20261102033000_…`). Üç şema değişikliği migration'sız (§3 N-01). |
| §1a satır 28 | "P5 planı uygulanıyor. Sıra: P5 → P2 …" | P5 bitti; P2–P7 tek commit'le geldi, sıra izlenmedi. |
| §1a satır 30-31, 37, 45 | "`main`'e merge/push yapılmadı (Erkan'ın onayı gerekli)" | Fiilen `main`'de ve `origin`'de (13 CI koşusu var). |
| §1a satır 32 | "Sıradaki görev **T10** … taze uygulayıcıyla başlat" | Aynı bölümde 38., 42., 44. satırlar T10–T14'ü tamamlanmış gösteriyor; satır silinmeli. |
| §1a satır 45 | "Yeni faz başlatılacaksa P2 planına geç" | P2–P7 için kod var; "sonraki adım" minibar modülünü planla uyumlu hâle getirmek/denetlemek olmalı. |
| §1a satır 56 | "`menuDesignCenter.spec.ts` 7/8 geçti; son senaryo başarısız…" | `ilerleme-data.js` bu iş için `done` (01.11 16:11) diyor; başarısız senaryonun kapandığı hiçbir yerde yok. Ya kapatılıp belgelenmeli ya da `done` geri alınmalı. |
| §1a satır 57 | e2e `merit` DB'yi sıfırlıyor; ayrı DB kurulmalı | Hâlâ doğru: `tests/e2e/fixtures.ts:18 resetAndSeed`; `playwright.config.ts` ayrı DB tanımlamıyor. Çözülmedi (D-37). |
| §1a satır 60 | "toplu commit yapılmadı…commit yoktur" | Menü merkezi commit'leri var (`93b4098`, `ebbf873`, `83a84d7`, `5cf9f1c`, `ab21642`). Menü merkezi defteri de T0 "commit atılmaz" kararını taşıyor ve T3–T9'u kaydetmiyor. |
| §1a satır 61 | "P2 Minibar tanımları planına geç" | P2 prototip olarak mevcut; "geç" yerine "planla uyumlu yeniden yaz/denetle". |
| §1a satır 44 | "seri Vitest 72 dosya/751 test" geçti | Menü merkezi baseline'ı (01.11 12:50) 726/753 ve 27 kırık gösteriyor; arada ne değiştiği açıklanmamış (D-36). |
| §2 | "Git: dal başına çalış…`main`'e fast-forward; commit kimliği Erkan Erdem" | Gerçek commit'ler `erkan <erkanerdem96@hotmail.com>`; son iş `main` üzerinde doğrudan. |
| §3.4 | "Her görev `npm run check` + e2e + `next build` yeşil olmadan commit edilmez" | `b52da3b` bu kuralla uyumsuz (test yok, build'de tip denetimi kapalı, CI kırmızı). |
| §4 Zaman | "iş günü `Europe/Nicosia` (`lib/time.ts`)" | Minibar kodu UTC kullanıyor (`minibarService.ts:17`). |
| §4 Yetki | "rol × otel × modül × ekran × işlem (`lib/rbac.ts`)" | `/api/minibar/*`, `/kat/*`, `/depo/*` bu modelin dışında. |
| §4 Kararlar | "DND 2 kontrolle tamam, 120 dk; MyBar ayarlanabilir" | Kod 3 kontrol / 60 dk, MyBar sınırı sabit. |
| §5 P2 | "`scripts/migrate-from-minibarlatest` (idempotent, `legacy_id_map`, `--dry-run`, rapor)" | Gerçek dosya `scripts/migrate-minibar-data.ts`; bunların hiçbiri yok. |
| §5 P5 | "P5 planı hazır ve uygulanıyor (dal `p5/qr-menu`)" | Bitti, `main`'de. |
| §6 | Pazartesi (3 Kasım) kontrol listesi | `npm run check` baseline'da kırık (27 birim test, 4 lint hatası); `prisma migrate diff` boş **değil** (N-01). |
| §7 | "`merit/.env` ve gerçek şifreler belgelere yazılmaz" | `scripts/migrate-minibar-data.ts:4` gerçek Postgres şifresini içeriyor (commit'li, itilmiş). `COOLIFY_DEPLOYMENT.md` ve `docker-compose.yaml` varsayılan `SEED_ADMIN_PASSWORD=Merit!2026` ve sabit varsayılan `SESSION_SECRET/QR_HMAC_SECRET/PRINT_GATEWAY_KEY` taşıyor. |
| §7 | "push yalnız kullanıcı isteğiyle" | 13 CI koşusu itilmiş commit'lere ait (1–2 Kasım); kullanıcı isteği belgelenmemiş. |
| Genel | Docker/Coolify, `COOKIE_SECURE`, seed'in admin şifresini her başlangıçta eşitlemesi, minibar prototipi hiç anılmıyor | Eklenmeli. |

## 3. Ertelenmiş madde kaydı

Durum: **Kapalı** (kodda kanıt) / **Açık** (kodda yok ya da değişmemiş). Kanıtı bulunamayanlar açık sayıldı; testler çalıştırılmadı.

### 3.1 P1 dal incelemesi P2 backlog'u (defter satır 89-91)

| ID | Madde | Durum | Kanıt |
|---|---|---|---|
| D-01 | `users.update` rol/otel değişince SSE kapsamı eskiyor (`session.closed` yayını) | Açık | `users.ts` update yalnız `publishUser(…,"update")` (≈satır 574); oturum kapatma/yenileme yok. |
| D-02 | Otel pasife alma kilidi | Kapalı (tasarımla) | Migration `0015_hotels_always_active` + `hotels.update` `isActive: true` zorluyor (`hotels.ts:134-138`). Yan etki: `hotelUpdateSchema.isActive` (satır 73) ölü alan; `admin-hotels.test.ts:294-308` hâlâ pasife almayı bekliyor (baseline'da zaten FAIL). |
| D-03 | Seed `CR-ONL` `canApprove` belgelensin | Kapalı | `roles.ts:54,137-139` (`ONLINE_FORCE` V,A,R), README "CR-ONL … zorla çıkış (`A`)". |
| D-04 | `users.ts` deny audit `hotelId` (SISTEM hedefte) | Açık | `rbac.ts:111-117` denetimi oturum otelindeki kayda yazıyor, hedef otel yalnız `after` içinde. |
| D-05 | Rol kopyalamada `defaultScreen` | Açık | `roles.ts:220` kaynak rolden yalnız `id` seçiliyor, `:231` `input.defaultScreen` kullanılıyor; kaynaktan devralınmıyor. |
| D-06 | `definitionChain` test adı | Açık | `tests/e2e/definitionChain.spec.ts` adı değişmemiş; ne istendiği defterde net değil. |

### 3.2 P5 T14'e ertelenen minörler (ledger T2–T8)

| ID | Madde | Durum | Kanıt |
|---|---|---|---|
| D-07 | `definitions`/`definitionChain` e2e `getByLabel('Outlet')` yarışı | Açık | `definitionChain.spec.ts:155,183`, `definitions.spec.ts:392,464` hâlâ `getByLabel("Outlet",{exact:true})`; karar `getByRole('combobox',{name:'Outlet'})` idi. |
| D-08 | `fieldErrors.items` `menuNodeId` de dönsün | Açık | `order/server/cart.ts:44-56` yalnız ad listesi. |
| D-09 | `selectionStore` satır kimliği (öğe+not) | Açık | `selectionStore.ts:29-31` `setQty/setItemNote/remove` yalnız `menuNodeId` ile. |
| D-10 | `readJsonBody` boyut sınırı | Açık | `lib/guest-api.ts:8-16` doğrudan `request.json()`. |
| D-11 | `waiterCalls` dedupe kilidi | Açık | `waiterCalls.ts:85-95` `findFirst` + `create`, kilit/benzersiz kısıt yok. |
| D-12 | `cart.*` anahtar adları | Açık (kozmetik) | `messages/tr.json:49` hâlâ `"cart"`; `cart.ts`, `validateCartItems`. Metinlerde "sepet" yok. |
| D-13 | `useLiveList` `realtime.resync` | Kapalı | `shell/ui/useLiveList.ts:13,112-115`. |
| D-14 | ThemeManager "Sepete ekle" ifadesi | Kapalı | `src` genelinde "sepet" geçmiyor. |
| D-15 | `ImageField` istemci boyut kontrolü | Açık | `ImageField.tsx` içinde boyut/MB denetimi yok. |
| D-16 | `guestState`'in `prisma/seed/menuThemes` içe aktarması `src/` sabitine taşınsın | Açık | `guestState.ts:3`. |
| D-17 | T6: `outletId`'siz `order.*` olayı sıkılaştırma; ItemSheet odak tuzağı | Açık (kısmen) | `useModalFocusTrap.ts` eklendi ve ItemSheet kullanıyor; olay sıkılaştırma kanıtı yok. |
| D-18 | T7: durum kontrolü yetkiden önce (CONFLICT, audit yok) | Açık (doğrulanamadı) | `orders.ts` `deny()` var (`:53`), sıra incelenmedi. |
| D-19 | T4: e2e reload/DB kalıcılık; assign/update/setDefault testleri | Açık (doğrulanamadı) | İncelenmedi. |

### 3.3 P5 T9 P3 maddeleri ve bağlayıcı kararlar

| ID | Madde | Durum | Kanıt |
|---|---|---|---|
| D-20 | `printJobs.report()` durum koruması (yalnız BASILIYOR) | Kapalı | `printJobs.ts:307`. |
| D-21 | `print.noPrinter` günlük tekilleştirme kilidi | Kapalı | `printJobs.ts:82` advisory lock; test `print-jobs.test.ts:121`. |
| D-22 | Global limiter geçerli tokenı reddetmesin | Kapalı | `guestToken.ts:142-197`, test `guest-token.test.ts:166-177`. Ruling netleştirmesi ("pasif hedefe çözünen token") yazılmadı; küçük açık nokta. |
| D-23 | Test: eşzamanlı `claim` (SKIP LOCKED) | Açık | `print-jobs.test.ts` yalnız noPrinter eşzamanlılığı. |
| D-24 | `guest.ipRateMultiplier` (NAT, P4 T1'e bağlayıcı) | Açık | `src` genelinde yok; MyBar gönderimi hiç hız sınırlı değil. |
| D-25 | Outlet düzenleme `price.display`/`ordering.changed` yayını (T4'e bağlayıcı) | Kapalı | `core/server/admin/outlets.ts:233-243`. |
| D-26 | DB hatası `HATA` → 503/yeniden dene ekranı | Kapalı | `unavailable.tsx:14`, `api/q/[token]/events/route.ts:41`. |
| D-27 | SVG yanıtına CSP sandbox | Kapalı | `uploads/[...path]/route.ts:18-20`. |
| D-28 | `menuImages` yetkiyi dosya yazımından önce; `wx` ile ezmeme | Kapalı | `menuImages.ts:88-89,184-185,250-251`, `lib/uploads.ts:51`. |
| D-29 | Güvenilir vekil `clientIp` + CSV formül öneki | Kapalı | `rate-limit.ts:79-85`, `tableQr.ts:247`. |
| D-30 | `ESC t 13` / `CODEPAGE_TABLE` saha doğrulaması | Açık | Yalnız belgelenmiş (README/kurulum); sahada doğrulanmadı. |
| D-31 | "Seçimler" terminolojisi (UI) | Kapalı | `src` içinde "sepet" yok. |
| D-32 | `tools/**` kök tsconfig/eslint dışı | Kapalı | `tsconfig.json:33` `exclude: ["node_modules","tools"]`. |

### 3.4 Menü Tasarım Merkezi defteri ve DEVIR §1a

| ID | Madde | Durum | Kanıt |
|---|---|---|---|
| D-33 | Başarısız e2e: çağrı seçeneği pasife alma | Açık (test çalıştırılmadı) | DEVIR:56; defterde kapanış yok. `CallOptionsPanel.tsx` 10 satır değişmiş (`b52da3b`). |
| D-34 | Baseline lint hataları (4) | Açık (kısmen) | `FormDialog.tsx` artık `setPortalRoot` içermiyor; `MenuDesignStudio.tsx:139,145` `useMemo` hâlâ var (memoization hatası). Lint koşulmadı. |
| D-35 | `vite` `--no-save` kuruldu | Kapalı | `package.json:66` `vite ^8.3.5`, lock ve `node_modules` 8.3.5. |
| D-36 | Baseline 27 başarısız birim test (`baseline-failures.txt`) | Açık | İlgili dosyalar: `admin-hotels`, `admin-outlets`, `admin-roles`, `seed`, `table-qr`, `targets`, vb. En az biri bayat: `admin-hotels.test.ts:294-308` (D-02). DEVIR T14'ün "751 test geçti" demesiyle çelişiyor; baseline 726/753. |
| D-37 | E2E `merit` DB'sini siliyor; ayrı `merit_e2e` yok | Açık | `tests/e2e/fixtures.ts:18`, README e2e uyarısı. |
| D-38 | `pg-boss` için `@opentelemetry/api` yok (health testi) | Açık | `node_modules/@opentelemetry/api` mevcut değil; `health.test.ts` baseline'da FAIL. |
| D-39 | Menü merkezi defteri T3–T9'u kaydetmiyor; "commit atılmaz" kararı geçerliliğini yitirdi | Açık | `.superpowers/sdd/2026-11-01-menu-tasarim-merkezi/progress.md` 8 satır (T0–T2). |
| D-40 | Zephyros ortak sahil alanları DB'de yok | Açık (sahibi belirsiz) | DEVIR:58. |
| D-41 | Arşiv `docs/superpowers/plans/…-p5-qr-menu-ledger.md` ile canlı defter (`…-plans/progress.md`) ayrık | Açık | `diff -q` farklı; T9–T14 yalnız `.superpowers` altında. |

### 3.5 P0 defterinden seçilmiş ertelenmişler

Defterde ~35 minör var; P1 T11/T12 "P0'dan devreden düzeltmeler" ve 17 minör düzeltmesi yaptığını belirtiyor. Aşağıdakiler kodda tek tek kontrol edildi; geri kalanı bu denetimde izlenmedi.

| ID | Madde | Durum | Kanıt |
|---|---|---|---|
| D-42 | ESLint globalIgnores | Kapalı | `eslint.config.mjs:16-19`. |
| D-43 | `ci.yml` `permissions: contents: read` | Kapalı | `.github/workflows/ci.yml`. |
| D-44 | Scaffold kalıntıları (`public/*.svg`, "Create Next App") | Kapalı | Yok. |
| D-45 | `@types/bcryptjs` | Kapalı | `package.json`'da yok. |
| D-46 | Prisma/Tailwind sürüm sabitleme (`~`) | Açık | `package.json:20-21,62-63` `^`. |
| D-47 | `env.ts` `safeParse` + okunur hata | Açık | `env.ts:17 schema.parse`; ayrıca sırlara sabit varsayılan eklendi (N-03). |
| D-48 | `EmailSetting` tek satır kuralı (P7) | Açık | `EmailSetting`/`EmailLog` kodda kullanılmıyor. |
| D-49 | Giriş limiter'ı kalıcı/DB tabanlı (P1'e not) | Açık | `kurulum.md` §10 hâlâ "süreç belleğinde, tek örnek". |
| D-50 | `boss.stop()` SIGTERM | Açık | `jobs.ts`/`instrumentation.ts`'te yok. |
| D-51 | SSE backpressure | Açık | `lib/sse.ts` içinde `desiredSize` yok. |
| D-52 | `kurulum.md` nginx `listen 443 ssl http2` kullanımdan kalkmış söz dizimi | Açık | `kurulum.md` §6. |
| D-53 | `SEED_ADMIN_PASSWORD` komut satırında (kurulum örneği) | Açık | `kurulum.md` §4. |

**Sayım (D-01…D-53):** Kapalı 19 (D-02, 03, 13, 14, 20, 21, 22, 25, 26, 27, 28, 29, 31, 32, 35, 42, 43, 44, 45); Açık 34.

### 3.6 Bu denetimde bulunan, hiçbir defterde olmayan maddeler (hepsi açık)

| ID | Madde | Kanıt |
|---|---|---|
| N-01 | **Şema migration'sız:** `MenuNode.imageUrls` (`menu_nodes.image_urls`, `schema.prisma:1242`), `MinibarCorrectionRequest` modeli ve `RoomCheck.transactionId` `b52da3b`'de eklendi; `prisma/migrations` altında karşılığı yok (`grep image_urls` → boş; tek yeni migration p6). `docker-entrypoint.sh` ve CI `prisma migrate deploy` ile kurulan veritabanında bu sütun/tablo yok; menü ve oda kontrolü sorguları çalışma anında patlar. | `git show b52da3b -- prisma/schema.prisma`; son-kontrol defteri R2 yalnız ikisini anmış. |
| N-02 | `/api/minibar/*` (26 route) yetki denetimsiz; kimlik hatası yutulup "ilk aktif kullanıcı" olarak yazılıyor (`room/[roomId]/check/route.ts:19-30`, `apiAuthHelper.ts:12-18`); `proxy.ts` eşleyicisi `/api` içermiyor. | §4 kriter 2. |
| N-03 | Güvenlik: sabit Postgres şifresi (`migrate-minibar-data.ts:4`, itilmiş geçmişte), `Dockerfile`/`docker-compose.yaml`/`env.ts` sabit varsayılan sırlar, compose varsayılan admin şifresi, seed her başlangıçta admin şifresini ve rolünü eşitliyor (`prisma/seed.ts:167-186`, `RUN_SEED` varsayılan true), `COOKIE_SECURE` varsayılan kapalı (`lib/auth.ts:55-66`). | Şifre döndürülmeli; sırlar zorunlu hale getirilmeli. |
| N-04 | Üretim isteği yolunda sahte veri üretimi (`ensureHotelStockSeed`, `ensureSampleOccupancySeed`; 00:01 işi dahil). | §1.2 #5. |
| N-05 | Havuz düşümü eşzamanlılık: kontrol-sonra-yaz, `FOR UPDATE` yok. | `minibarService.ts:728-748, 1515-1527`. |
| N-06 | `slaWarnedAt/slaBreachedAt` ve oda servisi SLA tarama işi yok; `rs.slaMinutes` yalnız göstergede. | §1.4 #2. |
| N-07 | Docker sürümleri: `Dockerfile` Node 22, compose Postgres 16; README/kurulum/CI Node 24, PG 17. Kök ve `merit/` altında ayrı Dockerfile/compose kopyaları, `.yml` + `.yaml` ikizi. Uygulama için HEALTHCHECK yok (`/api/health` mevcut). | `Dockerfile`, `docker-compose.yaml`. |

## 4. Spec §15 kabul ölçütleri

| # | Ölçüt | Durum | Kanıt |
|---|---|---|---|
| 1 | 3 otel seed'de, silinemez; otel bazlı modül kapatılabilir | Uygulandı + test | `prisma/seed/hotels.ts` (DIAMOND/ROYAL/PREMIUM, `isSystemDefault`), silme servisi yok, `hotelModules.ts`; `seed.test.ts`, `admin-hotels.test.ts`, `entitlements.test.ts` (bazı satırlar bayat/baseline FAIL). |
| 2 | Yetkisiz erişim engellenir ve günlüğe yazılır; XP'de yetkisiz simge görünmez | Kısmen: çekirdek/menü/sipariş uygulandı + test; minibar eksik | `rbac.ts` `assertCan` + `YETKISIZ_DENEME` (`rbac.test.ts`); `/api/minibar/*`, `/kat`, `/depo` yetkisiz (N-02). |
| 3 | Oturum kuralları; online liste ≤2 sn | Uygulandı + test | `sessions.test.ts`, `sessionSweeper.test.ts`, `sse-*.test.ts`, `onlineUsers.spec.ts`. |
| 4 | Oda kontrolü: +N → havuz → rapor; günlük setup sınırı sunucuda; DND 2 kontrol/120 dk/gün sonu EKSIK | **Eksik / çelişkili** | DND 3/60 sabit, gün sonu işi işlevsiz, setup sınırı yok, UTC iş günü (§1.2 #2). Testsiz. |
| 5 | MyBar: ikinci talep reddi (ayarlı), ≤3 sn görünme, eksik kapatma açıklaması, iptal yalnız depo/yönetim | **Eksik / çelişkili** | Aynı gün tekrarı reddediliyor ama ayar okunmuyor; 15 sn yoklama; kapatma/iptal akışları yok (§1.3). |
| 6 | Doluluk: 3 dosya → görevler; öncelik planı | Uygulandı, testsiz | `occupancyUploadService.ts`, `priority-plan` route; 00:01 işi sahte veri üretiyor. |
| 7 | QR sipariş: onaysız sipariş KDS/yazıcıya gitmez; fiyat kapalıyken tutar yok; `orderingEnabled=false` iken sipariş yok | Uygulandı + test | `orders.test.ts`, `kds.test.ts`, `guest-order.test.ts`, `price-display.test.ts`, `qrOrderAcceptance.spec.ts`. |
| 8 | Oda servisi: teyit adımı ayara göre; durumlar misafir ekranında canlı | Kısmen | Teyit outlet bayrağıyla ve birim testli; **misafir arayüzü yok** (§1.4 #1); "ayara göre" otel ayarı değil outlet bayrağı. |
| 9 | Göç: tüm eşlenen tablolarda sıfır fark raporu; eski QR tokenları çalışır | **Eksik** | Script 9 adım, rapor/dry-run yok; legacy token çözümü `guestToken.ts` içinde destekli ama oda/masa tokenları taşınmıyor (§1.1 #4). |
| 10 | Misafir ekranları 5 dilde, AR RTL; XP kabuğu dar ekranda Android | Uygulandı + test | `i18n.test.ts`, `guestMenu.spec.ts`, `menuDesignCenter.spec.ts` (375 px RTL), `mobileShell.spec.ts`; MyBar ekranı next-intl dışı kendi sözlüğüyle 5 dilde. |

Sayım: uygulandı+test 4 (1, 3, 7, 10); kısmen/testsiz 3 (2, 6, 8); eksik veya çelişkili 3 (4, 5, 9).

## 5. Belgeler, CI ve ortam

### 5.1 `merit/README.md`, `docs/kurulum.md`, Docker/Coolify

| Konu | Belge ne diyor | Gerçek |
|---|---|---|
| Kapsam | README başlığı "P0/P1 çekirdeği ve P5" | Minibar, MyBar, oda servisi, rapor, Docker/Coolify anlatımı yok. Klasör yapısı bölümü "modules: şimdilik core", "tools (planlı)", `app/` yalnız `(admin)`,`(staff)`,`api (health,sse)` diyor; gerçekte `modules/{core,menu,minibar,order}`, `app/{kat,depo,(ops),(guest)}`, `tools/print-gateway`. |
| README ortam tablosu | `DATABASE_URL`…`UPLOADS_DIR` | **Eksik:** `TRUSTED_PROXY_HOPS` (yalnız `.env.example` ve kurulum §6 gövdesinde), `COOKIE_SECURE`, `DEEPL_AUTH_KEY`, `GEMINI_API_KEY`/`GOOGLE_AI_API_KEY`, `SMTP_HOST/PORT/USER/PASS/FROM`, `RUN_SEED`, `POSTGRES_*` (compose), `MERIT_VERSION/BUILD_DATE`. `PRINT_GATEWAY_KEY` satırı hâlâ "(ileride)" diyor. VAPID anahtarları belgede de kodda da yok (Web Push yok). |
| `kurulum.md` değişken tablosu | `UPLOADS_DIR` var | `TRUSTED_PROXY_HOPS` tabloda yok (gövdede var); `SMTP_*`, `COOKIE_SECURE`, `DEEPL/GEMINI` yok. `.env.example` `SMTP_*`, `COOKIE_SECURE`, `RUN_SEED` içermiyor. |
| HTTPS | `kurulum.md` §10: "oturum çerezi `secure`; düz HTTP üzerinden giriş çalışmaz" | `lib/auth.ts:55-66` (4d6376c): `secure` yalnız `COOKIE_SECURE=true` ise; varsayılan HTTP kabul. Belge bayat ve varsayılan bir güvenlik gerilemesi. |
| Seed | §4: "seed idempotent…`admin` parolasını ezmez"; §10: "`SEED_ADMIN_PASSWORD` seed sonrası ortamdan çıkarılmalı" | `prisma/seed.ts:167-186` her çalıştırmada admin parolasını/rolünü/aktifliğini eşitliyor; `docker-entrypoint.sh` her açılışta seed çalıştırıyor (`RUN_SEED` varsayılan true); `COOLIFY_DEPLOYMENT.md` varsayılan şifreyi gösteriyor. P0 T3 kararı ("admin şifresini ezmez") tersine döndü. |
| Docker/Coolify | `kurulum.md`da bölüm yok | Kök `COOLIFY_DEPLOYMENT.md` var ama otel adlarını yanlış veriyor ("Merit Crystal Cove, Merit Park"; seed'de Merit Royal Diamond / Merit Royal / Merit Royal Premium), Postgres 16'yı anıyor; `kurulum.md` ve README bu belgeye bağlanmıyor. |
| Sürümler | README/kurulum/CI Node 24, PG 17 | `Dockerfile` `node:22-alpine`, compose `postgres:16-alpine`. |
| Kurulum Rehberi adım 9 | "Ürün ve minibar setup — P2 ile gelir" | Pencere var (`minibar.tanim`), rehber adımı bağlanmamış. |
| Print gateway | `kurulum.md` §5 / README | Güncel. |

### 5.2 CI (`.github/workflows/ci.yml`)

- GitHub'da son 13 koşunun tamamı `failure`; `check` işi 0 adımla bitiyor (3–4 sn). Büyük olasılıkla runner/hesap kaynaklı; yine de "CI'ın gerçek koşusu" (P8 T8) hiç doğrulanmadı.
- Adımlar yapısal olarak geçerli: `npm ci`, `prisma generate`, dev ve test DB'ye `migrate deploy`, `npm run check`, gateway testleri (`merit/tools/print-gateway`), Playwright, rapor yükleme.
- Sorunlar: (a) `migrate deploy` yeni sütunları getirmiyor (N-01), test/e2e şemayı prod'dan farklı kurar; (b) `npm run check` baseline'da lint 4 hata ve 27 birim test hatası yüzünden kırmızı; (c) `next build` tip denetimini atlıyor (CI'da ayrı `typecheck` var, iyi) ama CI'da `next build` ve Docker imajı derlenmiyor; (d) `prisma migrate diff` (şema–migration drift) kapısı yok, N-01 bu yüzden yakalanmadı; (e) `merit/` altında `ops-e2e-server*.log`, `test-results/`, `playwright-report/` yerel kalıntıları.

## 6. Önerilen sıra

1. N-01 migration üret (`image_urls`, `minibar_correction_requests`, `room_checks.transaction_id`) ve CI'a `prisma migrate diff --exit-code` ekle.
2. N-02/N-03: `/api/minibar/*` ve `/kat`, `/depo` sayfalarına `requireUser` + `assertCan`; sabit şifre ve varsayılan sırların kaldırılması, Postgres şifresinin döndürülmesi.
3. N-04, DND ayarları, UTC yerine `lib/time.ts`, havuz kilidi; MyBar token + hız sınırı + karşılama düşümü.
4. Göç scriptini plan §12'ye uygun yazın; minibar/mybar/rapor/e-posta/oda servisi testleri ve e2e.
5. `ilerleme-data.js` ve `DEVIR.md`'yi bu raporun §1–§2'sine göre düzeltin; Web Push ve oda servisi misafir arayüzünü "yapılmadı" gösterin.
