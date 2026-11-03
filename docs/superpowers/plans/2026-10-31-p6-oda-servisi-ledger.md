# P6 Oda Servisi Uygulama Defteri

- T2R: Oda servisinde `ONAYLANDI → HAZIR` geçişi hazırlık zaman damgası olmadan çalışır. Masa KDS'sinde hazırlık şartı sürer. Telefon teyidi ayarı aynı transaction içinde okunur. Geçiş regresyonu düzeltmeden önce hatayı yeniden üretti.
- T3R: Misafir oda siparişi olayları otel, outlet, oda ve sipariş kimliğini birlikte doğrular. Sipariş oluşturma IP çarpanını kullanır. İptal bağımsız sabit hız sınırına tabidir. Ayar okuma hataları çağırana iletilir. Beş regresyon düzeltmeden önce hatayı yeniden üretti.
- T4a: Oda servisi metinleri sekiz etkin dile eklendi. ETA `{min}` parametresini kullanır. Oda servisi sipariş gönderme metni Seçimler terminolojisini izler. Bayrak ve misafir rotası T4c'ye bağlıdır.
- Doğrulama: T2R, T3R ve T4a birlikte sekiz dosyada 79/79 Vitest ve `tsc --noEmit` geçti. Dalın tam doğrulaması ve oda servisi kabulü açık.
