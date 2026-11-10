# Coolify ile Merit Kurulum Kılavuzu (Tek Proje / Docker Compose)

Kurulum **tek bir Docker Compose stack'i** olarak yapılır: kök dizindeki `docker-compose.yaml`
(depoda başka compose dosyası yoktur). Stack, Next.js uygulamasını (`app`) ve PostgreSQL'i (`postgres`) içerir.
Ayrıntılı genel kurulum için `docs/kurulum.md` dosyasına bakın.

## Mimari
* **`app` (Next.js, port 3000):** yönetim paneli, POS/Kasa, KDS ve misafir QR menüsü.
* **`postgres` (PostgreSQL 16):** uygulama veritabanı.
* **Kalıcı birimler:** `postgres-data` (veritabanı), `app-uploads` (yüklenen görseller).

## Sunucuda adım adım (boş Ubuntu → Docker → Coolify → GitHub'dan dağıtım)

Otelin sunucusunda yalnız Ubuntu kuruluyken izlenecek sıra. Betikler `deploy/coolify/` altındadır.

### 0. Kurulumdan önce kesinleşmesi gerekenler

| Konu | Neden önemli |
| --- | --- |
| **Alan adı** (`qrmenu.merithotels.com`) | `APP_BASE_URL` olur ve basılan her QR koduna gömülür. Sonradan değişirse QR'lar yeniden basılır. |
| **Dışarıdan erişim** | Misafir telefonu (otel Wi-Fi'si veya mobil veri) bu adrese HTTPS ile ulaşabilmelidir. Sunucu iç ağdaysa otel güvenlik duvarında 80 ve 443 sunucuya yönlendirilir; alan adının A kaydı otelin dış IP'sini gösterir. |
| **Sertifika** | Coolify, Let's Encrypt sertifikasını 80 portu dışarıdan erişilebiliyorsa kendisi alır. Sunucu yalnız iç ağda kalacaksa otomatik sertifika alınamaz; otelin kendi sertifikası veya DNS doğrulaması gerekir. HTTPS olmadan PWA kurulumu ve anlık bildirim çalışmaz. |
| **Sunucu gücü** | Coolify en az 2 çekirdek / 2 GB ister. İmaj sunucuda derlendiği için (aşağıya bakın) **4 çekirdek, 8 GB bellek, 60 GB disk** önerilir; 4 GB'ta betik takas alanı açar, derleme yavaşlar. |
| **Yazıcı ağı** | Yazdırma geçidi otel ağında, yazıcılara TCP/9100 ile ulaşan bir makinede çalışır (`deploy/README.md` → Yazdırma geçidi). |

### 1. Sunucu hazırlığı, Docker ve Coolify

Sunucuya SSH ile bağlanın ve betiği çalıştırın (depo özel olduğu için betiği kendi bilgisayarınızdan kopyalayın):

```bash
scp deploy/coolify/sunucu-hazirlik.sh kullanici@SUNUCU_IP:/tmp/
```

```bash
ssh kullanici@SUNUCU_IP "sudo bash /tmp/sunucu-hazirlik.sh --ufw"
```

Betik sırasıyla: saat dilimini `Europe/Nicosia` yapar, bellek 8 GB'ın altındaysa 4 GB takas alanı açar,
Docker Engine'i Docker'ın resmi apt deposundan kurar (snap ile kurulu Docker varsa durur), `--ufw` verildiyse
güvenlik duvarını açar (SSH, 80, 443, 8000, 6001, 6002) ve Coolify'ı resmi kurulum betiğiyle kurar.
Yeniden çalıştırılabilir; kurulu adımları atlar. Yalnız Docker için `--docker-only`.

Bittiğinde `http://SUNUCU_IP:8000` adresini açıp **hemen** yönetici hesabını oluşturun: ilk kaydolan kişi
yönetici olur.

### 2. Coolify'ı GitHub'a bağlama (depo özel)

Depo (`Optimus825482/qrmenu`) özeldir; iki yol vardır (menü adları Coolify sürümüne göre biraz değişebilir):

* **GitHub App (önerilen):** Coolify → *Sources* → *GitHub App* ekleyin, GitHub'da yalnız `qrmenu` deposuna
  kurun. `main`e her push'ta otomatik dağıtım için GitHub'ın Coolify paneline webhook gönderebilmesi, yani
  panelin internetten erişilebilir olması gerekir.
* **Deploy key:** Coolify → *Keys & Tokens* altında bir SSH anahtarı üretin, açık anahtarı GitHub'da depo →
  *Settings → Deploy keys* altına **salt okunur** ekleyin. Panel dışarıya kapalıysa bu yol yeterlidir;
  dağıtım Coolify'daki *Redeploy* düğmesiyle elle yapılır.

### 3. Kaynağı oluşturma

Coolify → proje → **+ New Resource** → özel depo (GitHub App veya Deploy Key) → depo `qrmenu`, dal `main`,
**Build Pack: Docker Compose**, compose dosyası `/docker-compose.yaml`.

### 4. Ortam değişkenleri

Sırları kendi bilgisayarınızda üretin ve çıktıyı Coolify → *Environment Variables* alanına yapıştırın:

```bash
bash deploy/coolify/env-uret.sh https://qrmenu.merithotels.com
```

Çıktıyı dosyaya kaydetmeyin; değerleri parola kasanıza alın. `SESSION_SECRET` ve `QR_HMAC_SECRET` kaybolursa
oturumlar ve basılmış QR'lar geçersiz olur; `SETTINGS_SECRET_KEY` değişirse kayıtlı SMTP parolası açılamaz.
İsteğe bağlı değişkenlerin tamamı aşağıdaki "Ortam değişkenleri" bölümündedir.

### 5. Alan adı ve ilk dağıtım

1. *Domains* altında `app` servisine `https://qrmenu.merithotels.com:3000` yazın (port, konteynerin iç portudur;
   Coolify 443'ten 3000'e yönlendirir ve sertifikayı alır).
2. **Deploy**. İlk derleme 7-10 dakika sürer. Açılışta migrasyonlar, seed (`RUN_SEED=true`) ve Merit outlet /
   menü kurulumu (`SYNC_MERIT_MENUS=true`) çalışır.
3. `https://qrmenu.merithotels.com/api/health` → `ok:true` görün, `admin` ve `SEED_ADMIN_PASSWORD` ile girin,
   yönetici parolasını değiştirin.
4. Coolify'da `RUN_SEED=false`, `SYNC_MERIT_MENUS=false` yapın, `SEED_ADMIN_PASSWORD`'u silin ve yeniden dağıtın.
5. Denetim Masası → Sistem → `qr.baseUrl` alanına aynı adresi yazın; QR'ları bundan sonra basın.
6. Coolify paneline de bir alan adı verdiyseniz 8000, 6001 ve 6002 portlarını dışarıya kapatın.

### 6. Yedekleme

Veritabanı compose içindedir; yedeği sunucudaki betik alır (parola gerektirmez, `pg_dump` konteyner içinde çalışır):

```bash
sudo install -m 700 -D deploy/coolify/yedek.sh /opt/merit/yedek.sh
```

```bash
echo '15 3 * * * root /opt/merit/yedek.sh >> /var/log/merit-yedek.log 2>&1' | sudo tee /etc/cron.d/merit-yedek
```

Her gece `/var/backups/merit/` altına `merit-YYYY-AA-GG.dump` ve `merit-uploads-YYYY-AA-GG.tgz` yazılır, 14 günden
eskiler silinir. **Yedekleri başka bir makineye de kopyalayın**; aynı diskteki yedek disk arızasında işe yaramaz.
Canlıya geçmeden bir kez geri yükleme deneyin:

```bash
docker exec -i <postgres-konteyneri> sh -c 'createdb -U "$POSTGRES_USER" merit_geri_test && pg_restore -U "$POSTGRES_USER" -d merit_geri_test' < /var/backups/merit/merit-YYYY-AA-GG.dump
```

### 7. Güncelleme ve geri dönüş

* GitHub App + erişilebilir panel: `main`e push yeterlidir. Aksi halde Coolify'da **Redeploy**.
* Her dağıtımda migrasyonlar otomatik çalışır; migrasyon hatasında yeni konteyner kalkmaz, eskisi çalışmaya devam eder.
* Geri dönüş: Coolify → *Deployments* → önceki başarılı dağıtım → *Rollback*. Migrasyon geri alınmaz; şema
  değiştiren bir sürümden dönmeden önce o günün yedeğini elde tutun.

## Dağıtım biçimleri ve süreler

| Biçim | Nasıl | Beklenen süre |
| --- | --- | --- |
| **Docker Compose (sunucuda derleme)** — varsayılan | Coolify depoyu çeker ve `Dockerfile` ile derler. | İlk derleme 7-10 dk; yalnız kaynak değişince katman önbelleği sayesinde yaklaşık 3-5 dk (`npm ci` ve `prisma generate` katmanları yeniden kullanılır). `package*.json` veya `prisma/schema.prisma` değişirse ilgili katmanlar yeniden çalışır. |
| **Docker Image (hazır imaj)** — en hızlı | GitHub Actions (`.github/workflows/docker-image.yml`) `main` push'unda imajı derleyip `ghcr.io/optimus825482/qrmenu:latest` ve `:<commit-sha>` olarak GHCR'a yollar; Coolify yalnız çeker. | Yaklaşık 1 dk (çekme + başlatma). Derleme GitHub'da yapılır. |

Dockerfile iyileştirmeleri: tek `npm ci` (çalışma ortamı `node_modules` ağacı `npm prune --omit=dev` ile
elde edilir), BuildKit önbellek bağları (`/root/.npm`, `.next/cache`), `prisma generate` yalnız şemadan ve
bir kez, tip denetimi derlemede açık. `output: "standalone"` bilinçli olarak kullanılmaz: giriş betiği
`prisma migrate deploy` ve isteğe bağlı `tsx prisma/seed.ts` için tam ağaç gerektirir.

### Hazır imajla dağıtım (isteğe bağlı)
1. GitHub → Packages → `qrmenu` paketini oluşturan ilk iş akışı çalıştıktan sonra paketi özel bırakın ve
   Coolify'a bir GHCR kayıt bilgisi (kullanıcı + `read:packages` yetkili token) ekleyin; ya da paketi herkese açık yapın.
2. Coolify'da `postgres` için ayrı bir PostgreSQL kaynağı oluşturun, uygulama için **+ New Resource →
   Docker Image**: `ghcr.io/optimus825482/qrmenu`, etiket `latest`. Ortam değişkenlerini yukarıdaki gibi verin;
   `DATABASE_URL`'i doğrudan tanımlayın, `UPLOADS_DIR=/app/uploads` ve `/app/uploads` için kalıcı depolama ekleyin.
3. GitHub Actions bitince Coolify'da yeniden dağıtın (veya Coolify webhook'unu iş akışı sonuna ekleyin).

