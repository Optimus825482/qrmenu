# P4 Task 3 raporu — Misafir oda durumu, katalog, talep oluşturma ve API

Dal `ux/yenileme` (HEAD 0a40ea8 üstüne tek commit). Ajan `p4t3`, DB `merit_test_p4t3`, `NEXT_DIST_DIR=.next-p4t3`.

## Yeni dosyalar (`merit/`)
- `src/modules/mybar/server/sanitize.ts` — `sanitizeNote`
- `src/modules/mybar/server/roomGuest.ts` — `getRoomGuestState`, `openRoom`, `ROOM_CLOSED_MESSAGES`, `ROOM_SERVICE_READY` (sabit false)
- `src/modules/mybar/server/catalog.ts` — `roomCatalog(roomId, locale)`, `catalogProductIds(roomId, db?)`, `catalogQuantityMode`
- `src/modules/mybar/server/guestRequest.ts` — `mybarSubmitSchema`, `createGuestRequest`, `guestRequestStatus`, `roomRequestStatus`, `ipLimiter`/`roomLimiter`/`statusLimiter`
- `src/modules/mybar/server/fanout.ts` — `notifyNewRequest`
- `src/app/api/q/[token]/mybar/route.ts` — `POST` (talep) ve `GET` (bugünkü talep durumu, `?locale=`)
- `tests/unit/mybar-guest-request.test.ts` — 21 test (RED: modül yok -> GREEN)

Not: plandaki `tests/unit/mybar-guest.test.ts` adı eski (legacy) `minibar/server/mybarService` testiyle çakıştığı için yeni dosya `mybar-guest-request.test.ts` adıyla açıldı; legacy servis, `/api/minibar/mybar/request` rotası ve testi dokunulmadı (T4/T7 geçişinde kaldırılabilir).

## Davranış özeti
- Sıra: IP limiti (30/dk, `guest.ipRateMultiplier` ile ölçekli) -> zod -> token (`resolveGuestTokenLimited`, log kapalı; bilinmeyen tokende `QrScanLog ok=false` elle yazılır, `scan.room` gürültüsü yok) -> oda limiti (60/dk) -> oda durumu -> idempotency tekrarı -> not (sanitize, 500) -> boş istek -> `translateNoteForStaff` (transaction ve kilit DIŞINDA) -> transaction.
- Transaction: `rooms ... FOR UPDATE`; kilit sonrası idempotency yeniden kontrolü (aynı anahtarlı eşzamanlı çağrı `duplicate:true`); günlük sınır (`mybar.dailyLimit`, `IPTAL` hariç, `businessDay(businessDate())`) -> `DAILY_LIMIT`; ürün doğrulaması tx içinde; talep + kalemler; `audit MYBAR_CREATE` (userId yok, PII yok: yalnız roomId/adet/dil, `ip` kolonu plana uygun); `notifyNewRequest`; `publishMybar('mybar.created')` (strict RADAR_WIRE yükü). `P2002` yakalanıp tekrar yanıtına çevrilir.
- TICK modunda `qty` önce 1'e normalize edilir, sonra `maxQty` ile karşılaştırılır (plandaki iki cümle çelişiyordu).
- Katalog: aynı ürün birden çok setup'ta en yüksek adet; `maxQty` TICK 1 / `setup` adedi / sayı, en çok 20; fiyat alanı hiç dönmez; adlar `localizeTexts` ile (fallback Türkçe).
- Oda durumu: `ODA_PASIF -> OTEL_PASIF -> MYBAR_KAPALI`, ek olarak yeni `ODA_BOS`: otelin o gün IN_HOUSE doluluk verisi VARSA ve oda listede değilse kapalı ("Bu oda şu an dolu görünmüyor..."); veri yoksa (BILINMIYOR) engellenmez, yoksa doluluk yüklemeyen oteller çalışmazdı.
- Durum uç noktası: bugünün en yeni talebi -> `BEKLIYOR` (seenAt yok) / `GORULDU` / `KARSILANDI` / `IPTAL`; personel adı, iç not, fiyat yok; kalem adları misafir dilinde.
- Route: gövde 16 KB üstü 413; hotel/oda gövdeden asla okunmaz; hata kodları `DomainError.httpStatus`.

## Doğrulama
- `DATABASE_URL_TEST=...merit_test_p4t3 npx vitest run tests/unit/mybar-guest-request.test.ts` -> 21/21 geçti.
- `npx tsc --noEmit` temiz; eslint (kendi dosyalarım) temiz; `NEXT_DIST_DIR=.next-p4t3 npx next build` başarılı.

## T4 (misafir sayfası) için devir
- Sunucu tarafı: `openRoom(target)` -> `RoomGuestState` (`reason` artık `ODA_BOS` da olabilir; `mybar.unavailable.ODA_BOS` mesaj anahtarı eklenmeli; Türkçe karşılık `ROOM_CLOSED_MESSAGES`), `roomCatalog(roomId, locale)`, `roomRequestStatus(roomId, locale)` (sayfa yüklenirken "bugün talep gönderildi" durumunu göstermek için), `state.guestMessage` çevirisi `localizeTexts` ile T4'te.
- İstemci: `POST /api/q/{token}/mybar` gövde `{ idempotencyKey(uuid), locale, items:[{productId, qty}], note? }`; başarı `{ ok:true, data:{ requestId, duplicate, createdAt } }`. Hata kodları: `RATE_LIMITED` 429, `NOT_FOUND` 404, `CONFLICT` 409 (oda kapalı / anahtar başka odada), `DAILY_LIMIT` 409, `VALIDATION` 400 (`fieldErrors.items` ürün adları, `fieldErrors.note`), 413 büyük gövde. `GET /api/q/{token}/mybar?locale=` -> `{ request: null | { requestId, status, createdAt, items:[{name, qty}] } }`.
- `ROOM_SERVICE_READY` şimdilik `roomGuest.ts` içinde (false); plan `RoomServiceSlot.tsx`'e taşınmasını söylüyor, T4/P6 taşıyıp `roomGuest.ts`'den içe aktarabilir.

## T7 / diğerleri için
- Yeni talep bildirimi `type: 'mybar.created'`, `refType: 'MybarRequest'`; başlık `Oda {no} - Yeni MyBar talebi`. Kat sorumlusu penceresi bu satırlara ve `mybar.created` olayına bağlanır.
- `requests.ts` ve `pool.ts` değiştirilmedi.
