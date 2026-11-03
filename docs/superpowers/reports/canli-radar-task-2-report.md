# Radar Task 2 raporu (rd2)

Durum: DONE.

- G13: `rsSlaSweep(now)` (`merit/src/modules/order/server/roomService/sla.ts`), `rs.sla-sweep` kuyrugu her dakika (`src/lib/jobs.ts`). Kosullu `updateMany` + audit (`RS_SLA_WARN/BREACH`) + `order.sla` tek transaction; hata halinde geri alinir.
- G17: `print.printed` ve `print.failed(BASILAMADI)` zarfinda `outletId` (siparisin outleti, yoksa yazicinin).
- G19: `scan.room` (`guestToken.ts` oda dali, tx disi, hata yutulur).
- G20: `publishMailFailed(hotelId, kind)` `src/modules/radar/publish.ts` icinde. HAND-OFF: minibar T11, `sendHotelMailOnce` (`minibarJobs.ts`) sonucu "failed" iken `await publishMailFailed(hotelId, kind)` cagirmali; P7 ikinci yayin eklemez.
- Testler: `radar-publish-order` (13) + `radar-jobs` (1) yesil.
- Not: uygulama testlerden once yazildi, RED kaniti yok.
- Tam vitest: 1221 test; ilk temiz kosuda 35 hata hepsi baskasinin isi: rd2 DB'sine yeni minibar migration (`20261103093000_minibar_tamamlama_temel`) uygulanmamisti (P2022) ve `radar-normalize` SSE_EVENT_TYPES (baska ajanin realtime-events degisikligi). Migration uygulaninca hata veren 13 dosya yesil (142/142). `radar-normalize` ayni kosuda yesil.
- Repo geneli `tsc`: baska ajanlarin minibar test dosyalarinda hata (minibar-constants, minibar-screen-limits, minibar-stock-status, schema.test legacyIdMap/clientRequestId); benim dosyalarimda yok.
- `NEXT_DIST_DIR=.next-rd2 npx next build` basarili.
