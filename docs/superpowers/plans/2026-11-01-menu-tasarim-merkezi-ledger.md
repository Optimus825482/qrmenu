# Menü Tasarım Merkezi — Uygulama Defteri

**Plan:** `2026-11-01-menu-tasarim-merkezi.md`  
**Tarih:** 1 Kasım 2026  
**Durum:** Uygulama ve güvenli doğrulamalar tamamlandı; T10 kabulü tamamlanmadı. Commit yok.

## Tamamlanan kapsam

- Outlet tasarımına tipografi, yoğunluk, karşılama stili/görseli, küratörlü fotoğraflar, arama ve filtre gösterimi eklendi. Ayarlar `OutletMenuDesign.options` içinde saklanıyor.
- Kontrast/kalite denetimi, yeni tema paketleri ve yayın öncesi sunucu tarafı kontrast engeli eklendi.
- Misafir menüsünün görsel sunumu ve canlı telefon önizlemesi tamamlandı. Tipografi, yoğunluk, fotoğraf düzeni ve Arapça yazı yığını için responsive stiller var. Karşılama fotoğrafında görsel/gradient/metin katman sırası düzeltildi.
- Outlet çağrı seçenekleri modeli, migration, server action, varsayılan seçenekler, misafir çağrı akışı ve çağrı alt sayfası eklendi. Mevcut outlet doldurması migration ile bir kez yapılır; yeni outlet varsayılanları idempotent eklenir.
- Outlet başına en çok sekiz aktif çağrı seçeneği denetimi eşzamanlı kayıt yarışını önlemek için outlet satırını kilitler.
- Stüdyoda Tasarım/Renkler/Garson çağrısı sekmeleri, çağrı seçenekleri CRUD/sıralama/aktif durumu, çeviri eksikliği göstergesi ve kalite paneli var.
- Misafir dili kapsamı Fransızca, Yunanca ve İtalyanca dahil sekiz dile genişletildi; i18n testleri güncellendi.
- Playwright kabul dosyasına 375 px Arapça RTL, çağrı alt sayfası ve dokunma hedefi ölçümü eklendi.
- `DEVIR.md`, README ve `ilerleme-data.js` güncellendi.

## Doğrulama

- Bu devam turunda hedefli birim testi: 7 dosya, 62 test başarılı. `npm run lint`, `npm run typecheck` ve `node --check ilerleme-data.js` başarılı.
- `npm run check` tam paketi tamamlanmadı; önceki koşuda `admin-roles.test.ts` ve `seed.test.ts` dahil görev dışı hatalar görüldü.
- `menuDesignCenter.spec.ts` izole `merit_menu_center_e2e` DB'si ve yeni Next.js sunucusunda çalıştırıldı: 7/8 geçti. Son testte bir aktif seçeneği kapatma sonrası satır aktif kaldı ve DB'de aktif değer korundu; UI hata mesajı da yoktu. `CallOptionsPanel.persist` içindeki hata mesajının `load()` ile silinmesi düzeltildi, fakat toggle arızasının kök nedeni henüz çözülmedi. Dolayısıyla yeni spec ve tam Playwright paketi kabul edilmedi; ekran görüntülü tarayıcı incelemesi de yapılmadı.
- **Veritabanı notu:** Bu E2E denemesi `tests/e2e/fixtures.ts` içindeki `resetAndSeed()` çağrısını yürüttü. Çalışma anındaki `.env` `DATABASE_URL` veritabanı `merit` olarak çözümlendi; fikstür tüm uygulama tablolarını temizleyip yeniden seed eder. Sonraki denemeler durduruldu. Önceki durum için geri yükleme yapılmadı; yedek varlığı/doğruluğu doğrulanmadı.
- Görsel tarayıcı incelemesi/ekran görüntüsü de bu turda yapılmadı.

## Çalışma ağacı ve devam

Depoda bu görevden önce gelen çok sayıda bağımsız değişiklik vardı (başlangıç ölçümü 216 değişiklik). Bunları içeren toplu commit yapılmadı; sadece bu işe ait dosyaları adlarıyla seçerek ayrı commit hazırlamak gerekir. `main` merge/push yok.

Kalan kabul adımları: ayrı ve doğrulanmış izole E2E veritabanı ile ayrı bir Next.js sunucusu yapılandır; önce çağrı seçeneği aç/kapa hatasını teşhis edip düzelt; sonra yeni spec ve tam Playwright suite'ini çalıştır; 375 px RTL ve telefon önizlemesinin ekran görüntülerini kontrol et. `npm run check` içindeki bilinen görev dışı test hatalarını ayrıca ayır. Kullanıcı verisini içerebilecek `merit` DB'sinde `resetAndSeed()` tekrar çalıştırılmamalı. Planın Task 0 commit onayı alınmadığından commit oluşturulmadı.
