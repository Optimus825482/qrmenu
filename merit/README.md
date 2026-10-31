# Merit OS — P0 iskeleti

Merit, otel operasyonları (kat hizmetleri, depo, oda servisi, kasa, mutfak) için tek
bir Next.js uygulaması olarak geliştirilen platformdur. Bu depo **P0 iskeletini** içerir:
kimlik doğrulama ve oturum yönetimi, rol/yetki (`can()`), denetim kaydı, bildirimler,
gerçek zamanlı olaylar (SSE), arka plan işleri (pg-boss), Windows XP temalı masaüstü
kabuğu ve Komuta Merkezi, mobil kabuk ve CI.

## Gereksinimler

- Node.js 24 (LTS)
- PostgreSQL 17
- Playwright testleri için Chromium (`npx playwright install chromium`)

## Kurulum

1. **Veritabanlarını oluşturun.** `psql` ile bir yönetici kullanıcıyla bağlanın:

   ```sql
   CREATE DATABASE merit;
   CREATE DATABASE merit_test;
   ```

   İsterseniz ayrı bir rol de oluşturabilirsiniz (`CREATE ROLE merit LOGIN PASSWORD '...';`)
   ve iki veritabanının sahibi yapabilirsiniz. `merit` geliştirme ve e2e için,
   `merit_test` birim testleri içindir.

2. **Ortam değişkenlerini hazırlayın.** `.env.example` dosyasını `.env` olarak kopyalayın
   ve her değişkeni doldurun (`.env` asla commit edilmez):

   | Değişken | Zorunlu | Açıklama |
   | --- | --- | --- |
   | `DATABASE_URL` | evet | Geliştirme/çalışma veritabanı (`merit`). |
   | `DATABASE_URL_TEST` | testler için | Birim testlerinin kullandığı `merit_test` veritabanı. |
   | `SESSION_SECRET` | evet | Oturum çerezi için gizli anahtar, en az 32 karakter rastgele. |
   | `QR_HMAC_SECRET` | evet | QR kodu imzaları için gizli anahtar, en az 32 karakter rastgele. |
   | `PRINT_GATEWAY_KEY` | evet | Yazdırma geçidinin (ileride) kullanacağı anahtar. |
   | `APP_BASE_URL` | evet | Uygulamanın dış adresi, örn. `http://localhost:3000` (Origin denetimleri için). |
   | `SEED_ADMIN_PASSWORD` | `db:seed` için | İlk `admin` kullanıcısının parolası, en az 10 karakter; varsayılanı yoktur. |
   | `TZ` | önerilir | `Europe/Nicosia` (iş saatleri ve zamanlanmış işler bu saat dilimine göre). |
   | `MERIT_DISABLE_JOBS` | hayır | `1` ise pg-boss işleri ve dinleyici başlamaz (yalnız test/CI); aşağıya bakın. |

3. **Bağımlılıkları kurun ve veritabanını hazırlayın:**

   ```bash
   npm ci
   npm run db:migrate        # geliştirme veritabanı (prisma migrate dev)
   DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy   # test veritabanı
   npm run db:seed           # roller, otel/outlet verisi ve admin kullanıcısı
   ```

   `DATABASE_URL_TEST` değerini kabuğunuza almak için `set -a; . ./.env; set +a`
   kullanabilir veya URL'yi komut satırına doğrudan yazabilirsiniz.

4. **Geliştirme sunucusunu başlatın:** `npm run dev` — <http://localhost:3000>.
   Kullanıcı adı `admin`, parola `.env` içindeki `SEED_ADMIN_PASSWORD` değeridir.
   Girişten sonra yönetim ekranı `/admin` adresindedir.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu (Next.js). |
| `npm run check` | `lint` + `typecheck` + birim testleri; CI'nin ilk kapısı. |
| `npm test` | Birim testleri (Vitest, `merit_test` veritabanı). |
| `npm run test:e2e` | Uçtan uca testler (Playwright, Chromium). |
| `npm run build` | `prisma generate && next build`. |
| `npm start` | Derlenmiş uygulamayı çalıştırır. |
| `npm run lint` / `npm run typecheck` | ESLint / `next typegen && tsc --noEmit`. |
| `npm run db:migrate` | `prisma migrate dev` (şema değişikliği + istemci üretimi). |
| `npm run db:seed` | Başlangıç verisini yükler (`SEED_ADMIN_PASSWORD` gerekir). |
| `npm run db:reset` | Veritabanını siler, migrasyonları yeniden uygular (`migrate reset --force`). |

