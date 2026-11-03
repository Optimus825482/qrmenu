# P6 Oda Servisi — plan ile mevcut kod uzlaştırma (gap analizi)

Tarih: 3 Kasım 2026, salt okunur analiz; dal `ux/yenileme` (analiz başında HEAD `84f9091`, sonradan başka commit'ler girdi). Yol öneki `merit/` atlanmıştır; `S` = `merit/src`.
Kaynaklar: `docs/superpowers/plans/2026-10-31-p6-oda-servisi.md` (7 task + Koordinasyon notları), spec §7 (QR menü), **§8 (QR oda servisi)**, §9–§11, §15 kabul 8/10 (istekteki "§6.7" minibar raporlarıdır; oda servisi §8'dedir), `docs/kabul/2026-11-02-tutarlilik-denetimi.md` (§1.4, N-06), `prisma/schema.prisma`.

> Not: Bu klasörde aynı konuda başka bir ajanın (Codex devri) yazdığı kısa analiz vardı; kopyası `gap-analysis.alt-ajan.md` olarak saklandı. Ondan alınan ve bu belgede de yer alan ek bulgu: ROOM misafir SSE'sinde `guestEventFilter` `roomId` eşitliğini doğrulamıyor (§2.3). Çelişen nokta yok; o belgenin "özel manifest yok, ortak personel manifesti kullanılıyor" tespiti doğrulandı (`S/app/personel.webmanifest`, `S/app/(ops)/layout.tsx:14`) ve T5c'den manifest işi çıkarıldı.

Durum anahtarı: **TAM** (kodda + testle karşılanmış) · **KISMİ** · **YOK**.

## 0. Yönetici özeti

| Task | Durum | Hüküm |
|---|---|---|
| T1 Migration / dahili no / tür modül eşlemesi / menü erişimi / menü penceresi | **TAM** | Kapalı — mevcut kod. |
| T2 Durum makinesi / yetki / alıcı / fiş | **TAM + 1 engelleyici hata** | `ONAYLANDI→HAZIR` MASA'dan kalma `prepStartedAt` koruması personel ekranını kırıyor (§2.1). |
| T3 Misafir sipariş (state, create, sınır, vazgeç, API, SSE) | **TAM + küçük sapmalar** | `scaledMax` bağlı değil, `getSetting` hatası yutuluyor, SSE `roomId` doğrulaması yok. |
| T4 Misafir arayüzü | **YOK** | Slot `null`, `ROOM_SERVICE_READY=false`, `/q/[token]/oda-servisi` yok, durum sayfası ROOM için `null`, `guest.rs.*` yok. |
| T5 `/oda-servisi` personel ekranları | **KISMİ (prototip)** | Tek liste istemcisi var; `board.get`, SLA durumu, dahili/doluluk, izin kapıları, e2e yok; "Hazırlandı" kırık. |
| T6 SLA / eskalasyon / istatistik / pencere | **KISMİ** | `rsSlaSweep` + cron var ama plandan farklı, bildirimsiz, testsiz; eskalasyon MASA'ya sabit; `stats` yok; rapor penceresi prototip ve yanlış izinli. |
| T7 Kabul + belgeler | **YOK** | |

Hemen paralel başlayabilir: **T2R, T3R, T4a, T4b, T5a, T6b** (§4.1). Sonra: T4c/T4d, T5b/T5c, T6a/T6c; en son T7.

---

## 1. Task bazında uzlaştırma

### 1.1 Task 1

| Plan gereği | Mevcut kanıt | Durum | Kalan |
|---|---|---|---|
| Order `onWayAt/deliveredAt/deliveredById/slaWarnedAt/slaBreachedAt`, `@@index([roomId,status])`, `Room.extension` | `prisma/migrations/20261102033000_p6_oda_servisi/migration.sql`; `schema.prisma:1362-1375`, `:1393`, `:323-330` | TAM | — |
| `rs.maxOpenPerRoom` | `S/lib/settings-defs.ts:44,92,320` | TAM | — |
| `getRoomServiceOutlet/require…` | `S/modules/order/server/roomService/outlet.ts:9-29` | TAM | — |
| `guestState` tür bazlı modül | `S/modules/menu/server/guestState.ts:60-71`; `tests/unit/guest-state-rs.test.ts` | TAM | — |
| `assertMenuAccess` + `menuTree/translations/menuImages` | `S/modules/menu/server/menuAccess.ts:21-42`; `tests/unit/menu-access.test.ts` | TAM | — |
| `setAvailable` RO-TAL D / `setOrderingEnabled` RO-TAL A | `S/modules/menu/server/outletSwitches.ts:29-35` | TAM | — |
| `Rooms` `extension` zod + panel | `S/modules/core/server/admin/rooms.ts:100-104,244,287`; `S/shell/apps/definitions/panels/RoomsPanel.tsx`; `tests/unit/admin-rooms.test.ts` | TAM | — |
| `MenuManager lockOutletType` + `rs.menu` | `S/modules/menu/ui/MenuManager.tsx:33,37,53`; `S/modules/order/roomServiceApps.ts:10-25`; `S/modules/order/apps.ts:23` | TAM | Başlık "Oda Servisi Menü Yönetimi" (plan "…Menüsü"): değiştirmeye gerek yok. |

**T1: kapalı — mevcut kod.**

### 1.2 Task 2

| Plan gereği | Mevcut kanıt | Durum | Kalan |
|---|---|---|---|
| `ORDER_TRANSITIONS/isAllowed/CLOSED_STATUSES` | `S/modules/order/server/transitions.ts:4-28` | TAM | — |
| Kind'a göre yetki | `S/modules/order/server/orders.ts:91-139` (`authorizeRoomTransition`) | TAM | Teyit bayrağı TX içinde global `prisma` ile okunuyor (`:107-110`) → `tx`. |
| Zaman damgaları, `OrderEvent`, audit, publish | `orders.ts` `stamps`, `:283-330`; `EVENT_OF :19-29` | TAM | `EVENT_OF.TEYIT_BEKLIYOR→order.confirmed` (`:25`) yanıltıcı/ölü (§2.8). |
| Fiş yazıcı isteğe bağlı | `orders.ts:312`; `S/modules/order/server/printJobs.ts:62,70,161-163` | TAM | — |
| `confirmPhone` | `orders.ts` `confirmPhone` | TAM | — |
| `internal:true` yalnız sunucu içi TEYIT | `orders.ts:98-103,241` | KISMİ | `roomOrder.create` kullanmıyor (§2.8). |
| `recipientsFor` ODA | `S/modules/order/server/approvals.ts:37-46`; `tests/unit/room-recipients.test.ts` | TAM | — |
| `receipt.build` ODA + gateway `Dahili:` | `S/modules/order/server/receipt.ts:56-85`; `tools/print-gateway/src/render.ts:67-68`, `test/render.test.ts:101-106` | TAM | — |
| Action'lar | `S/modules/order/server/actions/roomService.ts:24-89` | TAM | — |
| Testler | `tests/unit/room-order-machine.test.ts` (415 sat.) | TAM | `:275` `prepStartedAt` elle yazıyor → §2.1'i gizliyor. |
| (plan dışı) HAZIR için `prepStartedAt` şartı | `orders.ts:269-271` | **HATA** | T2R. |

### 1.3 Task 3

| Plan gereği | Mevcut kanıt | Durum | Kalan |
|---|---|---|---|
| `cart.ts validateCartItems` | `S/modules/order/server/cart.ts:33-65` (+alias `:68`) | TAM | `fieldErrors.items` yalnız ad (D-08). |
| `roomServiceState` | `S/modules/order/server/roomService/roomState.ts`; `tests/unit/room-state.test.ts` | TAM | `getSetting` try/catch yutuyor (`:44-47`). |
| `roomOrder.create` | `roomOrder.ts:83-273` (kilit `:122`, sayım `:125-130`, iş günü `:151`, TEYIT `:185-210`, notify `:217`, publish `:229`) | TAM | (a) `orderLimiter` sabit 10 (`guestOrder.ts:18`; `scaledMax` `S/lib/rate-limit.ts:26` mevcut ve MyBar kullanıyor); (b) `rs.maxOpenPerRoom` try/catch (`:132-136`). |
| `GuestOrderView` genişlemesi | `S/modules/order/server/guestOrder.ts:55-71,86-110` | TAM | — |
| `get`, `guestCancel` | `roomOrder.ts:275-380` | TAM | Vazgeç sipariş limiter'ını paylaşıyor (`:299`). |
| `occupancyHint` | `S/modules/order/server/roomService/occupancy.ts:6-52` | TAM | — |
| Route'lar | `S/app/api/q/[token]/order/route.ts:30-33,56-59`; `order/cancel/route.ts`; `events/route.ts:45-75`; `call` ROOM → `waiterCalls.ts:61` NOT_FOUND | TAM | `readJsonBody` boyut sınırı yok (D-10, P8). |
| `GUEST_EVENT_TYPES` | `S/lib/realtime-events.ts:67-89` | TAM | — |
| Testler | `tests/unit/room-order.test.ts` (11 `it`: eşzamanlı 5→3, idempotency, vazgeç, IP sınırı, occupancy, events filtre) | TAM | — |

### 1.4 Task 4 — Misafir arayüzü ("Seçimler")

> Plan T4 başlığındaki "sepeti" **Seçimler** olarak uygulanır. Mevcut kod zaten uyumlu: `SelectionsDrawer.tsx`, `selectionStore.ts:111` (`merit_selections_{token}`), `tr.json` `guest.cart.submit="Seçimleri gönder"`. `src` içinde (büyük/küçük harf duyarsız) "sepet" yok. Yeni anahtarlar `guest.rs.selections.*` olur (planın `guest.rs.cart.*` adı kullanılmaz); `merit_cart_{token}` kullanılmaz.

| Plan gereği | Mevcut kanıt | Durum | Kalan |
|---|---|---|---|
| `RoomServiceCard` | `S/modules/order/ui/guest/` yok | YOK | Oluştur. |
| `RoomServiceSlot` gövde + `ROOM_SERVICE_READY=true` | `S/modules/mybar/ui/guest/RoomServiceSlot.tsx:120-125` (`false`, `return null`); tüketen `S/modules/mybar/server/roomGuest.ts:8-12,81-86`; `RoomHome.tsx:50-55` | YOK | Kart + bayrak (**bayrak son**). |
| `/q/[token]/oda-servisi/page.tsx` | yok | YOK | Oluştur. |
| `mode:'table'\|'room'` | `MenuBrowser.tsx:36-90` modsuz; `GuestFooter.tsx:58` `CallWaiterButton` koşulsuz; `GuestFrame.tsx:34,46,92` `tableLabel` zorunlu | YOK | T4b. |
| `OrderStatus` ODA adımları, Teyit, ETA, Vazgeç | `S/modules/menu/ui/guest/OrderStatus.tsx:13` yalnız MASA adımları; `siparis/[orderId]/page.tsx:20` `kind !== "TABLE"` → `null` | YOK | T4c. |
| i18n | `tr.json` `guest.order.status` 6 durum (TEYIT/YOLDA/TESLIM yok); `guest.room` yalnız `placeholder`; `guest.rs` yok | YOK | T4a. |
| `guestRoomService.spec.ts` | yok | YOK | T4d. |

### 1.5 Task 5 — Personel ekranları

| Plan gereği | Mevcut kanıt | Durum | Kalan |
|---|---|---|---|
| `sla.ts` yardımcıları | `S/modules/order/server/roomService/sla.ts:8-11` yalnız `SLA_OPEN_STATUSES`, `SLA_WARN_RATIO`; `slaStart/slaDue/slaStateOf` yok | KISMİ | T5a. |
| `board.get` + `RoomOrderCard` | yok; yerine `S/modules/order/server/actions/roomServiceRecords.ts:66-171` (RO-TAL V, outlet kapsamı yok, istatistik tarih süzgeçsiz `:113-120`) | YOK | T5a. |
| 5 sütun, SlaTimer, dahili, doluluk rozeti, dil rozeti, izin kapılı düğmeler, sipariş alımı anahtarı | `S/app/(ops)/oda-servisi/OdaServisiClient.tsx` (623 sat.): kart ızgarası + `?sekme=` (`:137,219-251`); SLA `createdAt`'ten (`:368-369`), amber eşiği sabit 20 dk (`:410`); tek `canEdit` (`:184`); dahili/doluluk/dil/anahtar yok | KISMİ | T5b. |
| `/teyit` (RO-TEL), `/teslim` (RO-TES) | `teyit/page.tsx:3-5`, `teslim/page.tsx:3-5` yalnız `redirect("/oda-servisi?sekme=…")`, izin yok; `S/components/staff/navModel.ts:54-63` ODS sekmeleri | KISMİ | T5b (sunucu kapısı). |
| OpsShell alt sekmeler | `navModel.ts` ODS ailesi | TAM | — |
| SSE + ses | `OdaServisiClient.tsx:21-30,174-181`: süzgeç yalnız otel, `order.confirmed` listede yok, ses yalnız `order.created` ve elle `AudioContext` (`useSound` yok) | KISMİ | T5b. |
| Manifest | ortak `S/app/personel.webmanifest`, `S/app/(ops)/layout.tsx:14` | TAM (ortak) | Özel manifest işi **kapatıldı**. |
| `seed-e2e` oda dünyası | `tests/e2e/seed-e2e.ts:217-223` yalnız rol→outlet üyeliği | KISMİ | T5c. |
| `room-board`, `roomServiceOps` | yok | YOK | T5a/T5c. |
| "Hazırlandı" zinciri | `OdaServisiClient.tsx:479-489` `markRoomReadyAction`; `startRoomPrepAction` hiç çağrılmıyor | **HATA** | §2.1. |
| "Mutfakta Hazırla" TEYIT'te de etkin | `OdaServisiClient.tsx:465` | **HATA (UX)** | T5b. |

### 1.6 Task 6 — SLA, eskalasyon, istatistik, pencere

| Plan gereği | Mevcut kanıt | Durum | Kalan |
|---|---|---|---|
| Dakikalık iş + cron | `S/lib/jobs.ts:18,83-91` kuyruk `rs.sla-sweep`; `tests/unit/radar-jobs.test.ts:12-23` yalnız zamanlama | TAM (ad farkı kabul) | — |
| Tarama (kapsam GONDERILDI/ONAYLANDI/HAZIR/YOLDA, başlangıç `phoneConfirmedAt ?? createdAt`, %80/%100 bir kez, koşullu UPDATE, notify, `order.sla`, audit) | `S/modules/order/server/roomService/sla.ts:22-125` `rsSlaSweep`: koşullu `updateMany` ✔ `:56-60`, audit `RS_SLA_WARN/BREACH` ✔, `publishRadar("order.sla")` ✔ strict (`:71`; şema `S/modules/radar/events.ts:177-184`); **kapsam** `SLA_OPEN_STATUSES=TEYIT_BEKLIYOR,ONAYLANDI,HAZIR,YOLDA` (`:8`) → GONDERILDI hariç/TEYIT dahil; **başlangıç `createdAt`** (`:45`); **`notify` yok** | KISMİ | T6a. |
| Radar katmanı (plan dışı) | `S/modules/radar/server/layers/roomService.ts`, `radar/alerts.ts:122`, `radar/ui/reducers/roomService.ts:45` | TAM (radar sahibi) | `slaStart` değişirse sahibine bildir. |
| `escalation` ODA dalı | `S/modules/order/server/escalation.ts:8,39,70-73`: `WAITING="GONDERILDI"`, alıcı R-SGF+R-FBM (`:14-24`), gövde `table?.label ?? "Masa yok"` | YOK | T6b. |
| `stats.sla/slowest` + action | yok | YOK | T6c. |
| SLA penceresi | `S/modules/order/ui/RoomServiceReportsWindow.tsx` (243 sat.), kayıt `rs.rapor`/`RO-SLA` (`roomServiceApps.ts:59-72`), yol `screens.ts:51` | KISMİ | T6c. |
| `run-rs-jobs.ts` | yok | YOK | T6a. |
| Testler | `rsSlaSweep` birim testi **yok**; eskalasyon oda yok; stats yok | YOK | T6a–c. |

Aynı SLA üç yerde daha kendi kuralıyla (hepsi `createdAt`): `S/modules/core/server/commandCenter.ts:95-103`, `S/modules/core/server/admin/actions/centralReports.ts:171-191`, radar katmanı. Planın P7 uyumu notu (`slaStart = phoneConfirmedAt ?? createdAt`) şu an sağlanmıyor.

### 1.7 Task 7
`roomServiceChain.spec.ts`, README/kurulum P6 bölümleri, `ilerleme-data.js` P6 satırlarının gerçek kapanışı: **YOK**.

---

## 2. Prototip kokuları

### 2.1 ENGELLEYİCİ — personel "Hazırlandı" kırık (T2R + T5b)
`orders.ts:269-271` her tür için HAZIR öncesi `prepStartedAt` ister; `OdaServisiClient.tsx:479-489` ONAYLANDI kartından doğrudan `markRoomReadyAction` çağırır, `startRoomPrepAction` (`actions/roomService.ts:58`) hiçbir arayüzden çağrılmaz → CONFLICT "Sipariş hazırlanmaya başlanmadan hazır yapılamaz". Birim test bunu gizliyor (`room-order-machine.test.ts:275` elle yazıyor). Plan: ODA'da `ONAYLANDI` zaten "hazırlanıyor"dur. Düzeltme: korumayı yalnız `kind==="MASA"` yap.

### 2.2 Yetki
- Rapor penceresi (`rs.rapor`, RO-SLA) verisini `listRoomServiceOrdersAction` ile **RO-TAL V**'den çeker (`roomServiceRecords.ts:51-62`): RO-SLA'lı/RO-TAL'sız rol pencereyi açıp FORBIDDEN alır; tersi RO-TAL'lı rol tüm raporu görür.
- Outlet kapsamı yok (`roomServiceRecords.ts:66-100`; plan: outlet rolleri `session.outletId === order.outletId`).
- `/oda-servisi/teyit|teslim` yalnız redirect, RO-TEL/RO-TES kapısı yok (`teyit/page.tsx:3-5`, `teslim/page.tsx:3-5`); tek `canEdit` = RO-TAL D her düğmede (`page.tsx:16`, `OdaServisiClient.tsx:184,449-532`); onay-sonrası "İptal / Ret" `RO-TES A` yokken görünür, tıklanınca `deny()` `YETKISIZ_DENEME` gürültüsü yazar.
- Otel girişten gelen `hotelId` (`roomServiceRecords.ts:11,51-55`) `ctx.hotelIds`+`assertCan` ile doğrulanıyor (kabul); `page.tsx:12` ise `ctx.session.hotelId ?? ctx.hotelIds[0]` ile çok otelli kullanıcıya sessizce ilk oteli seçer.
- Olumlu: yazma action'ları oteli siparişten türetir (`lockedOrder` `orders.ts:44-50`); misafir yolları oteli/odayı token'dan türetir.

### 2.3 Kilitler / eşzamanlılık / SSE kapsamı
- Eksik kilit **yok**: oda oluşturma `rooms FOR UPDATE` (`roomOrder.ts:122`), vazgeç `orders FOR UPDATE` (`:305`), `confirmPhone/transition/startPrep` `lockedOrder`, SLA koşullu `updateMany`.
- İnce: `authorizeRoomTransition` global `prisma` ile TX içinde okur (`orders.ts:107-110`) → `tx` (T2R).
- **Misafir SSE'de oda kimliği doğrulanmıyor** (alt ajan bulgusu, doğrulandı): `S/modules/menu/guestEventFilter.ts:29-32` `order.*` olaylarını yalnız istemcinin verdiği `orders=` kimlikleriyle süzer; `e.roomId === scope.roomId` karşılaştırması yalnız `mybar.*` için var. Aynı outletin başka odasının sipariş kimliği (cuid, tahmin edilmesi zor) verilirse o siparişin durum olayı (sanitize edilmiş: orderNo/status/roomId) akışa düşer. `roomOrder.get` ise doğru NOT_FOUND veriyor. Düzeltme (T3R): ROOM kapsamında `order.*` olaylarında `e.roomId`/`payload.roomId === scope.roomId` zorunlu; test = başka odanın siparişini isteyen ROOM akışı olay almaz. Mevcut test (`room-order.test.ts:533`) bu durumu kapsamıyor. (`guestEventFilter` P5/P4 ortak dosyası: yalnız T3R düzenler.)

### 2.4 UTC / iş günü
- İyi: `roomOrder.create` `businessDate()/businessDay()` (`roomOrder.ts:151,161`), radar Nicosia.
- Kötü: `RoomServiceReportsWindow.tsx:22-32` yerel saatle gün sınırı + `toISOString()`; `roomServiceRecords.ts:90-94` `new Date(dateFrom)` (UTC anı; `Order.businessDate` kullanılmıyor); `:113-120` istatistik tarihsiz, liste tarihli (KPI tutarsız); `OdaServisiClient.tsx:390`, `RoomServiceOrdersWindow.tsx:184,226-241` `toLocaleTimeString("tr-TR")` saat dilimsiz.
- P7 sahasında: `centralReports.ts:153-157` oda servisi aralığı `createdAt` (iş günü değil) — P7'ye bildirilir.

### 2.5 "sepet"
`src` içinde yok. Kalan: tanımlayıcı/anahtar adları (`cart.ts`, `validateCartItems`, `guest.cart.*`, D-12 kozmetik). P6 yeni kod/anahtarlarda `selection(s)` kullanır; yeniden adlandırma kapsam dışı.

### 2.6 Fiyat
- Misafir tarafında sızıntı yok: `toGuestOrderView` yalnız dolu fiyatı döker; `pricesShown=false` iken `null` (`roomOrder.ts:144-149`, `cart.ts:52-55`); misafir SSE beyaz liste (`menu/guestEventFilter.ts:38-58`).
- Personel/rapor: `roomServiceRecords.ts:157` `Number(o.subtotal)` null→**0**; `RoomServiceOrdersWindow.tsx:106,181,264` ve `RoomServiceReportsWindow.tsx:148,233` fiyat gizliyken "€0,00" / "Ciro — Faturalandırılan oda servisi" gösterir (plan: fiyat kapalıyken personel ekranında tutar yok; ödeme belgesi değildir).

### 2.7 SLA tanımı dört yerde farklı
Plan: `slaStart=phoneConfirmedAt ?? createdAt`, TEYIT'te sayaç işlemez, kapsam GONDERILDI/ONAYLANDI/HAZIR/YOLDA. Gerçek: sweep (`sla.ts:8,45`), commandCenter, centralReports, istemci (`OdaServisiClient.tsx:368-369,410`) hep `createdAt`. Sonuç: telefonu açılmayan teyit-bekleyen sipariş 30. dakikada "SLA aşıldı" sayılır; GONDERILDI beklemesi alarm üretmez. Tek kaynak `slaStart/slaDue/slaStateOf` (T5a); diğer tüketici sahipleri bilgilendirilir.

### 2.8 Küçük yapısal
- `roomOrder.create` TEYIT geçişini satır içi yapar (`roomOrder.ts:185-210`); `orders.transition(internal)` ve `EVENT_OF.TEYIT_BEKLIYOR` ölü/yanıltıcı (`orders.ts:25,98-103`).
- `getSetting` try/catch yutma: `roomState.ts:44-47`, `roomOrder.ts:132-136`.
- `orderLimiter` sabit (`guestOrder.ts:18`); `guest.ipRateMultiplier` ayarı mevcut (`settings-defs.ts:30,78,156`). Çözüm: oda için ayrı `roomOrderLimiter` (P5 `guestOrder.ts` değişmez).
- KDS panosu `kind` süzgeçsiz (`S/modules/order/server/kds.ts:35-36`): ODA outletinde `kdsEnabled` açılırsa oda siparişleri "Masa yok" ile KDS'ye düşer (plan T7-E). Alt ajan UX'in KDS oda servisi desteğini amaçlı sunmuş olabileceğini not ediyor; karar gerekli (§5).
- `escalation.ts:73` oda için "Masa yok".
- `OdaServisiClient` SSE süzgeci otel düzeyi (`:175`), masa siparişi sesi de tetiklenebilir.

### 2.9 Test eksikleri
Yok: `rsSlaSweep`, eskalasyon oda dalı, `board`, `stats`, `listRoomServiceOrdersAction` (izin/kapsam), ops/misafir arayüz bileşenleri, tüm P6 e2e, yeni i18n anahtarları, ROOM SSE `roomId` doğrulaması, HAZIR korumasını UI yolundan çalıştıran test.

---

## 3. Bağımlılıklar ve sahiplik

**P4:** oda sayfası P4'ün (`S/modules/mybar/ui/guest/{RoomHome,RoomFrame,RoomUnavailable}.tsx`, `app/(guest)/q/[token]/{layout,page}.tsx`, `guestTarget.ts`, `mybar/server/roomGuest.ts`). P6 yalnız: `RoomServiceSlot.tsx` (gövde + bayrak, planın açık izni), yeni `oda-servisi/page.tsx`, `siparis/[orderId]/page.tsx` ROOM dalı. `getRoomGuestState.roomServiceOpen` yalnız outlet varlığına bakar (`roomGuest.ts:81-86`) → kart `roomServiceState`'e göre "şu an kullanılamıyor" alt satırı göstermeli; `roomGuest.ts` değişmez. `RoomHome.tsx:55` yalnız-oda-servisi → `redirect(.../oda-servisi)`: sayfa var olmadan bayrak açılmaz. Oda menüsü `RoomFrame` içinde render olur; `GuestFrame`'in tema değişkenleri (`--m-*`) yoktur → T4b/T4c'de tema kapsayıcısı (GuestFrame `placeLabel` ya da tema değişkenlerini uygulayan sarmalayıcı) ve ikinci başlık/kabuk üretmeme kararı uygulayıcıya verilir.

**Radar:** `rsSlaSweep`, kuyruk, `publishRadar("order.sla")` (strict, alanlar `orderId, orderNo, roomId, roomNumber?, level, ageMin`), katman/uyarı/reducer hazır → T6'nın tarama kısmı büyük ölçüde mevcut; eksik: bildirim, doğru başlangıç/kapsam, test. Radar dosyalarını (`radar/server/layers/roomService.ts`, `radar/events.ts`, `radar/constants.ts`) P6 değiştirmez; `SLA_OPEN_STATUSES` değişimi katmanı etkiler → ayrı sabit (`RADAR_SLA_STATUSES`) ya da radar sahibiyle koordinasyon. `jobs.ts`, `realtime-events.ts`, `settings-defs.ts` P6'da değişmez. `order.sla` misafir listesine girmez.

**P7:** `centralReports.ts` kendi sorgusunu yazar; `slaStart/deliveredAt` tanımı P6 `sla.ts` yardımcısından alınmalı (P7 sahibine bildirim). T6c `stats.ts` ayrı çıktıdır. `commandCenter.ts` `delayedRoomOrders` hesabı aynı yardımcıya geçmeli (sahibe bildirim).

**Çalışma ağacı (UX/P4 dalgası):** `S/components/guide/*`, `core/screenGuide.ts`, `core/server/{guideState,helpActions,helpData}.ts`, `shell/components/Window.tsx`, `shell/icons.tsx`, `ShellClient.tsx`, `tsconfig.json`, `modules/mybar/{apps.ts,server/adminViews.ts,server/actions/admin.ts}`, `shell/apps/Mybar*` — P6 dokunmaz. Rehber turu `data-guide` işaretçilerine dayanır (`talep-listesi, teyit-listesi, teslim-listesi, talep-ac, ara, onayla, yola-cik, teslim-edildi, sonuc, sla-ozeti`): T5b/T6c yeniden yazımda **korunur**.

**Tekil sahipler:** minibar `S/modules/minibar/server/pool.ts` (ve tüm minibar) — P6 hiç dokunmaz. `orders.ts` yalnız T2R; `escalation.ts` yalnız T6b; `sla.ts` önce T5a (saf yardımcılar) sonra T6a (sweep); `roomOrder.ts/roomState.ts/guestEventFilter.ts` yalnız T3R; `messages/*.json` yalnız T4a; `MenuBrowser/GuestFooter/SelectionsDrawer/GuestFrame` yalnız T4b; `OrderStatus.tsx`, yeni misafir sayfaları, `RoomServiceSlot.tsx` yalnız T4c; `OdaServisiClient.tsx` + ops sayfaları yalnız T5b; `roomServiceRecords.ts` T5a (küçük `subtotal` düzeltmesi) sonra T6c; `RoomServiceOrdersWindow.tsx`/`RoomServiceReportsWindow.tsx` yalnız T6c; `tests/e2e/seed-e2e.ts` önce "seed task'ı" (§4.2).

---

## 4. Revize P6 görev listesi

Her task sonunda `npm run check` yeşil; Türkçe Conventional Commit; her ajan kendi test DB/port'unu kullanır (`.superpowers/sdd/PARALEL-KURALLAR.md`), yalnız kendi dosyalarını `git add <dosya>` ile sahneler.

### 4.1 Paralellik

| Dalga | Task'lar |
|---|---|
| Hemen, paralel | **T2R, T3R, T4a, T4b, T5a, T6b**, seed task'ı (S0, §4.2) |
| Sonra | T4c (T4a+T4b), T4d (T4c+S0), T5b (T5a, T2R), T5c (S0, T5b), T6a (T5a), T6c (T5a) |
| Son | T7 |

### T1 — kapalı — mevcut kod
Doğrulama testleri: `rs-schema`, `guest-state-rs`, `menu-access`, `admin-rooms`. İş yok.

### T2R — Durum makinesi kalan düzeltmeler (küçük)
**Dosyalar:** Modify `S/modules/order/server/orders.ts`, `tests/unit/room-order-machine.test.ts`.
**Arayüzler:** HAZIR koruması (`:269`) yalnız `order.kind==="MASA"`; `authorizeRoomTransition` `phoneConfirmRequired`'ı `tx` ile okur (imzaya `tx` ekle); ölü `internal`/`EVENT_OF.TEYIT_BEKLIYOR` kaldır (ya da "kullanılmıyor" yorumu). `startRoomPrepAction/orders.startPrep` değişmez.
**Adım 1 testler:** (1) ODA `ONAYLANDI`, `prepStartedAt` yokken R-MUS `HAZIR` yapar; (2) MASA aynı durumda hâlâ CONFLICT (P5 testleri aynen yeşil); (3) `:275`'teki elle `prepStartedAt` kaldırılıp zincir gerçek yoldan koşar.

### T3R — Misafir sipariş sapmaları (küçük)
**Dosyalar:** Modify `S/modules/order/server/roomService/{roomOrder,roomState}.ts`, `S/modules/menu/guestEventFilter.ts`, `tests/unit/{room-order,room-state}.test.ts`.
**Arayüzler:** `roomOrderLimiter = createRateLimiter({ max: () => scaledMax(10), windowMs: 60_000 })` (create); `guestCancel` ayrı sabit limiter; `getSetting` try/catch'siz; `guestEventFilter`: scope'ta `roomId` varsa `order.*` olayı `e.roomId===scope.roomId` (payload `roomId` yedek) şartı. `guestOrder.ts` DEĞİŞMEZ.
**Adım 1 testler:** `guest.ipRateMultiplier=3` → 30 istek/dk kabul, 31. RATE_LIMITED; çarpan 1'de 11. reddedilir; vazgeç çarpandan etkilenmez; ayar okuma hatası yutulmaz; ROOM akışı aynı outletin başka odasının `orderId`'sini isteyince o olayı almaz (kendi siparişinin `order.onway` olayı düşer; masa akışı davranışı aynı).

### T4a — Misafir i18n (küçük)
**Dosyalar:** Modify `S/lib/i18n/messages/{tr,en,de,ru,ar}.json`, `tests/unit/i18n.test.ts`.
**Arayüzler:** 5 dilde aynı küme, boş yok: `guest.room.card.roomService`, `guest.room.card.roomServiceHint`, `guest.rs.menu.title`, `guest.rs.selections.submit`, `guest.rs.limit`, `guest.rs.order.status.{TEYIT_BEKLIYOR,ONAYLANDI,HAZIR,YOLDA,TESLIM_EDILDI,IPTAL}`, `guest.rs.order.{confirmHint,eta,cancel,cancelConfirm,cancelled}`, ortak `guest.order.status.{TEYIT_BEKLIYOR,YOLDA,TESLIM_EDILDI}`; ölü `guest.room.placeholder` silinir. Çeviriler: Seçimler / Selections / Auswahl / Выбор / الاختيارات; "satın al/ödeme" yok.
**Adım 1 testler:** `i18n.test.ts` anahtar eşitliği + boş değer yok + "sepet" geçmez.

### T4b — Menü bileşenleri `mode="room"` (orta)
**Dosyalar:** Modify `S/modules/menu/ui/guest/{MenuBrowser,GuestFooter,SelectionsDrawer,GuestFrame}.tsx` (+`MenuView/ItemSheet` yalnız prop geçişi için). Test: `tests/unit/guest-room-mode.test.tsx`.
**Arayüzler:** `mode?: "table"|"room"` (varsayılan `"table"`, **masa davranışı ve P5 testleri bit-bit aynı**); room'da `CallWaiterButton` yok; gönderim aynı `POST /api/q/{token}/order`; `GuestFrame` genel `placeLabel` (`tableLabel` takma ad); gönder metni room'da `rs.selections.submit`; `orderingOpen=false` → seçimler düğmesi yok; fiyat yalnız `menu.state.pricesShown`; `useGuestEvents` değişmez.
**Adım 1 testler:** room render: garson çağır yok, "Oda 101", doğru gönder metni; modsuz render masa ile aynı; `pricesShown=false` → "€" yok.

### T4c — Kart, oda servisi sayfası, durum sayfası (orta; T4a+T4b sonrası)
**Dosyalar:** Create `S/modules/order/ui/guest/{RoomServiceCard,RoomOrderStatus}.tsx`, `S/app/(guest)/q/[token]/oda-servisi/page.tsx`; Modify `S/modules/menu/ui/guest/OrderStatus.tsx`, `S/app/(guest)/q/[token]/siparis/[orderId]/page.tsx` (TABLE|ROOM), `S/modules/mybar/ui/guest/RoomServiceSlot.tsx` (**bayrak son commit**).
**Arayüzler:** `RoomServiceCard({token,locale,state:RoomGuestState})` sunucu bileşeni, `roomServiceState(state.roomId)`'i kendisi yükler; sayfa: ROOM değilse `notFound()`, `roomServiceOpen=false`→`redirect('/q/{token}')`, `getMenu(rsOutletId, locale)`→`MenuBrowser mode="room"`; ODA adımları Gönderildi→Teyit(yalnız `confirmRequired`)→Hazırlanıyor→Yolda→Teslim; TEYIT'te ipucu, ONAYLANDI..YOLDA ETA, GONDERILDI|TEYIT'te Vazgeç (onay diyaloğu → `POST …/order/cancel`), IPTAL/TESLIM metinleri; fiyat yalnız `order.pricesShown`.
**Adım 1 testler:** `OrderStatus` ODA adım sayısı (confirmRequired'e göre 4/5), IPTAL banner, Vazgeç yalnız açık durumlarda; `siparis` sayfası başka odanın siparişi → bulunamadı; `RoomServiceSlot` kartı render eder ve `ROOM_SERVICE_READY===true`.

### T4d — Misafir e2e (orta; T4c + S0 sonrası)
**Dosyalar:** Create `tests/e2e/guestRoomService.spec.ts`.
**Adım 1 testler:** planın T4 senaryosu: kart→menü→Çay×2+not→Seçimlerim "2"→gönder→"Gönderildi","#1"→yenile aynı; teyit varyantı "Teyit"+Vazgeç→"İptal"; `?lang=ar` RTL; fiyat HIDE'da "€" yok; MRD'de kart yok+yönlenme; pasif oda; `orderingEnabled=false` iken seçim düğmesi yok ama mevcut sipariş sayfası açık.

### T5a — `sla.ts` saf yardımcılar + `board.get` (orta; hemen)
**Dosyalar:** Modify `S/modules/order/server/roomService/sla.ts` (**yalnız** saf yardımcı ekle; `rsSlaSweep` gövdesine dokunma), Create `S/modules/order/server/roomService/board.ts`, `S/modules/order/server/actions/roomServiceBoard.ts`, `tests/unit/{room-board,room-sla-helpers}.test.ts`; Modify `roomServiceRecords.ts` (yalnız `subtotal` null→`undefined`, fiyat gizliyken tutar yok).
**Arayüzler:** `slaStart`, `slaDue`, `slaStateOf` (plan imzaları; TEYIT→'OK'); `board.get(ctx,outletId):Promise<RoomBoard>` plan arayüzü (sütunlar CONFIRM/NEW/PREP/READY/ONWAY `slaDueAt` artan; `RoomOrderCard` `extension?`, `occupancy` = `occupancyHint(hotelId, roomIds, businessDay(businessDate()))`, `subtotal/currency` yalnız `pricesShown`; `kpis.today` Nicosia iş günü; `orderingEnabled`, `confirmRequired`); `assertCan(ctx,'RO-TAL','V',hotelId)`, `outletAllowed`, ODA_SERVISI değilse NOT_FOUND; `getRoomBoardAction(outletId)` (`safeAction`, otel outletten).
**Adım 1 testler:** plan `room-board` maddeleri (sütun eşlemesi, sıra, 25 dk WARN/31 dk BREACH/5 dk OK, teyitten ölçüm, TEYIT kartı OK, dahilisiz oda çökmez, occupancy BILINMIYOR/BOS, fiyat HIDE'da `subtotal` anahtarı yok, R-GAR FORBIDDEN, BAR NOT_FOUND, çapraz otel FORBIDDEN, `kpis.today`, `avgDeliverySec`) + `slaStateOf` tablosu (24 dk OK, 24:01 WARN, 30 BREACH, 29 dk teslim ON_TIME, 31 LATE, IPTAL CANCELLED). Eşik notu: ">=%80 WARN" kuralı; plan metnindeki "24 dk OK" örneği 24:00 sınırı olarak yazılır (24:00 → WARN değil OK değil; kararı test adına yaz).

### T5b — `/oda-servisi` arayüzü yeniden yazımı (büyük; B1 sunucu / B2 istemci olarak bölünebilir; T5a+T2R sonrası)
**Dosyalar:** Create `S/modules/order/ui/roomService/{RoomOrderCard,SlaTimer}.tsx`; Modify `S/app/(ops)/oda-servisi/{page.tsx,OdaServisiClient.tsx}`, `teyit/page.tsx`, `teslim/page.tsx`; test `tests/unit/room-ops-ui.test.tsx`.
**Arayüzler:** sayfa sunucuda `can()` bayraklarını hesaplar (`talepD, teyitD, teslimD, teslimA, talepA`); `?sekme=teyit|teslim` yalnız RO-TEL/RO-TES `V` ile, aksi `denyScreen`; "ilk oteli seç" geri dönüşü kaldırılır. İstemci `board`'a dayanır (5 sütun, mobilde çip seçici), `SlaTimer`, "Dahili tanımlı değil", "Oda boş görünüyor", dil rozeti; NEW "Onayla" (`confirmRequired` ise pasif + "Önce telefonla teyit edin"), "İptal" (sebep diyaloğu), PREP "Hazır", READY "Yola çıktı" (yalnız `teslimD`), ONWAY "Teslim edildi", onay-sonrası iptal yalnız `teslimA`; sipariş alımı anahtarı (`talepA`, `setOrderingEnabled`); SSE `e.outletId===outletId`, `order.created|confirmed|approved|prep|ready|onway|delivered|cancelled|sla`; sesler `useSound`; saatler `timeZone:"Europe/Nicosia"`; `data-guide` işaretçileri korunur.
**Adım 1 testler:** izin bayraklarına göre düğme görünürlüğü; TEYIT kartında Onayla pasif; dahilisiz etiket; boş rozet; sütun sırası; RO-TEL'siz kullanıcı `?sekme=teyit` engellenir.

### T5c — E2E personel (orta; S0 + T5b sonrası)
**Dosyalar:** Create `tests/e2e/roomServiceOps.spec.ts` (manifest işi **yok** — ortak `personel.webmanifest`).
**Adım 1 testler:** planın `roomServiceOps` senaryosu (misafir API ile sipariş → "Yeni" sütununda "#1 · Oda 101 · Dahili 4101" → Onayla → mutfak.oda Hazır → Yola çıktı → Teslim edildi, misafir sayfası her adımı yansıtır; 102 "Dahili tanımlı değil"; `loadInHouse(['102'])` → 101 "Oda boş görünüyor"; teyit varyantı; sipariş alımı kapat → 409).

### S0 — e2e seed (küçük; hemen)
**Dosyalar:** Modify `tests/e2e/seed-e2e.ts`, gerekirse `tests/e2e/e2eDb.ts`/`opsUi.ts` yardımcıları.
**İçerik:** MR oda 101 (dahili 4101) ve 102 (dahilisiz), imzalı tokenlar; Oda Servisi menüsünde "Çay", "Club Sandviç"; `oda.mr` (R-ODS), `mutfak.oda` (R-MUS) oda servisi outletine üye, `fbm.mr` oda servisi outletine de üye; karşı otel (MRD) odası; DB yardımcıları `setPhoneConfirm(hotelCode,bool)`, `loadInHouse(hotelCode,rooms[])`. Genel seed rol bağlarını bozma (`seed.test.ts` yeşil).
**Adım 1 testler:** seed sonrası birim/küçük doğrulama betiği (odalar+token+menü+kullanıcılar var).

### T6a — SLA tarama düzeltmesi + bildirim + test (orta; T5a sonrası)
**Dosyalar:** Modify `S/modules/order/server/roomService/sla.ts` (`rsSlaSweep` gövdesi), Create `tests/unit/room-sla.test.ts`, `tests/e2e/helpers/run-rs-jobs.ts`.
**Arayüzler:** kapsam GONDERILDI/ONAYLANDI/HAZIR/YOLDA (TEYIT çıkar; radar katmanı `SLA_OPEN_STATUSES` kullandığı için ayrı `RADAR_SLA_STATUSES`/koordinasyon, radar testleri koşulur); başlangıç `slaStart(order)`; koşullu `updateMany` aynen; BREACH okunmuş eski adayla önceki WARN zamanını ezmez, eşik güncel satırdan doğrulanır; notify aynı TX'te: WARN → outletin online R-ODS/R-BUT/R-MUS + R-FBM (`order.sla.warn`, "Oda servisi gecikiyor · Oda N", "#N · {kalan} dk kaldı"); BREACH → R-FBM + R-MUS + outlet personeli (`order.sla.breach`, "Oda servisi SLA aşıldı · Oda N", "#N · {geçen} dk"); `publishRadar` tek yayın (ikinci yayın yok). `jobs.ts` değişmez.
**Adım 1 testler:** 25 dk ONAYLANDI → `{warned:1,breached:0}`, 2. koşu `{0,0}`; 31 dk → `breached:1` + audit `RS_SLA_BREACH` 1 satır + R-MUS bildirimi; TESLIM/IPTAL/TEYIT taranmaz; teyit sonrası saat `phoneConfirmedAt`'ten; GONDERILDI taranır; MR `rs.slaMinutes=10` yalnız MR; iki eşzamanlı `run` tek bildirim; gece yarısı 23:50→00:10 `businessDate` oluşma günü; ilk görüşte ihlal → yalnız BREACH (+`slaWarnedAt` dolu).

### T6b — Eskalasyon oda dalı (küçük; hemen)
**Dosyalar:** Modify `S/modules/order/server/escalation.ts`; Create `tests/unit/room-escalation.test.ts`.
**Arayüzler:** adaylar `status IN (GONDERILDI,TEYIT_BEKLIYOR)`; alıcı `kind`'a göre: MASA mevcut (R-SGF üyelik süzgeçli + R-FBM), ODA R-FBM + R-MUS (outlet üyeliği süzgeçli, R-SGF yok); oda başlığı "Oda servisi onay bekliyor", gövde `#{no} · Oda {no} · {dk} dk · {Teyit bekliyor|Onay bekliyor}`; koşullu `updateMany` `status in WAITING`; "Masa yok" yalnız MASA.
**Adım 1 testler:** 3 dk GONDERILDI oda → R-FBM+R-MUS, R-SGF yok; 3 dk TEYIT_BEKLIYOR de; 2. koşu 0; MASA davranışı değişmez.

### T6c — `stats` + "Oda Servisi SLA" penceresi (orta; T5a sonrası)
**Dosyalar:** Create `S/modules/order/server/roomService/stats.ts`, `S/modules/order/server/actions/roomServiceStats.ts`, `tests/unit/room-stats.test.ts`; Modify `S/modules/order/ui/RoomServiceReportsWindow.tsx` (id `rs.rapor`/`RO-SLA` kalır; `data-guide="sla-ozeti"` korunur), `S/modules/order/ui/RoomServiceOrdersWindow.tsx` (tutar null durumu), `roomServiceRecords.ts` (rapor mantığı buradan ayrılır).
**Arayüzler:** `stats.sla(ctx,hotelId,{from,to})` (`RO-SLA V`, iş günü `Order.businessDate`, ≤92 gün aksi VALIDATION, plan `SlaStats` alanları, süre = `deliveredAt − slaStart`, boşta oranlar `undefined`), `stats.slowest`; pencere: iş günü seçici (son 7 gün), KPI kartları, CSS çubuk grafik, "En yavaş 20"; "30 dk" sabiti yok; tutar kartı yalnız `pricesShown`.
**Adım 1 testler:** plan `room-stats` (10/20/31/40 dk teslim + 1 iptal + 1 açık → `total 6, delivered 4, cancelled 1, open 1, onTimePct 50, avgDeliverySec 1275`), R-GAR FORBIDDEN, R-FBM ok, çapraz otel görünmez, 93 gün VALIDATION, boş aralık `undefined`, gece yarısı sınırı, RO-SLA'lı/RO-TAL'sız rol raporu görür.

### T7 — Kabul, belgeler, ilerleme (küçük; en son)
**Dosyalar:** Create `tests/e2e/roomServiceChain.spec.ts`; Modify `merit/README.md`, `docs/kurulum.md`, `D:\PROJECTS\qrmenu\ilerleme-data.js` (+public kopyası).
**Adım 1 testler:** planın A–F zinciri; `/kds`'te ODA siparişi görünmez (gerekirse `kds.ts` `kind:'MASA'` tek satır); SLA zinciri `run-rs-jobs.ts` ile; ilerleme yalnız gerçek durumla `done`.

### 4.2 Ortak dosya kuralı
`tests/e2e/seed-e2e.ts` yalnız **S0** düzenler; T4d/T5c ona dayanır (iki paralel e2e yazarının aynı seed'e yazmasını önler).

### 4.3 Boyut
Küçük: T2R, T3R, T4a, T6b, S0, T7. Orta: T4b, T4c, T4d, T5a, T5c, T6a, T6c. Büyük: T5b (B1/B2 böl).

---

## 5. Erkan'a açık sorular
1. SLA başlangıcı/kapsamı plan kuralı mı (teyit bekleyen sayaç işlemez, GONDERILDI kapsamda) yoksa mevcut mu? Öneri: plan kuralı; radar/commandCenter/centralReports aynı yardımcıya geçer.
2. Rapor penceresi id'si `rs.sla` mı mevcut `rs.rapor` mı? Öneri: `rs.rapor` kalsın (ekran yolu buna bağlı), başlık "Oda Servisi SLA".
3. `getRoomGuestState.roomServiceOpen` yalnız outlet varlığına bakıyor (menü kapalı/boş otelde kart görünür); P4 dosyasına dokunmadan kartın alt satırında "şu an kullanılamıyor" göstermek yeterli mi?
4. KDS panosuna `kind` süzgeci (P5 `kds.ts`, tek satır): UX KDS'nin oda servisini desteklemesi amaçlı mı? Değilse T7'de eklenir.
