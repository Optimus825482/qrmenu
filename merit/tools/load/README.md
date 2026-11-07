# Yerel yük denemesi

Node tabanlı araç; HTTP için undici, kalıcı SSE okuyucuları, gerçek personel girişi için Playwright, isteğe bağlı kapasite taraması için autocannon kullanır. Çıktılar `tools/load/.tmp/` altında tutulur ve Git'e alınmaz. Parola veya oturum çerezi hedef dosyasına/rapora yazılmaz.

1. `merit/` içinde `npm ci`; ardından `tools/load/` içinde `npm ci` çalıştırın. Chromium yoksa `npx playwright install chromium` çalıştırın.
2. Ayrı yerel `merit_load` DB oluşturun. Kabukta `DATABASE_URL` bu DB'yi, `LOAD_BASE_URL` ayrılmış sunucuyu göstermeli; örneğin `http://localhost:3124`. `LOAD_PASSWORD` ve temel seed için `SEED_ADMIN_PASSWORD` ortamdan verilmelidir. Parolalar en az 10 karakterdir.
3. `merit/` içinde `npx prisma migrate deploy` ve `npm run db:seed:load` çalıştırın. Doğal anahtarlarla tekrar çalışabilir; operasyon kayıtlarını silmez. Tekrarlanan senaryolar için yeni ayrılmış DB önerilir.
4. `NEXT_DIST_DIR=.next-load`, `APP_BASE_URL` hedef adresi olacak şekilde `npm run build`; aynı ortamla `npm start -- -p 3124`. Zamanlı işler açık olmalı; `/api/health` 200 ve `ok:true` dönmelidir.
5. Aynı DB/hedef/parola ortamıyla `npm run load:smoke`: 30 misafir, 5 personel, 60 saniye. `npm run load:smoke -- --nat` ortak IP senaryosudur. Çarpan 1 koşusunda `--expect-429`, çarpan 5 koşusunda bu seçenek olmadan çalıştırılır. Ayarı Sistem Ayarları üzerinden değiştirin; yeni değer 30 saniye içinde devreye girer.

PowerShell'de ortam değişkenlerini `$env:AD='değer'` ile ayrı satırlarda verin. `LOAD_PASSWORD` için bir parola yöneticisi veya süreç içinde rastgele üretilmiş değer kullanın; komut geçmişine gerçek sır koymayın. `.env` dosyasının üretim DB URL'si varsayılan olarak kabul edilmez: araç `_load`, `_test` veya `_egitim` son eki olmadan başlamaz. Yerel hedefte hem HTTP hem DB localhost olmalıdır. Yönlendirmeler takip edilmez.

`npm run load:full` 300 misafir, 40 personel, 5 radar bağlantısı ve 10 dakikayı hedefler. Tam yük raporu, yeniden başlatma ve 3–10 dakika RSS kanıtları eksik kaldığında başarısız sayılır; smoke başarısı tam kapasite kabulü değildir. Personel kuyruğu şu anda masa siparişi onay/KDS/servis akışını sürer; oda servisi ve MyBar misafir istekleri gönderilir, bu iki akışın personel kapatma zinciri henüz otomatik değildir. Kapasite seçeneği (`--capacity`) yalnız GET sayfa/sağlık doygunluğunu ölçer; POST doygunluğu ve tam yeniden başlatma tatbikatı ayrıca tamamlanmalıdır.

Harici hedefe test yalnız Erkan'ın açık onayıyla yapılır. `LOAD_ALLOW_HOST` yalnız tam ana makine adı kabul eder; bu çalışmada ayarlanmadı. `--target` kayıtlı hedefi değiştirir ama güvenlik korumasını atlamaz.

Rapor: HTTP sayım/hata/red/yüzdelikler, 429, SSE açılma/zirve/kapanma/yeniden bağlanma, onay→misafir SSE gecikmesi ve yalnız hedef DB'nin `pg_stat_activity` bağlantıları. Bir okuyucunun sipariş ID'si filtresine geçişi kasıtlı kapanmadır; beklenmeyen kapanma sayılmaz. Tam yük eşiği dosyası `thresholds.json` içindedir. Ölçülmeyen alanlar `not_run` olarak açıkça kaydedilir.
