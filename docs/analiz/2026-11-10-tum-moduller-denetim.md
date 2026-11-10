# Merit — Tüm Modüller Denetim Raporu (10 Kasım 2026)

Yöntem: 10 paralel salt-okunur ajan (1 Opus güvenlik, 8 Sonnet modül, 1 Haiku derleme sağlığı).
Dal: `ux/yenileme` (16 commit'lenmemiş dosya ile). Yollar `merit/` köküne göredir.

Durum etiketleri: **[D]** denetçi tarafından kodda doğrulandı · **[A]** ajan raporu, ayrıca doğrulanmadı · **[?]** ajan da emin değil.
Önem: P0 veri kaybı / yetki atlama · P1 iş akışını bozan hata · P2 yanlış sonuç / kenar durum · P3 iyileştirme.

## Ürün kararları (Erkan, 10 Kas 2026)

- K1 — Tükenen ürün menüden tamamen kalkar; "Tükendi" rozeti gösterilmez. Rozet kodu ve `menu.soldOut` ölü koddur, silinir.
- K2 — Elle çeviri düzeltme kaldırılır; yalnızca otomatik çeviri sistemi kullanılır.
- K3 — Para birimi, fiyat gösteriminin açıldığı formda seçilir. Denetim Masası genel ayarlarındaki para birimi seçeneği kaldırılır.

## 1. Kritik (P0)

| ID | Dr | Yer | Sorun | Düzeltme |
|---|---|---|---|---|
| OPS-1 | D | `docker-entrypoint.sh:47`, `prisma/seed/meritMenus.ts:230,276-283` | `SYNC_MERIT_MENUS` varsayılanı `true`; kategori adı/sırası seed'den saparsa yeniden başlatmada outlet'in Order/OrderItem/OrderEvent/PrintJob ve menü ağacı silinir. | Varsayılan `false`; silme yolundan sipariş silmeyi çıkar, menü yalnız boşken kurulsun. |
| ORD-1 | D | `src/modules/order/server/cashier.ts:230-234` | `can()` async, `await` yok → yetki kontrolü hiç çalışmıyor; otel/outlet kapsamı da yok. | `await can(...)`, `ctx.hotelIds` + outlet kapsam kontrolü. |
| KAT-1 | D | `src/app/kat/oda-kontrol/[roomId]/page.tsx:79`, `roomCheckService.ts:493,665`, `dnd.ts:89`, `api/minibar/room/[roomId]/check/route.ts:39` | `minibar.requireQrForControl` yalnız UI'da; `?fromQr=1` ya da doğrudan API ile QR'sız kontrol/DND. | QR çözümleme kullanıcı+oda için kısa ömürlü kanıt yazsın; yazma yolları doğrulasın. |
| KAT-2 | A | `src/app/kat/qr/page.tsx:250,258`, `roomScan.ts:85-89` | "Oda numarası yaz" alanı ve sunucudaki `number: token` yedeği QR'ı etkisiz kılıyor. | Yedeği kapat ya da ayrı izinli ayara bağla. |

## 2. Güvenlik

| ID | Ö | Dr | Yer | Sorun |
|---|---|---|---|---|
| SEC-1 | P1 | D | `api/qr/outlet/[outletId]/print/route.ts:19-20`, `modules/menu/server/tableQr.ts:337,351,362` | `theme`/`template` doğrulanmadan HTML'e yazılıyor (yansıyan XSS). Enum doğrula + `esc()`. |
| SEC-2 | P1 | D | `src/app/(guest)/q/onizleme/[outletId]/page.tsx:42-93` | Oturum kontrolü yok; pasif outlet menüsü ve canlı masa `qrToken`'ı sızıyor. `requireUser` + QM-MEN; token bağlantısını kaldır. |
| SEC-3 | P1 | A | `lib/qr.ts:36`, `modules/menu/server/guestToken.ts:182-195`, `roomQr.ts:71` | Token yalnız DB'de aranıyor; HMAC yalnız IP engelliyken; eski 6 haneli oda kodları geçerli. Canlıda eski kod var mı bilinmiyor. |
| SEC-4 | P2 | A | `modules/core/server/loginAction.ts:25` | Giriş IP'si istemcinin `x-forwarded-for` değerinden; rate limit aşılır. `clientIp()` kullan. |
| SEC-5 | P2 | A | `modules/core/server/admin/users.ts:546-560,645,675` | Son sistem yöneticisi koruması yok; koruma `username==="admin"` metnine bağlı. |
| SEC-6 | P2 | A | `modules/core/server/sessions.ts:147-149` | Mutlak oturum ömrü yok; her dokunuş süreyi uzatıyor. |
| SEC-7 | P2 | A | `modules/core/server/login.ts:62-70,159` | Başarısız giriş audit'lenmiyor; limit bellekte. |
| SEC-8 | P2 | A | `users.ts:572`, `lib/sse.ts:6` | Rol/otel değişince açık oturumlar ve SSE akışı kapanmıyor. |
| SEC-9 | P2 | A | `modules/menu/guestEventFilter.ts:26-31` | `call.resolved` oda akışlarına otel/outlet kontrolü olmadan gidiyor. |
| SEC-10 | P2 | A | `modules/radar/server/replay/sources/tables.ts:60` | Replay garson adını maskelemeden yazıyor. |
| SEC-11 | P3 | A | `api/manifest/guest/[token]/route.ts:11` | Sınırlayıcısız token çözümleme. |
| SEC-12 | P3 | A | `lib/env.ts:21`, `lib/gateway-auth.ts` | Tek `PRINT_GATEWAY_KEY`, `min(1)`. |
| SEC-13 | P3 | A | — | Mevcut parolayla kendi parolasını değiştirme akışı yok. |
| SEC-14 | P3 | A | `lib/password.ts:18,62` | bcrypt 72 bayt, politika 128 karakter. |
| SEC-15 | P3 | A | `lib/auth.ts:58-64` | Mutasyonlarda Origin kontrolü yok. |
| SEC-16 | P3 | A | `modules/menu/server/actions/menuTree.ts:97-107,150-155` | Dosya baytları oturum kontrolünden önce okunuyor. |
| SEC-17 | P3 | A | `modules/core/server/admin/onlineUsers.ts:154-157` | Yetkiden önce NOT_FOUND. |
| SEC-18 | P2 | A | `occupancyParse.ts:209-220`, `api/minibar/occupancy/_form.ts:12-17` | xlsx satır/sütun sınırı belleğe yüklendikten sonra (zip-bomb). |

## 3. Sipariş / kasa / KDS

Durum makinesi: GONDERILDI → ONAYLANDI | REDDEDILDI; ONAYLANDI → HAZIR | IPTAL; HAZIR → SERVIS_EDILDI | IPTAL (`transitions.ts:5-9`).

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| ORD-2 | P1 | `orders.ts:264`, `kds.ts:28-33`, `admin/outlets.ts:108` | KDS kapalı outlette sipariş ONAYLANDI'da kalıyor; `kdsEnabled=false` iken ONAYLANDI→SERVIS_EDILDI izni ver. |
| ORD-3 | P1 | `orders.ts:299-309` | İptalde print kuyruğu temizlenmiyor; mutfağa iptal fişi gitmiyor. |
| ORD-4 | P1 | `printJobs.ts:381-387,340-342` | `sweepStale` `attempts` sınırına bakmıyor; backoff yok → çift fiş / sonsuz döngü. |
| ORD-5 | P1 | `staffOrders.ts:104,134` | Garson adisyonu idempotency anahtarı sunucuda üretiliyor → çift sipariş. |
| ORD-6 | P2 | `tableAssignments.ts` `myTables` (~165) | Atama filtresi yok. |
| ORD-7 | P2 | `kds.ts:36`, `cashier.ts:99`, `orders.ts:548` | Önceki günün açık siparişleri KDS'te kalıyor, kasadan kayboluyor. |
| ORD-8 | P2 | `cashier.ts:156-163`, `pos.ts:44` | Tutar float ile toplanıyor; `pricesShown=false` iken `unitPrice` null saklanıyor. |
| ORD-9 | P2 | `GarsonClient.tsx:80-114`, `KasaClient.tsx:222`, `KdsClient.tsx:47-62` | SSE olayları debounce edilmiyor; KDS/Garson `realtime.resync` dinlemiyor [?]. |
| ORD-10 | P3 | `KdsCard.tsx:12-13` | Yaş hesabı istemci saatine bağlı. |
| ORD-11 | P3 | `waiterCalls.ts:85-94`, `orders.ts:78-86`, `guestOrder.ts:103` | Çağrı oluşturma kilitsiz; ret gerekçesi misafire ham gösteriliyor. |

## 4. Oda servisi

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| RS-1 | P1 | `pushDispatcher.ts:20,51-53` | Push yalnız `mybar.created` için kayıtlı; SLA/escalation push gitmiyor. |
| RS-2 | P1 | `escalation.ts:71-94`, `sla.ts:97-125`, `notifications.ts:39` | Alıcı boşsa claim yazılıyor, bildirim gitmiyor, tekrar denenmiyor. |
| RS-3 | P1 | `escalation.ts:30`, `sla.ts:29`, `roles.ts:32` | "Misafir ilişkileri" rolü yok; R-MUS = Mutfak Şefi. |
| RS-4 | P1 | `escalation.ts:46`, `sla.ts:73`, `slaConstants.ts:17` | Escalation tek seviyeli; teyit bekleme SLA'ya sayılmıyor. |
| RS-5 | P3 | `escalation.ts:63-66`, `jobs.ts:96`, `time.ts:5` | Aday başına `getSetting` (N+1); TZ sabit. |

## 5. Minibar — kat görevlisi

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| KAT-3 | P1 | `dnd.ts:113-135`, `roomCheckService.ts:389` | `dnd.recheckMinutes` sunucuda zorlanmıyor; `dndAllowed` sabit `true`. |
| KAT-4 | P1 | `oda-kontrol/[roomId]/page.tsx:130,215`, `dnd.ts:89` | `clientRequestId` her tıklamada yenileniyor; DND'de anahtar yok. |
| KAT-5 | P1 | `kat/talep/page.tsx:73` | `crypto.randomUUID()` düz HTTP'de tanımsız; `newRequestKey()` kullan. |
| KAT-6 | P1 | `roomCheckService.ts:1261`, `prisma/seed/roles.ts:136` | Düzeltme talebi `MB-TAL D` istiyor; R-KAT'ta yok [?]. |
| KAT-7 | P1 | `priorityPlan.ts:125-156` | DND dalı varış dalından önce. |
| KAT-8 | P2 | `priorityPlan.ts:89,106-122` | Gecikmişler `max(0,diff)` ile eşitleniyor; clash sıralaması. |
| KAT-9 | P2 | `oda-kontrol/[roomId]/page.tsx:615-619` | Seçimsiz "Kaydet" onaysız "Sarfiyat Yok" kaydediyor. |
| KAT-10 | P2 | `kat/qr/page.tsx:110-114` | Geçersiz QR sonrası tarama döngüsü duruyor. |
| KAT-11 | P2 | `roomCheckService.ts:803-837` | `deleteTransactionTx` `MYBAR_KARSILAMA` türünü reddetmiyor. |
| KAT-12 | P3 | `roomCheckService.ts:1251-1281`, `priorityPlan.ts:357-363` | Düzeltme talebi doğrulaması eksik; tüm-otel modunda `seq` çakışıyor. |

## 6. Minibar — depo

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| DEP-1 | P1 | `occupancyUpload.ts:338-349,472-486` | Geri alma, yalnız güncellenen eski kayıtları da siliyor. |
| DEP-2 | P1 | `stockRequests.ts:365-441` | Kısmi teslimde kalan miktar kayboluyor. |
| DEP-3 | P1 | `pool.ts:538`, `roles.ts:124,148`, `depo/stok/page.tsx:252` | R-DEP stok düzeltemiyor; sayım akışı yok; sebep alanı UI'da isteğe bağlı, sunucuda zorunlu. |
| DEP-4 | P1 | `scripts/update-minibar-setups-products.ts:236,305-325` | Ortam koruması olmadan stok ve par seviyelerini eziyor. |
| DEP-5 | P1 | `occupancyUpload.ts:186,407-414` | Tarih/otel uyuşmazlığı commit'te denetlenmiyor. |
| DEP-6 | P2 | `occupancyUpload.ts:328-356` | Yeni dosyada olmayan kayıt silinmiyor; önizleme sayıları yok. |
| DEP-7 | P2 | `pool.ts:625`, `stockViews.ts:48`, `depoDashboard.ts:78` | Pasif ürünün stoğu ekranlardan kayboluyor. |
| DEP-8 | P2 | `minibar/server/jobs.ts:96-104`, `minibarJobs.ts:42-46` | İş hatası yutuluyor; doluluk uyarısı tür bazında bakmıyor. |
| DEP-9 | P2 | `depoService.ts:82-94`, `api/minibar/depo/stock/route.ts:21`, `stockViews.ts:~170` | Tarihsiz rapor tüm geçmişi çekiyor; sayfalama yok. |
| DEP-10 | P2 | `pool.ts:257`, `roomCheckService.ts:566` | Havuz sıfırken oda kontrolü reddediliyor (karar gerekli). |

## 7. MyBar

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| MYB-1 | P1 | `useMybarSubmit.ts:33-50,72`, `guestRequest.ts:110,129-135` | İdempotency anahtarı başarıdan sonra silinmiyor; replay tarihe bakmıyor. |
| MYB-2 | P1 | `fanout.ts:23-32`, `notifications.ts:38-39` | Alıcı boşsa bildirim sessizce düşüyor. |
| MYB-3 | P1 | modül geneli | Üstlenilmeyen talep için zaman aşımı/yükseltme yok. |
| MYB-4 | P1 | `guestRequest.ts:216-217` | `closedWithMissing` misafire "Karşılandı" görünüyor. |
| MYB-5 | P2 | `requests.ts:490-538` | Kısmi karşılanmış talep iptalinde stok geri alınmıyor. |
| MYB-6 | P2 | `settings-defs.ts:239-244` | Günlük sınır yalnız aç/kapa; `mybar.dailyMax` ekle. |
| MYB-7 | P2 | `guestRequest.ts:220-225,138` | Gece yarısı bekleyen talep misafir ekranından kayboluyor. |

## 8. Menü / misafir

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| MEN-1 | — | `MenuView.tsx:154`, `ItemCards:105`, `ItemSheet:177` | K1 gereği gizleme doğru; rozet kodu ve `menu.soldOut` çevirisi silinir. Tümü tükenen kategoride "sonuç yok" yerine uygun boş durum. |
| MEN-2 | P1 | `SelectionsDrawer.tsx:157`, `selectionStore.ts:80-92` | Satır key'i `menuNodeId:note`; mutasyonlar yalnız `menuNodeId` ile. `lineId` ekle. |
| MEN-3 | P1 | `NodeForm.tsx:236`, `guestState.ts:96` | Para birimi etiketi uyumsuz → K3 ile çözülür. |
| MEN-4 | P1 | `menuTree.ts:244,290`, `translations.ts:653-669` | Çeviri çağrısı commit'ten önce `void`; sağlayıcı hatasında eski çeviri kalıyor → K2 ile sadeleştirilir. |
| MEN-5 | P2 | `order/server/cart.ts:49` | Pasif üst kategorideki ürün sipariş edilebiliyor. |
| MEN-6 | P2 | `SelectionsDrawer.tsx:71,159`, `ItemSheet.tsx:17`, `guestOrder.ts:46-48` | Seçimler menüyle uzlaştırılmıyor; hata adı Türkçe; not sınırı 500/200. |
| MEN-7 | P2 | `guestMenu.ts:32,40-42`, `guestToken.ts:75`, `guestState.ts:47-101` | `guestState` iki kez; eksik çeviri her istekte sağlayıcıyı tetikliyor. |
| MEN-8 | P2 | `menuTree.ts:399-445`, `menuImages.ts:120-135` | `imageUrls` dosyaları yetim kalıyor; sayı sınırı yok. |
| MEN-9 | P3 | `design.ts:410-411` | Hero renkleri hex doğrulanmıyor. |

## 9. Radar / raporlama

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| RAD-1 | P1 | `alerts.ts:117`, `layers/roomService.ts:55` | RS SLA yaşı `createdAt`'ten; `slaStart` kullan. |
| RAP-1 | P1 | `siparisOzet.ts:41`, `siparisUrun.ts:23` | İptal/red siparişler tutara dahil. |
| RAP-2 | P1 | `siparisOzet.ts`, `siparisSure.ts`, `siparisUrun.ts`, `run.ts` | Özet kırpılmış satırlardan hesaplanıyor. |
| RAD-2 | P2 | `metrics.ts:418`, `kpi.ts:155` | `mailFailed` her otele aynı sayı. |
| RAD-3 | P2 | `useRadar.ts:33`, `radarStore.ts` | Uyarılar istemci saatine bağlı. |
| RAP-3 | P2 | `reporting/server/jobs.ts:58` | İş hatası yutuluyor. |
| RAP-4 | P2 | `rsSla.ts:29` | Sınırsız `findMany`. |
| RAD-4 | P2 | `layers/minibar.ts:56-57` | Dünden kalan MyBar talebi radardan kayboluyor. |
| RAD-5 | P3 | `lib/sse.ts:56` | `desiredSize` kontrolü yok. |
| RAD-6 | P3 | `alerts.ts:27`, `metrics.ts:38` | Sabit eşikler çift tanımlı. |

## 10. Shell / PWA / operasyon

| ID | Ö | Yer | Sorun |
|---|---|---|---|
| SHL-1 | P1 | `src/app/**` | `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx` yok (misafir grubu dahil). |
| SHL-2 | P1 | `src/app/layout.tsx:36-43` | Fontlar Google CDN'den; `public/fonts` kullanılmıyor. |
| SHL-3 | P2 | `public/sw.js:49,75-83`, `PwaRegister.tsx:25` | Hash'siz yollar cache-first; güncelleme bildirimi yok. |
| SHL-4 | P2 | `useShellPersistence.ts:130-141` | Göç adımları dağınık; biri sürüm yazmıyor. |
| SHL-5 | P2 | `prefsSchema.ts:40-57` | Tek bozuk alan tüm yerleşimi düşürüyor. |
| SHL-6 | P2 | `Window.tsx:594-610` | `AppErrorBoundary` hatayı kaydetmiyor. |
| SHL-7 | P3 | `Window.tsx:477-516` | Pencere erişilebilirliği (odak dönüşü, `aria-modal`). |
| OPS-2 | P1 | `docker-compose.yaml`, `Dockerfile` | Uygulama healthcheck'i yok. |
| OPS-3 | P2 | `.github/workflows/ci.yml` | CI Node 24 + PG 17; üretim Node 22 + PG 16. |
| OPS-4 | P2 | `docs/kurulum.md:543-563` | `uploads` yedeği, geri yükleme adımı, Docker log sınırı yok. |
| OPS-5 | P2 | `src/lib/env.ts` | `RUN_SEED` ile `SEED_ADMIN_PASSWORD` birlikte doğrulanmıyor. |

## 11. Kapsam kararı gerektiren eksikler (hata değil)

- Oda servisi: doluluk doğrulaması, teslim kanıtı/imza, oda hesabına (folio) yazma, çalışma saati, minimum tutar, DND uyarısı, iade.
- Sipariş: masa değiştirme/birleştirme, hesap bölme, ödeme, servis sonrası iade.
- Menü: saat/gün bazlı kullanılabilirlik, taslak/yayınla.
- Depo: çift taraflı kayıt (merkez depo ledger), fire/hasar/SKT, koli çevrimi, CSV/.xls doluluk içe aktarma, Excel/PDF dışa aktarma.

## 12. Derleme sağlığı (ölçüldü)

- `tsc --noEmit`: 0 hata.
- `eslint .`: 9 hata, 28 uyarı. Hatalar: `depo/stok/page.tsx:93`, `kat/(home)/KatDashboard.tsx:66`, `kat/doluluk/[floorId]/page.tsx:179,658`, `kat/tavsiye-is-plani/page.tsx:142`, `components/ops/NotificationPermissionGate.tsx:40`, `menu/ui/guest/GuestFrame.tsx:185`, `PermissionMatrixPanel.tsx:267`.
- Vitest (DB'siz 57 dosya): 395/400. Kırmızılar: `radar-source-rules` (ham hex), `uxRatchet` (9–12 px yazı, ham palet), `uxSourceRules` (emoji, sürekli animasyon).
- Çalıştırılmadı: DB'ye dokunabilecek 193 test dosyası, tüm e2e.

## 13. Sağlam bulunanlar (dokunma)

- Stok ve durum geçişleri: satır kilidi (`FOR UPDATE`) + tek transaction; negatif stok yok.
- Misafir sipariş idempotency'si, fiyat snapshot'ı, atomik sipariş numarası.
- `requireUser` her istekte oturumu DB'den doğruluyor; `assertCan` reddi audit'liyor.
- SSE yaşam döngüsü, LISTEN kopmasında `realtime.resync`.
- Radar strict zod şemaları; demo tamamen istemci tarafı.
- pg-boss ile kalıcı SLA zamanlaması, çoklu instance güvenli claim.
- Para alanlarının tamamı `Decimal(10,2)`.

## 14. Düzeltme sonucu (10 Kas 2026)

Doğrulama (birleştirme öncesi, `ux/yenileme`): `tsc --noEmit` 0 hata; `eslint .` 0 hata, 24 uyarı; Vitest 266 dosya, 2742/2742 (gerçek `merit_test` veritabanına karşı). E2E çalıştırılmadı. Tarayıcıda görsel doğrulama yapılmadı.

Düzeltildi:
- OPS-1..5; SEC-1..18; ORD-1..5, ORD-7..11; KAT-1..12; DEP-1..9; MYB-1..7; MEN-1..9; RAD-1..6; RAP-1..4; SHL-1..6; RS-1, RS-2.
- Ürün kararları: K1 (tükenen ürün menüden kalkar, rozet yok), K2 (yalnız otomatik çeviri), K3 (para birimi satış noktasında, genel ayar kaldırıldı).
- Ek: elle oda girişi ayarı (otel/kat/oda bazlı, denetim kaydı + günlük rapor), R-DEP sayım düzeltmesi, 10 font ailesinin yerelleştirilmesi (Google Fonts bağımlılığı yok).

Kısmen:
- SHL-7: pencere kapanınca odak geri dönüyor; bildirim zili modal olmadığı için dokunulmadı.
- RS-5: ayar okuma tekrarı giderildi; sabit saat dilimi ortak dosyalarda kaldı.

Atlandı:
- ORD-6: garson ekranının masa atamasına göre süzülmesi ürün kararı (mevcut test tersini sabitliyor).
- RS-4: çok seviyeli yükseltme şema değişikliği gerektiriyor (yeni özellik).
- DEP-10: olduğu gibi bırakıldı (karar).

Açık kararlar:
- "Minibar Takip Yöneticisi" rolü seed'de yok; elle oda girişi ayarını şimdilik yalnız R-SYS değiştiriyor (adaylar R-HKS, R-DEP, R-OTM).
- MYB-5: kısmen teslim edilmiş talep iptalinde teslim edilen miktar havuza iade yazılıyor; ürün odada kalıyorsa kural değişmeli.
- DEP-6: yeni doluluk dosyasında olmayan aynı gün/tür kayıtları kaldırılıyor; iş kuralı onayı.
- Fiyat gösterimi "Devral" olan satış noktasında para birimi zorunlu değil.
- Belgelerde systemd için Node 24 / PG 17, Docker ve CI'da Node 22 / PG 16.

Kurulumda dikkat:
- Yeni migration'lar: `20261110130000_outlet_currency`, `20261110140000_occupancy_revert_data`, `20261110140100_minibar_depo_rol_yetkileri`.
- `PRINT_GATEWAY_KEY` en az 32 karakter; `RUN_SEED=true` iken `SEED_ADMIN_PASSWORD` zorunlu. Aksi hâlde uygulama açılmaz.
- `SYNC_MERIT_MENUS` varsayılanı artık `false`; ilk kurulumda bir kez `true` verilir.
- K2 için mevcut çevirilerin bir kez toplu yeniden üretilmesi önerilir (çalıştırılmadı).
