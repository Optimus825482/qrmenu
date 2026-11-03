# Task 4 raporu — görev kalemi çekirdeği (`tasks.ts`) ve DND servisi (`dnd.ts`)

Ajan `mb4`, dal `ux/yenileme`, DB `merit_test_mb4`, port 3034 (e2e koşulmadı: bu görev UI/e2e kapsamı dışı), `NEXT_DIST_DIR=.next-mb4`.

## Yapılanlar
- `src/modules/minibar/server/tasks.ts` (yeni): `completeOpenItemsForRoom`, `markItemsDnd`, `failDndItems`, `reopenIfUncovered`, `recomputeTaskStatus`, `taskSummary`, `listTaskItems`. Kalem ve ana görev satırları `FOR UPDATE` (id sırasıyla) kilitlenir; her geçiş `TaskStatusLog` yazar; `task.updated` yükü `publishRadar` ile `RADAR_WIRE`'a karşı doğrulanır (>100 kalemde `truncated`). Brief'e iki isteğe bağlı alan eklendi: `completeOpenItemsForRoom`'a `dndCount` ve `now`, `markItemsDnd`'ye `now` (DND eşiğinde sayaçlar tek geçişle yazılsın, test edilebilir zaman).
- `src/modules/minibar/server/dnd.ts` (yeni): `markDnd(ctx, input, now)` (`MB-TUK O`, oda `FOR UPDATE`, ikame/sarfiyat yok varsa CONFLICT, `TAMAMLANDI`/`EKSIK|IPTAL` CONFLICT, 30 sn çift dokunma yalnız aynı kullanıcı için, eşik `dnd.minChecks` otelden, tek bildirim R-DEP+R-OTM, `dnd.marked|completed` radar yükü), `autoCompleteDnd`, `listDnd` (`MB-DND V`), `dndHistory`, `runDndReminders(now)` (bir kez; `reminderSentAt`), `closeDndDay(upToDay, now)` (idempotent, otel başına tek `dnd.dayend` özeti, `DND_DAY_END` audit, `dnd.missed`).
- Route'lar: `POST room/[roomId]/dnd` (ince sarmalayıcı, yanıtta `message` korunur), `GET dnd?day=&onlyActive=`, `GET dnd/[dndId]/history`.
- Taşıma: `submitRoomDnd` (`minibarService.ts`) ve `runDndDayEndRollover` (`minibarJobs.ts`) silindi. `lib/jobs.ts` 23:59 işi `closeDndDay(businessDate(now), now)` çağırır (Task 11 yeni kuyrukları ve 00:01 yakalamayı bağlayacak). `roomCheckService.ts`: kontrol kaydında `autoCompleteDnd` + `completeOpenItemsForRoom` (IKAME/SARFIYAT_YOK), silmede `reopenIfUncovered`; eski satır içi `dailyTaskItem.updateMany` kalktı.
- Testler: `tests/unit/minibar-tasks.test.ts` (yeni, 13), `tests/unit/minibar-dnd.test.ts` (yeniden yazıldı, 21).

## Sınır testleri
23:59:30 işareti 00:01'de (`upToDay` dün) EKSIK; 23:59 kapanışından sonraki işaret "süresi doldu"; hatırlatma tam 120. dakikada gider, 119'da gitmez, ikinci çalıştırma 0, yeni işaret `reminderSentAt`'i sıfırlar, `dnd.recheckMinutes=30` ile 31 dk; çift dokunma 29 sn reddedilir / 30 ve 31 sn kabul; eşik 2'de tamamlanır, sonrası CONFLICT ve `count` artmaz; `dnd.minChecks=3`.

## Doğrulama
- `DATABASE_URL_TEST=<merit_test_mb4>`: tam vitest 1380 geçti, 10 atlandı; yalnız iki dosya (`guest-state-rs`, `price-display`) paralel ajanlardan "too many clients" ile düştü, tek başına yeniden koşunca 10/10 geçti. Lint: 0 hata (uyarılar başkalarının dosyalarında). `tsc`: yalnız radar T4 çalışma ağacından `operationEvent` hataları (Prisma istemcisi henüz yeniden üretilmemiş); benim dosyalarımda hata yok.
- `NEXT_DIST_DIR=.next-mb4 npx next build`: başarılı (`/api/minibar/dnd` rotaları dahil).
- Not: TDD kırmızı adımı tasks/dnd için ayrı koşulmadı (kod ve test aynı turda yazıldı; testler ilk koşuda geçti, yalnız bir test beklentisi düzeltildi).

## UI devri (UX T5 / Task 11)
- `/kat/dnd` çıplak liste sayfası bu turda yazılmadı (UI düzenlemesi yok kuralı). Kaynak: `GET /api/minibar/dnd?day=&onlyActive=` → `DndRow[] { dndId, roomId, roomNumber, floorName, count, required, firstAt, lastAt, status, linkedTask }`; geçmiş `GET /api/minibar/dnd/{dndId}/history` → `{ no, at, userName, note }[]`.
- `POST /api/minibar/room/{roomId}/dnd` gövdesi `{ note? (<=200) }`, yanıt `DndView { dndId, roomId, roomNumber, count, required, status, lastAt, nextCheckAt, completed, message }` (eski `success/dndCount/isCompleted` alanları yok). `oda-kontrol/[roomId]/page.tsx` yalnız `message` ve `error` okuduğu için bozulmadı; sayfadaki sabit `/3 DND` metni `required`dan okunmalı. MMD düğmesi/route'u Task 5'te kalkar.
- Task 11: `runDndReminders` (dakikalık) ve `closeDndDay` (23:59 bugün, 00:01 dün) kuyruğa bağlanacak.
- `listTaskItems` ve `taskSummary` yeni görev ekranlarının (Task 8/11) okuma modelidir; `reopenIfUncovered` Task 5'in silme akışında zaten çağrılıyor.
