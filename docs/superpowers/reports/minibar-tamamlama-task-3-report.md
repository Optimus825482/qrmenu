# Task 3 raporu — pool.ts (havuzun tek sahibi)

Ajan: mb3 (`merit_test_mb3`, `.next-mb3`).

## Yapılan
- `server/poolStock.ts` -> `server/pool.ts` (`git mv`). İlkeller: `takeFromPool`, `takeManyFromPool` (hep-ya-da-hiç, ürün-id sırasıyla FOR UPDATE), `restoreStock`, `addToPoolTx`. Servisler: `addToPool`, `returnFromPool`, `adjustPool` (yalnız SISTEM), `setCriticalLevel`, `listPool`, `listPoolAll`, `listMovements`.
- Hareketler işaretli: GIRIS +, KULLANIM/MYBAR -, IADE (oda kaydı geri) +, IADE (depoya iade) -, DUZELTME +-. `total - used = remaining` her yazmada korunur.
- Koordinatör notu: `restoreStock` `usedQty`'yi 0'ın altına indirmez; fazlası `DUZELTME +fazla` hareketi olarak total'e eklenir ve `STOCK_ADJUST` audit yazılır (testli). `returnFromPool` `used`'a dokunmaz.
- Olaylar `publishRadar` ile (`stock.changed`: productId, remainingQty, criticalLevel, delta, type; `stock.critical`).
- Kritik bildirim: düşüş sonrası `remaining <= criticalLevel` ve bugün (Nicosia iş günü) bu HotelStock için bildirim yoksa R-DEP'e bir kez; satır kilidi altında olduğundan eşzamanlılıkta tek.
- Tx içinde paylaşılan `prisma` ile ayar okumak havuz tükenmesine (P2028) yol açıyordu; varsayılan kritik seviye `tx.setting` üzerinden okunuyor.
- Çağıranlar: `stockRequests` (teslim -> `addToPoolTx`, çift publish kalktı), `roomCheckService` (`takeManyFromPool`, `restoreStock` ürün sırasıyla), `minibarService.confirmMybarRequest` (`takeManyFromPool` MYBAR), `depoService` (yalnız raporlar kaldı), `stockViews.setCriticalLevel` kaldırıldı, `/api/minibar/stock` PATCH pool'a bağlandı, `/api/minibar/depo/stock` GET/POST/PATCH yeniden yazıldı (eski alan adları korunur, `status`/`criticalLevel` eklendi; POST GIRIS/IADE/DUZELTME).
- Testler: `minibar-pool.test.ts` genişledi (28 test: eşzamanlılık, hep-ya-da-hiç, bildirim, restore fazlası, yetki, liste); `minibar-stock-views` ve `mybar-guest` imza/işaret güncellendi.

## Notlar
- UI sayfası değiştirilmedi (UX T5): `/depo/stok` DUZELTME gönderince R-DEP artık FORBIDDEN alır; IADE seçeneği ve kritik seviye alanı UX T5 işi.
- `onlyCritical` = durum NORMAL değil (DIKKAT dahil; stockViews.criticalStocks ile aynı).
- `npm run check` typecheck aşamasında başka ajanların dosyalarında hata veriyor (radar `operationEvent` şema/istemci, `migrate-core` testleri, `scripts/migrate-from-minibarlatest` eksik modül); pool ile ilgili hata yok. `next build` derleme başarılı, tip denetimi aynı dış hatalarda duruyor.
