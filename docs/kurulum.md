# Merit OS — Kurulum ve dağıtım rehberi

Bu belge P0 iskeletinin, P1 çekirdek tanımlarının ve P5 QR Menü/Sipariş bileşenlerinin bulut veya şirket içi (on-prem) bir sunucuya kurulumunu anlatır.
Geliştirme ortamı için `merit/README.md` dosyasına bakın.

## Üretim kurulumu → deploy/

Şirket içi (on-prem) üretim kurulumu için hazır dosyalar kök dizindeki `deploy/` klasöründedir: nginx yapılandırması,
systemd birimleri (üretim, eğitim, print gateway, yedek zamanlayıcısı), yedek / geri yükleme / güncelleme / sağlık betikleri,
ortam örneği, adım adım runbook (`deploy/README.md`) ve go-live listesi (`deploy/CHECKLIST.md`). Aşağıdaki bölümler
referans ve bulut/Docker alternatifleri içindir.

## 1. Gereksinimler

- Linux sunucu (örnekler Debian/Ubuntu içindir)
- Node.js 24 LTS
- PostgreSQL 17 (aynı makinede veya erişilebilir bir sunucuda)
- Ters vekil (reverse proxy): nginx veya eşdeğeri, HTTPS sonlandırması ile
- Saat dilimi: `TZ=Europe/Nicosia`

## 2. Veritabanı

```sql
CREATE ROLE merit LOGIN PASSWORD '<güçlü-parola>';
CREATE DATABASE merit OWNER merit;
```

Üretimde `merit_test` veritabanı gerekmez. Bağlantı dizesi:
`postgresql://merit:<parola>@<sunucu>:5432/merit`. Parolada özel karakter varsa
URL'de yüzde-kodlayın. pg-boss kendi `pgboss` şemasını aynı veritabanında kendisi oluşturur.

## 3. Ortam değişkenleri

Uygulama dizininde bir `.env` dosyası (veya systemd `EnvironmentFile`) oluşturun;
dosya izinleri `600` olsun ve depoya eklemeyin.

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `DATABASE_URL` | evet | Üretim veritabanı bağlantı dizesi (varsayılanı yok). |
| `SESSION_SECRET` | evet | Oturum çerezini şifreleyen anahtar; en az 32 baytlık rastgele değer. |
| `QR_HMAC_SECRET` | evet | QR imza anahtarı; en az 32 baytlık rastgele değer. |
| `SETTINGS_SECRET_KEY` | hayır | Veritabanında şifreli saklanan sırların (SMTP parolası, `enc:v1:` biçimi) anahtarı; en az 32 baytlık rastgele değer. Tanımsızsa `SESSION_SECRET` kullanılır. Değer sonradan değişirse (veya `SESSION_SECRET` değişir ve bu tanımsızsa) kayıtlı SMTP parolası açılamaz; parola Sistem ayarlarından yeniden girilmelidir. |
| `PRINT_GATEWAY_KEY` | evet | Yazdırma geçidi anahtarı (varsayılanı yok); geçidin `GATEWAY_KEY` değeriyle aynı olmalı. |
| `APP_BASE_URL` | evet (üretimde) | Dış adres, örn. `https://merit.otel.example` (Origin denetimleri bunu kullanır). Üretimde varsayılanı yoktur; geliştirmede `http://localhost:3000`. |
| `SEED_ADMIN_PASSWORD` | yalnız ilk seed | `admin` kullanıcısı **yoksa** oluşturulurken kullanılan parola, en az 10 karakter. Admin varsa seed ona dokunmaz; seed sonrası ortamdan kaldırın. |
| `TZ` | evet (pratikte) | `Europe/Nicosia` |
| `NODE_ENV` | evet | `production` (`npm start` bunu kendisi ayarlar; systemd örneği de açıkça verir). |
| `PORT` | hayır | Dinlenecek port, varsayılan 3000. |
| `MERIT_DISABLE_JOBS` | hayır | Üretimde **ayarlamayın**; ayarlansa bile üretimde yoksayılır. |
| `DATABASE_URL_TEST` | hayır | Yalnız geliştirme/CI; üretimde gerekmez. |
| `UPLOADS_DIR` | hayır | Menü görselleri için kalıcı dizin; boşsa `<uygulama>/uploads`. Uygulama kullanıcısı yazabilmelidir. |
| `TRUSTED_PROXY_HOPS` | hayır | Uygulamanın önündeki güvenilir vekil sayısı (varsayılan 1); bkz. bölüm 6. |
| `COOKIE_SECURE` | hayır | Üretimde oturum çerezi varsayılan olarak `secure`'dür. **Yalnız HTTP ile erişilen test ortamları** (IP adresi, sslip.io) için `false` verin; gerçek kurulumda ayarlamayın. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | hayır | **Yedek (eski) SMTP kaynağı.** Yalnız Sistem ayarlarında hiçbir yerde `smtp.host` kayıtlı değilken kullanılır; ayar ekranından host girildiği anda ortam değişkenleri yoksayılır. `SMTP_HOST` ve `SMTP_USER` birlikte gerekir; port varsayılanı 587 (465 → SSL, diğerleri STARTTLS). Kurulumda ayar ekranını kullanın; bkz. [E-posta (SMTP)](#e-posta-smtp-ve-günlük-raporlar). |
| `DEEPL_AUTH_KEY`, `GEMINI_API_KEY` | hayır | Menü çevirisi sağlayıcıları (DeepL birincil, Gemini yedek); yoksa otomatik çeviri çalışmaz. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | hayır | MyBar cihaz bildirimlerini açmak için iki anahtarı birlikte ayarlayın. |
| `VAPID_SUBJECT`, `PUSH_ENDPOINT_ALLOWLIST` | hayır | VAPID iletişim adresi ve gerektiğinde virgülle ayrılmış push sunucusu alan adları. |
| `TRANSLATE_PROVIDER` | hayır | MyBar metin çevirisi. Varsayılan `none`. |
| `RUN_SEED` | hayır | Yalnız Docker girişi: `true` ise açılışta `prisma/seed.ts` çalışır. Varsayılan `false`. |
| `SEED_DEMO` | hayır | `true` ise seed ayrıca demo outlet, menü, menü tasarımı ve örnek personel yükler. Varsayılan `false`; **canlı veritabanında kullanmayın**. |
| `LEGACY_DATABASE_URL` | hayır | Yalnız eski Flask minibar verisini taşıyan `npm run migrate:legacy` betiği için kaynak veritabanı. |
| `SKIP_ENV_VALIDATION` | hayır | Yalnız Docker derleme aşaması için (`1`); çalışma ortamında **ayarlamayın**. |

