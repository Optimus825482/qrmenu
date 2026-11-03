# P4 Task 6 raporu — Karşılama

Durum: DONE.

## Yapılanlar
- `merit/src/modules/mybar/server/fulfill.ts`: `fulfillInputSchema`, `fulfill(ctx, requestId, input)`.
  - Yetki: `assertCan('MB-PERS','D', request.hotelId)`; başka otel FORBIDDEN, bilinmeyen id NOT_FOUND.
  - Tek transaction: talep `FOR UPDATE` (`loadRequestForUpdate`), ardından havuz satırları `lockStocks` (productId sırası), sonra `takeFromPool(type:'MYBAR', refType:'MybarRequest', refId)` ürün başına. Herhangi biri yetersizse tüm transaction geri alınır (hepsi-ya-hiç); mesaj `"Kola: Stokta 1 adet var"`.
  - Tek `MinibarTransaction(MYBAR_KARSILAMA, mybarRequestId)`; kalemler `consumed 0 / added qty`, alış/satış fiyat anlık görüntüsü.
  - `deliveredQty` artar; talep görülmemişse `seenById/At` yazılır, `mybar.created` bildirimleri okundu olur, `mybar.seen` yayınlanır; `MYBAR_FULFILL` denetimi; `mybar.fulfilled`. Talebi kapatmaz.
  - Hatalar: BEKLEMEDE değil -> CONFLICT "Bu talep zaten işlenmiş"; kalan yok -> VALIDATION "Eklenecek ürün yok"; fazla adet -> VALIDATION "{ad} için en fazla {n} adet eklenebilir" (`fieldErrors.lines`); talepte olmayan ürün -> VALIDATION.
  - Eşzamanlı iki karşılama: talep kilidi sıralar, ikincisi "Eklenecek ürün yok" alır; çift düşüm yok.
- `actions/fulfill.ts`: `fulfillMybarAction(requestId, input)`.
- `tests/unit/mybar-fulfill.test.ts`: 7 test.

## Doğrulama
- mybar-fulfill 7/7; mybar-requests + minibar-pool + minibar-room-check 65/65 (DB `merit_test_p4t6`).
- `tsc --noEmit` temiz, eslint temiz, `NEXT_DIST_DIR=.next-p4t6 next build` başarılı.

## T7 UI için devir notları
- Dönüş: `{ added: {productId,name,qty}[]; fullyDelivered: boolean }`.
- `STOCK_INSUFFICIENT` mesajı ürün adı önekli; olduğu gibi gösterilebilir.
- `fullyDelivered` true olunca arayüz "Kapat" (`completeMybarAction`) önerebilir; karşılama talebi kapatmaz.
- `mybar.fulfilled` olayı payload: `{requestId, roomId, roomNumber, status:'BEKLEMEDE', byUserId}`; ilk karşılamada `mybar.seen` de gider (onay pencereleri kapanır).
- Notlar: `.next-p4t6` ve `merit_test_p4t6` bırakıldı.
