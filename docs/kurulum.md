# Merit OS — Kurulum ve dağıtım rehberi

Bu belge P0 iskeletinin, P1 çekirdek tanımlarının ve P5 QR Menü/Sipariş bileşenlerinin bulut veya şirket içi (on-prem) bir sunucuya kurulumunu anlatır.
Geliştirme ortamı için `merit/README.md` dosyasına bakın.

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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | hayır | E-posta bildirimleri; tanımsızsa e-postalar yalnız günlüğe yazılır. Port varsayılanı 587. |
| `DEEPL_AUTH_KEY`, `GEMINI_API_KEY` | hayır | Menü çevirisi sağlayıcıları (DeepL birincil, Gemini yedek); yoksa otomatik çeviri çalışmaz. |
| `RUN_SEED` | hayır | Yalnız Docker girişi: `true` ise açılışta `prisma/seed.ts` çalışır. Varsayılan `false`. |
| `SEED_DEMO` | hayır | `true` ise seed ayrıca demo outlet, menü, menü tasarımı ve örnek personel yükler. Varsayılan `false`; **canlı veritabanında kullanmayın**. |
| `LEGACY_DATABASE_URL` | hayır | Yalnız eski Flask minibar verisini taşıyan `npm run migrate:minibarlatest` betiği için kaynak veritabanı. |
| `SKIP_ENV_VALIDATION` | hayır | Yalnız Docker derleme aşaması için (`1`); çalışma ortamında **ayarlamayın**. |

`SESSION_SECRET`, `QR_HMAC_SECRET`, `PRINT_GATEWAY_KEY` ve `DATABASE_URL` için varsayılan değer yoktur;
eksikse uygulama açılışta hata vererek durur. Rastgele anahtar üretmek için: `openssl rand -base64 48`.

`qr.baseUrl` ortam değişkeni değildir. Migrasyon/seed sonrasında **Denetim Masası → Sistem → QR
taban adresi** alanına misafirin erişeceği genel HTTPS adresini (örn.
`https://menu.otel.example`) yazın; üretilmiş masa QR'ları bu değeri kullanır.

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
işlemler ve kullanıcılar bu adımın kapsamı dışındadır (`scripts/migrate-minibar-data.ts`).

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
- Giriş betiği (`docker-entrypoint.sh`) `prisma migrate deploy` çalıştırır; yalnız veritabanı
  bağlantı hatasında en çok 30 kez yeniden dener, migrasyon hatasında **hata koduyla çıkar**
  (konteyner ayağa kalkmaz). `RUN_SEED=true` iken seed hatası da başlatmayı durdurur.
- Derleme aşamasında `SKIP_ENV_VALIDATION=1` yalnız `prisma generate` ve `next build` komutlarına verilir;
  imaja gizli değer girmez. Dockerfile BuildKit gerektirir (Coolify'da varsayılan) ve katman/`npm`
  önbelleği kullanır; `package*.json` ve `prisma/schema.prisma` değişmedikçe kurulum katmanları yeniden
  çalışmaz. Daha hızlı dağıtım için GitHub Actions'ın GHCR'a yolladığı hazır imaj kullanılabilir
  (`COOLIFY_DEPLOYMENT.md` → Dağıtım biçimleri).
- Yalnız HTTP ile erişilen test ortamında (IP/sslip.io) `COOKIE_SECURE=false` verin.

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

Günlük `pg_dump` önerilir (örnek cron, her gece 03:15):

```bash
15 3 * * * pg_dump -Fc "postgresql://merit@localhost:5432/merit" \
  -f /var/backups/merit/merit-$(date +\%F).dump && find /var/backups/merit -name 'merit-*.dump' -mtime +14 -delete
```

Parolayı komut satırına yazmak yerine `~/.pgpass` kullanın. Yedekleri başka bir
makineye de kopyalayın ve geri yüklemeyi düzenli sınayın:
`pg_restore -d merit_restore_test merit-YYYY-MM-DD.dump`.

## 9. Günlükler

Uygulama standart çıktıya yazar: systemd altında `journalctl -u merit`, pm2 altında
`pm2 logs merit`. Günlük satırları `[realtime]`, `[pg-boss]`, `[instrumentation]` önekleriyle
başlar. Açılışta "gerçek zaman dinleyicisi başlatılamadı" veya "işler başlatılamadı"
görürseniz veritabanı erişimini ve `/api/health` çıktısını kontrol edin. Dinleyici
bağlantısı kopsa 1-2-4-8 sn aralıkla kendisi yeniden bağlanır. Günlük döndürme için
journald'ın varsayılanı yeterlidir.

## 10. Güvenlik notları

- `SESSION_SECRET` ve `QR_HMAC_SECRET` en az 32 baytlık rastgele değerler olmalı; örnek
  değerleri (`change-me...`) üretimde kullanmayın. `SESSION_SECRET` değişirse açık
  oturumlar geçersiz olur.
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
