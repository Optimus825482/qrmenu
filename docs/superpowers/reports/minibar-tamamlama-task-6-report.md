# Task 6 review (fd68ecc)

### Spec Compliance
Met (file refs: merit/src/modules/minibar/server/roomQr.ts):
- No full token in list rows (toRow; tokenTail only), audit before/after tokenTail only (generate), bulk audit has mode/count only, guest-message audit has no text; no logging; print/ZIP filenames use fileSafe(hotel/floor/room) only.
- Downloads side-effect-free: renderRoomQrFile (NOT_FOUND "Bu odanın QR kodu yok"), roomQrZip/roomQrPrintSheet only read (qrRooms: active + qrToken not null). Old downloadRoomQr/Zip prototype removed. Routes use the new functions.
- generateRoomQr: CONFLICT without regenerate, inactive CONFLICT, compare-and-set updateMany, single tx with audit + publishDefinition.
- Bulk: LEGACY|ALL without confirmInvalidate -> VALIDATION with fieldErrors.confirmInvalidate (checked before limiter); active rooms only; NOT_FOUND when empty; single tx, single ROOM_QR_BULK_GENERATE audit, publishDefinition in tx.
- Other hotel's room: generate -> loadRoomInHotel findFirst({id,hotelId}) NOT_FOUND; setRoomGuestMessage count check all-or-nothing in tx; render route returns NOT_FOUND for out-of-scope room; out-of-scope hotel id -> FORBIDDEN via assertCan.
- sanitizeGuestMessage: tags stripped (loop), stray < > removed, control chars except \n removed, trim, >500 codepoints -> VALIDATION, empty -> null.
- Rate limits keyed ctx.user.id: 30/min single, 3/min bulk, exact Turkish message (roomQrEvents.ts).
- /qr/[token]: regex ^[A-Za-z0-9_-]{1,64}$, 308 to /q/{token}, else 404; no DB; proxy.ts matcher does not gate /qr.
- ZIP: fflate zipSync, csvCell identical to menu/server/tableQr.ts:248 guard, BOM, "Oda;Kat;URL", filename QR_Kodlari_{code}_{yyyyMMdd}.zip via businessDate, duplicate-name guard.
- apps.ts screenCode MB-TAN. UI: confirm({danger:true}) for regenerate and non-MISSING bulk; success only via setStatus (no modal); list shows tokenTail only, images via /api/qr/room/{id}. Print iframe sandboxed, escapes name/logo, logo scheme allow-list.
- Tests assert DB rows (token, qrGeneratedAt, guestMessage), audit JSON absence of tokens, unchanged tokens after render/ZIP, 401/404 routes, 308/404, rate-limit windows with fake timers.

### Issues
Critical: none.
Important: none.
Minor:
1. roomQr.ts bulk loop: read-then-update inside tx without row lock or compare-and-set (unlike single generate); two concurrent MISSING/LEGACY bulks could overwrite each other's fresh tokens. Rate limiter + same-user keying makes it unlikely; optional `updateMany where qrToken = old`.
2. Tests do not assert audit shape positively (before/after = {tokenTail}) nor bulk audit payload (mode/count/replaced); only absence of token. Also no test that bulk is atomic or that bulk is hotel-scoped for a foreign floorId (code returns NOT_FOUND via empty set).
3. roomQrPrintSheet silently ignores roomIds that are inactive/QR-less/other-hotel (consistent with "skip", but a foreign id gives no NOT_FOUND).
4. RoomQrWindow zipUrl interpolates floorId unencoded (ids are cuid, harmless).
5. Single-generate consumes a rate-limit hit before CONFLICT/NOT_FOUND checks (acceptable).
6. QR URL (with full token) legitimately appears in ZIP CSV and SVG content; not a leak per spec but worth noting for handling of downloaded files.

### Assessment
**Task quality:** Approved — all Important-class risks (token leak, side-effecting GET, cross-hotel write, unconfirmed bulk invalidation) are correctly closed and tested; only minor hardening/test-depth notes remain.
