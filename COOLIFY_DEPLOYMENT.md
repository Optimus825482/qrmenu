# 🚀 Coolify ile Merit QR Menü Kurulum Kılavuzu

Bu kılavuz, projenin **Coolify** (Self-hosted PaaS) üzerinde sıfır hata ve kesintisiz şekilde çalıştırılması için gerekli tüm adımları içerir.

---

## 🛠️ Mimari ve Gereksinimler

* **Uygulama:** Next.js (Node.js 22-alpine)
* **Veritabanı:** PostgreSQL 15+ (Coolify içinden tek tıkla kurulabilir)
* **ORM & Migrasyon:** Prisma (`prisma migrate deploy` konteyner açılışında otomatik uygulanır)
* **Kalıcı Depolama (Storage):** Menü ürün fotoğrafları için kalıcı disk birimi (`/app/uploads`)

---

## 📋 1. Adım: Coolify'da PostgreSQL Veritabanı Açma

1. Coolify panelinizde projenizin içine girin.
2. **+ New Resource** → **Databases** → **PostgreSQL** seçin.
3. İsim olarak `merit-db` verebilirsiniz.
4. Oluşturulduktan sonra veritabanının **Internal Connection String (İç Bağlantı URL'si)** adresini kopyalayın.
   * Örnek: `postgresql://postgres:sifreniz@merit-db:5432/merit`

---

## 🌐 2. Adım: GitHub Reposunu Coolify'a Bağlama

1. **+ New Resource** → **Git Repository (GitHub App veya Public/Private Repo)** seçin.
2. `qrmenu` reposunu ve ilgili dalı (`main` veya `p5/qr-menu`) seçin.
3. Build Pack olarak **Dockerfile** seçili olduğundan emin olun.
4. **General** sekmesinde şu ayarları yapın:
   * **Base Directory:** `/merit` (eğer root Dockerfile kullanacaksanız `/` bırakabilirsiniz; önerilen: `/merit`)
   * **Dockerfile Path:** `/Dockerfile`
   * **Ports Exposes:** `3000`

---

## 🔑 3. Adım: Ortam Değişkenleri (Environment Variables)

Coolify'daki uygulamanızın **Environment Variables** sekmesine aşağıdaki değerleri girin:

| Değişken | Örnek / Açıklama |
| :--- | :--- |
| `DATABASE_URL` | 1. adımda kopyaladığınız Postgres bağlantı dizesi (örn: `postgresql://postgres:sifre@merit-db:5432/merit`) |
| `APP_BASE_URL` | Sunucunuzun canlı dış adresi: `https://menu.siteniz.com` (veya IP testi için: `http://ip-adresi:3000`) |
| `SESSION_SECRET` | 32+ karakter rastgele gizli anahtar (örn: `openssl rand -hex 32`) |
| `QR_HMAC_SECRET` | 32+ karakter QR imzalama anahtarı (örn: `openssl rand -hex 32`) |
| `PRINT_GATEWAY_KEY` | Termal yazıcı geçidi güvenlik anahtarı (örn: `openssl rand -hex 32`) |
| `SEED_ADMIN_PASSWORD` | İlk kurulum admin şifresi (örn: `Merit!2026`) |
| `UPLOADS_DIR` | `/app/uploads` |
| `RUN_SEED` | **İlk kurulumda:** `true` (Oteller, temalar, menüler ve masaları oluşturur). Kurulum bittikten sonra `false` yapabilirsiniz. |
| `TZ` | `Europe/Nicosia` veya `Europe/Istanbul` |
| `NODE_ENV` | `production` |

> 💡 **İpucu:** Güvenlik anahtarlarını üretmek için terminalinizde şu komutu çalıştırabilirsiniz:
> ```bash
> openssl rand -hex 32
> ```

---

## 💾 4. Adım: Kalıcı Depolama (Persistent Storage / Uploads)

Kullanıcıların yüklediği menü ve ürün fotoğraflarının konteyner yeniden başlatıldığında silinmemesi için kalıcı bir birim bağlanmalıdır:

1. Coolify uygulamasında **Storages** (veya **Persistent Storage**) sekmesine gidin.
2. **+ Add Storage** butonuna tıklayın:
   * **Volume Name:** `merit-uploads`
   * **Destination Path:** `/app/uploads`
3. Kaydedin.

---

## 🚀 5. Adım: Canlıya Alma (Deploy)

1. Coolify'da **Deploy** butonuna basın.
2. Konteyner ayağa kalkarken:
   * Otomatik olarak `prisma migrate deploy` çalışır ve tablolar güncellenir.
   * `RUN_SEED=true` olduğu için ilk örnek veriler (Merit otelleri, beach bar, masa QR'ları, temalar, kullanıcılar) yüklenir.
   * Next.js 3000 portunda yayına başlar.
3. Coolify otomatik SSL (Let's Encrypt HTTPS) sertifikasını bağlayacaktır.

---

## 🧪 6. Adım: Kurulum Sonrası Kontrol

* **Sistem Sağlık Testi:**
  `https://menu.siteniz.com/api/health` adresine gidin. `{"status":"ok", ...}` yanıtı gelmelidir.
* **Yönetici Girişi:**
  `https://menu.siteniz.com/giris` adresine gidin.
  * **Kullanıcı adı:** `admin`
  * **Şifre:** `SEED_ADMIN_PASSWORD` ile belirlediğiniz şifre (varsayılan: `Merit!2026`)
* **Masa QR Kodları Kontrolü:**
  Masaüstünde **Masa QR Kodları** penceresini açın. Masaların QR linklerinin artık `https://menu.siteniz.com/q/...` adresine yönlendiğini doğrulayın.
