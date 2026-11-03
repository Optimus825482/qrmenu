# Görev 7 raporu — KDS yenilemesi, ses dosyaları, "Hazır" geri alma (ux7)

## Yapılanlar
- `src/modules/order/kdsTiming.ts` (`kdsTone`, `formatAge`), `orders.revertReady` (30 sn sunucu toleransı, FOR UPDATE, OrderEvent notu `HAZIR_GERI_ALINDI`, audit `ORDER_READY_REVERT`, `order.prep` yayını, `prepStartedAt` korunur) ve `undoReadyAction`.
- KDS: `KdsClient/KdsColumn/KdsCard` yeniden yazıldı, `kds.css` (üç sütun; <900 px `[data-kds-board]` yatay kaydırma + scroll-snap, sütun `min(88vw,360px)`), 24/20 px yazı, 64 px tam genişlik bump (`data-primary`), not sarı blokta, süre rozeti renk + metin ("Dikkat"/"Geç") + kenar biçimi, kart bazlı `pendingIds`, "Hazır" sonrası `notify.success(..., { undo })`, `playCue` (new-order / ready başka cihazdan / error), `(ops)/kds/layout.tsx` (başlık).
- `PosShell`: `context="kds"` iken ray çizilmez; `pos.css` KDS için ray'sız ızgara. (T6 dosyalarına küçük ek.)
- `src/components/ui/EmptyState.tsx` yoktu; en küçük haliyle oluşturuldu.
- Ses dosyaları ve `scripts/generate-sounds.ts` T6'da (`c441101`) zaten depodaydı; script yeniden çalıştırıldı, çıktı birebir aynı (deterministik); `sounds.test.ts` yalnız doğrular.
- Koordinatör isteği: `tests/unit/uxRatchet.json` içindeki minibar T10'un düşürülmüş üç değeri bu commit'e dahil edildi.
- Testler: `kds-timing`, `orders-revert` (gerçek DB, eşzamanlılık, başka outlet, R-GAR, 31 sn, SERVIS_EDILDI), `sounds`; e2e `opsScreens.spec.ts` yeni KDS testi.

## Doğrulama
- Yeni birim testleri: 3 dosya, 10 test yeşil (orders/uxRatchet/pos-shell ile birlikte 11 dosyada 78 yeşil).
- e2e (dev sunucu :3017, `merit_ux7_e2e`): opsScreens 3/3 yeşil; posKiosk 4 yeşil, 1 başarısız (testin kendi `pg` istemcisi "too many clients": Postgres 97/100 bağlantıda, diğer ajanlar), 1 çalışmadı.
- `npm run check`: lint 2 hata (`staff/SessionBanner.tsx`, `staff/useOnline.ts` — başka ajan), typecheck hataları `kat/(home)/KatDashboard.tsx`, `kat/tavsiye-is-plani`, `minibar-auth.test.ts`, `nav-model/online` testleri (başkalarının). Tam vitest: 46 dosya / 80 test kırmızı, 71 "too many clients"; approvals+cashier tek başına 12/12 yeşil. Kalıcı kırmızılar (migrate-*, minibar-room-check, auth vb.) benim dosyalarım değil.
- `next build`: derleme başarılı, ama "Failed to type check" başkalarının dosyalarında (`kat/tavsiye-is-plani/page.tsx`, staff testleri). Benim dosyalarımda tip hatası yok. **Build yeşil doğrulanamadı.** (e2e için `next dev` kullanıldı.)

## Kontrolöre
- Matris/ratchet: değişiklik gerekmedi (`kds` anahtarı ratchet'te ve knownViolations'ta yok; routes.ts `ready: /Mutfak ekranı/` h1 korundu).
- El değişimi: Postgres bağlantı doygunluğu (max 100); build için kat/staff tip hataları giderilmeli. İlk e2e koşusunda dev-sunucu derleme gecikmesi nedeniyle 30 sn zaman aşımı olabilir (`--timeout=120000`).