Not (10 Kasım 2026): GitHub Actions bu hesapta hiçbir iş akışını başlatamıyor (`ci.yml` ve `docker-image.yml`
dahil hepsi `startup_failure`); yani GHCR'daki imaj güncel değildir ve **şu an tek geçerli yol sunucuda
derlemedir**. Actions düzeldiğinde hazır imaj yoluna geçilebilir.

## Adım adım

### 1. Kaynağı ekleyin
Coolify → **+ New Resource** → **Docker Compose** (Git Repository). Branch `main`,
**Compose File Path:** `docker-compose.yaml`.

### 2. Ortam değişkenleri
Gizli değerlerin varsayılanı **yoktur**. Aşağıdaki zorunlu değişkenlerden biri eksikse
`docker compose` (ve dolayısıyla Coolify dağıtımı) açık bir hata verir (`${VAR:?required}`).

Zorunlu:

```env
POSTGRES_USER=merit
POSTGRES_PASSWORD=<güçlü parola; URL'ye gömülür, özel karakter kullanmayın>
POSTGRES_DB=merit
APP_BASE_URL=https://qrmenu.merithotels.com
SESSION_SECRET=<openssl rand -base64 48>
QR_HMAC_SECRET=<openssl rand -base64 48>
PRINT_GATEWAY_KEY=<openssl rand -base64 32>
```

