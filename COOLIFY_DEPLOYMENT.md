# 🚀 Coolify ile Merit QR Menü Kurulum Kılavuzu (Tek Proje / Docker Compose)

Bu kurulumda **Coolify üzerinde tek bir proje kaynağı (Docker Compose Stack)** oluşturulur. Hem **Next.js Web Uygulaması** hem de **PostgreSQL Veritabanı** aynı stack içinde otomatik olarak ayağa kalkar, tohum veriler (oteller, beach bar, 12 masa QR'ı, menü ürünleri ve görseller) otomatik yüklenir.

---

## 🛠️ Mimari
* **Servis 1: `app` (Next.js - Port 3000):** Web arayüzü, admin paneli, POS/Kasa, KDS mutfak ve misafir QR menüsü.
* **Servis 2: `postgres` (PostgreSQL 16):** Uygulama veritabanı.
* **Kalıcı Birimler (Volumes):**
  * `postgres-data` → Veritabanının silinmesini engeller.
  * `app-uploads` → Yüklenen yeni fotoğrafların silinmesini engeller.
* **Örnek Görseller & Menüler:** Repo içindeki `/menu-samples` ve otel logoları doğrudan Next.js konteynerine dahildir ve ilk açılışta veritabanına otomatik bağlanır.

---

## 📋 Coolify'da Adım Adım Kurulum

### 1. Yeni Kaynak Ekleyin
1. Coolify panelinizde projenize girin.
2. **+ New Resource** → **Docker Compose** (veya **Git Repository** seçip Build Pack olarak **Docker Compose** seçin).
3. GitHub reponuzu bağlayın:
   * **Repository:** `https://github.com/Optimus825482/qrmenu.git`
   * **Branch:** `main`
   * **Compose File Path:** `docker-compose.yml` (veya doğrudan repodaki dosyayı okur)

---

### 2. Ortam Değişkenleri (Environment Variables)

Coolify'daki Docker Compose kaynağınızın **Environment Variables** bölümüne alan adınızı girmeniz yeterlidir:

```env
APP_BASE_URL=https://menu.siteniz.com
SEED_ADMIN_PASSWORD=Merit!2026
RUN_SEED=true
```

*(Diğer tüm ayarlar — `DATABASE_URL`, gizli anahtarlar, portlar, sağlık kontrolleri — `docker-compose.yml` içinde hazır ve otomatik yapılandırılmıştır!)*

---

### 3. Alan Adı (Domain / FQDN) Bağlama
* Coolify'da `app` servisinin karşısına alan adınızı yazın:
  * `https://menu.siteniz.com` (veya IP adresi ile test: `http://sunucu-ip:3000`)
* Coolify otomatik olarak Traefik reverse proxy ve Let's Encrypt SSL sertifikasını `app` servisinin 3000 portuna yönlendirecektir.

---

### 4. Canlıya Alma (Deploy)
* **Deploy** butonuna tıklayın.
* Coolify konteynerleri derleyecek ve şu sırayla başlatacaktır:
  1. `postgres` servisi açılır ve sağlık testi (`healthy`) beklenir.
  2. `app` servisi açılır, `docker-entrypoint.sh` devreye girer.
  3. Veritabanı tabloları oluşturulur (`prisma migrate deploy`).
  4. Örnek veriler ve görseller yüklenir (`prisma/seed.ts`):
     * Merit Royal, Merit Crystal Cove, Merit Park otelleri
     * Beach Bar ve diğer outletler
     * Masalar ve imzalı QR kodları
     * Menü kategorileri, içecekler, yemekler ve örnek görseller
     * XP Tema tasarımları
  5. Next.js 3000 portunda yayına başlar.

---

### 5. Giriş ve Kullanım
* **Yönetici Girişi:** `https://menu.siteniz.com/giris`
  * **Kullanıcı adı:** `admin`
  * **Şifre:** `Merit!2026` (veya `SEED_ADMIN_PASSWORD` ile belirlediğiniz şifre)
* **Masa QR Kodları:**
  * Yönetici arayüzünde **Masa QR Kodları** penceresini açın.
  * Masaların QR adresleri otomatik olarak canlı adresinize (`https://menu.siteniz.com/q/...`) hazırdır.
  * **Yazdır** veya **ZIP İndir** diyerek anında çıktı alabilirsiniz.
