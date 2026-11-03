# P4 Task 4 raporu — Misafir MyBar oda sayfası (5 dil, RTL, canlı durum)

Dal `ux/yenileme` (HEAD 72c289e üstüne tek commit). Ajan `p4t4`, DB `merit_test_p4t4` / `merit_p4t4_e2e`, port 3064, `NEXT_DIST_DIR=.next-p4t4`.

## Yapılanlar (`merit/`)
- `src/modules/mybar/ui/guest/`: `RoomFrame` (dil menüsü, logo/otel adı, oda rozeti, bilgi kutusu), `RoomHome` (+`RoomMybar`; yalnız MyBar -> form satır içi, ikisi açık -> iki kartlı seçici, yalnız oda servisi -> `/oda-servisi` yönlendirmesi), `RoomServiceSlot` (P6 yer tutucusu, `ROOM_SERVICE_READY` artık burada), `RoomUnavailable`, `RoomLanguageSwitch`, `MybarForm`, `GroupPills`, `ProductCard`, `SelectionChips`, `MybarStatus`, `useMybarSubmit`, `useMybarStatus`.
- `src/app/(guest)/mybar.css` (canlı şablon paleti token olarak, mantıksal CSS özellikleri), `q/[token]/mybar/page.tsx`, layout/page ROOM dalı, `guestTarget.ts` (+`getRoomPageState`, istek başına tek `scan.room`).
- Mesajlar: `mybar` ad alanı 49 anahtar x 8 dil (TR/EN/DE/RU/AR + FR/EL/IT; mevcut `i18n.test` anahtar eşitliği 8 dili zorunlu kıldığı için üçü de eklendi). `mybar.unavailable.ODA_BOS` dahil.
- Canlı durum: `GUEST_EVENT_TYPES` += `mybar.seen|fulfilled|completed|cancelled`; `guestEventFilter` yalnız kendi odasının olaylarını geçirir (`scope.roomId`), `sanitizeGuestEvent` yükü yalnız `requestId`'ye indirger; `/api/q/[token]/events` ROOM dalı artık oda servisi çıkışı yoksa 404 vermez (outletId opsiyonel). İstemci olayda `GET /api/q/{token}/mybar?locale=` ile durumu yeniden okur; 45 sn yoklama yedekli.
- `LanguageSwitch` (paylaşılan): erişilebilir ad görünür kodla başlar (`AR ...`), axe `label-content-name-mismatch` giderildi.
- Silinenler: `menu/ui/guest/RoomPlaceholder.tsx`, `minibar/ui/guest/MybarGuestScreen.tsx` (eski prototip, yalnız layout kullanıyordu).

## Davranış notları
- Bugünün talebi varsa sayfa doğrudan durum ekranını açar (Bekliyor / Görüldü / Karşılandı / İptal edildi) ve `mybar.dailyLimit` açıkken günlük sınır mesajını gösterir; İPTAL veya sınır kapalıysa "Yeni talep gönder". Başka cihazdan aynı gün gönderim -> `err409Daily` uyarısı + mevcut talebin durumu.
- Dil kalıcılığı: çerez (lang rotası) + `localStorage` `merit.guest.lang`; çerez silinmişse kayıtlı dil bir kez yeniden uygulanır.
- Fiyat hiçbir yerde yok; "sepet/cart" dili yok (unit + e2e ile sabitlendi). Grup sekmeleri ada göre (tr) sıralı; ilk grup açık (plan).
- Ürün/grup adları T3 katalogunda `localizeTexts` ile sunucuda çevrilmiş geliyor (doğrulandı); oda mesajı (`guestMessage`) layout'ta aynı servisle çevrilir.

## Doğrulama
- Birim (`merit_test_p4t4`): `mybar-guest-page-i18n` (5), `mybar-guest-page` (17), `mybar-guest-page-events` (5) + `i18n`, `guest-events`, `guest-token`, `mybar-guest-request`, `guest-state-rs` toplam 82 test yeşil.
- `tsc --noEmit` temiz, eslint (kendi dosyalarım) 0 uyarı, `NEXT_DIST_DIR=.next-p4t4 next build` başarılı.
- e2e `mybarGuest.spec.ts` 7/7 (AR rtl + gönder + yenileyince limit, ikinci cihaz limit, canlı Pending->Seen, dil kalıcılığı, 375 px kaydırma/44 px hedef/axe, pasif oda + masa tokenı 404, ürünsüz oda notu) ve `guestMenu.spec.ts` 11/11. Sunucu durduruldu.

## Devir
- T5/T7: personel tarafı `mybar.seen` vb. olaylarını yayınladığında misafir sayfası kendiliğinden güncellenir (ek iş yok). Seen için `seen_at` dolu olmalı (durum eşlemesi `GUEST_STATUS`).
- T10: ilerleme satırı 1 (T1-T4) kapsamı tamam. `MybarWindow` ve diğerleri etkilenmez.
- P6: `RoomServiceSlot.tsx` içinde `ROOM_SERVICE_READY = true` yap, gövdeyi kendi kartıyla doldur, `/q/{token}/oda-servisi` sayfasını üret. `RoomHome` ve layout'a dokunma. Olay akışı oda servisi çıkışı olan odalarda outlet olaylarını zaten taşır.
- Eski `/api/minibar/mybar/request` rotası ve legacy `mybarService` testi dokunulmadı (artık misafir arayüzü kullanmıyor; T7'de kaldırılabilir).
