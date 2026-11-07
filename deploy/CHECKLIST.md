# Merit OS — Go-live kontrol listesi

## Altyapı
- [ ] Ubuntu 24.04, saat dilimi `Europe/Nicosia`, NTP senkron (`timedatectl`)
- [ ] Node 24, PostgreSQL 17, nginx kurulu; `merit` kullanıcısı ve dizinler (`/opt/merit`, `/var/lib/merit/uploads`, `/var/backups/merit`)
- [ ] Alan adı kesinleşti (`APP_BASE_URL` = `qr.baseUrl`); iç DNS (split-horizon) misafir Wi-Fi'sinde çözülüyor
- [ ] Geçerli TLS sertifikası (Let's Encrypt / DNS-01); yenileme testi `certbot renew --dry-run`
- [ ] `sudo nginx -t` geçti; HTTP→HTTPS yönlendirmesi çalışıyor
- [ ] Güvenlik duvarı: yalnız 22 (LAN), 80, 443; 3000/3100/5432 dışa kapalı

## Yapılandırma
- [ ] `/etc/merit/merit.env` izin 600, hiçbir `CHANGE_ME_` kalmadı
- [ ] `SESSION_SECRET`, `QR_HMAC_SECRET`, `PRINT_GATEWAY_KEY` birbirinden farklı, rastgele (>= 32)
- [ ] `SEED_ADMIN_PASSWORD` seed sonrası ortamdan silindi; admin parolası değiştirildi
- [ ] `DEMO_PASSWORD` / `SEED_DEMO` üretimde tanımlı değil
- [ ] `qr.baseUrl` ayarı girildi; `guest.ipRateMultiplier` NAT için ayarlandı (öneri 5)
- [ ] SMTP Sistem ayarlarından girildi ve test e-postası ulaştı
- [ ] VAPID anahtarları (`npx web-push generate-vapid-keys`) üretildi, push testi yapıldı (isteğe bağlı)

## Veri
- [ ] 3 otel, modül anahtarları, outlet / masa / oda kayıtları girildi
- [ ] Gerekliyse eski minibar verisi göçü yapıldı ve doğrulandı
- [ ] QR'lar canlı alan adıyla basıldı

## Servisler
- [ ] `systemctl is-active merit` ve `curl -fsS https://<alan>/api/health` → `ok:true`
- [ ] Yazıcı: ağ testi (9100), Türkçe karakterli "Test fişi" doğru basıldı, `merit-gateway` etkin
- [ ] SSE: tarayıcıda canlı güncelleme çalışıyor (nginx tamponlamıyor)
- [ ] Eğitim örneği (`merit-egitim`, port 3100, `EĞİTİM` etiketi) ayrı veritabanında çalışıyor

## Yedek ve izleme
- [ ] `systemctl list-timers merit-backup.timer` etkin; ilk yedek üretildi (`.dump` + `.tgz`)
- [ ] Yedekler başka makineye kopyalanıyor
- [ ] Geri yükleme tatbikatı yapıldı (`restore.sh … merit_restore_test`) ve satır sayıları eşleşti
- [ ] `/api/health` izlemeye (uptime) bağlandı
- [ ] `update.sh` kuru çalıştırma / sudoers kuralı sınandı
- [ ] Yük denemesi raporu ve teslim kontrol listesi (`docs/teslim-kontrol-listesi.md`) tamamlandı
