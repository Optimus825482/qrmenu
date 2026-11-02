# Coolify ile Merit Kurulum Kılavuzu (Tek Proje / Docker Compose)

Kurulum **tek bir Docker Compose stack'i** olarak yapılır: kök dizindeki `docker-compose.yaml`
(depoda başka compose dosyası yoktur). Stack, Next.js uygulamasını (`app`) ve PostgreSQL'i (`postgres`) içerir.
Ayrıntılı genel kurulum için `docs/kurulum.md` dosyasına bakın.

## Mimari
* **`app` (Next.js, port 3000):** yönetim paneli, POS/Kasa, KDS ve misafir QR menüsü.
* **`postgres` (PostgreSQL 16):** uygulama veritabanı.
* **Kalıcı birimler:** `postgres-data` (veritabanı), `app-uploads` (yüklenen görseller).

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

Not: CI iş akışı (`ci.yml`) şu an kodla ilgisi olmayan bir runner/hesap sorunu nedeniyle başarısız
oluyor; bu, `docker-image.yml` çalışmasını etkilemez ama GitHub Actions'ın hesapta çalışır durumda olması gerekir.

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
APP_BASE_URL=https://menu.siteniz.com
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
| `TRUSTED_PROXY_HOPS` | `1` | Uygulamanın önündeki güvenilir vekil sayısı (Coolify/Traefik tek vekil: `1`). |

### 3. İlk dağıtım ve seed
İlk kurulumda `RUN_SEED=true` ve `SEED_ADMIN_PASSWORD` ile bir kez dağıtın; `admin` oluştuktan sonra
`RUN_SEED=false` yapıp yeniden dağıtın ve `SEED_ADMIN_PASSWORD` değerini kaldırın.

### 4. Alan adı
`app` servisine alan adınızı bağlayın (`https://menu.siteniz.com`); Coolify Traefik ve Let's Encrypt ile
3000 portuna yönlendirir. `APP_BASE_URL` bu adresle aynı olmalıdır.

### 5. Dağıtım sırası
1. `postgres` açılır ve sağlıklı olana dek beklenir.
2. `docker-entrypoint.sh` `prisma migrate deploy` çalıştırır: yalnız bağlantı hatasında en çok 30 kez
   yeniden dener; migrasyon hatasında hata koduyla çıkar (konteyner kalkmaz).
3. `RUN_SEED=true` ise seed çalışır, ardından Next.js 3000 portunda başlar.

### 6. Giriş
* Yönetici: `https://menu.siteniz.com/giris`, kullanıcı adı `admin`, parola ilk seed'de verdiğiniz
  `SEED_ADMIN_PASSWORD` değeri.
* Masa QR kodları: yönetim arayüzünde **Masa QR Kodları** penceresi; Denetim Masası → Sistem →
  `qr.baseUrl` alanına genel HTTPS adresini yazın.
