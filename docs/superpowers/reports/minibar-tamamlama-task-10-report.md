# Task 10 raporu (mb10)

## Yapılanlar
- `server/floorPlan.ts`: `katPlan` (taskSummary eski şekil + `tasks`, `criticalStockCount`, `occupancy.{arrivalsToday,departuresToday}`), `floorOccupancy` (toplu rozet sorgusu; 40 odalı katta <= 6 sorgu, rbac sorguları hariç), `roomDetail` (`GET room/[id]?detail=1`). "Dolu" = `arrivalDate <= gün <= departureDate`.
- `server/roomScan.ts`: `extractToken`, `resolveRoomByQr` (MB-KF V, IP başına 30/dk, imza doğrulanmaz, her deneme `QrScanLog`, `scan.room`). Route `POST /api/minibar/qr/resolve`.
- `ui/useMinibarLive.ts` (300 ms debounce, `realtime.resync` da yeniler); KatDashboard, doluluk ve oda-kontrol sayfalarına bağlandı.
- `/kat/qr`: `html5-qrcode@2.3.8` (dinamik import), elle kod alanı resolve ucunu çağırır; eski oda-no listesi kaldırıldı.
- `minibarService.ts` silindi: `confirmMybarRequest`/`mybarRequestHotel` -> `mybarService.ts`; `roomHotel`/`floorHotel` -> `minibarCommon.ts`; `notifyChange` silindi (stok olayı `pool.ts`'ten gidiyor). `minibarTransactionHotel`/`correctionRequestHotel` kullanılmıyordu, dosyayla gitti.
- Oda-kontrol sayfasından MMD düğmesi/modal/handler kaldırıldı; boş seçim `no-consumption` ucuna gider.
- `getAdvisoryPriorityPlan` geçici olarak `floorPlan.ts` içinde (T8 `priorityPlan.ts`'e taşıyacak, route importunu güncelleyecek).

## Doğrulama
- minibar-*, mybar-*, uxRatchet birim testleri: geçti (iki dosya paralel seed kilitlenmesiyle düşmüştü, `--no-file-parallelism` ile 82/82 yeşil). `tsc --noEmit` temiz, eslint (değişen dosyalar) temiz, `next build` (.next-mb10) yeşil.
- E2E (3040): DB sunucusu 100 bağlantı sınırında ("too many clients", ~13 ajan) olduğundan her koşuda farklı, giriş kaynaklı 5-7 test düştü; güvenilir sonuç alınamadı.

## Devir
- `tests/unit/uxRatchet.json` çalışma ağacında güncellendi (kat/qr 2->1 ve 22->18, oda-kontrol 117->109) ama dosya ux8 ile ortak olduğundan SAHNELENMEDİ; sahibi commit etmeli.
- `tests/e2e/noBrowserDialogs.spec.ts` QR testi yeni etiket/mesaja ("QR kodu", "Geçersiz veya tanınmayan QR kod") uyarlandı.
- UX T9: `/kat/qr` kamera kutusu `#qr-reader`; sayfalar `data-testid` korunarak sade bırakıldı; PersistentMybarModal hâlâ 15 sn yoklama yapıyor.
- T8/T4: `kat/gorevler` ve `kat/dnd` sayfaları yok; açılınca `useMinibarLive(["task.updated","dnd.marked",...])` bağlanmalı.
- T11: sözleşme/e2e kabulünde `GET /api/minibar/floor/[id]?filter=GIRIS|CIKIS|DOLU|BOS&day=` kullanılabilir.