İsteğe bağlı:

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `RUN_SEED` | `false` | `true` ise açılışta seed çalışır (referans veri + admin yoksa oluşturur). Seed hatası başlatmayı durdurur. |
| `SEED_DEMO` | `false` | `true` ise seed ayrıca demo outlet, menü ve örnek personel yükler. **Canlıda açmayın.** |
| `SEED_ADMIN_PASSWORD` | boş | `RUN_SEED=true` ve admin henüz yokken zorunlu, en az 10 karakter. Var olan admin'e seed dokunmaz. |
| `COOKIE_SECURE` | `true` | Yalnız HTTP ile erişilen test ortamında (IP, sslip.io) `false` yapın; gerçek kurulumda HTTPS kullanın. |
| `TRUSTED_PROXY_HOPS` | `1` | Uygulamanın önündeki güvenilir vekil sayısı (Coolify/Traefik tek vekil: `1`). Otelin önünde ayrı bir vekil/yük dengeleyici daha varsa `2`. |
| `SYNC_MERIT_MENUS` | `false` | İlk kurulumda bir kez `true`: 20 Merit outletini ve menülerini kurar. Var olan menüye dokunmaz. |
| `SETTINGS_SECRET_KEY` | boş | Veritabanında mühürlü saklanan sırların (SMTP parolası) anahtarı, en az 32 karakter. Boşsa `SESSION_SECRET` kullanılır. İlk kurulumda verin; sonradan değiştirmeyin. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | boş | Anlık bildirim (Web Push). İki anahtar birlikte verilir: `npx web-push generate-vapid-keys`. `VAPID_SUBJECT` örn. `mailto:it@otel.example`. |
| `PUSH_ENDPOINT_ALLOWLIST` | boş | İzinli push sunucuları (virgülle); boşsa bilinen servisler. |
| `TRANSLATE_PROVIDER` | `none` | MyBar metin çevirisi: `none` veya `gtx`. |
| `DEEPL_AUTH_KEY`, `GEMINI_API_KEY` | boş | Menü çevirisi sağlayıcıları. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | boş | SMTP yedek kaynağı; asıl ayar Denetim Masası → Sistem ekranındadır. |
| `DB_POOL_MAX` | `20` | Veritabanı bağlantı havuzu üst sınırı (5-100). |
| `ENV_LABEL` | boş | Durum çubuğunda ortam rozeti (ör. `EĞİTİM`); canlıda boş bırakın. |

