# Task 5 raporu — oda kontrolü servisi

Durum: DONE. Yeni dosyalar: `roomChecklist.ts`, `no-consumption` ve `start` rotaları, `minibar-room-check.test.ts` (29 test).

## Yapılanlar
- `roomChecklist.ts`: `loadRoomChecklist` (T2 `buildChecklist` + dolap kopyaları, pasif ürün/setup hariç), `capacityByProduct` (setup x kopya toplamı), `addedToday` (tüm personel).
- `roomCheckService.ts` yeniden yazıldı: `startRoomCheck`, `getRoomCheckView` (rozet, boş oda uyarısı, allowedLeft, poolRemaining, düğmeler; eski `setups` alanları üst küme), `addReplacement` (çok satırlı, DAILY_LIMIT, unique `clientRequestId`, P2002 yarışı yeniden oynatma), `recordNoConsumption`, `deleteMyTransaction`/`updateMyTransaction` (tek birleşik, ürün sıralı havuz kilidi; oda kilidi -> işlem kilidi -> havuz), `listMyTransactions` (DND kayıtları dahil, otomatik tamamlama kontrolleri hariç), düzeltme talebi (`MB-TAL D` talep; `MB-TUK A` + SISTEM karar, işlemi onaylayan yapar).
- MMD kaldırıldı (servis + rota). `minibarService`/`minibarCommon` temizlendi (`consumedToday`, `assertWithinCatalogue`, `normalizeItems`, `getRoomInspectionData`, `getMyRoomCheckHistory`).
- Kapsam dışı otel odası/işlemi NOT_FOUND (route düzeyi 404; minibar-auth beklentileri 404), yetki yoksa FORBIDDEN.

## Sapmalar / kararlar
- Audit adları radar sabiti `ROOM_CHECK_CHANGE_ACTIONS` ile uyumlu kalsın diye `MINIBAR_ROOM_CHECK_DELETE/UPDATE`; ikame `MINIBAR_REPLACE`, sarfiyat yok `MINIBAR_NO_USE`. Silme/güncellemede `room.check.changed` radar olayı yayınlanır.
- Başkasının işlemini silme/güncelleme `NOT_FOUND` (brief); dünkü işlem `FORBIDDEN`.
- `startStock = max(0, setupQty - qty)` (kopya çarpanında negatif olmasın).
- `buttons.enabled` = havuz >= n VE kalan hak >= n.
- `/room/[id]/check` eski sayfa gövdesini (`consumedItems`, boş liste = Sarfiyat Yok) geçici uyumlulukla kabul eder; UX T8 sonrası kaldırılabilir.
- Yeni uç: `POST /room/[id]/start`, `POST /room/[id]/no-consumption`.

## UI devir notları (UX T8/T9)
1. `/kat/oda-kontrol/[roomId]`: MMD düğmesi/modalı sil. Yeni gövde `POST check { items:[{productId,setupId,qty}], clientRequestId(uuid), note? }`; Sarfiyat Yok `POST no-consumption { clientRequestId }`; sayfa açılışında `POST start`. Her kullanıcı eyleminde yeni `crypto.randomUUID()`, yeniden denemede aynısı.
2. Görünüm `GET room/[id]`: `badge`, `emptyRoomWarning`, `checklistError`, `checklist[]` (dolap kopyası başına: `label`, `items[].buttons/allowedLeft/poolRemaining/capacity`). Fiyat alanı yok. Hata kodları: `DAILY_LIMIT`, `STOCK_INSUFFICIENT`, `CONFLICT` (Sarfiyat Yok tekrar).
3. `/kat/islemlerim`: `my-checks` artık `kind: ISLEM|DND`, `canDelete` döner; DND satırları silinemez. DELETE yanıtı `{restored, message}`.
4. `/kat/duzeltme-onay`: karar yalnız SISTEM; talep yalnız `MB-TAL D` (R-DEP).

## Doğrulama
- `minibar-room-check` 29/29, `minibar-pool`, `minibar-auth` yeşil (merit_test_mb5); `next build` (.next-mb5) başarılı; eslint temiz.
- Tam `npm run check`: paylaşılan Postgres'te "too many clients" (diğer ajanlar ~70+ bağlantı) yüzünden ilk koşuda 73 test düştü; yeniden koşuda kalan yalnız `migrate-definitions`/`migrate-history` (T13'ün yarım çalışma ağacı, benim dosyalarımla ilgisiz). Tam yeşil kanıtı alınamadı. Not: `.next-*` eski tip dizinleri silinen mmd rotasına başvurduğundan başka ajanların `tsc`'si kendi build'lerine kadar uyarabilir.
