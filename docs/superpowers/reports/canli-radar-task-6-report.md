# Radar Görev 6 raporu — Gün tekrarı (RD-6)

Ajan `rd6`, dal `ux/yenileme`, DB `merit_test_rd6`, port 3046 (sunucu başlatılmadı), `NEXT_DIST_DIR=.next-rd6`.

## Yapılanlar

Yeni dosyalar (`merit/` altı):

- `src/modules/radar/server/replay/limits.ts` — `parseReplayQuery`, `ReplayQuery`, `MAX_EVENTS = 50_000`, `PAGE = 2000`, `formatCursor`.
- `.../replay/merge.ts` — `mergeSources` (k-yollu birleştirme, `compareRadarEvents` sırası, erken çıkışta tüm kaynaklar kapatılır).
- `.../replay/stream.ts` — `ReplayLine`, `replayLines(ctx, q, layers, { maxEvents?, page? })`.
- `.../replay/audit.ts` — `auditReplayOnce` (10 dk tekilleştirme, advisory kilit ile yarışa karşı güvenli).
- `.../replay/sources/{paging,orders,tables,print,rooms,mybar,stock,staff}.ts`.
- `src/app/api/radar/replay/route.ts` — NDJSON rotası.
- `src/modules/radar/server/layers/asOf.ts` — geçmiş durum yardımcıları (`orderStatusesAt`, `taskStatusesAt`, `latestOperations`).
- `tests/unit/radar-replay.test.ts` — 30 test.

Değişenler: `server/snapshot.ts` (`opts.asOf`), `server/config.ts` (`LayerEnv.historical`, `loadEnv(…, historical)`), `layers/{order,minibar,roomService,staff,system}.ts` (tarihsel dallar; `asOf` yokken güncel yol aynen).

## Sınırlar ve sözleşme kararları

