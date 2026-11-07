# Merit OS — P0/P1 çekirdeği ve P5 QR Menü/Sipariş

Merit, otel operasyonları (kat hizmetleri, depo, oda servisi, kasa, mutfak) için tek
bir Next.js uygulaması olarak geliştirilen platformdur. Bu depo **P0 iskeletini** içerir:
kimlik doğrulama ve oturum yönetimi, rol/yetki (`can()`), denetim kaydı, bildirimler,
gerçek zamanlı olaylar (SSE), arka plan işleri (pg-boss), Windows XP temalı masaüstü
kabuğu ve Komuta Merkezi, mobil kabuk ve CI. **P1 (çekirdek tanımlar ve oturum takibi)**
bunun üzerine tanımlama pencerelerini, kurulum rehberini, online kullanıcı takibini,
bildirim merkezini, denetim günlüğünü ve sistem ayarlarını ekler (aşağıda "P1 pencereleri").
**P5** masa QR menüsünü, çok dilli misafir siparişini, kasa/garson onayını, KDS'yi ve
yerel ağdaki ESC/POS yazdırma geçidini ekler.

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
   | `SESSION_SECRET` | evet | Oturum çerezi için gizli anahtar, en az 32 karakter rastgele; varsayılanı yoktur. |
   | `QR_HMAC_SECRET` | evet | QR kodu imzaları için gizli anahtar, en az 32 karakter rastgele; varsayılanı yoktur. |
   | `PRINT_GATEWAY_KEY` | evet | Yazdırma geçidi anahtarı; geçidin `GATEWAY_KEY` değeriyle aynı. Varsayılanı yoktur. |
   | `APP_BASE_URL` | üretimde evet | Uygulamanın dış adresi (Origin denetimleri için). Geliştirmede boşsa `http://localhost:3000`; üretimde varsayılanı yoktur. |
   | `SEED_ADMIN_PASSWORD` | `db:seed` (admin yoksa) | İlk `admin` kullanıcısının parolası, en az 10 karakter; varsayılanı yoktur. Var olan admin'e seed dokunmaz. |
   | `TZ` | önerilir | `Europe/Nicosia` (iş saatleri ve zamanlanmış işler bu saat dilimine göre). |
   | `MERIT_DISABLE_JOBS` | hayır | `1` ise pg-boss işleri ve dinleyici başlamaz (yalnız test/CI); aşağıya bakın. |
   | `UPLOADS_DIR` | hayır | Menü görsellerinin dizini; varsayılan `<çalışma-dizini>/uploads`. |
   | `TRUSTED_PROXY_HOPS` | hayır | Önündeki güvenilir vekil sayısı (varsayılan 1). |
   | `COOKIE_SECURE` | hayır | Üretimde çerez varsayılan `secure`; yalnız HTTP test ortamı için `false`. |
   | `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` | hayır | E-posta bildirimleri (yoksa yalnız günlüğe yazılır). |
   | `DEEPL_AUTH_KEY`, `GEMINI_API_KEY` | hayır | Menü çeviri sağlayıcıları. |
   | `RUN_SEED` | hayır | Yalnız Docker girişi; `true` ise açılışta seed çalışır (varsayılan `false`). |
   | `SEED_DEMO` | hayır | `true` ise seed demo outlet, menü, tasarım ve örnek personel de yükler (varsayılan `false`). |
   | `LEGACY_DATABASE_URL` | hayır | Yalnız `npm run migrate:legacy` göç betiği için eski veritabanı. |
   | `SKIP_ENV_VALIDATION` | hayır | Yalnız Docker derlemesi (`1`); çalışma ortamında ayarlamayın. |

3. **Bağımlılıkları kurun ve veritabanını hazırlayın:**

   ```bash
   npm ci
   npm run db:migrate        # geliştirme veritabanı (prisma migrate dev)
   DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy   # test veritabanı
   npm run db:seed           # referans veri (oteller, roller, ekranlar, yetkiler) + admin (yoksa)
   # Demo outlet/menü/personel için: SEED_DEMO=true npm run db:seed
   ```

   `DATABASE_URL_TEST` değerini kabuğunuza almak için `set -a; . ./.env; set +a`
   kullanabilir veya URL'yi komut satırına doğrudan yazabilirsiniz.

4. **Geliştirme sunucusunu başlatın:** `npm run dev` — <http://localhost:3000>.
   Kullanıcı adı `admin`, parola `.env` içindeki `SEED_ADMIN_PASSWORD` değeridir.
   Girişten sonra yönetim ekranı `/admin` adresindedir.

