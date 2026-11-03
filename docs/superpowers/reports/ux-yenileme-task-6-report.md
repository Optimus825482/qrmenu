# Task 6 raporu — POS kabuğu, kasa masa haritası ve yan panel (P-UX-7)

Ajan: `ux6` · dal `ux/yenileme` · DB `merit_test_ux6` / `merit_ux6_e2e` · port 3016 · `NEXT_DIST_DIR=.next-ux6`

## Yapılanlar

- **PosShell ailesi** (`src/components/pos/`): `PosShell`, `PosRail` (yatayda solda 72 px, dikeyde alt çubuk; `nav aria-label="Personel bölümleri"`; Masalar · Kuyruk(sayı) · Çağrılar(sayı) · Menü · Yazıcı · İptal; yetkisiz öğe sunucuda `posShellData.ts` içinde süzülür), `PosStatusBar` (canlı/kopuk, yazıcı, ses kapısı, tam ekran/uyku kilidi uyarıları, bekleyen sayılar, saat, kullanıcı, outlet değiştirici, çıkış), `FullscreenGate` (büyük "Tam ekranı başlat" bandı + `useFullscreenGate`), `soundGate.ts` (`locked|on|off|unsupported`, `unlockAudio`, `playCue`, `setMuted`, `useSoundState`), `useWakeLock.ts`, `usePrinterStatus.ts` (olay tabanlı), `pos.css`.
- **Durum belirteci**: `src/components/ui/statusTone.ts` (`TONES`, `orderTone`, `tableTone`; renk + kenar biçimi + metin; fg/bg çiftleri belirteçlerden >= 4.5:1).
- **Kasa**: `TableBoard` yeni kart düzeni (>= 120x104, etiket 26 px, garson ya da kesik çizgili "Atanmadı", sipariş rozeti, çağrı rozeti + saniye sayacı, `title=` yok, ızgara `repeat(auto-fill, minmax(120px, 1fr))` / 12 px); `TablePanel` (yatayda sağda %38, dikeyde alttan %60 sayfa; garson değiştir/ata/kaldır, açık siparişler, çağrılar "Yanıtla", Onayla / Reddet(`askReason`) / Fiş yeniden bas / Yeni adisyon; yetkiye bağlı); `KasaClient` yeniden yazıldı (altı sekmeli `nav` kaldırıldı; sekmeler ray linkleri; `Onay kuyruğu` bölgesi ve kart `article` yapısı korundu; bildirimler `notify`; QR-okutma uyarıları panelin üstünü kapatmasın diye satır içi). `AssignDialog` yalnız toplu atama olarak kaldı. Yazıcı ve iptal sayfaları POS kabuğunda: 9-12 px metin yok, ham palet yok, dokunma hedefleri >= 44 px, tablo kaydırma bölgesi odaklanabilir.
- **OpsShell**: yalnız kasa/KDS -> `PosShell` yönlendirmesi; garson/oda servisi eski kabukta. `(ops)/layout.tsx` yeni `posShellData.ts`'ten ray + yazıcı ilk durumunu alıp `OpsShell`'e geçirir. `OutletSwitcher`'a isteğe bağlı `className`.
- **useSound**: `soundGate` üzerine ince sarmalayıcı, imza `useSound(name)` korundu.
- **StaffOrderComposer** çıkarıldı (`src/modules/order/ui/`), `GarsonClient` yalnız import/kullanım için değişti. Kasada "Yeni adisyon" yalnız kullanıcı masanın atanmış garsonuysa görünür (mevcut `staffOrders.create` kuralı: kasiyer başkasının masasına adisyon açamaz).
- **Yeni sunucu okuması** (tek): `src/modules/order/server/actions/pos.ts` -> `tablePanelOrdersAction(outletId, tableId)`; mevcut `orders.listForOutlet` + `approvals.canApproveOrder` kullanır, yeni yazma yok.
- **Sesler**: `scripts/generate-sounds.ts` -> `public/sounds/{new-order,ready,call,error}.wav` (16-bit mono PCM; dosya çalınamazsa osilatör yedeği).
- **Ratchet**: `uxRatchet.json` kasa girdileri (5 satır) silindi; `knownViolations.ts` içinden `kasa`, `kasa-yazici`, `kasa-iptal` (dokunma), `kasa`, `kasa-yazici@phone-390x844` (axe) silindi.

## Sapmalar / kararlar

1. **Durum şeridi 44 px** (brief 32 px): şeritteki ses/yazıcı/çıkış öğeleri dokunulabilir olduğundan matris POS katmanı >= 44 px ister.
2. **Tam ekran kapısı engelleyici katman değil**, haritanın üstünde büyük bant (+ "Şimdi değil"); aksi hâlde tüm mevcut e2e akışları kapıya takılırdı. Her ilk `pointerdown` ses kapısını da açar.
3. **Masa kartı adı**: `aria-label` yerine görünür etiket `aria-hidden` + ekran okuyucu metni "M1 masa detayları" (axe `label-content-name-mismatch` ihlali nedeniyle); `tableTile(...)` yardımcısı aynı kalır.
4. **Paneller**: dikeyde `position: sticky` alt sayfa (ray ve şerit görünür kalır); `.pos-split` dikeyde `display: contents`.
5. **KDS dokunma ratchet'i**: KDS `PosShell`'e geçince `kds: "T7"` (dokunma) kendiliğinden temizlendi; cırcır silmeyi zorunlu kıldığı için `knownViolations.ts`'ten `kds` satırı da silindi (T7 ajanına bilgi).
6. **Yazıcı 90 sn kuralı**: sunucu `printer.status {ok:false, reason:"SESSIZ"}` yayıyor, şerit "Hata (yanıt yok)" yazar; ilk yükleme durumu `posShellData.ts` içinde aynı 90 sn kuralıyla hesaplanır.
7. Taşıyıcı olmayan gözlemler (başka ajanların çalışması): ortak çalışma ağacında minibar yeniden düzenlemesi `next build` tip denetimini bozuyordu (silinen `minibar/room/[roomId]/mmd` rotası, `.next*/types/validator.ts` kalıntıları) -> yalnız üretilen `types` klasörleri silindi (`.next`, `.next-mb2/3/4`, `.next-rd4`, `.next-ux5`, `.next-uxint`); sonraki build'lerinde yeniden üretilir. Ortak Postgres 100 bağlantı sınırına dayandı (başka ajanlar), e2e `--retries=2` ile koşuldu.
8. `ilerleme-data.js` bu görevde güncellenmedi (paralel çakışma; kontrolör toplu işlesin).

## Testler

- Birim: `statusTone.test.ts` (14), `soundGate.test.ts` (5), `pos-table.test.tsx` (12), `pos-shell.test.tsx` (6).
- E2E: yeni `posKiosk.spec.ts` (6: harita/ray/şerit, tam ekran+wakeLock+ses, reddedilen tam ekran + wakeLock yok, 2 dokunuşla onay + Reddet akışı + Atanmadı, yazıcı olayı <= 5 sn, 1024x768 ve 768x1024 yerleşim); uyarlanan `opsScreens`, `kasaCurrency`, `noBrowserDialogs`, `opsUi.ts` (yeni `railLink`, `tablePanel`; `assignWaiter` panel akışı).
- Matris `kasa*` (6 görünüm x 3 rota x axe/yatay kaydırma/dokunma = 54) yeşil.
