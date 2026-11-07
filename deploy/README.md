# Merit OS — Üretim dağıtım paketi (on-prem runbook)

Birincil hedef: otelin kendi sunucusu (Ubuntu 24.04 LTS, 4 vCPU / 8 GB, UPS). Bulut/Coolify ikincildir
(`COOLIFY_DEPLOYMENT.md`, `docs/kurulum.md`). Ayrıntılı ortam değişkeni tablosu: `docs/kurulum.md` §3.

| Dosya | Hedef |
| --- | --- |
| `nginx/merit.conf` | `/etc/nginx/sites-available/merit` |
| `systemd/merit.service`, `merit-egitim.service`, `merit-gateway.service`, `merit-backup.{service,timer}` | `/etc/systemd/system/` |
| `env.production.example` | `/etc/merit/merit.env` (600) |
| `gateway.env.example` | `/etc/merit/gateway.env` (600) |
| `scripts/{backup,restore,update,health}.sh` | `/opt/merit/deploy/scripts/` (depoyla birlikte gelir) |

Varsayımlar: kod `/opt/merit` (depo kökü; uygulama `/opt/merit/merit`), sistem kullanıcısı `merit`,
uploads `/var/lib/merit/uploads`, yedekler `/var/backups/merit`, üretim portu 3000, eğitim 3100.

## 1. Sunucu hazırlığı

```bash
sudo timedatectl set-timezone Europe/Nicosia
sudo apt update && sudo apt install -y nginx postgresql-17 certbot git curl ufw   # PostgreSQL 17: PGDG deposu gerekebilir
# Node 24 LTS (NodeSource veya nvm; systemd /usr/bin/node arar):
node -v   # v24.x

sudo useradd --system --create-home --shell /bin/bash merit
sudo mkdir -p /opt/merit /etc/merit /var/lib/merit/uploads /var/backups/merit
sudo chown -R merit:merit /opt/merit /var/lib/merit /var/backups/merit
sudo chmod 750 /etc/merit && sudo chown root:merit /etc/merit
sudo -u merit git clone <depo-adresi> /opt/merit
```

Güncelleme betiği `systemctl restart` çağırır; `merit` için dar bir sudoers kuralı ekleyin
(`sudo visudo -f /etc/sudoers.d/merit`):
`merit ALL=(root) NOPASSWD: /usr/bin/systemctl restart merit, /usr/bin/systemctl restart merit-egitim`

## 2. Veritabanı

```bash
sudo -u postgres psql -c "CREATE ROLE merit LOGIN PASSWORD '<güçlü-parola>';"
sudo -u postgres psql -c "CREATE DATABASE merit OWNER merit;"
# Eğitim örneği (isteğe bağlı):
sudo -u postgres psql -c "CREATE DATABASE merit_egitim OWNER merit;"
# Yedek betiği için parola dosyası (merit kullanıcısı, 600):
echo 'localhost:5432:merit:merit:<güçlü-parola>' | sudo -u merit tee /home/merit/.pgpass >/dev/null
sudo chmod 600 /home/merit/.pgpass
```

## 3. Ortam dosyası ve ilk kurulum

```bash
sudo install -m 600 -o merit -g merit /opt/merit/deploy/env.production.example /etc/merit/merit.env
sudo -e /etc/merit/merit.env      # her CHANGE_ME_ değerini değiştirin; anahtarlar: openssl rand -base64 48
# Yedek betiğinde parola komut satırında görünmesin: BACKUP_DATABASE_URL=postgresql://merit@localhost:5432/merit

cd /opt/merit/merit
sudo -u merit bash -c 'set -a; . /etc/merit/merit.env; set +a; npm ci && npx prisma migrate deploy && npm run build && npm run db:seed'
```

Seed `SEED_ADMIN_PASSWORD` ile `admin` kullanıcısını oluşturur. **Seed sonrası bu satırı
`/etc/merit/merit.env` dosyasından silin** ve ilk girişte parolayı değiştirin.
Sonra Denetim Masası → Sistem → `qr.baseUrl` değerini girin. Alan adı değişirse tüm QR'lar yeniden basılır.

## 4. TLS ve nginx

Misafir telefonları geçerli HTTPS ister; kendi imzalı sertifika kabul edilmez.

- **Genel alan adı + Let's Encrypt:** `sudo certbot certonly --webroot -w /var/www/certbot -d merit.otel.example`
  (iç ad internetten çözülmüyorsa **DNS-01**: `--manual --preferred-challenges dns` veya DNS sağlayıcı eklentisi).
- **İç CA (kurumsal):** sertifikayı CA'dan alıp `ssl_certificate*` yollarını değiştirin; CA kökü misafir cihazlarında
  güvenilir değilse bu seçenek misafir QR'ı için uygun değildir.