## P1 pencereleri

Yönetim kabuğunda (`/admin`) Başlat menüsünden açılan pencereler. Her pencere bir
**ekran koduna** bağlıdır; kod, rol için `V` (görüntüle), `O` (oluştur), `D` (düzenle),
`A` (onayla) ve `R` (rapor) yetkilerinden hangilerinin açık olduğunu belirler
(Tanımlamalar → Yetki Matrisi). Otel bağlamlı pencereler açılırken otel seçtirir
(tek otelli kullanıcıda seçici çıkmaz); Oteller, Roller, Denetim Günlüğü ve Ayarlar
sistem geneldir.

| Ekran kodu | Pencere | Ne yapar |
| --- | --- | --- |
| `CR-TAN` | Tanımlamalar | Otel bilgileri ve modül anahtarları; kat, oda tipi, oda (toplu ekleme, Excel dışa aktarma), outlet, masa (toplu ekleme). Oda tipleri başka bir otelden kopyalanabilir. |
| `CR-KUL` | Tanımlamalar → Kullanıcılar, Ekipler, Roller, Yetki Matrisi | Kullanıcı açma/düzenleme/şifre/pasife alma, outlet ekibi (üyelik), rol kataloğu ve ekran x işlem yetki matrisi (sistem geneli veya otel bazlı geçersiz kılma). |
| `CR-REH` | Kurulum Rehberi | Otel başına kurulum adımları ve yüzde. Adımdaki **Aç** düğmesi Tanımlamalar'ı ilgili ağaç düğümünde açar; Komuta Merkezi'nde otel başına Kurulum % kartı görünür. |
| `CR-ONL` | Online Kullanıcılar | Açık oturumlar (2 sn içinde canlı), sayaçlar, durum süzgeci ve **zorla çıkış** (`A` yetkisi). |
| `CR-DEN` | Denetim Günlüğü | Tüm yazma işlemlerinin kaydı; kullanıcı/işlem/varlık/tarih süzgeci, before/after ayrıntısı, CSV dışa aktarma (`R` yetkisi olmayana düğme gösterilmez). Bildirim zili görev çubuğundadır. |
| `CR-SYS` | Denetim Masası → Sistem | Sistem geneli ve otel bazlı ayarlar (oturum süreleri, MyBar, DND, stok, fiyat, e-posta, QR). Otel değeri sistem değerini geçersiz kılar; "Otel değerini kaldır" geri alır. |

### Rol hiyerarşisi (YONETIM kuralı)

Otel müdürü gibi **YONETIM** rolleri kendi otelleri içinde çalışır; sistem düzeyi
işlemler yalnızca **SISTEM** rollerine (R-SYS) aittir:

- Rolleri ve yetki matrisini yalnızca SISTEM değiştirir; YONETIM bunları salt okunur görür.
- YONETIM, SISTEM ve YONETIM rollü kullanıcı oluşturamaz/atayamaz (rol listesinde de gösterilmez);
  başka yöneticiyi yönetemez. Kendi şifresini ve profilini değiştirebilir, kendi rolünü veya
  otel yetkisini değiştiremez, kendi hesabını pasife alamaz.
- YONETIM yalnızca tüm otelleri kendi yetki alanında olan kullanıcıları yönetir; başka otelle
  bağlantısı olan kullanıcıya salt okunur bakar.
- Online Kullanıcılar'da SISTEM oturumları YONETIM'e görünmez (sayaçlar dahil) ve kapatılamaz;
  başka bir yöneticinin oturumunu yalnızca SISTEM zorla kapatabilir.
- Yetkisiz her deneme `YETKISIZ_DENEME` olarak denetim günlüğüne yazılır.

Yeni ekran kodları (`CR-TAN`, `CR-REH`, `CR-ONL`, `CR-DEN`, `CR-SYS`) `npm run db:seed` ile
eklenir. Seed yalnız eksik olanı oluşturur: var olan `admin`'in parolasını/rolünü/aktifliğini,
menü düğümlerini, kullanıcı ve üyelikleri değiştirmez, pasif oteli yeniden açmaz; demo veri
yalnız `SEED_DEMO=true` ile yüklenir.

## P5 QR Menü ve Sipariş

- Misafir rotası `GET /q/{masa-qr-token}`'dır. Masa QR'ı yalnız kendi masa siparişlerini
  görüntüleyebilir; personel için giriş gerekmez. Misafir seçimleri gönderince akış
  `GONDERILDI → ONAYLANDI → HAZIR → SERVIS_EDILDI` olarak izlenir.