- Pencere **(from, to]**: `from` anındaki durum snapshot'ta, olaylar `at > from` ve `at <= to`. Böylece ardışık pencereler çakışmaz/boşluk bırakmaz ve snapshot ile olaylar çift sayılmaz.
- `to` `HH:mm[:ss]`, `24:00` ve ötesi (`24:30` = ertesi gün 00:30) olabilir; `from` < 24 sa. Pencere en çok 24 sa. Gece yarısını kesen pencere bu yolla mümkün (`from=00:30&to=24:30`). DST günlerinde duvar saati ile çözülür.
- `day`: bugünden ileri değil, `bugün − radar.replayRetentionDays`'tan geri değil (sınır günü dahil). Saklama süresi otel ayarından okunur (varsayılan 90).
- Doğrulama hataları `DomainError("VALIDATION")`, ileti Türkçe, rota 400 döner: "Gelecekteki bir gün oynatılamaz", "Gün saklama süresi dışında", "Başlangıç saati bitişten önce olmalı", "Pencere en çok 24 saat olabilir", "Geçersiz imleç", "İmleç pencerenin dışında" vb.
- **İmleç** `<isoAt>|<eventId>`: "bu olaydan sonra". Devam isteğinde (imleç varken) **snapshot satırı gönderilmez** (istemci durumunu korur); kaynaklar `at >= cursor.at` okur, akış imleç olayına kadar olan aynı-an olaylarını atlar.
- `more.nextFrom` = son gönderilen olayın `at` değeri, `more.cursor` = `<at>|<id>`. Sonra her zaman `end {count}` gelir. Tam sığan gün için `more` yoktur (bir fazla olayı önden bakarak anlar).
- Rota: `requireUser` → `parseReplayQuery` → `assertRadarScope(R)` (başarısızsa 403 + `YETKISIZ_DENEME`) → ayrıca `assertRadarScope(V)` (ilk satır snapshot olduğu için; akış başlamadan 403) → `auditReplayOnce` → akış. Denetim her istekte çağrılır (imleçle atlatma yok), tekilleştirme 10 dk. `Cache-Control: no-store`, `application/x-ndjson; charset=utf-8`.
- Sayfalama: her kaynak alt-yineleyici başına `(zaman sütunu, id)` anahtar kümesi; sayfa dolarsa son milisaniyeyi bir sonraki sayfaya bırakır (aynı ms'nin olayları hiç bölünmez, sayfa içinde `compareRadarEvents` ile sıralanır). Tek ms bir sayfadan büyükse o ms tek seferde çekilir.
- Olay kimlikleri: `<tablo>:<satırId>:<alt>` (örn. `order_events:<id>:status`, `waiter_calls:<id>:opened`); sentetik hazırlık `order-prep:<orderId>`.

## Kaynak eşlemesi (kısıtlar)

- Yasak sütunlar hiç seçilmez (`note`, `rejectReason`, fiyat, `ip`, `userAgent`, `deviceLabel`, `error`, `payload`, `closeNote`...). Denetim kaydında yalnız `before->>'roomId'` okunur.
- `room.checked`: `RoomCheck.endedAt` olan satırlar (ACIK/devam eden kontrol olay değildir).
- `dnd.marked`: `RoomDndCheck`; `status` = `no >= dnd.minChecks ? TAMAMLANDI : AKTIF`.
- `task.updated`: `TaskStatusLog`; günlüğü hiç olmayan kalemler için `DailyTaskItem.checkedAt` yedeği (TAMAMLANDI).
- `stock.level`: pencere fonksiyonu ile (bugünkü `remainingQty` − sonraki işaretli hareketler).
- `upload.status EKSIK`: `OperationEvent(upload.missing)` hangi dosyaların eksik olduğunu saklamıyor; üç tür (IN_HOUSE/ARRIVAL/DEPARTURE) birden EKSIK üretilir. Tamamlanan yüklemeler `OccupancyUpload` (TAMAMLANDI/HATA, `updatedAt`).
- `presence`: giriş `UserSession.loginAt`, çıkış `logoutAt` (DUSURULDU/CIKTI), `UYARI` `SessionEvent WARN`, `BOSTA` `OperationEvent(presence.idle)`. SISTEM rolü oturumları ve `mail.failed` yalnız SISTEM çağırana.
- `print.job BASILIYOR` olayı yok (ara denemeler kaybolur — spec kabulü); anlık görüntüde ise BASILIYOR işi `startedAt/updatedAt <= asOf` ise BASILIYOR.
- Kapsam: katman süzgeci kaynaklarda (kapalı katmanın tabloları hiç sorgulanmaz) ve `stream.ts`'te ikinci kez uygulanır.

## `asOf` anlık görüntüsü

`radarSnapshot(ctx, hotelId, { asOf })`: `now = asOf`, `businessDate(asOf)`, önbellek/singleFlight yok. Sipariş durumu `DISTINCT ON (order_id) … at <= asOf`, OrderEvent izi hiç olmayan eski kayıtlar güncel durumu korur; çağrı `createdAt <= asOf ∧ (resolvedAt null ∨ > asOf)`; iş durumu `PrintJob` zaman damgalarından; yazıcı sağlığı/masa atama `OperationEvent` son kaydından; görev durumu `TaskStatusLog`; DND sayacı `RoomDndCheck`; MyBar `completedAt/cancelledAt`; havuz bugünkü `remainingQty` − asOf sonrası hareketler; oturum `loginAt <= asOf ∧ (logoutAt null ∨ > asOf)`; kat kontrolü `endedAt > asOf` olanlar sayılmaz; `checkDate` iş gününe bağlı olduğundan 00:05 anlık görüntüsü önceki günün `checkedToday` değerini taşımaz. Bilinen fark: `BOSTA` (idle) işaretçisi anlık görüntüde yok (istemci türetir), asOf'ta başlamış oturumlar akışta yalnız `presence` olayıyla gelir (indirgeyici bilinmeyen oturum için yenileme ister).

## Testler (`tests/unit/radar-replay.test.ts`, 30 test)

limits (varsayılan/HH:mm:ss/yarın/retention±1/ters ve 25 sa pencere/biçim/imleç) · merge (sıra, aynı `at`'te yaratma önce, kararlılık, boş) · akış (snapshot ilk, toplam sıra, tüm olay türleri, kaynak eşlemeleri, sayfa 2/3/5 ile kayıpsız-çiftsiz, aynı ms üç kaynak, öğlen 12:00 snapshot'ı, gece yarısı iş günü ayrımı, gizlilik anahtar + değer taraması) · kapsam (PREMIUM→403+`YETKISIZ_DENEME`, R'siz rol 403, MB-KAT'sız rolde minibar yok, SISTEM dışı rolde `mail.failed`/SISTEM oturumu yok, isim olaylarda yok) · rota 400/başlıklar · tavan (`maxEvents=10` → `more`+`end`, imleç zinciri çiftsiz; tam sığan günde `more` yok) · denetim (10 dk/11. dk/kullanıcı-otel-gün ayrımı/rota/paralel) · metamorfik (snapshot(09:30) + olaylar = snapshot(18:00), staff hariç) · `asOf=now` ≡ güncel `comparableState`.

Not (TDD): gerçeklemeyi önce yazıp testleri sonra çalıştırdım; RED adımı ayrı koşturulmadı. Testler ilk çalıştırmada 29/30, düzeltmeden sonra 30/30 geçti.

## Doğrulama

- Tek dosya, boşta bir DB'de: `radar-replay.test.ts` 30/30 yeşil; `npx tsc --noEmit` benim dosyalarımda temiz; `eslint` 0 hata (benim dosyamda uyarı yok).
- `NEXT_DIST_DIR=.next-rd6 npx next build` yeşil (`/api/radar/replay` rota listesinde).
- Tam `vitest run` sırasında Postgres sunucusu 100 bağlantı sınırında doydu (diğer ajanların e2e sunucuları ~85 bağlantı tutuyor, `too many clients`); başarısızlıkların tamamı bu bağlantı hatası veya başka ajanların bölgesi: `seed`, `sessions`, `settings`, `onlineUsers`, `menu-*`, `minibar-dnd`, `minibar-occupancy-upload`, `admin-hotels`, `migrate-*` (mb13), `uxRatchet` (ux ajanları: `kat/oda-kontrol`, `kat/qr` kaydı). Benim değişikliklerimle ilgili değil; `npm run check` içindeki typecheck'te tek dışarıdan hata `src/app/kat/(home)/KatDashboard.tsx(199)` ve `tests/unit/minibar-auth.test.ts` (başka ajanlar).

## T10 oynatıcı için devir notları

1. İstek: `GET /api/radar/replay?hotelId&day=YYYY-MM-DD&from=HH:mm&to=HH:mm[&cursor]`; yanıt satır satır JSON (`ReplayLine`). `from` her zaman < 24:00; gün sonu `to=24:00`.
2. İlk istekte ilk satır `snapshot` (`state` = `from` anı). `more` gelirse **aynı sorguyu** `cursor=<more.cursor>` ile yeniden iste; devam yanıtında snapshot yoktur, mevcut oynatıcı durumu korunur. `end.count` o yanıttaki olay sayısıdır.
3. Olaylar `(at, SOURCE_RANK, id)` sıralıdır; istemci yeniden sıralamak zorunda değil (`applyEvents` yeterli).
4. Kimlikler `<tablo>:<id>:<alt>`; `order-prep:<orderId>` sentetik KDS hazırlık geçişidir (`prep: true`). `presence.status = "BOSTA"` boşta işaretidir; `mail.failed` yalnız SISTEM oturumunda gelir.
5. Kapsam dışı katmanın olayı ve snapshot katmanı hiç gelmez; `people` yalnız snapshot'tadır (olaylarda ad yok, `byUserId` var).
6. 403: JSON `{ ok:false, error:{ code:"FORBIDDEN", message } }`; 400: aynı biçim, Türkçe `message`.
7. Her istek `RADAR_REPLAY` denetim kaydı dener (10 dk/kullanıcı+otel+gün tekilleştirme).
