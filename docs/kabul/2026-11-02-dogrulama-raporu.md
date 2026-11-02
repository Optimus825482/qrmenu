# Doğrulama Raporu - 2 Kasım 2026

Hedef: `D:\PROJECTS\qrmenu\merit`, dal `main`, taban commit `b52da3b`. Yalnızca doğrulama; kodda değişiklik, commit veya dosya düzenlemesi yapılmadı (bu rapor hariç).

## Önemli uyarı: çalışma ağacı eş zamanlı değişti

Doğrulama sırasında başka bir ajan/kişi depoda çalışıyordu. Başlangıçta ağaç temizdi (`b52da3b`). Saat 20:33 sonrası: yeni commit `5509660`, `next.config.ts`, `schema.prisma`, `seed*.ts`, `playwright.config.ts`, `tests/e2e/*`, yeni `20261102210000_schema_drift_minibar_menu/` migrasyonu ve Docker dosyaları değişti. Adım 1-4 (lint, tsc, ilk vitest, build, drift) bu değişikliklerden ÖNCE (20:09-20:25) çalıştı, yani `b52da3b` ile ilgilidir. Üçüncü vitest koşusu ve e2e denemesi kısmen değişikliklerle çakıştı (aşağıda belirtildi).

## Özet

| # | Adım | Sonuç | Sayılar |
|---|------|-------|---------|
| 1a | `npm run check` | BAŞARISIZ (lint adımında durdu, tsc/vitest zinciri çalışmadı) | eslint: 14 hata, 23 uyarı |
| 1b | `npm run typecheck` (`next typegen && tsc --noEmit`) | GEÇTİ | 0 hata |
| 1c | `npx tsc --noEmit` (ayrıca) | GEÇTİ | 0 hata |
| 1d | `npx vitest run` (merit_test'e karşı) | BAŞARISIZ | 83 dosya: 18 kalan, 65 geçen; 843 test: 25 kalan, 818 geçen |
| 2 | `npx next build` | GEÇTİ (exit 0) | `ignoreBuildErrors: true`, "Skipping validation of types"; 3 Turbopack uyarısı (dinamik fs erişimi) |
| 3 | print-gateway `npm test` | GEÇTİ | 2 dosya, 17 test |
| 4a | `prisma migrate diff` (migrations -> schema) | DRIFT VAR (exit 2) | 1 tablo, 2 enum, 2 kolon, 1 default farkı eksik |
| 4b | Migrasyon sıralaması | Sorun yok | bkz. aşağıda |
| 5 | İzole e2e (Playwright) | ÇALIŞTIRILMADI (yapısal engel) | bkz. aşağıda |
| 6 | `migrate status` merit / merit_test | merit: 1 eksik; merit_test: migrasyon tablosu yok | bkz. aşağıda |
| 7 | Repo hijyeni | Gerçek sır yok; 1 zayıf varsayılan parola | bkz. aşağıda |

## 1. check / lint / tsc / vitest

`npm run check` = `npm run lint && npm run typecheck && npm run test`; lint exit 1 verdiği için devamı çalışmadı. Typecheck ve vitest ayrı koşuldu.

### eslint: 14 hata (23 uyarı)

| Dosya:satır | Kural |
|---|---|
| src/app/(ops)/kds/page.tsx:16 | react-hooks/error-boundaries (try/catch içinde JSX) |
| src/app/kat/components/PriorityRouteModal.tsx:19 | react-hooks/set-state-in-effect |
| src/app/kat/page.tsx:38 | react-hooks/set-state-in-effect |
| src/modules/menu/ui/panels/ImageStudioModal.tsx:325 | prefer-const (`a`) |
| ImageStudioModal.tsx:496 | no-explicit-any |
| ImageStudioModal.tsx:518 | prefer-const (`next`) |
| ImageStudioModal.tsx:1118 (x2), 1148, 1149 (x2) | react-hooks/refs (render sırasında ref okuma) |
| src/modules/minibar/ui/guest/MybarGuestScreen.tsx:156 | react-hooks/set-state-in-effect |
| src/modules/order/server/roomService/roomOrder.ts:214, :246 | no-explicit-any |

Not: 2 hata `--fix` ile düzelir (prefer-const). `ImageStudioModal.tsx` sonradan başka biri tarafından değiştirildi (20:35); lint sonucu `b52da3b` içindir.

### vitest (DATABASE_URL_TEST = merit_test, `b52da3b`): 25 başarısız test, 18 dosya

merit_test veritabanı eski bir şemada (migrasyon tablosu yok, `room_checks.transaction_id` yok, bkz. Adım 6). Aynı testler izole, güncel şemalı ve tohumlu bir veritabanında (merit_vt) tekrar koşuldu: 24 başarısız, 819 geçen. Yani başarısızlıkların neredeyse tamamı eski DB'den değil kod/test uyumsuzluğundan kaynaklanıyor. (İkinci doğrulama koşusu 20:33 sonrası değişikliklerle kısmen çakışmış olabilir.)

| Dosya | Hata (kısa) |
|---|---|
| health.test.ts (dosya yüklenemedi) | `Error: Cannot find package '@opentelemetry/api' imported from node_modules/pg-boss/dist/telemetry.js` (eksik bağımlılık/ortam) |
| admin-hotels.test.ts (2 test) | `expected ['DIAMOND','PREMIUM','ROYAL'] to deeply equal ['ROYAL','DIAMOND','PREMIUM']` (sıralama); `promise resolved ... instead of rejecting` (sistem oteli pasife alınabiliyor) |
| settingsAdmin.test.ts | aynı otel sıralaması uyuşmazlığı |
| admin-outlets.test.ts (2) | ikinci ODA_SERVISI outleti CONFLICT yerine başarıyla oluştu; `bulkCreate` beklenen `M1..M20` yerine `['Havuz Bar 2 1', ...]` |
| admin-roles.test.ts | beklenen `code: 'FORBIDDEN'`, alınan DomainError: "Bu role bağlı kullanıcılar v..." (CONFLICT) |
| controlPanelPrefs.test.ts (2) | `expected { wallpaper: 'royal-gold', ... } to be null`; `expected { wallpaper: 'bliss', ...} to match { fontScale:'M', ...}` |
| dataGrid.test.tsx | `expected '0' to be null` (sıralanamaz başlık tabIndex) |
| formDialog.test.tsx (2) | `expected 'true' to be null` (aria-busy); `expected "vi.fn()" to be called at least once` |
| guest-token.test.ts | `expected "vi.fn()" to be called with arguments: [ ObjectContaining{...} ]` |
| menu-images.test.ts (2) | `DomainError: "a.png": Görsel 2 MB'ı aşamaz` beklenen eşleşmede uyuşmadı; `expected '/uploads/menu/...' not to be '/uploads/menu/...'` (ikinci yükleme aynı URL) |
| p5-matrix.test.ts | `expected 18 to be 3` (tema sayısı) |
| print-queue-route.test.ts (2) | `expected 404 to be 200`; `Target cannot be null or undefined` (hotel=MR bulunamıyor) |
| rooms-export-route.test.ts | beklenen `odalar-MR.xlsx`, alınan `odalar-ROYAL.xlsx` |
| seed.test.ts (2) | `expected 15 to be +0` (seed artık outlet oluşturuyor); `expected 201 to be 191` (yetki satırı sayısı) |
| sse-filtered.test.ts | `SSE_EVENT_TYPES` beklenen 11 yerine 14 öğe |
| table-assignments.test.ts | `expected [ {...}, {...} ] to deeply equal [ ObjectContaining{...} ]` |
| targets.test.ts (2) | `PrismaClientKnownRequestError: No record was found` (`findFirstOrThrow` ODA_SERVISI outleti yok) |

Genel gözlem: çoğu, `b52da3b` ile gelen tohum (seed) değişikliklerinin (otel kodları/sırası, örnek menüler/outletler, yetki satırı sayısı) testlerle güncellenmemesinden; birkaçı gerçek davranış farkı olabilir (ODA_SERVISI tekilliği, sistem otelinin pasife alınabilmesi, rol silme hata kodu). Kök neden analizi bu rapor kapsamı dışı.

## 2. next build

`npx next build` exit 0. "Skipping validation of types" (`next.config.ts` `typescript.ignoreBuildErrors: true`). 3 Turbopack uyarısı: "Dynamic filesystem access causes tracing of the whole project" (uploads okuma). Tip denetimi build'de atlandığı için Adım 1c'deki `tsc --noEmit` (0 hata) asıl tip kanıtıdır.

## 3. print-gateway

`cd merit/tools/print-gateway && npm test`: 2 dosya, 17 test, hepsi geçti.

## 4. Migrasyon drift

Komut (geçici config: url = `DATABASE_URL`, shadow = `DATABASE_URL_TEST`):
`npx prisma migrate diff --config <geçici> --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` -> **exit 2 (fark var)**. `--script` ile (shadow = geçici merit_shadow) üretilen eksikler:

- Yeni enum: `CorrectionRequestStatus`, `CorrectionActionType`
- Yeni tablo `minibar_correction_requests` (+ indeks, 4 FK)
- `menu_nodes.image_urls TEXT[] DEFAULT ARRAY[]::TEXT[]` eksik
- `room_checks.transaction_id` + FK eksik
- `outlet_call_options.updated_at` DEFAULT kaldırılmalı (şema `@updatedAt`)

Neden: `b52da3b` şemaya `MinibarCorrectionRequest` vb. ekledi, migrasyon eklenmedi. `merit` geliştirme veritabanında bu kolonlar zaten var (elle uygulanmış), bu yüzden geliştirmede fark edilmedi.

**Sonuç (engelleyici):** `prisma migrate deploy` ile sıfırdan kurulan bir veritabanında (Coolify/Docker üretim, CI) `npm run db:seed` şu hatayla çöker: `The column image_urls of relation menu_nodes does not exist in the current database` (`prisma/seed.ts:274`, P2022). Çalışma ağacında başka biri `20261102210000_schema_drift_minibar_menu` migrasyonunu eklemiş (untracked); `b52da3b` içinde yok. Bu migrasyonun drift'i tam kapatıp kapatmadığı bu raporda doğrulanmadı.

### Sıralama

Prisma migrasyonları klasör adına göre sözlüksel sıralar. `0001_..0021_` hepsi `20261101082744_...`, `20261101131500_...`, `20261102033000_...` adlarından ÖNCE uygulanır (`'0' < '2'`). Bağımlılık kontrolü:

| Zaman damgalı migrasyon | Bağımlılığı | Önce çalışıyor mu |
|---|---|---|
| 20261101082744_menudes | `DROP INDEX outlet_tables_area_id_idx` (0007'de oluşur) | Evet |
| 20261101131500_outlet_call_options | `CallType` enum (0001), `outlets` tablosu | Evet |
| 20261102033000_p6_oda_servisi | `orders`, `users`, `rooms` tabloları | Evet |

Ters bağımlılık (00NN'in zaman damgalıya bağımlı olması) yok. Sıralama sorunu yok; sıfırdan `migrate deploy` 24 migrasyonun tamamını hatasız uyguladı.

## 5. İzole e2e

**Çalıştırılmadı (yapısal engeller):**

1. `merit_e2e` oluşturuldu, `migrate deploy` uygulandı; ancak drift nedeniyle (Adım 4) `db:seed` çöktü. Drift SQL'i (yukarıdaki `--script` çıktısı) elle uygulanıp `db:seed` yeniden çalıştırıldı: "Seed tamamlandı: 3 otel, 17 rol, 33 ekran". İzole DB hazır (şema = `schema.prisma`).
2. `prisma db push --accept-data-loss` Prisma'nın yapay zeka koruması yüzünden reddedildi; atlatılmadı.
3. **Port 3000 meşgul:** Benim dışımda başlatılmış bir `next dev` (PID 28884, ebeveyn 17204, başlangıç 20:33:04) 3000'i dinliyor. Hangi veritabanını kullandığı doğrulanamıyor (muhtemelen `merit` demo verisi). `next start -p 3000` `EADDRINUSE` verdi. Ayrıca `definitionChain`, `guestMenu`, `menuDesignCenter`, `onlineUsers`, `opsScreens` spec'leri `http://localhost:3000` adresini koda gömülü kullanıyor; farklı porta taşımak spec düzenlemesi gerektirir. E2E fixture'ları kendi DATABASE_URL'lerini sıfırlar; 3000'deki sunucu başka DB'ye bağlıysa testler yanlış sunucuya karşı koşar ve `merit` ile karışma riski doğar. Bu yüzden `merit`'e dokunmamak için durdum.
4. `playwright.config.ts`, `fixtures.ts`, `seed-e2e.ts` bu sırada başka biri tarafından değiştirildi (yeni `tests/e2e/e2eDb.ts`: DB adı `_e2e`/`_test` ile bitmeli, `DATABASE_URL`'den farklı olmalı). Koşulacak e2e altyapısı artık `b52da3b`'dekiyle aynı değil.

Hiçbir Playwright testi koşulmadı; per-spec sonucu yok. Hazır izole DB: `merit_e2e` (migrate deploy + drift SQL + seed). Önerilen koşu: 3000'deki `next dev` kapatıldıktan sonra `E2E_DATABASE_URL=.../merit_e2e` ile `npx playwright test`.

Oluşturduğum geçici veritabanları: `merit_e2e`, `merit_vt` (kalıyor; silinebilir), `merit_shadow` (silindi). Geçici config dosyaları silindi. Benim başlattığım süreç kalmadı.

## 6. migrate status

| Veritabanı | Sonuç |
|---|---|
| `merit` (salt okunur) | 24 migrasyondan 23 uygulanmış; **`20261102033000_p6_oda_servisi` uygulanmamış**. Şema `room_checks.transaction_id`, `image_urls` içeriyor (drift elle uygulanmış). |
| `merit_test` | `_prisma_migrations` tablosu YOK; 59 tablo var, 24 migrasyonun hepsi "uygulanmamış" görünüyor. `room_checks.transaction_id` yok, yani P6/düzeltme şemasından eski. Vitest'in ilk koşusunda bir test bu yüzden `The column room_checks.transaction_id does not exist` verdi. |

Not: `merit_test` Adım 4'te shadow olarak adlandırıldı; sonrasında tablo sayısı değişmedi (59), migrasyon tablosu hâlâ yok.

## 7. Repo hijyeni

- `git ls-files | grep -iE "\.env$|secret|\.pem$|\.key$"`: **sonuç yok**. `merit/.env` gitignore'da.
- İçerik taraması (değerler maskeli):
  - `merit/.env.example`: yer tutucu değerler (`change-me-...`); gerçek değil.
  - `.github/workflows/ci.yml:31-33,53`: CI için postgres parolası ve sahte `SESSION_SECRET`; yalnızca CI, gerçek sır değil.
  - `Dockerfile` (kök ve `merit/`): build-time sahte değerler (`SESSION_SECRET=0123...`, `PRINT_GATEWAY_KEY=build_print_gateway_key`, `DATABASE_URL=postgresql://build:***@localhost`); gerçek değil.
  - `src/lib/env.ts:4`: build için varsayılan `postgresql://build:***@localhost:5432/build`.
  - `docker-compose.yml/.yaml` (kök ve `merit/`): `SESSION_SECRET`, `QR_HMAC_SECRET`, `PRINT_GATEWAY_KEY` ortam değişkeninden (`${...}`) okunuyor, sabit değil.
  - **Zayıf varsayılan parola:** `docker-compose.yml/.yaml`, `docker-entrypoint.sh`, `prisma.config.ts` içinde `POSTGRES_PASSWORD` varsayılanı sabit bir değer (`merit_admin` kullanıcısı için `merit_secure_pass_2026`). Ortamda `POSTGRES_PASSWORD` verilmezse bilinen parola kullanılır. Öneri: varsayılanı kaldır (zorunlu yap).
  - `docs/kurulum.md:22`, `scripts/migrate-minibar-data.ts:6`, planlar: yer tutucu örnek URL'ler.
  - `VAPID`: yalnızca belgelerde ad olarak geçiyor, anahtar değeri yok.
  - `merit/ops-e2e-server.log`, `playwright-report/`, `test-results/`, `uploads/` çalışma ağacında var; `git ls-files` içinde değil.

## Kullanılan komutlar (özet)

```
cd merit && npm run check; npm run typecheck; npx tsc --noEmit; npx vitest run
npx eslint . -f json
npx next build
cd tools/print-gateway && npm test
npx prisma migrate diff --config <shadow.config> --from-migrations prisma/migrations --to-schema prisma/schema.prisma [--exit-code|--script]
npx prisma migrate status       # merit; DATABASE_URL=$DATABASE_URL_TEST ile merit_test
psql ... -c 'create database merit_e2e' -c 'create database merit_vt'   # geçici
DATABASE_URL=<merit_e2e|merit_vt> npx prisma migrate deploy; psql -f drift.sql; npm run db:seed
DATABASE_URL_TEST=<merit_vt> DATABASE_URL=<merit_e2e> npx vitest run
git ls-files | grep ...; git grep -nIE "PRINT_GATEWAY_KEY=|SESSION_SECRET=|..."
```

## Engelleyiciler

1. Şema/migrasyon drift'i (`b52da3b`): sıfırdan `migrate deploy` + seed çöküyor; üretim (Coolify) ve CI etkilenir. Yeni `20261102210000_schema_drift_minibar_menu` migrasyonu bunu kapatıyor olabilir; commit edilip yeniden doğrulanmalı.
2. `merit` veritabanında `20261102033000_p6_oda_servisi` uygulanmamış; `merit_test` şeması eski ve migrasyon tablosu yok (vitest bu yüzden yanlış sinyal verebilir).
3. 24-25 başarısız vitest testi (çoğu seed/test uyumsuzluğu) ve 14 eslint hatası: `npm run check` kırmızı.
4. Playwright çalıştırılamadı: port 3000'de yabancı `next dev` süreci var; spec'lerde gömülü 3000 adresi.
