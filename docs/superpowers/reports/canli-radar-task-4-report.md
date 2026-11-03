# Radar Task 4 raporu (rd4)

Durum: DONE.

## Yapilanlar
- Sema: `OperationEvent` (`operation_events`, `@@index([hotelId, at])`) + yedi tekrar indeksi (`OrderEvent(at)`, `QrScanLog(createdAt)`, `WaiterCall(outletId, createdAt)`, `SessionEvent(createdAt)`, `RoomDndCheck(at)`, `RoomCheck(checkDate)`, `TaskStatusLog(createdAt)`).
- Migration `20261103120000_canli_radar`: Prisma DDL + elle `@data:begin/end` blogu (CR-RAD ekrani CR-KOM'dan sonra, sort_order kaydirma, hotel_id NULL izinleri `WHERE NOT EXISTS`). `migrate diff` (shadow `merit_rd4_shadow`) bos. `merit_test` ve `merit` gelistirme DB'sine `migrate deploy` temiz uygulandi (merit: 34 ekran, CR-RAD 27, 4 izin satiri).
- `CR-RAD` (sortOrder 27, `/radar`), `CORE_MANAGEMENT` = {CR-KOM, CR-RAD} (R-SYS V,O,D,A,R; R-ITT/R-OTM/R-FBM V,R). **Yeni izin satiri sayisi: 201** (197 + 4); ekran sayisi 34.
- `radar.*` 8 ayar (`SETTING_META`, grup "Radar", uc `systemOnly`), `parseWallViews` (`radar/constants.ts`).
- `radar/server/operations.ts` (`recordOperation`, `purgeOperations`), `core/server/sessionPresence.ts` (`presenceSweep`), `radar/server/uploadAlerts.ts` (`announceMissingUpload`).
- Isler: `radar.purge` `30 3 * * *` (90 gun, `radar.replayRetentionDays`); `session.sweep` sonunda `presenceSweep` (hata yutulur); `print.sweep` icinde `printers.printerSilenceSweep`.
- G14 `tableAssignments.publishChange` (assign/unassign/bulk) `table.assigned` yazar; G18 `printerSilenceSweep` + heartbeat `publishRadar("printer.status")` ve `printer.health` kaydi; G21 `announceMissingUpload`; G22 tick + idle.
- `src/app/radar/page.tsx`: yalniz katalog yolunu cozen yer tutucu (oturum + `/admin` yonlendirmesi); ekran kataloğu testi page.tsx ister. Radar penceresi T8-T11'de bunun yerini alir.
- `screenGuide.ts` CR-RAD rehberi eklendi (UX T11 zaten inmisti); `screen-guide.test.ts` `/radar` yolunu "xp" baglami sayar.

## Sapmalar / el degistirme notlari
- **HAND-OFF (minibar ajani, `src/modules/minibar/server/minibarJobs.ts`)**: dosya baska ajanda duzenleniyor, dokunmadim. `checkOccupancyUploadAndAlert` icinde, `missing.push(hotel.name)` hemen ardindan (mail kapali olsa bile) su cagri eklenmeli:
  `await announceMissingUpload({ hotelId: hotel.id, date: day, slot: slot === "am" ? "10:00" : "18:00", now });` (`import { announceMissingUpload } from "@/modules/radar/server/uploadAlerts";`; `missingKinds` verilmezse IN_HOUSE/ARRIVAL/DEPARTURE). Ayni gun+slot tekrari sessizdir. Test: `radar-publish-ops` G21 blogu fonksiyonu dogrudan sinar; `checkOccupancyUploadAndAlert` uzerinden test hand-off sonrasi eklenmeli.
- Brief "80'er parca, her olay <= 4 KB" tutarsiz: 80 oturum ~6.6 KB eder. 4 KB testini tutturmak icin `PRESENCE_CHUNK = 40` (100 oturum = 3 parca; wire semasi 80'e izin vermeye devam eder).
- SISTEM rollu oturumlar `presence.tick`/`presence.idle` disinda tutuldu (tick SISTEM+YONETIM'e gider; `session.changed` kurali SISTEM oturumlarini yalniz SISTEM'e gosterir).
- `printer.status` yayini artik `publishRadar` uzerinden (strict sema).
- Brief'teki "RED" asamasi: uygulama testlerden once yazildi (RED kaniti yok).
- Dosya: yalniz `jobs.ts` ve `seed.test.ts` icinde baska ajanin (minibar) bekleyen satirlari vardi; indekse yalnizca benim hunk'larimi yazdim, calisma agaci dokunulmadi.

## Dogrulama
- Yeni/degisen testler: radar-operations 3, radar-migration 3, radar-publish-ops 8, radar-sse-scope 7, radar-settings 6, radar-jobs +1, seed +1 (CR-RAD), screen-guide/catalog guncel.
- Tam vitest (merit_test_rd4): 132 dosya / 1390 test, 1389 gecti. Tek hata baskasinin isi: `minibar-auth.test.ts` "depo sorumlusu fiyat gormez..." (stockItems.price; minibar ajaninin devam eden is).
- `eslint` benim dosyalarimda temiz; `tsc --noEmit`: benim dosyalarimda hata yok; kalanlar baskasinin: `tests/unit/migrate-core.test.ts`, `migrate-definitions.test.ts` (NODE_ENV tip), `(ops)/garson|kasa/page.tsx` (`currency` prop, UX).
- `NEXT_DIST_DIR=.next-rd4 npx next build` yesil (`/radar` rotasi var).
- Tam e2e kosulmadi (paralel yuk); katalog 34 ekrana cikti, e2e'de ekran sayisi sabiti yok.