- Kasa `/kasa`, garson `/garson`, mutfak ekranı `/kds` rotalarındadır. Fiyat gizliyse toplamlar
  bu ekranlarda, misafir durumunda ve fişte gösterilmez; sipariş anındaki seçim saklanır.
- Denetim Masası → Sistem'de `qr.baseUrl` dış HTTPS adresine ayarlanmalıdır; QR çıktıları bu
  adresi taşır. `order.approvalEscalationMinutes` içindeki süre aşılırsa ilgili outletin şef
  garsonlarına ve otelin F&B müdürlerine bildirim gönderilir.
- Menü görselleri `UPLOADS_DIR` altında saklanır ve `/uploads/...` ile sunulur. Bu dizini kalıcı
  bir disk/birimde tutun, web kökü ya da Git altında tutmayın.

### Menü Tasarım Merkezi

Tema Yönetimi içindeki Menü Tasarım Merkezi'nde outletin canlı mobil menüsü düzenlenir. Tasarım
ayarları (tipografi, yoğunluk, karşılama, görsel seçimi ve gösterim tercihleri) outletin mevcut
`OutletMenuDesign.options` kaydında saklanır. Kalite panelindeki kontrast engelleri sunucuda da
denetlenir ve yayını durdurur. Renkler ve şablonlar tema kataloğundan yönetilir.

Garson çağrı seçenekleri aynı stüdyonun Garson çağrısı sekmesindedir. Outlet başına en çok sekiz
aktif seçenek bulunabilir; Türkçe etiket zorunlu, İngilizce/Almanca/Rusça/Arapça çeviriler isteğe
bağlıdır. Mevcut outletlerin ilk seçenekleri migration tarafından tek sefer eklenir. Yeni outlet
oluşturulurken dört varsayılan seçenek sağlanır; bir outletin seçenekleri yönetici tarafından
silinirse seed varsayılanları geri getirmez.

Misafir menüsü şu dilleri destekler: Türkçe, İngilizce, Almanca, Rusça, Arapça, Fransızca,
Yunanca ve İtalyanca (`tr`, `en`, `de`, `ru`, `ar`, `fr`, `el`, `it`).

### Yazdırma geçidi

Fiş kuyruğu uygulamada tutulur; termal yazıcıya erişen makinede ayrıca
[`tools/print-gateway/README.md`](tools/print-gateway/README.md) yönergeleriyle gateway'i
çalıştırın. Gateway `.env` dosyasındaki `GATEWAY_KEY`, uygulamanın `PRINT_GATEWAY_KEY` değeriyle
aynı olmalıdır. Yazıcıyı Kasa → Yazıcılar'dan tanımlayın; gateway işleri çeker, üç denemeden
sonra hatayı kasaya bildirir. cp857 için `CODEPAGE_TABLE=13` başlangıç değeridir ve test fişiyle
sahada doğrulanmalıdır.

## Minibar

Minibar modülü eski Flask uygulamasının (`minibarlatest`) yerini alır. Kat sorumlusu, depo sorumlusu ve
yönetim için ayrı yüzeyler vardır; tümü rol/ekran yetkisiyle (`MB-*` ekran kodları) açılır.

| Yüzey | Ne yapar |
| --- | --- |
| `/kat` | Kat sorumlusu ana sayfası: günün işleri, kritik stok, kat doluluk haritası. Alt sayfalar: `gorevler` (günlük In House / Arrival / Departure kontrol görevleri), `oda-kontrol/[oda]` (QR ile açılan ürün ekleme, **Sarfiyat Yok**, kapasiteli ikame), `dnd`, `doluluk`, `qr`, `islemlerim` (kendi işlemini silme/düzeltme talebi), `duzeltme-onay`, `stok`, `talep` (depodan ek talep), `tavsiye-is-plani` (öncelik planı), `kritik`. |
| `/depo` | Depo sorumlusu: `stok` ve `havuz` (otel havuzu: giriş, iade, düzeltme, kritik seviye), `talepler` (ek talep onay/teslim), `doluluk-yukle` ve `doluluk` (günlük üç doluluk dosyası), `gorevler` (yükleme görevleri), `raporlar`, `tanimlar`. |
| MyBar | Misafir QR'ı ile gelen doldurma talebi; kat sorumlusu onaylar, depo havuzundan düşer. Günde bir kez (ayarlanabilir). Rotalar: misafir `/q/[token]/mybar` (oda seçici `/q/[token]`; `?lang=` yalnız seçicide çerezi yazar; sekiz dil, Arapçada RTL), kat sorumlusu `/kat/mybar` (zorunlu sesli onay penceresi "Gördüm", "Tümünü Karşıla", "Talebi Kapat"), depo/yönetim `/depo/mybar` ve XP kabuğunda "MyBar Talepleri" (KPI, iptal, dışa aktarma). Web Push ve `TRANSLATE_PROVIDER` kurulumu için `docs/kurulum.md`. Kabul testi: `tests/e2e/mybarFlow.spec.ts`. |
| Yönetim (`MB-TAN`, `MB-ZIM`, ...) | Ürün grupları, ürünler, setuplar, oda tipi-setup atamaları, oda QR üretimi ve toplu üretim, misafir mesajı. |

