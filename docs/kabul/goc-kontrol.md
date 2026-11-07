# Canlı göç kontrolü

K09, küçük ve tamamen sentetik bir PostgreSQL kaynağıyla çalışır. Kaynakta üç otel, iki kat, altı oda, dört ürün, iki setup, eski Werkzeug parolalı kullanıcı, beş minibar işlemi, iki MyBar talebi ve bir DND bulunur. Test; kuru çalışmanın veri yazmadığını, rapordaki sayı farklarının sıfır olduğunu, havuz bakiyelerini, tekrar aktarımın aynı sonuç verdiğini, altı haneli eski oda QR'ını ve ilk girişte parolanın yükseltildiğini doğrular.

**Gerçek dump gelene kadar K09 yalnız sentetik fixture ile kanıtlanmıştır.** Sentetik test sonucu canlı kaynak için kabul veya aktarım izni sayılmaz.

## Canlı kaynak geldiğinde

1. Erkan'ın sağladığı yedeği, üretimden ayrı ve erişimi sınırlı bir `minibar_legacy` veritabanına `pg_restore` ile yükleyin. Dosyanın sağlama değerini, tarihini ve kaynağını kaydedin.
2. Hedefin yedeğini alın; ayrı bir deneme hedefinde tüm Prisma migration'larını ve temel seed'i uygulayın. Gerçek parolaları komut geçmişine veya rapora yazmayın; bağlantıları ortamdan sağlayın.
3. `npm run migrate:legacy -- --dry-run --report <rapor-yolu>` çalıştırın. Otel eşlemesi otomatik bulunamıyorsa raporu inceleyerek `--hotel-map` verin. Kaynak salt okunurdur; kuru çalıştırma hedef değişikliklerini geri alır.
4. Raporun her varlık satırında hata ve farkın sıfır olduğunu doğrulayın. Havuzda toplam eksi kullanılan eşittir kalan olmalıdır. Atlanan, birleştirilen, yetim ve dönüştürülen kayıtları ayrı ayrı sınıflandırın; yalnız sıfır sayı farkı veri anlamının korunduğunu kanıtlamaz.
5. Spec §16 açık noktalarını; eski QR örneklerini, oda tipi/setup eşlemesini, görev/DND günlerini, MyBar durumlarını, personel parolalarını ve rapor toplamlarını otel yetkilisiyle inceleyin. Çözülmeyen fark varken gerçek aktarım yapmayın.
6. Onaydan sonra yalnız Erkan gerçek aktarımı yapar. Aynı kaynağı tekrar aktararak satır ve eşleme sayılarının değişmediğini kontrol edin. Misafir QR'ları ve yetkili personel girişini sahada doğrulayın; anahtar/parola rotasyonunu kurulum kılavuzuna göre yapın.

## İmza kaydı

| Alan | Kayıt |
|---|---|
| Kaynak yedek tarihi ve sağlama değeri | Canlı yedek tesliminde doldurulur |
| Deneme hedefi ve rapor yolu | Deneme sırasında doldurulur |
| Çözümlenen farklar ve kabul edilen dönüşümler | Otel yetkilisiyle kaydedilir |
| Onay veren / tarih / imza | Gerçek aktarım öncesinde doldurulur |
| Aktarımı yapan / tarih | Gerçek aktarım sonrasında doldurulur |
