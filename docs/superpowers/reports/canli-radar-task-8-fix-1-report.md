# Radar T8 fix 1 raporu

## Uygulama

- `useOverview` yerel 15 sn sorgusu kaldırıldı. Genel Bakış tek radarStore içinden başlangıç/yenileme ve mevcut SSE olaylarının 1 sn birleştirmesiyle güncelleniyor; yeni SSE aboneliği yok. `useNow` yalnız süre metinleri için kaldı.
- `fetchOverview(hotelId)` → doğrulanan action → sunucu `radarOverview(ctx, hotelId)`. Tek otelde önce özgün kullanıcı kapsamı/yetki kontrolü, ardından yalnız seçili otelle toplayıcılar çalışıyor. ALL mevcut izin filtresini koruyor. Cache anahtarı seçili kapsamı içeriyor. Snapshot sözleşmesi değişmedi.
- Store nesli ve istek sırası geç/eski yanıtları eliyor; ayrıca tek otel sonucunu savunma amaçlı süzüyor. Root, store oteli seçimle eşleşmeden eski snapshot/kartı çizmez. Hata/yeniden deneme merkezi akışı kullanır.
- ALL kartının Kat/Masa açma eylemleri kartın açık katmanlarıyla sınırlandı; genel kapsam araç çubuğunda yalnız Genel Bakış olması artık kart geçişini kapatmıyor. Otel başlığı varsayılan uygun görünümü açar.
- Kat satırlarında mevcut `role="row"` korundu; hücreleri saran görsel flex kutusu `role="presentation"` ile erişilebilirlik ağacında saydamlaştırıldı. Böylece gridcell sahipliği satırdadır. Yerleşim, yoğunluk ve klavye geometrisi değişmedi.
- Boş uploads dizisi de “Doluluk yüklenmedi” durumunu gösterir. Bütün `[data-tone]` CSS kuralları `.rd-root` altında.
- Root `useId()` ile pencereye özel tab/panel kimlikleri üretir; Toolbar aynı öneki kullanır. Durum metni seçili oteli içerir; kullanıcı adı mevcut shell `Window.tsx` durum çubuğundan gelir. Shell dosyasına dokunulmadı.
- Controller tarafından `server/overview.ts` ve `ui/Toolbar.tsx` küçük ek kapsamı onaylandı. Replay/layers/minibar/sparkline ve P4 dosyalarına dokunulmadı.

## Rehberler

Önce modern-web-guidance SKILL.md ve controller tarafından önceden getirilmiş tam `modern-web-guidance.md` içindeki spatial-navigation, accessibility, css-layout bölümleri okundu. Yeniden ağ sorgusu gerekmedi.

- **accessibility** uygulandı: “Prefer `aria-labelledby` over `aria-label` when a visible label exists”. Sekme/panel ilişkisi korunup her pencereye ait kimliklerle bağlandı. “Mandatory - Don't suppress the roles of interactive elements”: presentation yalnız etkileşimsiz sarmalayıcıya verildi; gridcell ve row rolleri korundu.
- Modern Web Guidance skill DOM kuralı uygulandı: “generate per-instance IDs/`anchor-name`s (`useId()`)”. Sabit sekme/panel id çakışmaları kaldırıldı.
- **spatial-navigation** incelendi: “The active item has `tabindex="0"`.” Mevcut tek roving tab durağı korundu. Geometri/gezinme yeniden tasarımı bu sınırlı düzeltmeye eklenmedi.
- **css-layout** incelendi: “Don't use `grid-auto-flow: dense` on interactive content.” Hücre ve kart DOM sırası değiştirilmedi; yoğun yerleştirme eklenmedi.
- Yerel `pwa-mobile` düzen rehberi incelendi. Proje XP 24px/pos 44px yoğunlukları ve zoom korunuyor; genel 48px önerisi uygulanmadı, PWA özelliği eklenmedi.
- `merit/AGENTS.md` uyarısına göre mevcut Next `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` ve `use-server.md` tam okundu. Server dokümanı: “validate inputs, check authentication and authorization”. Mevcut server/client sınırı, Zod doğrulaması, requireUser ve kapsam kontrolü korundu.

## Statik inceleme

Yalnız kaynak/diff okuma ve rg kullanıldı. Action/dependency çağrı zinciri, ALL ve tek otel dalları, geç yanıt korumaları, kapsam geçişi render koruması, tüm tone seçicileri, tab/panel bağlantıları ve boş uploads dalı incelendi. `useOverview` referansı kalmadı; tek SSE subscribe akışı mevcut `useRadar`/store yaşam döngüsünde. UTF-8 ve LF yazımı kullanıldı. Çalışan test/lint/typecheck/check/build/DB/server komutu yok; test yazılmadı. Fable sahibi kullanıcı talimatı esas alındı.

## Fable devri

1. Tek otel overview action: izin verilen A oteli için response/metric collect/snapshot yalnız A; B/out-of-scope için FORBIDDEN, geçersiz giriş için doğrulama hatası. ALL yalnız izinli oteller ve katmanlar.
2. A→B→ALL hızlı seçim; eski snapshot/overview resolve/reject sıraları ters dönse bile eski kart/hata görünmemesi. Aynı kapsamda eski overview isteği yeni isteğin sonucunu ezmemeli.
3. Genel Bakış sekmesi aç/kapat beklemelerinde 15 sn yerel polling olmamalı. Başlangıç/F5/retry ve seçili otelin SSE olayları merkezi store overview yüklemesini tetiklemeli; başka otelin olayları tek otelin normal event yenilemesini tetiklememeli. Unmount abonelik/zamanlayıcı temizliği.
4. Snapshot başarılı/overview başarısız durumunda hata ve retry; daha önce yüklenen overview varken SSE overview hatasında son iyi kartların korunması; ALL bağlantı hata/iyileşme davranışı.
5. ALL kartından sadece mevcut/açık Kat/Masa katmanı için geçiş; tek otel varsayılan görünüm, izinli katmanlar, pencere başlığı ve seçili otel + shell kullanıcı adı durum metni.
6. İki RadarRoot/pencere birlikte: DOM id çakışması olmamalı, tab aria-controls ve panel aria-labelledby kendi pencere elemanına gitmeli.
7. Kat grid → row → gridcell erişilebilirlik ağacı, rowheader ve mevcut roving tab/ok/Home/End/Enter/Esc; 1366×768, 1920×1080 ve zoom kontrolleri.
8. uploads=[] ve hepsi EKSIK için boş durum; karışık/yüklenen durumlarda satırlar. Radar dışı `[data-tone]` öğesine radar tonu sızmaması.

## Sınırlar

Çalışma zamanı sonuçları iddia edilmiyor; Fable doğrulaması bekleniyor. Shell `needsHotel:false` için önceden “Otel: —” önekini basıyor; radarın seçili oteli status metninde ayrıca bulunur. Bu paylaşılan shell davranışı bu kapsamda değiştirilmedi.
