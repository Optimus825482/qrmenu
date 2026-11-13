# Merit OS ekip denetimi — görevler

- [x] Güncel kod, çalışma ağacı, devir ve ortak hafıza kontrolü.
- [x] Her dış ajana ayrı hedefli görev gönderimi; otomatik birleştirme hatasının giderilmesi.
- [x] Kullanıcının hiyerarşi ve yetki beklentilerinin kabul ölçütlerine yazılması.
- [x] Claude Code/Fable: kullanıcı/rol/ekip denetim raporu ve çapraz değerlendirme alındı.
- [x] ZCode: QR sipariş/oda servisi denetim raporu ve bildirim düzeltmeleri alındı.
- [x] Particle: minibar/stok denetim raporu ve gerçek servisle hedefli test sonucu alındı.
- [x] Antigravity: statik stüdyo/mobil/arayüz raporları alındı; tarayıcı doğrulaması ayrı sürüyor.
- [ ] Codex: bağımsız yetki, raporlama/radar, oturum ve işletim incelemesi.
- [ ] Gelen bulguların kaynak üzerinden doğrulanması; eski denetim maddeleriyle eşleme.
- [ ] Koordineli hedefli testler ve gereken tarayıcı senaryoları; yapılan/yapılmayan kontrollerin kaydı.
- [ ] Nihai bulgu raporu ve öncelikli düzeltme sırası.

## Kabul kapıları

- [ ] Üç otel için sipariş ve minibar kapsamı incelendi.
- [ ] Üst yönetici, oda servisi sorumlusu, outlet sorumlusu ve saha personeli pozitif/negatif yetki örnekleri değerlendirildi.
- [ ] Ekran yetkisi devri, otel/outlet/ekip sınırları ve üst rolü yönetme engelleri değerlendirildi.
- [ ] Her önemli bulgunun yeniden üretim adımı veya açıkça belirtilmiş statik kod kanıtı var.
- [ ] Rapor alınmayan veya çalıştırılamayan kontrol tamamlandı olarak işaretlenmedi.

## Son doğrulanan dış ajan durumu

Ekip teslimleri alındı. Fable: ortak personel 8/8, garson hata bildirimi 5/5, tema atama ve matris testleri 23/23. Gemini: iframe dil/yön düzeltmesi üç tarayıcı testi, UX/rehber/token 36/36. Particle: iade hesabı 7/7, radar demo 25/25; ek stok hareketi önerisi geri çekildi. ZCode: bildirim değişiklikleri 60/60; kaynak değiştirmeden yeni süreçte SLA/kapsama tekrarı 40/40. Bunlar sahiplerinin bildirdiği sonuçlardır; kaynak diff'leri ayrıca Codex tarafından inceleniyor.

Codex ilk `npm run check`: lint sıfır hata (43 uyarı), tip kontrolü geçti. Test koşusu 300 dosyada 288 geçti / 12 başarısız, 3171 test geçti / 17 başarısız / 13 atlandı; süre 2749,51 saniye. Koşu sırasında kaynaklar değiştiğinden bu sonuç son sabit sürümün kabulü değildir. Ayrıca demo testi, Codex'in test DB adını eğitim adı kuralına uygun bulmadı. Koruma değiştirilmedi; yalnız Codex'e ait DB `merit_test_codex1794532126793` olarak yeniden adlandırıldı. Güncel sabit dosyalarda 20 hedefli test filtresi yeni süreçte çalışıyor; lint/tip kontrolü ayrı süreçte tekrarlanıyor. Nihai sonuç bekleniyor; commit/push/deploy yok.

## Kullanıcı kararları

- [x] Geçici şifre davranışı bu çalışmada değiştirilmeyecek; Fable'a iletildi.
- [x] Ajanların iletişim paneli bu denetimden sonra ayrı tasarlanacak; bu tur manuel tetikleme.
- [x] Doğrulanmış hatalar küçük değişikliklerle düzeltilebilir; yanlış bulgular sahiplerine nazikçe bildirilecek.
- [ ] Fazla iade için yalnız denetim kaydı iyileştirmesi: hareket/bakiye hesabından ayrı değerlendirilecek.
- [ ] Yetki devri ve otel bazlı açık ret gereksinimleri için dar uygulama tasarımı; üst rol/ekip sınırı korunmalı.

## Yeni süreçte son regresyon

- [x] İlk tam koşudaki 12 başarısız dosyanın tümü ve ilgili ek regresyonlar: 20 dosya, 206/206 test geçti (216,79 sn).
- [x] Güncel lint: 0 hata, 43 mevcut uyarı; typecheck geçti.
- [x] SLA/kapsama eski-yeni süreç farkı taze Codex koşusunda tekrarlanmadı.
- [x] Demo eğitim DB adı koruması korunarak demo testi geçti.
- [x] Güncel birleşik üretim build başarılı (exit 0); dinamik dosya erişimi izleme konusunda dört Turbopack uyarısı var.

Kullanıcı commit/push görevini doğrudan Fable'a verdi; Codex paralel commit veya push başlatmayacak. Rapor ve görev kayıtları proje içinde kaldı; D sürücüsüne proje dışı görsel üretilemedi ve kaydedilmedi. Kullanıcı dağıtımdan sonra manuel test yapacak.

206/206 sonucu yeni bir tam 300 dosyalık koşu değildir; ilk tam koşunun başarısızlarının ve değişen alanların hedefli tekrarıdır. Açık YET-01/02/03 gereksinim farkları raporda kalır.
