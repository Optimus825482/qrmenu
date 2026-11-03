# Task 1 review (8b99c64)

Verdict: Approved with one Important privacy item (byUserId on guest SSE).
- Catalogue: RADAR_EVENT_TYPES = 43 names, order and content identical to plan list (spec 42 - room.checked + roomcheck.done + dnd.completed).
- Important: orderPayload adds byUserId (staff user id) to order.* events; GUEST_EVENT_TYPES carries order.confirmed..cancelled and guestEventFilter (menu/guestEventFilter.ts) forwards payload unfiltered -> guest table/room stream now receives staff user id (route doc says no recipient ids). Fix: omit/strip byUserId (and tableLabel is fine) for guest stream, or add payload sanitiser in guestEventFilter / createFilteredSseStream.
- Minor: compareRadarEvents returns NaN on unparsable `at`; toRadarEvent throws on null envelope; presence/session status cast unchecked; shortName has no role input (names enforced later, T5/T11); no tx-rollback test for publishRadar; outletId + roleKinds MINIBAR combination would hide event from non-privileged MINIBAR sessions of other outlets (callers pass none).

## Fix round 1
- Misafir SSE akışı: `sanitizeGuestEvent` (src/modules/menu/guestEventFilter.ts) order.* payload'ını beyaz listeye (orderId, orderNo, status, rejectReason, cancelReason, tableId, roomId, from, kind) indirir; `byUserId` ve diğerleri düşer. `createFilteredSseStream` (src/lib/sse.ts) isteğe bağlı `map` seçeneği aldı (kopya üzerinde çalışır); misafir events route'u `map: sanitizeGuestEvent` verir. Ortak `publish` değişmedi.
- `compareRadarEvents`: `Date.parse` NaN -> 0 (toplam sıra korunur). `toRadarEvent(null/undefined)` boş sonuç döner.
- Testler: guest-events (2), sse-filtered (1, uçtan uca byUserId yok), radar-normalize (2). 52/52 geçti.
- `npm run check`: lint 0 hata; typecheck'te yalnız başkalarının minibar dosyaları (minibar-constants/stock-status testleri, modül eksik).
