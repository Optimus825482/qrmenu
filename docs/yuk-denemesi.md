# Yük denemesi

7 Kasım 2026 P8 T4 kapsamı: ayrılmış yerel DB, ayrılmış port ve üretim derlemesi üzerinde smoke. Gerçek otel veya uzak hedef test edilmedi; `LOAD_ALLOW_HOST` ayarlanmadı. Tam 300 misafir + 40 personel + 5 radar kabulü bu yerel smoke ile kanıtlanmış sayılmaz.

## Araç ve korumalar

Kurulum ve komutlar: [yük aracı](../merit/tools/load/README.md). Araç undici ile HTTP ve SSE, gerçek personel oturumu için Playwright, isteğe bağlı GET doygunluk taraması için autocannon kullanır. Hedef DB adı `_load|_test|_egitim` ile bitmeli; koruma ağ isteği veya seed'den önce çalışır. Hedef dosyası, raporlar ve geçici çalışma değerleri Git dışında tutulur. Raporda parola, çerez veya QR tokenı yoktur.

## Havuz ve NAT

Uygulama havuzu varsayılan 20 (`DB_POOL_MAX`, aralık 5–100), pg-boss 4 ve LISTEN 1 bağlantı olarak sınırlandı. Bağlantı kurma zaman aşımı 5 saniye, boşta kalma zaman aşımı 30 saniyedir. PostgreSQL'in 100 bağlantılık varsayılan sınırı altında yaklaşık 25 uygulama bağlantısı hedeflenir; gerçek tepe ölçümü aşağıda raporlanır.

`guest.ipRateMultiplier` sistem düzeyinde 1–20 aralığında kalır; 30 saniye önbelleği eşzamanlı istekleri tek okuma altında toplar. `settings.changed` veya dinleyici yeniden eşitlemesi önbelleği sıfırlar. Masa siparişi ve bilinmeyen token IP sınırı mevcut MyBar/oda siparişi çarpanına bağlandı. Masa başına çağrı ve giriş sınırı değişmez. Ortak IP'de çarpan 1/5 için birim testi sırasıyla 10/50 sipariş iznini doğrular; bu, gerçek NAT yük ölçümü yerine geçmez.

## Yerel ölçüm

Ölçüm tamamlandıktan sonra gerçek sonuçlar bu bölüme eklenir. Başarılı olmayan veya koşulmayan senaryo yeşil gösterilmez.

## Tam yükte açık kanıtlar

- 300 misafir, 40 personel ve 5 radar ile 10 dakika, ≥335 ölçülmüş SSE zirvesi.
- Ortak IP'de çarpan 1 ile 429 oluşması; çarpan 5 ile 429 olmaması.
- Oda servisi ve MyBar personel kapatma zincirinin yük personasına eklenmesi.
- 4. dakikadaki 60 sipariş/30 saniye zirvesi ve POST doygunluk ölçümü.
- Sunucu yeniden başlatıldığında tüm istemcilerin 60 saniyede geri dönmesi.
- Sunucu RSS değerinin 3. ve 10. dakika arasında ≤%20 büyümesi.

Bu kanıtlar eksikken `load:full` tam kabul sonucu vermez. Yerel smoke yetkisi bu sahada yapılacak doğrulamaları kapatmaz.