### Uçtan uca (e2e) testler hakkında

- E2E testler **geliştirme veritabanına** (`DATABASE_URL`) karşı çalışır ve uygulama
  tablolarını **siler**, yeniden tohumlar. Değerli veri içeren bir veritabanına karşı
  çalıştırmayın. `merit_test` e2e için kullanılmaz.
- İlk kurulumda `npx playwright install chromium` gerekir. `localhost:3000` üzerinde
  zaten çalışan bir sunucu yeniden kullanılır, yoksa Playwright `npm run dev` başlatır.
- Giriş hız sınırlayıcısı kullanıcı adı ve IP başına dakikada 5 denemeye izin verir.
  Başarılı girişler kullanıcı adı sayacını sıfırlar; bu yüzden testleri art arda
  çalıştırmak sorun değildir. Başarısız bir koşudan sonra "çok fazla deneme" hatası
  alırsanız yaklaşık 60 saniye bekleyip yeniden deneyin.

## Klasör yapısı

```
merit/
  src/
    app/          Next.js yönlendirmeleri: (admin), (staff), api/ (health, sse)
    modules/      Etki alanı modülleri; şimdilik core (auth, oturum, denetim, bildirim, ayarlar)
    shell/        XP masaüstü kabuğu: pencere yöneticisi, uygulama kaydı, mobil kabuk
    lib/          Paylaşılan altyapı: prisma, env, auth, rbac, realtime (SSE), jobs, time, result
    components/   Küçük ortak React bileşenleri
    proxy.ts      Oturum çerezi olmayan isteği /giris sayfasına yönlendirir
    instrumentation.ts  Sunucu açılışında gerçek zaman dinleyicisini ve pg-boss'u başlatır
  prisma/         schema.prisma, migrations/, seed.ts
  tests/          unit/ (Vitest), e2e/ (Playwright), helpers/
  tools/          (planlı) yazdırma geçidi gibi yardımcı programlar
```

Depo kökündeki `docs/` altında analiz notları, plan ve `docs/kurulum.md`
(dağıtım rehberi) bulunur.

## Mimari (özet)

Tek bir Next.js süreci ve tek bir PostgreSQL vardır; Redis kullanılmaz. Gerçek zamanlı
olaylar PostgreSQL `NOTIFY`/`LISTEN` ile taşınır: işlemler `pg_notify` çağırır, her
sunucu süreci tek bir uzun ömürlü `LISTEN` bağlantısı tutar ve gelen olayları açık
SSE bağlantılarına rol/otel/outlet kapsamına göre dağıtır. Zamanlanmış ve arka plan
işleri (oturum süpürücüsü gibi) PostgreSQL üzerinde çalışan pg-boss ile yürür.
Dinleyici ve pg-boss `src/instrumentation.ts` içinden açılışta başlatılır; sağlık
durumu `GET /api/health` ile izlenir.

## Sorun giderme

- **`prisma generate` veya esbuild kurulum betikleri çalışmadı** (ör. `@/generated/prisma`
  bulunamıyor): npm install betikleri onay bekliyor olabilir. `npm ci` sonrasında
  `npx prisma generate` çalıştırın; paket yöneticiniz betik onayı istiyorsa `prisma`
  ve `esbuild` için izin verin. `npm run build` zaten `prisma generate` içerir.
- **`MERIT_DISABLE_JOBS=1`**: dinleyiciyi ve pg-boss işlerini başlatmaz; testler ve
  CI'da kullanılır (birim testleri bunu kendisi ayarlar). **Üretimde
  (`NODE_ENV=production`) yoksayılır** ve açılışta uyarı yazılır, çünkü oturum
  süpürücüsü üretimde her zaman çalışmalıdır. Açıkken `/api/health` içinde
  `listener` ve `boss` alanları `disabled` görünür.
- **`SEED_ADMIN_PASSWORD tanımlı değil`**: `.env` içine en az 10 karakterlik bir değer yazın.
- **`/api/health` 503 dönüyor**: gövdedeki `db`, `listener`, `boss` alanlarından hangisinin
  `down` olduğuna bakın; veritabanı bağlantısını ve `DATABASE_URL` değerini denetleyin.