Boş bırakılan isteğe bağlı değişken uygulamada "tanımsız" sayılır. Coolify yalnız compose dosyasında anılan
değişkenleri konteynere verir; yeni bir değişken eklenecekse `docker-compose.yaml` içine de yazılmalıdır.

### 3. İlk dağıtım ve seed
İlk kurulumda `RUN_SEED=true` ve `SEED_ADMIN_PASSWORD` ile bir kez dağıtın; `admin` oluştuktan sonra
`RUN_SEED=false` yapıp yeniden dağıtın ve `SEED_ADMIN_PASSWORD` değerini kaldırın.

### 4. Alan adı
`app` servisine alan adınızı bağlayın (`https://qrmenu.merithotels.com`); Coolify Traefik ve Let's Encrypt ile
3000 portuna yönlendirir. `APP_BASE_URL` bu adresle aynı olmalıdır.

### 5. Dağıtım sırası
1. `postgres` açılır ve sağlıklı olana dek beklenir.
2. `docker-entrypoint.sh` `prisma migrate deploy` çalıştırır: yalnız bağlantı hatasında en çok 30 kez
   yeniden dener; migrasyon hatasında hata koduyla çıkar (konteyner kalkmaz).
3. `RUN_SEED=true` ise seed çalışır, ardından Next.js 3000 portunda başlar.

### 6. Giriş
* Yönetici: `https://qrmenu.merithotels.com/giris`, kullanıcı adı `admin`, parola ilk seed'de verdiğiniz
  `SEED_ADMIN_PASSWORD` değeri.
* Masa QR kodları: yönetim arayüzünde **Masa QR Kodları** penceresi; Denetim Masası → Sistem →
  `qr.baseUrl` alanına genel HTTPS adresini yazın.