`SESSION_SECRET`, `QR_HMAC_SECRET`, `PRINT_GATEWAY_KEY` ve `DATABASE_URL` için varsayılan değer yoktur;
eksikse uygulama açılışta hata vererek durur. Rastgele anahtar üretmek için: `openssl rand -base64 48`.

`qr.baseUrl` ortam değişkeni değildir. Migrasyon/seed sonrasında **Denetim Masası → Sistem → QR
taban adresi** alanına misafirin erişeceği genel HTTPS adresini (örn.
`https://menu.otel.example`) yazın; üretilmiş masa QR'ları bu değeri kullanır.

### MyBar Web Push ve çeviri

`merit/` dizininde `npx web-push generate-vapid-keys` ile anahtar çifti üretin. Çıktıyı
`VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY` olarak uygulamanın ortamına tanımlayın.
`VAPID_SUBJECT=mailto:it@otel.example` örneğindeki adresi otelinizin teknik iletişim adresiyle değiştirin.
Ters vekilde HTTPS'yi ve aşağıdaki `X-Forwarded-Proto` başlığını yapılandırın. Yerel denemede
`localhost` kullanılabilir. iOS'ta önce Personel uygulamasını ana ekrana ekleyin, sonra
uygulamada cihaz bildirimlerine izin verin.

VAPID anahtarları tanımsızsa MyBar, uygulama içi bildirim ve SSE üzerinden çalışır.
Cihaz bildiriminde genel metin görünür. Oda, ürün ve not bilgileri yetkili personelin uygulama içi
bildiriminde yer alır.

`TRANSLATE_PROVIDER=gtx` MyBar metinlerini Google'ın resmî olmayan çeviri ucuna gönderir.
Bu tercihi, misafir notlarının üçüncü tarafa aktarımı otel tarafından onaylandığında etkinleştirin.
Varsayılan `none` değerinde ürün adları Türkçe kalır ve personel özgün misafir notunu görür.

### E-posta (SMTP) ve günlük raporlar

E-posta ayarları ortam değişkeniyle değil, veritabanında **ayar anahtarları** olarak tutulur ve ekrandan girilir:

1. **Şifreleme anahtarı.** `SETTINGS_SECRET_KEY` (en az 32 baytlık rastgele değer, `openssl rand -base64 48`)
   uygulamanın ortamında tanımlı olsun; tanımsızsa `SESSION_SECRET` kullanılır. SMTP parolası bu
   anahtardan türetilen AES-256-GCM ile `enc:v1:…` zarfı olarak saklanır; ekranda, denetim kaydında ve hata
   metinlerinde görünmez. Anahtar kaybolur veya değişirse parola açılamaz ve **yeniden girilmelidir**; anahtarı
   yedekleyin.
2. **SMTP ayarları.** *Denetim Masası → QR Menü ve Sistem → E-posta* grubu (yalnız CR-SYS yetkisi olan roller):
   `smtp.host`, `smtp.port`, `smtp.security` (Şifresiz / STARTTLS / SSL-TLS), `smtp.user`, `smtp.password`,
   `smtp.fromEmail`, `smtp.fromName`. Kullanıcı ve parola birlikte girilir (ikisi de boş = kimlik doğrulamasız
   sunucu); yalnız biri doluysa ayar geçersiz sayılır. Parola alanı kayıttan sonra `••••••••` ile maskelenir; boş
   bırakıp kaydetmek (veya *Değeri temizle*) parolayı siler.
3. **Kapsam ve öncelik.** Sistem satırı tüm otellere uygulanır. Bir otel kapsamında **kendi `smtp.host`** değerini
   girerse yalnız kendi satırlarını kullanır: sistem kullanıcı adı ve parolası o otelin sunucusuna **asla** gönderilmez
   (yalnız gönderen adı/adresi sistemden devralınabilir). Çözüm sırası: otel satırı (host varsa) → sistem satırı →
   yedek `SMTP_*` ortam değişkenleri (yalnız hiçbir yerde `smtp.host` yoksa).
4. **Test.** *Denetim Masası → E-posta*: kapsamı seçip **Test gönder**; ileti oturum açan kullanıcının kendi
   adresine gider (hesapta e-posta tanımlı olmalı). Sonuç panelde ve gönderim günlüğünde (tür *Test*) görünür; parola
   hiçbir yerde yazılmaz. Dakikada 5 deneme sınırı vardır.
5. **Alıcı koşulları.** Rapor e-postası almak için: otelde e-posta ana anahtarı ve ilgili tür anahtarı (rapor/uyarı)
   açık, sistem ayarları `email.reportEnabled` / `email.alertEnabled` açık, kullanıcıda **e-posta bildirimi
   (`emailOptIn`)** işaretli, geçerli adres ve otelde *Minibar Raporları* (MB-RAP) için **R** yetkisi. Koşullar
   gönderim anında yeniden denetlenir; değişmişse satır *İptal* olur. Açık rıza KVKK gereği kullanıcıya aittir:
   toplu açmayın.

**Zamanlanmış işler** (pg-boss, `Europe/Nicosia`; `MERIT_DISABLE_JOBS` üretimde yoksayıldığından her zaman çalışır):

| İş | Zaman | Görev |
| --- | --- | --- |
| `mail.process` | her dakika | Sırada bekleyen e-postaları atomik olarak (`SKIP LOCKED`) alıp gönderir; geçici hatada 60 sn’den başlayıp her denemede ikiye katlanan (en çok 30 dk) beklemeyle en çok 5 kez dener, kalıcı hata veya 5. başarısızlıkta satır *Hata* olur ve radara bildirilir |
| `mail.daily-gorev` | 08:00 | Önceki iş gününün **görev raporunu** (Excel ekli) yetkili alıcılar için kuyruğa alır |
| `mail.daily-sarfiyat` | 08:05 | Önceki iş gününün **sarfiyat raporunu** (Excel + PDF ekli) kuyruğa alır |
| `mail.upload-alert` | 10:00 ve 18:00 | Doluluk Excel dosyası yüklenmemiş oteller için eksik yükleme uyarısı |
| `mail.purge` | 03:40 | 90 günden eski gönderim kayıtlarını siler (saklama süresi) |

Alıcı başına tek ileti üretilir (`şablon:otel:gün:kullanıcı` anahtarı); aynı gün işin yeniden çalışması tekrar
göndermez. Eski `minibar.daily-report` ve `minibar.consumption-report` zamanlamaları her açılışta kaldırılır;
eski sürümden güncellerken ek bir işlem gerekmez. Başarısız bir satırı yönetici *Denetim Masası → E-posta*
ekranından **Tekrar kuyruğa al** ile yeniden başlatır. Eski göç edilen `email_ayarlari` verisi pasif arşivdir;
`EmailSetting` tablosu kullanılmaz, `smtp.*` ayarları elle girilir.

