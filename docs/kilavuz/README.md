# Merit OS Eğitim Kılavuzları

Bu set ayrı eğitim veritabanında üretilen gerçek arayüz görüntülerini içerir. Ortamın adresi, hesabı ve parolası eğitim sorumlusundan alınır; [kurulum](../kurulum.md) belgesinde eğitim ortamının hazırlanması anlatılır. Gerçek misafir veya operasyon verisi kullanılmaz.

| Kılavuz | Hedef kitle |
|---|---|
| [Yönetici](yonetici.md) | Müdür, F&B, IT |
| [Kat sorumlusu](kat-sorumlusu.md) | Minibar saha |
| [Depo](depo.md) | Havuz ve doluluk |
| [Garson ve kasa](garson-kasa.md) | Masa operasyonu |
| [Mutfak ve oda servisi](mutfak.md) | KDS ve teslim |
| [Misafir](misafir.md) | Misafir ve danışma personeli |

## Üç oturumluk eğitim planı

| Oturum | Süre | Eğitim hesapları | Alıştırmalar |
|---|---|---|---|
| 1 — Yönetici ve IT | 90 dk | egitim.admin, egitim.fbm | Doğru otel seçimi; kurulum/tanım sırası; rol ve Erişimim; menü/QR; rapor Excel/PDF; yetkili IT eşliğinde ayar ve yedek kontrolü |
| 2 — Saha | 75 dk | egitim.garson1, egitim.kasa, egitim.kds, egitim.oda | Demo masa QR siparişi → kasa onayı → KDS başlat/hazır → servis; garson çağrısı; oda servisi teyit ve teslim; iptal gerekçesi |
| 3 — Minibar | 90 dk | egitim.kat1, egitim.kat2, egitim.depo | Üç doluluk dosyasının önizlemesi; +1/Sarfiyat Yok/DND; örnek MyBar karşılama ve eksik gerekçesi; ortak havuz ve rapor karşılaştırması |

Her oturum sonunda katılımcı aynı akışı eğitmenin yardımı olmadan tekrarlar. Katılım ve kabul imzası [teslim kontrol listesine](../teslim-kontrol-listesi.md) işlenir. DND hatırlatması gibi süreli adımlar eğitimde süreyi beklemek yerine kabul test raporuyla açıklanır; üretim saati değiştirilmez.

## Görüntüleri yeniden üretme

1. Ayrı yerel eğitim veritabanını kurun; temel seed ve demo seed'i çalıştırın. Parola yalnız ortam değişkeninden verilir. Eğitim şeridi açık ayrı bir sunucu başlatın.
2. GUIDE_DATABASE_URL, DEMO_PASSWORD ve BASE_URL değerlerini o süreç için tanımlayın. Bu değişkenleri belge veya ekran görüntüsüne koymayın.
3. merit klasöründe npm run kilavuz:resim çalıştırın. Ayrı Playwright yapılandırması normal test süitine dahil değildir; veritabanını sıfırlamaz.
4. Oluşan PNG'leri gözle kontrol edin; npm run check bağlantı, boyut ve içerik kapılarını denetler.

Görüntü kataloğu: merit/tests/e2e/guide/shots.ts. Masaüstü 1280×800, KDS 1280×720, saha ve misafir 390×844. Saat ve oturum sayaçları maskelenir. Çekim sırasında uygulama/izin/oturum hatası olursa komut başarısız olur; boş ekran sessizce kabul edilmez.
