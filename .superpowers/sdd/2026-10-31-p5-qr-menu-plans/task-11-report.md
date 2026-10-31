# P5 Task 11 Raporu

**Görev:** `(ops)` personel kabuğu, garson ekranları ve masa ataması servisi  
**Dal:** `p5/qr-menu`  
**Durum:** Tamamlandı

## Yapılanlar

- Ortak personel kabuğu eklendi: outlet/otel/kullanıcı başlığı, SSE bağlantı rozeti, outlet seçici, çıkış ve mobil alt gezinme.
- Garson ekranı kuyruk, atanmış masalar ve açık çağrıları gösteriyor. Yetkisi olmayan garson için sipariş onayı kapalı; sipariş ve çağrı eylemleri sunucu aksiyonları üzerinden yürütülüyor.
- `/garson/cagrilar` ayrı çağrı görünümü olarak eklendi. 60 saniyeyi aşan çağrılar vurgulanıyor.
- Garson PWA manifesti eklendi ve `/garson` metadata'sına bağlandı.
- Masa ataması, kaldırma, toplu atama, atama listeleme ve kullanıcının masaları servisleri eklendi. Outlet üyeliği, kapsam/yetki, audit ve SSE olayları denetleniyor; toplu işlemde tüm çiftler yazma öncesi doğrulanıyor.
- Garson canlı yenilemesi, atama ve sipariş olaylarında kuyruk/çağrı/atanmış masa/açık sipariş verisini yeniliyor. Yeni sipariş sesi yalnız sipariş garson kuyruğunda görünüyorsa çalıyor.
- Outlet seçicinin oturum açmış kullanıcı tarafından kullanılabilmesi için hedef seçimi tam oturum çerezinden de kabul edildi; auth birim testi bu yolu doğruluyor.

## Doğrulama

- `npm run check` — başarılı: 69 test dosyası, 731 test.
- `npm run test:e2e -- tests/e2e/opsScreens.spec.ts` — başarılı: 1/1.
- `npm run build` — başarılı.

## Notlar ve riskler

- Build, `src/lib/uploads.ts` içindeki dinamik dosya sistemi erişimi nedeniyle bilinen üç Turbopack tracing uyarısı verdi. Build başarısını engellemedi; bu T11 değişikliği kaynaklı değil.
- Playwright dev sunucusu kapanırken `ECONNRESET` (`Error: aborted`) çıktısı verdi; test 1/1 başarılı tamamlandı.
- T11 birim testleri aktif tekil atamayı, aynı masaya yeniden atamada eski atamanın kapanmasını, üye/yetki reddini, `myTables` kapsamını ve beş masalık toplu atama ile geçersiz çiftte işlem bütünlüğünü kapsıyor.

## Rapor yolu

`.superpowers/sdd/2026-10-31-p5-qr-menu-plans/task-11-report.md`

## İnceleme düzeltme turu

İnceleme bulguları sonrası yapılan düzeltmeler:

- Outlet hedefi seçimi mevcut oturum çereziyle devam ederken `requireUser()` ile canlı sunucu oturumunu doğruluyor; kapatılmış (`CIKTI`) tam oturum yetkisiz döner. Auth regresyon testleri geçerli hedef geçişini ve kapalı oturum reddini kapsıyor.
- Garson SSE aboneliğine `order.prep`, `order.cancelled` ve `order.escalated` eklendi.
- `bulkAssign` tüm atamaları ve audit kaydını yazdıktan sonra SSE yayınlarını yapıyor; birim testi her yayın anında toplu audit kaydının transaction içinde bulunduğunu doğruluyor.
- Kasaya geçici temel masa-atama görünümü eklendi; outlet kapsamlı garson listesi mevcut `assignTableAction` üzerinden atanıyor. Atamasız siparişler, masanın güncel aktif atamasıyla yalnız atanan garson tarafından onaylanabiliyor.
- Garson/kasa alt sekmelerinde `sekme` sorgusu aktif durumu doğru belirliyor. Proxy istek yolunu güvenilir dahili başlıkla iletiyor; `(ops)` layout geçersiz oturumda giriş yönlendirmesinin `next` parametresini koruyor.
- Playwright uçtan uca senaryosu: misafir `/q/e2e-guest-m1` üzerinden `#1 · M1` siparişini gönderir; garson atama öncesi onayı göremez/etkinleştiremez; ayrı kasa oturumu M1'i `garson.havuz` kullanıcısına atar; garson onaylar ve `Masalarım` sekmesinde `ONAYLANDI` siparişini görür.

Düzeltme turu doğrulaması:

- Odaklı testler: auth + approvals + table-assignments, 3 dosya / 41 test başarılı.
- `npm run check`: 69 dosya / 733 test başarılı.
- `npm run test:e2e -- tests/e2e/opsScreens.spec.ts`: 1/1 başarılı.
- `npm run build`: başarılı; önceki üç `uploads.ts` Turbopack tracing uyarısı devam ediyor.