**Rapor dışa aktarma bağımlılığı.** PDF çıktısı `merit/assets/fonts/` altındaki DejaVu yazı tiplerini ister
(Türkçe karakterler için). Derleme bunları `outputFileTracingIncludes` ile izlenen çıktıya ekler; elle kopyaladığınız
bir dağıtımda `assets/fonts/` dizininin uygulamayla birlikte bulunduğundan emin olun. Raporların gün sınırları
`TZ=Europe/Nicosia` iş gününe göredir.

## 4. Derleme, migrasyon ve seed

```bash
cd merit
npm ci
npm run build                 # prisma generate && next build
npx prisma migrate deploy     # bekleyen migrasyonları uygular (üretimde migrate dev kullanmayın)
SEED_ADMIN_PASSWORD='<parola>' npm run db:seed   # yalnız ilk kurulumda (admin yoksa oluşturur)
```

Seed varsayılan olarak yalnız **referans veriyi** (oteller, roller, ekranlar, yetkiler, ayarlar,
temalar) ve eksikse `admin`'i yazar. Demo outlet, örnek menü, menü tasarımı ve örnek personel yalnız
`SEED_DEMO=true` ile yüklenir; örnek personelin parolası rastgele üretilir ve ilk girişte
değiştirilmelidir (yönetici parola atar).

