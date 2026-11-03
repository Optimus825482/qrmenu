# Minibar Task 1 (Temel) - Rapor

Ajan `mb1`; DB'ler `merit_test_mb1`, `merit_mb1_e2e`, `merit_mb1_shadow`; derleme `NEXT_DIST_DIR=.next-mb1`.

## Yapılanlar
- **Migration** `20261103093000_minibar_tamamlama_temel`: sıra = `@data` bloğu (kind normalizasyonu occupancy_uploads + upload_tasks, tekrar eden `daily_task_items` temizliği, işaretli hareket dönüşümü, bakiye onarımı, negatif seviye/fiyat düzeltmesi) -> Prisma DDL (LegacyIdMap, LegacyArchive, `legacyExtra`, `isComplimentary`, `clientRequestId @unique`, `reminderSentAt`, `@@unique(taskId, roomId)` ve indeksler) -> CHECK'ler (`hotel_stocks` used/total/critical/balance, `products` critical/prices) -> `@limits` bloğu (R-OTM/R-DEP/R-HKS/R-KAT satır kısıtları). T9'un `BEKLIYOR`, `stored_path`, `occupancy_uploads.kind` değişiklikleri tekrarlanmadı.
- **`SCREEN_LIMITS: ScreenLimit[]`** (`prisma/seed/roles.ts`): `P5_SCREEN_LIMITS`/`applyP5Limits`/`P3_SCREEN_LIMITS` kaldırıldı. `actionsFor` çıktısı tüm rol x ekran için öncesiyle karşılaştırıldı: yalnız beklenen MB-* değişiklikleri (P5 farkı yok).
- `src/modules/minibar/{constants,stockStatus}.ts` yeni; `events.ts` genişledi (`MINIBAR_EVENTS` dizisi + adlı sabitler); `stockEvents.ts` silindi; `SSE_EVENT_TYPES` `...MINIBAR_EVENTS` içerir.
- Konsolidasyon: `stockRequests.ts` yerel `stockStatus/suggestQty/urgencyFor/STATUS_RANK` kaldırıldı (`stockStatus.ts`); `stockViews.ts`, `stockRequests.ts` olay adları `events.ts`'ten; `DND_DOUBLE_TAP_MS` kalktı (`DND_MIN_GAP_SECONDS*1000`); `"14:00"/"12:00"` -> sabitler; `OCCUPANCY_MAX_BYTES` tek tanım (`constants.ts`, `occupancyParse.ts` yeniden dışa aktarır); `UPLOAD_KINDS` ve `KIND_LABEL_TR` tek tanım (`occupancyUpload.ts`, `uploadTasks.ts` kullanır).
- Dokunulmadı (kasıtlı): `roomQrEvents.ts` (oda QR denetim adları/hız sınırı/mesaj sınırları - T1 sabitlerinde karşılığı yok, olay değil) ve `poolStock.ts` (T3 `pool.ts` olacak; T1 sabitiyle çakışan yerel kopya yok). `setCriticalLevel` `stockViews.ts`'te kaldı (T3 devri).

## Yeni `EXPECTED_PERMISSION_ROWS`
**197** (önce 199): R-DEP `MB-KF` ve R-OTM `MB-KF` satırları kalktı.

## Radar uyumu
`roomcheck.done`, `dnd.marked|completed|missed`, `task.updated|generated`, `stock.changed|critical`, `occupancy.uploaded|missing` adları `src/modules/radar/constants.ts` ile aynı. Uyumsuzluklar (radar dosyalarına dokunulmadı):
1. Radar spec §4 `RADAR_EVENT_TYPES` listesi `room.checked`/`room.check.changed` yazıyor, radar kodu `roomcheck.done` kullanıyor; T1 `roomcheck.done` yayınlar.
2. Yük sözleşmeleri farklı: radar `task.updated {items:[{taskItemId,roomId,from,to}], byUserId}` / `task.generated {date, types, itemCount}` / `stock.changed {productId, remainingQty, criticalLevel, delta, type}` / `dnd.marked {..., minChecks}`; T1 brifi `task.updated {taskIds, roomIds, day}`, `task.generated {day, added}`, `stock.changed {productId, remainingQty, status}`, `dnd.* {..., required}`. Yayıncı görevler (T3-T5, T8) yük şemasını radar `events.ts` zod şemasına göre seçmeli (radar `z.strictObject` ise brifteki yükler reddedilir).
3. `occupancy.missing` ve `dnd.reminder`/`stockrequest.*` brifteki listede yoktu; `occupancy.missing` (T9 yayınlıyor) `MINIBAR_EVENTS`'e eklendi.

## Doğrulama
- Yeni testler: `minibar-stock-status`, `minibar-constants`, `minibar-screen-limits` (tablo + migration SQL eşdeğerliği), `minibar-migration-data`, `schema.test.ts` (+7), `seed.test.ts` sayısı.
- `prisma migrate diff` (shadow `merit_mb1_shadow`): boş. `next build` (`.next-mb1`): başarılı.
- `npm run check` (DB `merit_test_mb1`): lint 0 hata/20 uyarı (başkasının), typecheck temiz, vitest 1221 testten ilk koşuda 4 hata; düzeltmelerden sonra ilgili 3 dosya + minibar T6/T7/T9 dosyaları yeşil (radar-normalize, admin-roles, minibar-pool, stock-*, room-qr, occupancy-*). Not: ilk koşuda `seed.test.ts` SEED_DEMO testi bir kez, eşzamanlı başka koşucu yüzünden, düştü; tek başına geçti (tüm koşuda yeşil).
- Düzeltmeler: (a) `admin-roles.test.ts` R-OTM `MB-TUK D`'ye dayanıyordu, yeni limit `MB-TUK [V]` -> `MB-TAN`'a çevrildi; (b) `depoService.adjustHotelConsignmentStock` negatif düzeltmede `totalQty`'yi düşürmüyordu, yeni `hotel_stocks_balance_check` ihlal ediyordu -> total ve remaining birlikte değişir (T3 bu fonksiyonu zaten siler); (c) `radar-normalize.test.ts` `roomcheck.done`'ın `SSE_EVENT_TYPES` dışında olmasını şart koşuyor, brif ise içermesini söylüyor -> `roomcheck.done` SSE listesine **eklenmedi** (radar açıkça abone olur); karar kontrolörde.
- `merit` geliştirme DB'sine uygulanmadı: `migrate status` başkalarının `20261103080000_ux_screen_catalog` ve `20261103091000_minibar_doluluk_yukleme` migration'larını da bekliyor gösteriyor; birlikte uygulanacağı için kontrolöre bırakıldı.
- Not: `tsconfig.json` değişikliği (next'in `.next-*` include eklemesi) başkasına ait, sahnelenmedi.
