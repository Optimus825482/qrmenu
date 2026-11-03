# Task 10 raporu: Kabuk seçimi, PWA manifestleri, kiosk (ux10)

## Yapılanlar
- `src/shell/resolveShell.ts`: saf karar noktası. `ShellKind/ShellInput/ShellDecision`, `allowedShells` (spec 4.1 tablosu), `parseShellQuery` (`mod` > `kabuk` > `mobil=1`), `resolveShell` (query > cihaz > tercih > ekran bağlamı > genişlik; izinsiz aday atlanır; xp<760 `android`, pos<600 `personel`, `null` genişlik `standard`).
- `src/shell/deviceRecord.ts`: `merit.device` (zod; bozuk/erişilemez `null`, `writeDevice` false döner, fırlatmaz) + aynı sekme için `merit:device-changed` olayı. Yetki vermez.
- `src/shell/manifests.ts` + `src/app/{personel,pos}.webmanifest/route.ts` + `src/app/manifest.ts` (admin): üç manifest, KDS varyantı (`?ekran=kds`), farklı `id`, `fullscreen/landscape`; yeni simgeler `public/icons/merit-{personel,pos}-{192,512}.png` (lacivert / koyu gri zemin, maskeli).
- `useShellMode.ts`: `resolveShell` üzerine ince sarmalayıcı (`?mobil=1`, `?mod=personel`, `?kabuk=personel` admin telefon kabuğunu açar); yeni `useResolvedShell` (genişlik, sorgu, cihaz kaydı; sunucu/hidrasyon `null` genişlik).
- `OpsShell`: kabuk seçici. Kasa/KDS `pos` ise PosShell, değilse StaffShell. Telefon genişliğinde kasa/KDS için gezinme, sunucuda yetkiye göre süzülmüş POS rayından üretilir (kasa rolünün nav ailesi yok). `(ops)/layout.tsx` `roleKind` ve `preferredShell` (yeni `src/shell/preferredShell.ts`) geçirir.
- `DeviceSetupPrompt` ("Kur" / "Bu cihaz kasa değil"), PosShell'e `setup` render-prop'u eklendi (tam ekran + ses + uyku kilidi aynı harekette).
- `ShellPrefs.preferredShell` (opsiyonel) tip + şema.
- Layout `metadata.manifest`: (ops) ve kat, depo `/personel.webmanifest`; yeni `(ops)/kasa/layout.tsx` `/pos.webmanifest`; KDS `/pos.webmanifest?ekran=kds`; `garson/page.tsx` tek satır (`/api/manifest/garson` yerine `/personel.webmanifest`).
- `/baslat`: `kabuk/ekran/mod/mobil` okur; kabuk yalnız rolün izin verdiği kümeden ve `resolveLanding(ctx,{shell})` ile uygulanır; `kabuk=pos&ekran=kds` ve QS-KDS görünürse `/kds`; girişe yönlendirmede sorgu korunur.
- `usePwaInstall.ts` `INSTALL_COPY` (admin/personel/pos metinleri), `InstallPrompt` `variant` prop.
- `docs/kurulum.md` "Kasa/KDS tabletini kurma" (Android PWA, tam ekran, Uygulama sabitleme; Windows Edge kiosk).
- Matris: `routes.ts` POS rotaları 600 px altı projede `personel` katmanıyla denetlenir (telefonda kasa personel kabuğunda).

## Testler
- Birim (hedefli, `merit_test_ux10`): resolve-shell (40 civarı satır), device-record (10), manifests (8), uxRatchet, nav-model, landing: yeşil (73).
- `tsc --noEmit`: bu göreve ait hata yok (yalnız başka ajanın radar test dosyalarında eksik modül hataları vardı; son çalıştırmada temiz). ESLint dosyalarımda temiz. `next build` (`.next-ux10`) geçti.
- E2E (chromium, :3020, `merit_ux10_e2e`): posKiosk (6 yeni test dahil) + mobileShell 19/19 yeşil. staffShell 7/8: `depo ana sayfası ... Depo panosu` başlığı bulunamıyor; bu başlık `depo/page.tsx` HEAD'inde de yok (T10 dışı, T8/ux13 kaynaklı olabilir). `depo çok otelli` bir koşuda tek seferlik düştü, üç tekrarda geçti (zamanlama).
- Matris (tablet 1280/1024, telefon 390; kasa, kds, garson, oda-servisi): axe/yatay kaydırma/dokunma hedefi yeşil.

## Devir notları
- T12 (rehber): `Kur` önerisi ve `FullscreenGate` aynı üstte iki şerit çıkarır (ilk açılış); gerekirse birleştirilebilir. Cihaz kaydı `merit.device` kullanıcıya özel değildir (cihaza özel): `clearUserLocalState` bunu silmemeli.
- T14: `preferredShell` yazan arayüz yok (okunur ama kaydedilemez). `saveShellPrefs` tüm `shell` JSON'unu değiştirdiği için bir tercih UI'si eklenirse `windowStore.snapshot` bu alanı taşımalı, yoksa ilk yerleşim kaydında silinir.
- T14/T15: `/api/manifest/garson` artık hiçbir sayfada kullanılmıyor (silinebilir). Kasa rolünün `navModel` ailesi yok; telefonda alt gezinme OpsShell'de rayından türetiliyor, istenirse `navModel`'e "kasa" ailesi eklenip bu türetme kaldırılabilir.
- Kiosk açılışında `kiosk:true` kaydı şimdilik yalnız saklanır (otomatik tam ekran yok; tarayıcı kullanıcı hareketi ister).
