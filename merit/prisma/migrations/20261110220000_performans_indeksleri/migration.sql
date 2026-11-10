-- Performans indeksleri (10 Kas 2026). Her dakika calisan supurucu isler ve surekli yenilenen panolar
-- (kasa, oda servisi, komuta merkezi, radar, bildirim zili) tablonun tamamini okumak yerine indeks kullanir.
-- Yalniz indeks ekler; veri degismez. Tekrarlanabilir (IF NOT EXISTS).

-- Siparisler: otel duzeyi sayaclar ve SLA supurucusu; yukseltme supurucusu; satis noktasinin gunluk listesi.
CREATE INDEX IF NOT EXISTS "orders_hotel_id_status_created_at_idx" ON "orders"("hotel_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE INDEX IF NOT EXISTS "orders_outlet_id_business_date_idx" ON "orders"("outlet_id", "business_date");

-- Yazdirma: takilan isleri arayan supurucu.
CREATE INDEX IF NOT EXISTS "print_jobs_status_started_at_idx" ON "print_jobs"("status", "started_at");

-- MyBar: cikis supurucusu (bekleyen talepler) ve otel bazli zaman araligi listeleri.
CREATE INDEX IF NOT EXISTS "mybar_requests_status_created_at_idx" ON "mybar_requests"("status", "created_at");
CREATE INDEX IF NOT EXISTS "mybar_requests_hotel_id_created_at_idx" ON "mybar_requests"("hotel_id", "created_at");

-- DND: otelin gunluk listesi; gorev satiri silinirken bagli kayitlarin bulunmasi.
CREATE INDEX IF NOT EXISTS "room_dnds_hotel_id_date_idx" ON "room_dnds"("hotel_id", "date");
CREATE INDEX IF NOT EXISTS "room_dnds_task_item_id_idx" ON "room_dnds"("task_item_id");

-- Gorev durum gecmisi: gorev satirina gore okuma ve gorev silinirken zincirleme silme.
CREATE INDEX IF NOT EXISTS "task_status_logs_task_item_id_created_at_idx" ON "task_status_logs"("task_item_id", "created_at");

-- Bildirimler: zil listesi (kullaniciya gore, yeniden eskiye) ve otel bazli sayac.
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "notifications_hotel_id_created_at_idx" ON "notifications"("hotel_id", "created_at");

-- Oturumlar: kapanmis oturumlar silinmedigi icin gecmis sorgulari (rapor, cevrimici kullanicilar) ve kullaniciya gore arama.
CREATE INDEX IF NOT EXISTS "user_sessions_hotel_id_login_at_idx" ON "user_sessions"("hotel_id", "login_at");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_status_idx" ON "user_sessions"("user_id", "status");

-- Denetim kaydi: islem + kullaniciya gore arama (depo talebi tekrar kontrolu).
CREATE INDEX IF NOT EXISTS "audit_logs_action_user_id_created_at_idx" ON "audit_logs"("action", "user_id", "created_at");

-- Oda kontrolleri: radar zaman araligi.
CREATE INDEX IF NOT EXISTS "room_checks_started_at_idx" ON "room_checks"("started_at");

-- Doluluk: belirli bir gunde otelde kalanlar (kat plani, komuta merkezi, gorev uretimi).
CREATE INDEX IF NOT EXISTS "guest_records_hotel_id_departure_date_idx" ON "guest_records"("hotel_id", "departure_date");
