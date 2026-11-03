# UX Görev 1 raporu — Belirteçler, dokunma kademeleri, görünüm matrisi iskeleti, erişilebilirlik yardımcıları

## Yapılanlar
- `globals.css`: `--space-1…8`, `--radius-s|m|l`, `--tap-xp|min|std|pri|pos`, `--tap-gap`, `--tap-action|primary`, `[data-density="xp|personel|pos"]`; durum belirteçleri (`--warn/-bg`, `--info/-bg`, `--success-bg`, `--danger-bg`, `--muted-bg`), nokta/anahtar renkleri ve Android kabuk paleti (`--app-*`, `--accent-*`).
- `mobile.css`: tüm `--mb-*` ve ham hex değerleri belirteçlere (`var(--…)`) eşlendi; dosyada ham renk kalmadı.
- `src/lib/contrast.ts`, `src/components/ui/{tap.ts,Density.tsx,Button.tsx}`.
- `tests/e2e/matrix/{viewports,a11y,routes,knownViolations}.ts` + `{layout,touchTargets,axe}.spec.ts`; `playwright.config.ts` (chromium `testIgnore` matris; 6 matris projesi, `hasTouch`, telefonda `isMobile`); `package.json` (+`@axe-core/playwright`, `test:e2e:matrix`); CI: chromium adımı + matris adımı.
- Rota matrisi: kat, kat-oda-kontrol, depo-stok (koordinatör devri), garson, garson-cagrilar, kasa, kasa-yazici, kasa-iptal, kds, oda-servisi, admin (11 rota x 3 spec x 6 proje = 198 test).

## Sapmalar
- `KNOWN_*` anahtarı `<rota>` (tüm görünümler) veya `<rota>@<proje>` olabilir (`knownFor`); admin dokunma ihlali yalnız telefon dışı 5 görünümde var.
- Her rota için `ready` metni (SSE yüzünden networkidle güvenilmez); `settle()` bitmiş animasyon/yazı tipi bekler.
- e2e seed'inde oda yok: matris ilk kullanımda ROYAL'e kat + oda tipi + 3 ürünlü setup + oda ekler (yalnız matris).
- `Button` `disabledReason` varken düğmeyi `<span>` içine alıp `<small id>` ekler.
- e2e DB `merit_ux1_e2e` (koordinatör isteği); `merit_test` yeni migration'lara göre `migrate deploy` ile güncellendi.
- KNOWN_SCROLL boş: hiçbir rota/projede yatay kaydırma yok.

## TDD RED/GREEN
- RED (src stash'li): `tokens/contrast/tap/button` -> 4 dosya, 19 test FAIL (belirteçler ve modüller yok).
- GREEN: 4 dosya, 35 test geçti.

## Doğrulama
- vitest tamamı: 120 dosya / 1225 test geçti (`npm run check`: eslint 0 hata, tsc temiz).
- `next build` temiz.
- Matris: `npm run test:e2e:matrix` 198/198 (ihlaller "beklenen" olarak yeşil). Başlangıç ihlal listesi: dokunma — kat-oda-kontrol T9, depo-stok T8, garson T8, garson-cagrilar T8, kasa T6, kasa-yazici T6, kasa-iptal T6, kds T7, oda-servisi T8, admin(5 görünüm) T14; axe — kat T9, kat-oda-kontrol T9, depo-stok T8, kasa T6, kasa-yazici@phone T6, oda-servisi T8.
- `--project=chromium`: 100 geçti, 5 kaldı (+18 çalışmadı, seri blok): commandCenter:155 ve shell:48 (beklenen `/secim`, artık `/yetkisiz`), definitionChain:216 (iniş `/erisimim` zorunlu özet), guide:54, definitions:420. Hepsi T2/T3/T4/T11'in davranış değişikliği kaynaklı; benim değişikliklerim yalnız CSS belirteci/test altyapısı. Temiz HEAD ile karşılaştırma yapılamadı (paylaşımlı çalışma ağacı).

## Concern
- chromium paketi bu dalda 96/96 değil (yukarıdaki 5 spec'in güncellenmesi T2/T4/T11 sahibine ait).
- `tsconfig.json` diğer ajanların `next build` çıktısıyla değişiyor; commit'e alınmadı.
- Matris `kat-oda-kontrol` sahte-yeşil riskine karşı `ready` ve `settle` ile korunuyor; ilk turdaki dalgalanma stil yüklenmeden ölçümden kaynaklıydı.