Referans seed ayrıca **eski canlı minibar sisteminin gerçek otel tanımlarını** yükler
(`merit/prisma/seed/data/legacy-definitions.json`, kaynak: canlı yedek 02.11.2026): otel logoları,
katlar, oda tipleri, odalar (QR token olmadan), ürün grupları, ürünler, setuplar, setup içerikleri ve
oda tipi-setup atamaları. Yükleme yalnız **eksik kayıtları** oluşturur; var olan kaydı değiştirmez,
pasifleştirmez, QR token'a dokunmaz, ODA_SERVISI/menü verisi üretmez; her seed çalıştırması güvenlidir.
Özet sayılar `legacy-definitions.README.md` dosyasındadır. Veriyi yeniden çıkarmak için (yalnız
geliştirici makinesi, eski veritabanının yerel restore'u gerekir; bağlantı bilgisi dosyalara yazılmaz):

```bash
cd merit
LEGACY_DATABASE_URL='postgresql://kullanici:sifre@localhost:5432/minibar' npx tsx scripts/extract-legacy-definitions.ts
```

Bu komut JSON'u, README özetini ve `public/brand/hotels/<kod>.png` logolarını yeniden yazar. Geçmiş
işlemler ve kullanıcılar bu adımın kapsamı dışındadır (`scripts/migrate-from-minibarlatest/`).

`npm run build` sırasında arka plan işleri başlamaz, ancak `src/lib/env.ts` zorunlu
değişkenleri modül yüklenirken doğrular: derleme (ve migrasyon/seed) komutlarının
çalıştığı kabukta **tüm zorunlu değişkenler** (`DATABASE_URL`, `SESSION_SECRET`,
`QR_HMAC_SECRET`, `APP_BASE_URL`, `PRINT_GATEWAY_KEY`) tanımlı olmalıdır (CI/Docker derlemesinde
yalnız `npm run build` komutu için `SKIP_ENV_VALIDATION=1` verilebilir); örneğin:

```bash
set -a; source /etc/merit/merit.env; set +a
npm run build
```

Güncellemelerde sıra: kodu çek, `npm ci`, `npm run build`, `npx prisma migrate deploy`,
süreci yeniden başlat. Seed'i ilk kurulumda ve yeni ekran kodu/rol yetkisi getiren sürümlerde
(örn. P1) çalıştırın; bkz. "Var olan veritabanında güncelleme".

### İlk kurulum: Kurulum Rehberi

Seed (varsayılan, `SEED_DEMO` kapalı) roller, ekran/yetki matrisi, oteller, `admin` kullanıcısı ve eski sistemden alınan
kat/oda/ürün/setup tanımlarını getirir; outlet ve personel tanımları elle girilir. `admin` ile giriş yapıp
**Başlat → Kurulum Rehberi** penceresini açın, otelinizi seçin ve adımları yukarıdan aşağıya
izleyin. Her adımın **Aç** düğmesi Tanımlamalar penceresini doğru bölümde açar; yüzde,
zorunlu adımlar bitince %100 olur (aynı yüzde Komuta Merkezi'ndeki Kurulum kartında görünür):

1. **Otel bilgileri** — ad, adres, telefon, logo; modül anahtarları (Minibar, QR Menü, QR Sipariş, Oda Servisi).
2. **Katlar** — kat numarası ve adı.
3. **Oda tipleri** — örn. Standart, Suit (kabin sayısıyla). Başka bir otelden kopyalanabilir.
4. **Odalar** ve **Odalara oda tipi atama** — **Toplu Ekle** ile numara aralığı (ön ek, atlanacak numaralar, önizleme); çakışma varsa hiçbiri yazılmaz.
5. **Outletler** — havuz, bar, salon vb. (QR Menü/Sipariş açıksa zorunlu). Her otelde bir Oda Servisi outleti seed ile gelir.
6. **Masalar** — sipariş alan outletlerde (QR Sipariş açıksa zorunlu).
7. **Kullanıcılar** — Minibar açıksa bir kat sorumlusu, QR Sipariş açıksa bir garson.
8. **Ekipler** — sipariş outletine en az bir üye.
9. **Ürün ve minibar setup** — P2 ile gelir; zorunlu değildir.

Rol ve yetkileri özelleştirmek için Tanımlamalar → Roller ve Yetki Matrisi kullanılır
(yalnız sistem yöneticisi). Hesapların çıkış/giriş durumunu **Online Kullanıcılar**, yapılan
her değişikliği **Denetim Günlüğü** gösterir.

### Var olan veritabanında güncelleme (seed)

P1 yeni ekran kodları (`CR-TAN`, `CR-REH`, `CR-ONL`, `CR-DEN`, `CR-SYS`) ve rol yetki satırları
ekler. P0'dan yükseltilen bir veritabanında migrasyondan sonra seed'i **yeniden çalıştırın**:

```bash
npx prisma migrate deploy
SEED_ADMIN_PASSWORD='<parola>' npm run db:seed
```

Seed idempotenttir (var olanı yinelemez). Mevcut `admin`'in parolasına, rolüne ve aktiflik
durumuna **dokunmaz** (admin yalnız eksikse oluşturulur); pasife alınmış oteli yeniden
aktifleştirmez ve elle yaptığınız tanımları ezmez; yalnız seed'deki üç otelin **adı** koduna göre
varsayılana döner (adı Tanımlamalar'dan değiştirdiyseniz seed sonrası yeniden düzeltin). Çalıştırmazsanız yeni pencereler Başlat menüsünde görünmez, çünkü rollerin ekran
yetkisi yoktur. Rehber yüzdesi seed çalıştırıldıktan sonra anlam kazanır.

### Eğitim ortamı

Eğitim, gerçek veriye dokunmayan **ayrı bir örnek**tir: ayrı veritabanı (`merit_egitim`), ayrı süreç
(örn. `PORT=3100`) ve ekranda **ENV_LABEL** rozeti. Demo verisi yalnız adı `_egitim`, `_demo` veya
`_test` ile biten veritabanlarına yüklenir; `merit` gibi bir adda betik hiçbir şey yazmadan hata verir
(`Demo verisi yalnız eğitim veritabanına yüklenebilir`).

```bash
createdb -U postgres merit_egitim
export DATABASE_URL='postgresql://<kullanıcı>:<parola>@localhost:5432/merit_egitim'
npx prisma migrate deploy
SEED_ADMIN_PASSWORD='<yönetici parolası>' npm run db:seed          # temel seed (önkoşul)
DEMO_PASSWORD='<en az 10 karakter>' npm run db:seed:demo           # eğitim senaryosu
```

- `DEMO_PASSWORD` zorunludur, varsayılanı yoktur ve hiçbir yere yazdırılmaz; tüm `egitim.*` kullanıcıları bu parolayla girer.
  Parolayı değiştirip betiği yeniden çalıştırırsanız kullanıcıların parolası güncellenir.
- Betik **idempotenttir**: art arda çalıştırmak satır sayısını değiştirmez. Her çalıştırma "bugün"ü (ve son 7 iş gününü)
  tamamlar; eski günlerin kayıtları silinmez. Eğitim gününü tazelemek için aynı komutu sabah yeniden çalıştırmak yeter.
- Senaryo: Merit Royal (tam: 3 kat × 10 oda, Standart/Suit, QR'lı odalar, minibar setup'ları ve havuz stoku — bir ürün kritik
  seviyede) ve Merit Royal Diamond (5 oda); Havuz Bar, Beach Bar, Ana Restoran (her biri 10 masa, QR'lı, menüler 5 dilde)
  ve Oda Servisi menüsü; bugünün doluluğu, günlük görevler, MyBar (1 bekleyen, 2 kapalı), DND, son 7 güne yayılmış masa ve oda
  servisi siparişleri (rapor ve radar boş görünmesin), 1 açık garson çağrısı, pasif yazıcı kaydı (`192.0.2.50`) ve test fişi örneği.
- Kullanıcılar (`egitim.` + rol): `admin` (Otel Müdürü), `fbm`, `sgf`, `garson1`–`garson3`, `kasa`, `mutfak`, `kds`, `oda`,
  `kat1`–`kat2`, `depo`. E-posta adresleri `@example.invalid` uzantılıdır ve rapor e-postası kapalıdır; eğitim ortamı dışarıya
  e-posta göndermez.
- Eğitim örneğinin ortamında `ENV_LABEL=EĞİTİM` tanımlayın (en çok 20 karakter): XP kabuğunun görev çubuğunda, personel kabuğu
  oturum şeridinde, Kasa/KDS durum şeridinde ve misafir sayfasının altında küçük bir rozet görünür. Üretimde boş bırakın.
  Etiket çalışma zamanında okunur; ortam değişkenini değiştirince süreci yeniden başlatın.

### Oda Servisi (P6)

Her otelin tek bir "Oda Servisi" outleti vardır (seed oluşturur). Kurulum sırası:

1. Seed'i yeniden çalıştırın (yeni `RO-*` ekranları ve rol yetkileri için), sonra Tanımlamalar → Odalar'da
   dahili numaraları girin (dahilisiz oda panoda "Dahili tanımlı değil" görünür).
2. Oda Servisi outletine üye ekleyin: onay/teslim için `R-ODS`, mutfak için `R-MUS`; iptal yetkisi `R-FBM`'dedir.
3. Menüyü "Oda Servisi Menüsü" penceresinden (`rs.menu`) girin. Menüsü boş outlet misafire kapalı görünür.
4. **Telefon teyidi:** Outletler penceresinde Oda Servisi outletinin `phoneConfirmRequired` anahtarı; açıkken sipariş
   "Teyit bekliyor" olur ve "Telefonla teyit edildi" kaydedilmeden hazırlanamaz.
5. **Sipariş alımı:** outletin sipariş anahtarı (`orderingEnabled`) kapalıyken misafir gönderimi 409 döner,
   mevcut siparişlerin durum sayfası açık kalır. Mutfak panosundaki "Sipariş alımı" düğmesi aynı anahtardır.
6. **Ayarlar** (Denetim Masası → Sistem, otel bazında): `rs.slaMinutes` (varsayılan 30; uyarı eşiği süresinin %80'i),
   `rs.maxOpenPerRoom` (oda başına açık sipariş sınırı, varsayılan 3), `order.approvalEscalationMinutes`
   (onay bekleyen siparişte F&B ve outlet yöneticilerine eskalasyon).
7. Yazıcı isteğe bağlıdır: outlete bağlı yazıcı yoksa fiş üretilmez ve "yazıcı yok" bildirimi gönderilmez.

SLA taraması ve eskalasyon zamanlanmış işlerdir. Beklemeden denemek için e2e veritabanında
`npx tsx tests/e2e/helpers/run-rs-jobs.ts 2026-11-07T12:30:00Z [--only=sla|escalation]` (benzetilmiş saat; çıktı
`{"sla":{warned,breached},"escalated"}`). Yardımcı yalnız `*_e2e`/`*_test` adlı yerel veritabanını kabul eder.

### Veri göçü (minibarlatest)

Eski Flask minibar sisteminin geçmişi (kullanıcılar, e-posta, ek talepler, bildirimler, MyBar, işlemler, oda
kontrolleri, otel havuzu ve hareketleri, doluluk yüklemeleri, günlük görevler, DND, QR/denetim/sistem günlükleri)
`merit/scripts/migrate-from-minibarlatest/` betiğiyle taşınır. Betik kaynağı **yalnız okur**, hedefe yazar,
istenirse tek transaction'da deneyip geri alır ve her çalıştırmada bir rapor (`migration-report.md`) üretir.

**Ön koşullar**

- Hedef veritabanında **tüm migrasyonlar uygulanmış** (`npx prisma migrate deploy`) ve referans seed çalışmış olmalı:
  üç otel (DIAMOND, ROYAL, PREMIUM), roller, ekranlar, ayarlar ve `admin`. Betik otel, kat, oda, ürün ve setup
  tanımlarını da (eksikse) kendisi ekler; var olanı değiştirmez.
- Eski sistemin yedeğini **ayrı bir veritabanına** geri yükleyin (üretim eski veritabanına dokunmayın):

  ```bash
  createdb minibar_legacy
  pg_restore -d minibar_legacy <yedek-dosyasi>
  ```

- Aktör olarak taşınacak bir sistem yöneticisi gerekir (varsayılan: en eski aktif `R-SYS`; seçmek için `--actor <kullanıcı>`).
- Göçten önce eski sistemdeki `update-minibar-setups-products.ts` gibi tanım güncelleme betikleri **çalıştırılmaz**:
  tanımlar göçle (ve seed ile) zaten gelir.

**Ortam değişkenleri** (bağlantı dizesi hiçbir dosyaya yazılmaz, rapora da girmez)

| Değişken | Anlamı |
| --- | --- |
| `LEGACY_DATABASE_URL` | Geri yüklenmiş eski veritabanı (yalnız okunur oturum). |
| `DATABASE_URL` | Hedef Merit veritabanı. |
| `LEGACY_SCHEMA` (veya `--legacy-schema`) | Eski tabloların şeması, varsayılan `public`. |

**Çalıştırma**

```bash
cd merit
export LEGACY_DATABASE_URL='postgresql://…/minibar_legacy'   # kabukta; dosyaya yazmayın
npm run migrate:legacy -- --dry-run          # 1) kuru çalıştırma: tek transaction, sonunda geri alınır
less migration-report.md                     # 2) raporu okuyun
npm run migrate:legacy -- --actor <sistem-yoneticisi>   # 3) gerçek çalıştırma
```

Başlıca bayraklar: `--only definitions,users,history,tasks` / `--skip …` (adım seçimi), `--skip-logs` (QR okutma, denetim
ve sistem günlüklerini atlar; en büyük tablolar bunlardır), `--report <yol>`, `--batch <n>`, `--notifications-days <n>`
(varsayılan 30), `--hotel-map 1=DIAMOND,…`, `--user-roles depo_sorumlusu` (yalnız sayılan eski rollerdeki kullanıcılar
taşınır; diğerlerinin geçmiş kayıtları aktöre yazılır), `--frozen-catalog` (hedefteki güncel katalog korunur: eski setup
içerikleri ve oda tipi bağlantıları yazılmaz, yalnız eski sistemde olan ürün ve setuplar pasif gelir). Betik `.env`
okumaz; `DATABASE_URL` de kabukta verilir. Kuru çalıştırma 250 bin+ satırlık canlı yedekte yaklaşık on dakika sürer.

**Dağıtımda tek seferlik otomatik aktarım (Coolify):** Eski yedek canlı sunucudan erişilen ayrı bir veritabanına
yüklenir ve Coolify'da `LEGACY_DATABASE_URL` tanımlanır. Kap açılırken site önce başlar, aktarım arka planda
`--user-roles depo_sorumlusu --frozen-catalog` ile yürür (`scripts/migrate-from-minibarlatest/once.ts`); özeti kap
günlüğüne yazılır. Temiz bitince `settings` tablosuna `migration.legacy.completedAt` işareti konur ve sonraki
açılışlarda atlanır; hata olursa işaret konmaz, sonraki açılışta kaldığı yerden yeniden denenir. Bu yol kuru çalıştırma
yapmaz: önce canlı veritabanının yedeği alınır. Yeniden çalıştırmak gerekirse işaret satırı silinir.
**Durum:** aktarım 11 Kasım 2026'da canlıda temiz tamamlandı; `LEGACY_DATABASE_URL` bu yüzden `docker-compose.yaml`
dosyasından kaldırıldı. Yeniden gerekirse önce compose'a geri eklenmelidir (Coolify yalnız orada anılan değişkenleri
kaba verir).

**Kat personelinin sonradan aktarılması (`--new-credentials`):** Eski "kat_sorumlusu" kullanıcıları **Minibar Garson**
(rol `R-KAT`, görev "Minibar Garson") olarak taşınır. `--new-credentials` ile bu çalıştırmada oluşan kullanıcılar eski
girişlerini korumaz: kullanıcı adı ad-soyaddan üretilir (`ad.soyad`), kullanıcı formundaki standart geçici şifre verilir
ve ilk girişte değiştirmeleri zorunludur. Eski → yeni kullanıcı adları raporun "Notlar" bölümünde listelenir. Canlıda,
uygulama kabının içinden (eski veritabanı aynı PostgreSQL sunucusunda `minibar` adıyla duruyorsa):

```bash
docker exec $APP sh -c 'LEGACY_DATABASE_URL="$(echo "$DATABASE_URL" | sed "s#/merit?.*#/minibar#")" npx tsx scripts/migrate-from-minibarlatest/index.ts --only users --user-roles depo_sorumlusu,kat_sorumlusu --skip-users ERKANKAT,superadmindepo --new-credentials --frozen-catalog --report /tmp/kullanici.md'
```

Önce aynı komut `--dry-run` ile denenir. Daha önce taşınmış kullanıcılara dokunulmaz; geçmiş kayıtların personel alanı
değişmez (aktörde kalır).

**Örnek kullanıcıların silinmesi:** `npx tsx scripts/ornek-kullanici-temizle.ts` yalnız listeler; `--uygula` ile siler.
`admin`, `admin2`, `--koru` ile sayılanlar ve eski sistemden aktarılan kullanıcılar korunur; diğer kullanıcılar ve
onların minibar işlemleri, oda / DND kontrolleri, stok hareketleri, stok ve düzeltme talepleri, doluluk yüklemeleri,
masa atamaları ve oturumları kalıcı olarak silinir (siparişler ve MyBar talepleri kalır, personel alanı boşalır).
Önce veritabanı yedeği alınır.

**Çıkış kodları:** `0` temiz; `1` en az bir adım hatası veya **doğrulama FAIL** (rapordaki `KALDI` satırları);
`2` yapılandırma hatası (eksik/yanlış ortam değişkeni veya bayrak, hiçbir şey yazılmadı).

**Rapor ve doğrulama.** Rapor "Satır sayıları" tablosunda her varlık için Legacy, Aktarılan, Zaten vardı, Taşınmadı ve
**Fark** (her satırda 0 olmalı) verir. Doğrulamalar legacy sayılarını sayaçlardan değil doğrudan eski veritabanından okur:
`SAYI_FARKI`, `HAVUZ_FARKI` (kullanılan/kalan eşitliği), `TOKEN_KAYIP` (eski QR token'ları yeni odada aynen duruyor),
`HASH_FARKI` (parola özetleri aynen taşındı), `MYBAR_DURUM_SAYILARI`, `ISLEM_TIP_SAYILARI`, `LOGO_DOSYASI_YOK`;
bilgi niteliğinde `HAVUZ_TUTARSIZ`, `HAREKET_BAKIYE_FARKI` ve `ODA_SAYISI` (UYARI, çıkış kodunu bozmaz). Havuz satırları
`toplam = kullanılan + kalan` olarak yazılır; eski kayıtlardaki tutarsızlıklar uyarı olarak listelenir. "Yapılacaklar"
bölümü göçten sonra elle yapılacakları sayar.

**DND ve görev birleştirme.** Eski sistemde aynı oda/gün için hem bağımsız DND kaydı hem göreve bağlı DND vardı; göçte bunlar tek `RoomDnd` olur
(sayı = ikisinin en büyüğü, kontroller zamana göre birleşir, aynı anlı kontrol bir kez sayılır). Aynı oda aynı (otel, gün, tür) görevde birden çok kişiye
atanmışsa tek görev kalemi kalır. Bu yüzden canlı yedekte görev kalemi ~10 bin (%7), DND kaydı ~13 bin satır "taşınmadı" görünür; bunlar veri kaybı değil
birleştirmedir (`GOREV_KALEM_COBLU`, `DND_CAKISMA` uyarıları).

**Yeniden çalıştırma.** Betik idempotenttir: eşleme tablosu (`legacy_id_map`) sayesinde ikinci çalıştırma yalnız
**eksikleri** ekler (yarım kalan çalıştırma kaldığı yerden tamamlanır). Eski veritabanından **daha yeni bir dump**
alındıysa hedefi de sıfırdan kurun (boş veritabanı + migrate + seed) ve göçü baştan çalıştırın; var olan satırlar
güncellenmez.

**Göçten sonra kontrol listesi**

1. Rapor `Sonuç: temiz`, `Fark` sütunu her satırda 0, `KALDI` satırı yok.
2. **Şifreler:** eski kullanıcıların parola özeti `scrypt` ise bu uygulamada doğrulanamaz; rapordaki kullanıcıların şifresini
   Tanımlamalar → Kullanıcılar'dan sıfırlayın. Pasif taşınan `superadmin` hesaplarını gerekirse etkinleştirin.
3. **QR kodları:** eski biçimli (6 haneli) token'lı odalar için Minibar Tanımları › Oda QR'dan yeni QR üretip basın;
   eski QR'lar bu arada çalışmaya devam eder.
4. **E-posta:** SMTP parolası taşınmaz; *Denetim Masası → QR Menü ve Sistem → E-posta* grubunda `smtp.*` ayarlarını (parola dâhil) yeniden girin, *E-posta* ekranından test gönderin ve kullanıcıların `emailOptIn` onayını kontrol edin (bkz. E-posta bölümü).
5. Bildirimler yalnız son 30 günü taşır; kesme tarihi raporda yazar.
6. Havuz (otel zimmet stoku) bakiyelerini depo sorumlusuyla bir ürün örneğinde karşılaştırın; `HAVUZ_HAREKET_FARKI`
   uyarıları eski hareket geçmişinin eksik olduğu satırlardır (bakiye doğrudur, geçmiş değildir).
7. Bir odanın Oda Kontrolü, bir günlük görev listesi ve DND geçmişini ekranda açıp eski sistemle karşılaştırın.
8. Yüklenen doluluk dosyalarının içeriği taşınmaz (saklama 4 gün); yeni yüklemeler normal akışla yapılır.

## 5. Süreç yöneticisi

### systemd

`/etc/systemd/system/merit.service`:

```ini
[Unit]
Description=Merit OS
After=network.target postgresql.service

[Service]
Type=simple
User=merit
WorkingDirectory=/opt/merit/merit
EnvironmentFile=/etc/merit/merit.env
Environment=NODE_ENV=production
Environment=TZ=Europe/Nicosia
Environment=PORT=3000
ExecStart=/usr/bin/npm start -- -H 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now merit
journalctl -u merit -f
```

### pm2 (alternatif)

```bash
TZ=Europe/Nicosia NODE_ENV=production pm2 start npm --name merit -- start -- -H 127.0.0.1
pm2 save
```

### Print gateway (P5)

Termal yazıcının erişebildiği her otelde, Merit uygulamasından ayrı bir gateway süreci çalışır:

```bash
cd /opt/merit/merit/tools/print-gateway
npm ci
cp .env.example .env
# API_URL=https://merit.otel.example
# GATEWAY_KEY=/etc/merit/merit.env içindeki PRINT_GATEWAY_KEY ile aynı değer
# HOTEL_CODE=ROYAL   (ROYAL, DIAMOND veya PREMIUM)
npm run start
```

Gateway yerel yazıcılara TCP/9100 ile erişir, fakat uygulama API'sine HTTPS üzerinden erişmelidir.
`CODEPAGE_TABLE=13` cp857 için başlangıç değeridir; Türkçe karakterleri içeren test fişiyle
yazıcı modelinde doğrulayın. Ayrıntılı Windows/NSSM hizmet örneği ve tüm alanlar için
`merit/tools/print-gateway/README.md` dosyasını izleyin.

### Docker / Coolify

Depoda **tek** compose dosyası vardır: kök dizindeki `docker-compose.yaml` (Dockerfile da kökte;
`merit/Dockerfile` aynı içeriktir). Coolify'da kaynak türü *Docker Compose*, dosya yolu
`docker-compose.yaml`. Gizli değerlerin varsayılanı yoktur; aşağıdakiler Coolify ortam
değişkenlerinde (veya yerel `.env`) **verilmezse** `docker compose up` hata verir:

```env
POSTGRES_USER=merit
POSTGRES_PASSWORD=<güçlü-parola>   # URL'ye gömüldüğü için özel karakter içermesin
POSTGRES_DB=merit
APP_BASE_URL=https://menu.otel.example
SESSION_SECRET=<openssl rand -base64 48>
QR_HMAC_SECRET=<openssl rand -base64 48>
PRINT_GATEWAY_KEY=<openssl rand -base64 32>
```

İsteğe bağlı: `RUN_SEED` (varsayılan `false`), `SEED_DEMO` (varsayılan `false`),
`SEED_ADMIN_PASSWORD`, `COOKIE_SECURE`, `TRUSTED_PROXY_HOPS`.

- **İlk kurulum:** `RUN_SEED=true` ve `SEED_ADMIN_PASSWORD` (>= 10 karakter) ile bir kez dağıtın;
  admin oluştuktan sonra `RUN_SEED=false` yapın. Demo veri istemiyorsanız `SEED_DEMO` açmayın.
- **Merit outlet ve menüleri:** Senkron her açılışta kendiliğinden çalışır; Coolify'da ayarı yoktur
  (`SYNC_MERIT_MENUS` compose'dan kaldırıldı, kap içinde varsayılan `true`). Bir outlet'in menüsü yalnız boşsa ya da
  `prisma/seed/data/merit-menus.json` içindeki menüsü değiştiyse yeniden kurulur; dosya aynıysa panelden yapılan
  düzenlemeler kalır. Sipariş verisine dokunulmaz: eski siparişlerde geçen ürünler pasif bir arşiv kategorisine alınır.
- Uygulama konteyneri `/api/health` ile sağlık denetimi yapar (`docker ps` durumunda `healthy`); Docker günlükleri
  konteyner başına 10 MB x 5 dosya ile sınırlıdır.
- Giriş betiği (`docker-entrypoint.sh`) `prisma migrate deploy` çalıştırır; yalnız veritabanı
  bağlantı hatasında en çok 30 kez yeniden dener, migrasyon hatasında **hata koduyla çıkar**
  (konteyner ayağa kalkmaz). `RUN_SEED=true` iken seed hatası da başlatmayı durdurur.
- Derleme aşamasında `SKIP_ENV_VALIDATION=1` yalnız `prisma generate` ve `next build` komutlarına verilir;
  imaja gizli değer girmez. Dockerfile BuildKit gerektirir (Coolify'da varsayılan) ve katman/`npm`
  önbelleği kullanır; `package*.json` ve `prisma/schema.prisma` değişmedikçe kurulum katmanları yeniden
  çalışmaz. Daha hızlı dağıtım için GitHub Actions'ın GHCR'a yolladığı hazır imaj kullanılabilir
  (`COOLIFY_DEPLOYMENT.md` → Dağıtım biçimleri).
- Yalnız HTTP ile erişilen test ortamında (IP/sslip.io) `COOKIE_SECURE=false` verin.

### Kasa/KDS tabletini kurma

Kasa ve mutfak ekranı (KDS) dokunmatik cihazda tam ekran, ekran uyumadan ve sesli uyarılarla çalışmalıdır.
Önerilen donanım: 10-13" Android tablet (1280x800 ya da 1024x768), yatay. Mutfak ekranı için 15-22" dokunmatik
ekran; her outlet için bir mutfak ekranı. Misafir ya da personel telefonu kasa olarak kurulmaz.

**Android tablet (önerilen)**

1. Chrome'da `https://<alan-adı>/kasa` adresini açın ve kasa kullanıcısıyla (outlet seçerek) giriş yapın.
   Mutfak ekranı için `/kds` açın.
2. Ekranın üstündeki "Bu cihazı kasa ekranı olarak kurun" şeridinde **Kur**'a dokunun. Cihaz kaydı tarayıcıya
   yazılır; tam ekran, ekran kilidi engeli ve ses tek dokunuşta açılır. Cihaz kasa değilse
   "Bu cihaz kasa değil" seçilir ve cihaz personel görünümüyle çalışır.
3. Chrome menüsünden **Ana ekrana ekle / Uygulamayı yükle**'yi seçin. Kasa ve mutfak ekranı ayrı uygulamalar olarak
   yüklenir ("Merit Kasa", "Merit Mutfak"); ikisi de tam ekran ve yatay açılır (mutfak yönü serbest bırakır).
   Yüklü uygulama her açılışta oturumu açık kullanıcının kasa ekranına gider.
4. **Uygulama sabitleme** (Android "Ekran sabitleme / Pin app"): Ayarlar - Güvenlik - Gelişmiş - Uygulama sabitleme'yi
   açın, son uygulamalar ekranında Merit Kasa simgesine dokunup **Sabitle**'yi seçin. Sabitleme kalkana kadar
   kullanıcı başka uygulamaya geçemez. Ekran kilidi PIN'i sabitlemeyi kaldırmak için sorulur.
5. Pil ayarlarında Chrome/Merit Kasa için "Kısıtlama yok" seçin ve cihazı şarjda tutun. Ekran otomatik
   kapanıyorsa tam ekranı yeniden başlatın ("Tam ekranı başlat"): uyku kilidi ancak bir dokunuşla alınır.
6. Vardiya sonunda kullanıcı çıkış yapar (cihazda PIN ya da hızlı kullanıcı değişimi yoktur).

**Windows dokunmatik PC**

Edge'i kiosk kipinde açan bir kısayol oluşturun:

```
msedge --kiosk https://<alan-adı>/kasa --edge-kiosk-type=fullscreen
```

Mutfak ekranı için adresi `/kds` yapın. Kiosk kipinden `Alt+F4` ile çıkılır. Ses için ilk açılışta ekrana bir kez
dokunmak gerekir.

**Cihaz kaydını sıfırlama:** tarayıcı site verisini silin ya da cihazda `/kasa?mod=personel` açın (yalnız o sekme için
personel görünümü). Cihaz kaydı yalnız görünüm tercihidir; yetkiyi sunucu her istekte yeniden denetler.

## 6. Ters vekil (nginx)

Uygulama düz HTTP dinler; HTTPS vekilde sonlanır. Aşağıdaki örnekteki iki ayar
**zorunludur**:

- `proxy_set_header X-Forwarded-For $remote_addr;` — giriş hız sınırlayıcısı istemci IP'sini
  bu başlıktan okur. İstemcinin gönderdiği `X-Forwarded-For` değerinin **üzerine
  yazılmalıdır** (`$proxy_add_x_forwarded_for` kullanmayın); aksi halde saldırgan
  sahte IP ile sınırı aşabilir.
  Uygulama `X-Forwarded-For` listesinin **sağdan** `TRUSTED_PROXY_HOPS`. girişini (varsayılan 1:
  yalnız nginx) istemci IP'si sayar; nginx'in önünde ek bir güvenilir vekil (CDN vb.) varsa
  `$proxy_add_x_forwarded_for` kullanın ve `.env` içinde `TRUSTED_PROXY_HOPS` değerini vekil
  sayısına yükseltin.
- SSE ayarları: `proxy_buffering off;` ve `proxy_read_timeout 1h;` — olay akışı
  tamponlanmamalı ve uzun süre açık kalabilmelidir. Bunları genel `location /` yerine
  ayrı konumlar kullanıyorsanız **hem** `/api/sse` **hem de** `/api/q/*/events` için uygulayın.

```nginx
server {
    listen 443 ssl http2;
    server_name merit.otel.example;

    ssl_certificate     /etc/letsencrypt/live/merit.otel.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/merit.otel.example/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # SSE (gerçek zamanlı olaylar)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}

server {
    listen 80;
    server_name merit.otel.example;
    return 301 https://$host$request_uri;
}
```

Uygulamanın portunu (3000) dış ağa açmayın; yalnız vekil erişebilsin (güvenlik
duvarı ile kısıtlayın veya `npm start -- -H 127.0.0.1` ile yalnız yerel arayüzde dinletin; yukarıdaki
systemd ve pm2 örnekleri bunu zaten yapar).

## 7. Sağlık denetimi

`GET /api/health` kimlik doğrulamasız çalışır ve gövdede yalnız bileşen durumlarını döner:

```json
{ "ok": true, "db": "ok", "listener": "ok", "boss": "ok", "time": "2026-10-31T10:00:00.000Z" }
```

Her şey sağlıklıysa HTTP 200, `db`, `listener` veya `boss` alanlarından biri `down` ise
503 döner. Üretimde `disabled` değeri görünmez (iş kapatma anahtarı yoksayılır).
Uptime izleyicisini veya yük dengeleyici denetimini bu uca yönlendirin. Açılıştan sonraki
ilk birkaç saniye `listener`/`boss` henüz `down` olabilir.

## 8. Yedekleme

Günlük yedek için `deploy/scripts/backup.sh` önerilir (systemd zamanlayıcısı `deploy/README.md`'de): `pg_dump -Fc`
dökümünü **ve** `uploads` dizinini (`merit-uploads-YYYY-MM-DD.tgz`) `BACKUP_DIR` altına yazar, `RETENTION_DAYS`
(14) günden eskileri siler. Menü görselleri yalnız `uploads` içinde durur; yalnız veritabanını yedeklemek
yetmez. Elle yedek alacaksanız:

```bash
pg_dump -Fc "postgresql://merit@localhost:5432/merit" -f /var/backups/merit/merit-$(date +%F).dump
tar -czf /var/backups/merit/merit-uploads-$(date +%F).tgz -C /var/lib/merit uploads
```

Parolayı komut satırına yazmak yerine `~/.pgpass` kullanın. Yedekleri başka bir makineye de kopyalayın.
Docker kurulumunda `uploads` `app-uploads` biriminde durur:
`docker run --rm -v <proje>_app-uploads:/u -v $PWD:/b alpine tar -czf /b/uploads.tgz -C /u .`

### Geri yükleme (adım adım)

1. Uygulamayı durdurun: `sudo systemctl stop merit` (Docker: `docker compose stop app`).
2. Önce yedeğin okunabildiğini sınayın: `pg_restore --list merit-YYYY-MM-DD.dump`.
3. Veritabanını yükleyin: `deploy/scripts/restore.sh merit-YYYY-MM-DD.dump merit --force`
   (güvenli deneme için önce `merit_restore_test` adlı bir hedefe yükleyip sınayın).
4. `uploads` dizinini geri koyun (mevcut dizin yedeklenmeden silinmez):
   `sudo mv /var/lib/merit/uploads /var/lib/merit/uploads.eski && sudo tar -xzf merit-uploads-YYYY-MM-DD.tgz -C /var/lib/merit && sudo chown -R merit:merit /var/lib/merit/uploads`
5. Uygulamayı başlatın ve `/api/health` ile birkaç menü görselini kontrol edin; sorun yoksa `uploads.eski` silinebilir.

Geri yüklemeyi düzenli sınayın.

## 9. Günlükler

Uygulama standart çıktıya yazar: systemd altında `journalctl -u merit`, pm2 altında
`pm2 logs merit`, Docker altında `docker compose logs app`. Günlük satırları `[realtime]`, `[pg-boss]`,
`[instrumentation]` önekleriyle başlar. Açılışta "gerçek zaman dinleyicisi başlatılamadı" veya "işler
başlatılamadı" görürseniz veritabanı erişimini ve `/api/health` çıktısını kontrol edin. Dinleyici
bağlantısı kopsa 1-2-4-8 sn aralıkla kendisi yeniden bağlanır.

**Günlük döndürme:** journald varsayılanı yeterlidir; sınırlamak için `/etc/systemd/journald.conf` içinde
`SystemMaxUse=500M` verin. pm2'de `pm2 install pm2-logrotate` kullanın. Docker'da `docker-compose.yaml`
her konteyner için `json-file` sürücüsüyle `max-size: 10m`, `max-file: 5` uygular (en çok 50 MB); Docker'ı
compose dışı çalıştırıyorsanız aynı değerleri `/etc/docker/daemon.json` `log-opts` içine yazın.

## 10. Güvenlik notları

- `SESSION_SECRET` ve `QR_HMAC_SECRET` en az 32 baytlık rastgele değerler olmalı; örnek
  değerleri (`change-me...`) üretimde kullanmayın. `SESSION_SECRET` değişirse açık
  oturumlar geçersiz olur.
- SMTP parolası ayar anahtarı olarak (`smtp.password`) AES-256-GCM ile şifreli saklanır; ekranda ve denetim
  kaydında gösterilmez. Şifreleme anahtarı `SETTINGS_SECRET_KEY` (yoksa `SESSION_SECRET`) ortam değişkeninden türetilir; bu
  değişkeni yedekleyin, kaybolursa parola yeniden girilir.
- **HTTPS zorunludur.** Üretimde oturum çerezi `secure` işaretlidir; düz HTTP üzerinden
  giriş çalışmaz. Yalnızca HTTP ile erişilen geçici test ortamları için `COOKIE_SECURE=false`
  verilebilir; gerçek kurulumda kullanmayın.
- `MERIT_DISABLE_JOBS=1` üretimde yoksayılır (oturum süpürücüsü her zaman çalışır).
- `X-Forwarded-For` başlığı yalnız güvenilir vekilden gelmeli (bkz. bölüm 6); uygulama
  doğrudan internete açılmamalı.
- `.env` dosyası `600` izinli olmalı, sürüm denetimine girmemeli; `SEED_ADMIN_PASSWORD`
  ilk seed'den sonra ortamdan çıkarılmalıdır.
- **P0'da desteklenen topoloji tek örnektir (instance).** Giriş hız sınırlayıcısı süreç
  belleğinde tutulur, yani örnek başınadır; birden fazla örnekte sınır örnek sayısı kadar
  gevşer. SSE dinleyicisi süreç başına olduğundan çoklu örnek SSE için sorun çıkarmaz ve
  pg-boss zamanlamaları idempotenttir; ancak yatay ölçekleme P0'da hedeflenmemiş ve
  sınanmamıştır.
