# Minibar operasyon kapanış düzeltmesi

Durum: iki Important bulgusu düzeltildi. BASE `3732fd3`, mevcut `ux/yenileme` dalı; yalnız brief sahipliğindeki iki kaynak, iki test ve bu rapor değiştirildi.

## Davranış ve kök neden

- `dnd.dayend` daha önce yürütmenin takvim gününü kapatıyordu. Null schedule payload'ında güvenilir occurrence günü yok; uygulama worker'ına cron slotu iletilmiyor. Artık Europe/Nicosia duvar saatinde 23:59 ise bugün, diğer saatlerde önceki gün seçilir: kapanmış en son 23:59 günü. UTC gün dilimi/getTime hesabı yok. Normal 23:59 ve 00:01 catch-up davranışı, `closeDndDay <= day` idempotency korunur.
- Yeni görev kalemleri her zaman BEKLIYOR yaratılıyordu; oda kontrolü yalnız o anda var olan kalemleri tamamlıyordu. Artık aynı günün bitmiş, işlem bağlantısı bulunan URUN_EKLENDI/SARFIYAT_YOK RoomCheck kaydı veya TAMAMLANDI RoomDnd tamamlanma sağlar; AKTIF DND sayımı/bekleyişi, EKSIK DND kapalı durumu devralınır. Kontrolsüz oda BEKLIYOR kalır.
- Mevcut BEKLIYOR kalem aynı otoritatif sonuçla onarılır; ilerlemiş TAMAMLANDI/DND_BEKLIYOR/EKSIK/DEVAM kalemler değiştirilmez. Üst görev yeniden hesaplanır. checkedAt gerçek kontrol bitişinden/DND son işaretinden gelir; dndCount/lastDndAt devralınır. DailyTaskItem şemasında checkedBy alanı yoktur; gerçek kullanıcı TaskStatusLog.userId'ye yazılır. Yeni log gerçek oluşturulan duruma, onarım logu gerçek geçişe yazılır. Onarımlar task.updated, eklemeler mevcut task.generated/audit/notification akışında ve tek transaction içinde kalır.

## Kilit ve eşzamanlılık

Uzlaştırmanın otel/gün advisory kilidi korunur. Ardından hedef ve mevcut odalar sıralı room kilidi, sıralı mevcut room_dnds kilidi, sıralı item kilidi ve task kilidi alınır. Kontrol/DND yazıcısı room → DND → item → task; gün sonu DND → item → task sırasıyla uyumludur. Oda kontrolünü beklerken ters item → room sırası kurulmaz; coverage oda/DND kilitlerinden sonra okunur. `dnd.ts`, `roomCheckService.ts` ve `tasks.ts` değiştirilmedi.

Gerçek tx regresyonunda bir bağlantı oda kilidini tutup tamamlanmış DND yazar. İkinci bağlantı reconciliation çalıştırır; üçüncü bağlantı pg_stat_activity üzerinden reconciliation'ın room FOR UPDATE kilidinde gerçekten beklediğini gözler. Writer commit edildiğinde yeni kalem TAMAMLANDI/count=2 olur.

## Doğrulama

Bütün DB işlemleri yalnız `merit_test_clops` üzerinde, .env değiştirmeden process-local DATABASE_URL / DATABASE_URL_TEST ile yapıldı; sırlar çıktılanmadı. Başlangıç toplam PG bağlantı sayısı 39, GREEN gözlemi 40; >80 görülmedi. Her seferinde yalnız bir Vitest süreci çalıştı. Harici 3050 matrix ve clmig veritabanına dokunulmadı.

- Hazırlık: process-local DATABASE_URL=clops ile `prisma migrate deploy`: exit 0, 30 migration uygulandı.
- RED: process-local DATABASE_URL_TEST=clops ile `node node_modules/vitest/vitest.mjs run tests/unit/minibar-jobs.test.ts tests/unit/minibar-task-generation.test.ts`: exit 1, 33 test; 7 beklenen fail, 26 pass. Fail'ler: gecikmiş worker yeni günü kapatması; 1/2 DND'nin kaybolması; iki normal kontrol türü sonrasında bekleyen kalemin onarılmaması; EKSIK'nin kaybolması; reconciliation'ın room kilidini beklememesi.
- GREEN: aynı env ile `node node_modules/vitest/vitest.mjs run tests/unit/minibar-jobs.test.ts tests/unit/minibar-task-generation.test.ts tests/unit/minibar-dnd.test.ts tests/unit/minibar-tasks.test.ts tests/unit/minibar-room-check.test.ts`: exit 0, 5 dosya, 96/96 pass, 111.84 saniye.
- Hedefli ESLint: `npx eslint src/modules/minibar/server/jobs.ts src/modules/minibar/server/taskGeneration.ts tests/unit/minibar-jobs.test.ts tests/unit/minibar-task-generation.test.ts`: exit 0, 0 warning/error (ilk unused warning kaldırıldı).
- Son biçim/yorum düzenlemesi sonrası aynı RED komutunun tekrar koşusu: exit 0, 2 dosya, 33/33 pass, 35.77 saniye. Hedefli ESLint tekrar exit 0; git diff --check temiz.

## Commit ve kalan sınırlar

Tek Türkçe commit: `fix(minibar): gecikmiş gün sonunu ve geç görev durumlarını düzelt`; bu rapor aynı commit'e dahildir. Co-Authored-By: GPT-6.1 Sol <noreply@openai.com>. Gerçek hash kontrolöre finalde bildirilir.

Full check/build/e2e çalıştırılmadı; dalga sonu kapanış doğrulaması kontrolöre aittir. Gün sonu en son kapanmış günü catch-up ettiği için çok eski bir tekrar da en son kapanmış güne kadar eski aktif DND'leri kapatır; bu brief'teki <= day sözleşmesidir. Uzlaştırma aynı otel/günün ilgili odalarını işlem boyunca kilitler, yoğun operasyonlarda bekleme yaratabilir. Bağımsız kod incelemesi kontrolör tarafından yapılacaktır. İşçi hata yutma gibi önceki minor backlog kapsam dışıdır.
