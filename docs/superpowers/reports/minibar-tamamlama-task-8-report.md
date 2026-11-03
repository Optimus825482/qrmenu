# Task 8 raporu: Günlük görev üretimi (uzlaştırma) ve öncelik planı

Ajan `mb8`, DB `merit_test_mb8`, port 3038 (sunucu başlatılmadı), `NEXT_DIST_DIR=.next-mb8`.

## Yapılanlar
- `server/taskGeneration.ts`: `reconcileDailyTasks(hotelId, day, { actorId? }, now)` tek transaction, `pg_advisory_xact_lock(hashtext('tasks:'+hotelId+day))`. Kilit sırası `tasks.ts` ile aynı (önce kalemler id sırası, sonra görevler `FOR UPDATE`), kilitlenme yok. Oda başına en son kayıt, yalnız aktif odalar; eksik görev oluşturulur (kalemsiz görev yok); geç yüklemede oda eklenir; `BEKLIYOR` kalemin saati/priority'si güncellenir; kaydı kalmayan `BEKLIYOR` kalem silinir, boşalan görev silinir; `TAMAMLANDI/DND_BEKLIYOR/EKSIK/DEVAM` kalemlere dokunulmaz; tamamlanmış göreve oda eklenirse durum yeniden hesaplanır (`recomputeTaskStatus`). Her yeni kalem için `TaskStatusLog` (null -> BEKLIYOR). Yeni kalem varsa R-KAT'a tek `notify` + `publishRadar('task.generated', { day, types, itemCount })`; değişiklik varsa audit `TASKS_GENERATED` (actor'lü).
- Dönüş: `created` = oluşan DailyTask, `added` = mevcut göreve eklenen kalem, `removed` = silinen bekleyen kalem, `updated` = güncellenen bekleyen kalem.
- `regenerateTasks(ctx, { day? })` (`MB-DOL D`, oturum oteli, strict zod) ve `reconcileAllHotels(now)` (günlük iş gövdesi).
- Kablolama: `setDailyTaskReconciler(reconcileDailyTasks)` modül yükünde; `occupancy/upload/route.ts` yan etki importuyla yüklüyor, böylece `tasksGenerated` true olur.
- `server/priorityPlan.ts`: saf `computePriorityPlan` + `loadPriorityPlan` (`MB-KAT V`, `dnd.recheckMinutes` otel ayarı). Sıra (rank, remainingMin ?? 9999, kat, doğal oda no). Oda başına tek giriş: bir odanın birden çok açık kalemi (ör. çıkış odasında IN_HOUSE + DEPARTURE) en acil kalemiyle tek satır olur; çakışmada `itemId` = departure kalemi.
- Uçlar: `GET /api/minibar/tasks` (`{ day, summary, items }`), `POST /api/minibar/tasks/regenerate`, `GET /api/minibar/priority-plan` (yeni şekil).
- `src/app/kat/gorevler/{layout,page}.tsx`: çıplak liste (`data-testid`: gorevler-page, gorevler-summary, gorevler-list, gorevler-item, gorevler-empty, gorevler-error).
- `getAdvisoryPriorityPlan` floorPlan.ts'den silindi; `runDailyTaskGeneration` minibarJobs.ts'den silindi.

## Plan dışı ama zorunlu dokunuşlar
- `src/modules/minibar/priorityPlanView.ts` (yeni): yeni plan JSON'unu eski kart alanlarına çeviren adaptör. `tavsiye-is-plani/page.tsx` ve `components/PriorityRouteModal.tsx` (ikisi de eski şekli okuyordu) yalnız bunu kullanıyor; JSX değişmedi. `minibarTypes.ts` içindeki `PriorityRoutePlan/PriorityTaskPlanItem` adaptörün hedefi olarak duruyor (UX T9 yeni şekle geçince silinebilir).
- `src/lib/jobs.ts`: `runDailyTaskGeneration` kalktığı için `minibar.task-gen` işi `reconcileAllHotels` çağırıyor (3 satır). T11 altı kuyruğu yazarken bunu devralır.
- `tests/unit/mail-jobs.test.ts`: silinen fonksiyonun iki testi (kapsamı yeni test dosyasında) çıkarıldı.
- `occupancy/upload/route.ts`: tek satır yan etki importu (T9 dosyası).

## Testler
`minibar-task-generation` 12, `minibar-priority-plan` 13 geçti. tsc (src/tests) ve eslint temiz; `next build` geçti. `mail-jobs` 6, `minibar-tasks` 13, `minibar-auth` 10, `minibar-room-scan` 9, `minibar-stock-requests` 17, `minibar-stock-views` 8, `minibar-catalog` 25 tek tek geçti. Makinede Postgres bağlantıları (100 sınırı, diğer ajanların e2e DB'leri) doluyor: toplu `minibar-*` koşusunda "too many clients" ile rastgele dosyalar düşüyor; `minibar-room-check` her seferinde farklı 3-9 testte (eşzamanlılık/bağlantı) düştü, bu görevle ilgisiz; kontrolör dalga sonu koşusunda doğrulasın.

## Devir notları
- T11 kuyrukları: `minibar.task-gen` için `reconcileAllHotels(now)` hazır; "doluluk verisi yok" bildirimi eski işten kalktı (UploadTask/`runUploadWarnings` karşılıyor). `task.generated` bildirim `type` = `task.generated`, `refType` `MinibarDay`, `refId` `hotelId:day`.
- UX T9: `/kat/gorevler` yeniden stillenecek; `GET /api/minibar/tasks` yanıtı `{ day, summary: TaskSummary, items: TaskItemView[] }`. `GET priority-plan` yanıtı `PriorityPlan` (`entries[].targetAt` JSON'da ISO string). `/kat/gorevler` ux8'in matrix `routes.ts` listesine eklenmeli (ben dokunmadım).
- Depo "Görevleri yeniden üret" düğmesi (T11/UX): `POST /api/minibar/tasks/regenerate { day? }`.
- `events.ts` başlık yorumu `task.generated { day, added }` diyor; gerçek yük radar sözleşmesi `{ day, types, itemCount }` (yorum düzeltilebilir).