**Arka plan işleri** (pg-boss, `Europe/Nicosia`; `MERIT_DISABLE_JOBS=1` iken çalışmaz): 00:01 günlük görev
üretimi ve yükleme görevleri, 10:00 ve 18:00 eksik doluluk dosyası uyarısı, her dakika DND hatırlatması, 23:59 DND gün sonu
kapanışı (kalan DND'ler EKSIK olur), 02:00 doluluk dosyası temizliği (saklama 4 gün). İş günü Nicosia saatine göredir.

### Eski sistemden veri göçü

```bash
export LEGACY_DATABASE_URL='postgresql://…/minibar_legacy'   # geri yüklenmiş eski yedek; dosyaya yazmayın
npm run migrate:legacy -- --dry-run     # tek transaction, sonunda geri alınır; migration-report.md üretir
npm run migrate:legacy                  # gerçek çalıştırma (idempotent); doğrulama FAIL ise çıkış kodu 1
```

Adımlar: `definitions` (oteller, katlar, odalar, ürünler, setuplar), `users` (kullanıcılar, e-posta, ek talepler,
bildirimler), `history` (MyBar, işlemler, oda kontrolleri, havuz ve hareketleri) ve `tasks` (doluluk, günlük görevler, DND,
QR/denetim/sistem günlükleri; `--skip-logs` günlükleri atlar). Rapor, doğrulama kontrolleri ve göç sonrası kontrol listesi
için `docs/kurulum.md` › "Veri göçü (minibarlatest)".

## P6 Oda Servisi

- **Misafir:** oda QR'ı `/q/{oda-token}` iki kart sunar (MyBar, Oda Servisi). Menü `/q/{oda-token}/oda-servisi`,
  sipariş durumu `/q/{oda-token}/siparis/{id}` adresindedir; durum sayfası sayfa yenilenmeden canlı güncellenir,
  sekiz dilde ve RTL'dir. Misafir "Seçimler" ile gönderir; onaydan önce "Vazgeç" diyebilir. Menüsü boş, pasif ya da modülü
  kapalı otelde kart bağlantısız "Şu an kullanılamıyor" gösterir; sipariş alımı kapalıysa menü görünür, gönderim 409 döner.
- **Personel:** `/oda-servisi` beş sütunlu pano (Teyit, Yeni, Hazırlanıyor, Hazır, Yolda), `/oda-servisi/teyit` ve
  `/oda-servisi/teslim` aynı panonun sekmeleridir. Ekran kodları: `RO-TAL` talepler, `RO-TEL` telefon teyidi,
  `RO-TES` teslim takibi, `RO-SLA` Oda Servisi SLA penceresi (`rs.rapor`); XP pencereleri `rs.menu`, `rs.tema`,
  `rs.kayitlar`, `rs.rapor`.
- **Roller:** `R-ODS` oda servisi görevlisi (onay, yola çıkar, teslim), `R-MUS` mutfak (Hazır), `R-FBM` F&B müdürü
  (onay sonrası iptal dahil). Oda servisi siparişi `/kds` ve `/garson` kuyruğunda görünmez (`kds.ts` yalnız `MASA`).
- **Akış:** `GONDERILDI → (TEYIT_BEKLIYOR) → ONAYLANDI → HAZIR → YOLDA → TESLIM_EDILDI`, `IPTAL` sebepli.
  Telefon teyidi Oda Servisi outletinin `phoneConfirmRequired` anahtarıyla açılır. Yazıcı isteğe bağlıdır (yoksa fiş ve uyarı yoktur).
- **SLA:** süre başlangıcı telefon teyidi (varsa) yoksa oluşturma anıdır; teyit bekleyen sipariş sayılmaz. %80'de uyarı,
  %100'de aşım bildirimi gider (tekrarlanmaz). Yardımcılar `order/server/roomService/slaConstants.ts`'tedir.
- **Kabul zinciri:** `tests/e2e/roomServiceChain.spec.ts` (A teyit kapalı + yazıcı/fiyat, B teyit açık, C iptal, D SLA,
  E kapsam/KDS/409, F `?lang=de`); SLA saati `tests/e2e/helpers/run-rs-jobs.ts <şimdi-ISO>` ile ilerletilir.
  Ayarlar için `docs/kurulum.md` › "Oda Servisi".

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu (Next.js). |
| `npm run check` | `lint` + `typecheck` + birim testleri; CI'nin ilk kapısı. |
| `npm test` | Birim testleri (Vitest, `merit_test` veritabanı). |
| `npm run test:e2e` | Uçtan uca testler (Playwright, Chromium). |
| `npm run test:e2e:matrix` | UX görünüm matrisi: altı görünümde (1366×768, 1280×800, 1024×768, 768×1024, 800×1280, 390×844) yatay kaydırma, dokunma hedefi/aralığı ve ciddi/kritik axe denetimi. |
| `npm run build` | `prisma generate && next build`. |
| `npm start` | Derlenmiş uygulamayı çalıştırır. |
| `npm run lint` / `npm run typecheck` | ESLint / `next typegen && tsc --noEmit`. |
| `npm run db:migrate` | `prisma migrate dev` (şema değişikliği + istemci üretimi). |
| `npm run db:seed` | Başlangıç verisini yükler (`SEED_ADMIN_PASSWORD` gerekir). |
| `npm run migrate:legacy` | Eski minibar verisini taşır (`LEGACY_DATABASE_URL` gerekir; `--dry-run` önce deneyin). |
| `npm run db:reset` | Veritabanını siler, migrasyonları yeniden uygular (`migrate reset --force`). |

### UX kapanış kapıları

- `tests/unit/final-gates.test.ts` (`npm run check` içinde): `KNOWN_TOUCH_VIOLATIONS`,
  `KNOWN_AXE_VIOLATIONS`, `KNOWN_SCROLL` ve `XP_AXE_EXCLUDE` boş, `tests/unit/uxRatchet.json`
  sayaçları 0 ve görünüm matrisi kabul listesindeki tüm rotaları kapsar. Yeni ihlal bu listelere
  eklenerek susturulmaz; kaynağında düzeltilir.
- `tests/unit/uxSourceRules.test.ts`: emoji, sürekli animasyon, sabit para birimi, tarayıcı
  diyalogları ve başarı modalı kuralları. `tests/unit/uxRatchet.test.ts`: personel/depo
  sayfalarında 9–12 px sabit yazı ve ham palet (`slate|indigo|purple|zinc|gray-NNN`) yasak.
- Matris rotaları `tests/e2e/matrix/routes.ts` (`ROUTE_MATRIX`); misafir menüsü (`/q/<token>`,
  `?lang=ar` dahil) `tests/e2e/matrix/guestMenu.spec.ts` ile yalnız 390×844'te denetlenir.
- Web Push e2e testi (`pushSubscribe.spec.ts`) sunucuda VAPID anahtarı ister. Koşu için geçici
  anahtar üretip yalnız o sunucu sürecine verin, repoya ve `.env`'e yazmayın:
  `npx web-push generate-vapid-keys --json` → `VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=…
  VAPID_SUBJECT=mailto:e2e@example.test npx next start -p <port>`.

### Uçtan uca (e2e) testler hakkında

- E2E testler **geliştirme veritabanına** (`DATABASE_URL`) karşı çalışır ve uygulama
  tablolarını **siler**, yeniden tohumlar. Değerli veri içeren bir veritabanına karşı
  çalıştırmayın. `merit_test` e2e için kullanılmaz.
- İlk kurulumda `npx playwright install chromium` gerekir. `localhost:3000` üzerinde
  zaten çalışan bir sunucu yeniden kullanılır, yoksa Playwright `npm run dev` başlatır.
- Bu belgedeki komutlar bash sözdizimindedir; PowerShell'de ortam değişkenlerini
  `$env:NAME="değer"` ile verin.
- `tests/e2e/definitionChain.spec.ts` P1 kabul zinciridir: oda tipi, toplu oda, outlet ve masa,
  kullanıcı, ekip, rol kopyası, yetki matrisi, Kurulum Rehberi %100, online kullanıcı ve zorla
  çıkış, denetim günlüğü satırları. İkinci bir tarayıcı bağlamında garson olarak giriş yapar.
  Üretim derlemesiyle çalıştırmak için: `npx next build && npx next start -p 3000`, ardından
  `npm run test:e2e` (3000 portundaki sunucu yeniden kullanılır).
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