```bash
sudo cp /opt/merit/deploy/nginx/merit.conf /etc/nginx/sites-available/merit
sudo ln -sf ../sites-available/merit /etc/nginx/sites-enabled/merit
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Dosyadaki `merit.otel.example` / `egitim.otel.example` adlarını gerçek adlarla değiştirin. Eğitim örneği kullanılmayacaksa
son `server` bloğunu ve `upstream merit_egitim` kaydını silin. Misafir Wi-Fi'sinde ad, split-horizon DNS ile sunucunun
LAN IP'sine çözülmelidir.

## 5. Servisler

```bash
sudo cp /opt/merit/deploy/systemd/merit*.service /opt/merit/deploy/systemd/merit-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now merit merit-backup.timer
/opt/merit/deploy/scripts/health.sh http://127.0.0.1:3000 60
```

Eğitim örneği: `/etc/merit/merit-egitim.env` oluşturun (ayrı `DATABASE_URL=…/merit_egitim`, **ayrı** gizli anahtarlar,
`APP_BASE_URL=https://egitim.otel.example`, ayrı `UPLOADS_DIR`), `merit_egitim` veritabanına migrate + seed uygulayın
(`DATABASE_URL` o veritabanına işaret ederken), sonra `sudo systemctl enable --now merit-egitim`.
Birim `ENV_LABEL=EĞİTİM` ve `PORT=3100` verir.

Cron alternatifi (systemd timer yerine): `15 3 * * * merit set -a; . /etc/merit/merit.env; set +a; /opt/merit/deploy/scripts/backup.sh`

## 6. Güvenlik duvarı

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow from <yönetim-LAN> to any port 22 proto tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
```

3000, 3100 ve 5432 dışa açılmaz (uygulama `127.0.0.1` dinler).

## 7. Yazdırma geçidi (print gateway)

Aynı sunucuda: `cd /opt/merit/merit/tools/print-gateway && sudo -u merit npm ci`, ardından
`sudo install -m 600 -o merit -g merit /opt/merit/deploy/gateway.env.example /etc/merit/gateway.env`, değerleri düzenleyin
(`GATEWAY_KEY` = sunucudaki `PRINT_GATEWAY_KEY`), `sudo cp deploy/systemd/merit-gateway.service /etc/systemd/system/`,
`sudo systemctl enable --now merit-gateway`. Sunucudan yazıcıya TCP/9100 erişimi gerekir; yazıcılara sabit IP / DHCP rezervasyonu verin.
Başka otelde veya LAN PC'de çalışacaksa gateway yalnız dışa doğru HTTPS ile `API_URL`'e çıkar (Windows için NSSM:
`merit/tools/print-gateway/README.md`). Türkçe karakter doğrulaması: Yazıcılar penceresinden "Test fişi";
bozuksa `CODEPAGE_TABLE` değerini değiştirin.

## 8. Yedek ve geri yükleme doğrulaması

- Günlük 03:15: `merit-backup.timer` → `backup.sh` (pg_dump `-Fc` + uploads `.tgz`, 14 gün saklama, `pg_restore --list` kontrolü).
  İzleme: `systemctl list-timers merit-backup.timer`, `journalctl -u merit-backup.service`.
- Yedekleri başka makineye de kopyalayın (aynı diskte kalan yedek yedek değildir).
- **Aylık tatbikat:** `restore.sh /var/backups/merit/merit-<tarih>.dump merit_restore_test`, satır sayılarını canlıyla karşılaştırın
  (`SELECT count(*) FROM "User"` vb.), sonra `dropdb merit_restore_test`. `restore.sh` hedef `merit` ise `--force` olmadan reddeder.
- Felaket durumunda: `sudo systemctl stop merit`, `restore.sh <dump> merit --force`, uploads için `tar -xzf` ile `/var/lib/merit` altına aç, servisi başlat.

## 9. Güncelleme

```bash
sudo -u merit /opt/merit/deploy/scripts/update.sh            # mevcut dalda git pull --ff-only
sudo -u merit /opt/merit/deploy/scripts/update.sh v1.2.0     # belirli etikete
```

Sıra: yedek → git → `npm ci` → `prisma migrate deploy` → build → restart → `health.sh` (60 sn). Başarısız olursa betik geri dönüş komutunu yazdırır.

Go-live: bkz. [CHECKLIST.md](CHECKLIST.md). Bu paketteki `nginx -t`, `systemd-analyze verify` ve shellcheck çalıştırılmadı
(geliştirme makinesi Windows); ilk kurulumda sunucuda çalıştırın.
