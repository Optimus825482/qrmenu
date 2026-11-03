# Task 12 raporu — Göç iskeleti ve tanımlar

Ajan `mb12`, dal `ux/yenileme`. Birim DB `merit_test_mb12`, entegrasyon/kuru çalıştırma hedefi `merit_mb12_goc` (migrate + referans seed), legacy kaynak yerel restore (`LEGACY_DATABASE_URL` yalnız komut satırında).

## Yapılanlar
- `merit/scripts/migrate-from-minibarlatest/`: `index.ts` (main, çıkış 0/1/2, kuru çalıştırma = tek dış transaction + `DryRunRollback`, gerçek çalıştırmada parça başına transaction, tek `LEGACY_MIGRATION` audit), `config.ts` (`parseConfig`, `ConfigError`), `legacy.ts` (`LegacyReader`: oturum `default_transaction_read_only=on`, tanımlayıcı doğrulama, keyset sayfalama, esnek kolon), `idmap.ts` (`IdMap`, `MAP_ENTITY`), `report.ts` (`Report`, `redact`), `mapping.ts`, `logos.ts`, `types.ts`, `steps/definitions.ts`.
- Tanımlar adımı alt adımları: oteller (+logo) → katlar → oda tipleri (otel kopyası) → odalar → ürün grupları → ürünler → setuplar → setup içerikleri → oda tipi atamaları. Hepsi hedefte doğal anahtarla eşler (seed'in yazdığı satırlar için `legacy_id_map` yazar, kopya üretmez), yoksa oluşturur.
- Fixture `merit/tests/fixtures/legacy-dump.sql` (kontrolör talimatındaki ad; briefteki `legacy-minibar.sql` yerine) + `tests/helpers/legacyFixture.ts` (`legacy_fx` şeması, `merit_test_mb12` içinde).
- Testler: `tests/unit/migrate-core.test.ts` (27), `tests/unit/migrate-definitions.test.ts` (21).
- Silinen: `scripts/migrate-minibar-data.ts`. Değişen: `package.json` (`migrate:legacy`), `.env.example` (`LEGACY_SCHEMA`, açıklama), `docs/kurulum.md` (betik adı).

## Talimat/brief ile bilinçli farklar
- Logo: kontrolör talimatına uyuldu: `public/brand/hotels/{kod-küçük}.png` yalnız dosya yoksa yazılır, `Hotel.logoUrl = /brand/hotels/{kod}.png` yalnız boşsa; kuru çalıştırmada dosya yazılmaz. Dizin `--logo-dir` ile değişir (testler tmp dizini kullanır). Briefteki `saveUpload('hotels/…')` kullanılmadı.
- QR token: yeni odaya legacy token aynen yazılır; seed'in yarattığı ve token'ı boş odaya yalnız boşsa ve token başka odada yoksa legacy token doldurulur (`QR_TOKEN_DOLDURULDU` bilgi uyarısı); dolu token asla ezilmez.
- Aynı `(otel, kat_no)`: ikinci legacy kat ilk kata eşlenir (`KAT_NO_COBLU`); aynı `(otel, oda_no)`: ikinci oda `ODA_NO_COBLU` ile düşer. "Birleştirilen" setup içerik satırları `Taşınmadı` sütununda sayılır, böylece Fark 0 kalır.
- `users|history|tasks` adımları henüz yok: `--only/--skip` adlarını kabul eder, çalıştırmada `ADIM_YOK` uyarısı + Yapılacaklar maddesi düşer (T13/T14 `STEPS` kaydına ekler).

## Test sonuçları
- `migrate-core` 27/27, `migrate-definitions` 21/21 (yeşil). eslint temiz (0 hata) — tüm repo lint: 0 hata.
- `tsc`: `scripts/**` ve yeni testlerde hata yok. Repo genelinde kalan tip hataları başkasının: paylaşımlı `src/generated/prisma` istemcisi `OperationEvent` modelini içermiyor (`radar-*` dosyaları; başka ajanın şema değişikliği, `prisma generate` bekliyor).

## Gerçek legacy üzerinde kuru çalıştırma (`--dry-run` -> `merit_mb12_goc`, çıkış 0)
Hedefte referans seed (3 otel, 558 oda, 18 kat, 69 ürün…) olduğundan her şey "Zaten vardı"; kopya yok, `legacy_id_map` boş kaldı (geri alındı).

| Varlık | Legacy | Aktarılan | Zaten vardı | Taşınmadı | Hata | Fark |
|---|---:|---:|---:|---:|---:|---:|
| hotel | 3 | 0 | 3 | 0 | 0 | 0 |
| floor | 18 | 0 | 18 | 0 | 0 | 0 |
| roomType | 14 | 0 | 12 | 2 | 0 | 0 |
| room | 558 | 0 | 558 | 0 | 0 | 0 |
| productGroup | 7 | 0 | 7 | 0 | 0 | 0 |
| product | 69 | 0 | 69 | 0 | 0 | 0 |
| setup | 10 | 0 | 10 | 0 | 0 | 0 |
| setupItem | 123 | 0 | 123 | 0 | 0 | 0 |
| roomTypeSetup | 31 | 0 | 31 | 0 | 0 | 0 |

Uyarılar: `TIP_KULLANILMIYOR` x2 (STANDART PREMIUM, JUNIOR PREMIUM hiçbir otelde kullanılmıyor, taşınmadı), `ADIM_YOK` x3 (users, history, tasks). Kuru çalıştırmada 558 odaya legacy QR token'ı yazılacağı görüldü.

Ek doğrulama (tek kullanımlık `merit_mb12_scratch`, `merit_mb12_goc`'tan kopya, sonra silindi): gerçek çalıştırma çıkış 0, `legacy_id_map` 831 satır (3+18+12+558+7+69+10+123+31), 558 odada `qr_token` dolu, 1 audit; ikinci gerçek çalıştırma 0 yeni satır, token yeniden doldurulmadı. `merit_mb12_goc` dokunulmamış (kuru çalıştırma sonrası `legacy_id_map` 0).

## Dikkat (sonraki görevler için)
- `StepContext.target` yok; adımlar yalnız `ctx.tx(db => …)` ve `ctx.ids(db)` kullanır (kuru çalıştırmada tek dış transaction'a katılır).
- Yeni adım eklemek: `index.ts` içindeki `STEPS` kaydına `{ users: runUsers }` vb.
- Eski Flask DB'de `oda_tipi_id` bazı odalarda tipsiz olabilir: oda tipsiz taşınır (`ODA_TIPI_YOK`).
