# Web.dev “Duyarlı Tasarımı Öğrenme” — Türkçe Rehber

> Bu belge, kullanıcı tarafından paylaşılan listedeki 17 web.dev sayfasının ana ilkelerini Türkçe olarak özetler. Kaynak metinlerin birebir çevirisi/kopyası değildir; uygulamaya dönük sentez, örnekler ve kontrol listesi sunar.

## İçindekiler

1. [Hoş geldiniz](#1-hoş-geldiniz)
2. [Giriş](#2-giriş)
3. [Medya sorguları](#3-medya-sorguları)
4. [Uluslararasılaştırma](#4-uluslararasılaştırma)
5. [Makro düzenler](#5-makro-düzenler)
6. [Mikro düzenler](#6-mikro-düzenler)
7. [Tipografi](#7-tipografi)
8. [Duyarlı görseller](#8-duyarlı-görseller)
9. [picture öğesi](#9-picture-öğesi)
10. [Simgeler](#10-simgeler)
11. [Tema oluşturma](#11-tema-oluşturma)
12. [Erişilebilirlik](#12-erişilebilirlik)
13. [Etkileşim](#13-etkileşim)
14. [Kullanıcı arayüzü kalıpları](#14-kullanıcı-arayüzü-kalıpları)
15. [Medya özellikleri](#15-medya-özellikleri)
16. [Ekran yapılandırmaları](#16-ekran-yapılandırmaları)
17. [Sonuç](#17-sonuç)

## Genel yaklaşım

Duyarlı tasarım, birkaç telefon/tablet/masaüstü ölçüsüne göre sayfayı küçültmek değildir. İçerik ve etkileşimler kullanılabilir alana, yazma yönüne, giriş cihazına, erişilebilirlik tercihlerine ve ekran biçimine uyum sağlamalıdır.

Önerilen sıra: içeriği ve temel görevleri belirle; dar alanda anlamlı bir akış kur; akışkan düzen kullan; yalnız içeriğin gerçekten istediği yerde medya/kapsayıcı sorgusu ekle; metinleri, görselleri ve etkileşimleri kullanıcı tercihleriyle test et.

---

## 1. Hoş geldiniz

[Duyarlı Tasarımı Öğrenme'ye hoş geldiniz](https://web.dev/learn/design/welcome?hl=tr)

Web, pek çok işletim sistemi ve donanımda çalışır. Duyarlı tasarım, bu çeşitlilik içinde içeriğin ve işlevlerin erişilebilir kalmasını amaçlar. Kurs, düzenle sınırlı değildir; görseller, tipografi, erişilebilirlik, etkileşim ve kullanıcı tercihleri de tasarımın parçasıdır.

**Uygulama:** Cihaz maketinden önce içerik ve kullanıcı görevleriyle başla. Her bölümde aynı içeriği farklı alan ve giriş yöntemlerinde doğrula.

## 2. Giriş

[Giriş](https://web.dev/learn/design/intro?hl=tr)

- **Sabit genişlikli düzen** belirli ölçüye dayanır; küçükte taşar, büyükte gereksiz boşluk bırakabilir.
- **Akışkan düzen** kullanılabilir alana göre esner ama tek başına satır uzunluğu veya bileşen yoğunluğunu çözmez.
- **Uyarlanabilir düzen** birkaç sabit düzen arasında kesme noktalarında geçiş yapar; bu noktalar arasındaki alanlar yine sorunlu olabilir.
- **Duyarlı düzen** akışkan ızgara, esnek medya ve gerekli kesme noktalarını birlikte kullanır.

Mobil tarayıcıya sayfanın gerçek görünüm alanını bildir:

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

Viewport meta etiketi yoksa mobil tarayıcı sayfayı daha geniş bir sanal alanda oluşturup küçültebilir. Kesme noktalarını cihaz isimlerine göre değil, içeriğin ne zaman sıkıştığına göre seç.

## 3. Medya sorguları

[Medya sorguları](https://web.dev/learn/design/media-queries?hl=tr)

Medya sorguları, koşula bağlı CSS uygular. Ekran dışında baskı gibi çıktı ortamları da hedeflenebilir:

```css
@media print {
  body { color: #000; background: transparent; }
}
```

Genişlik, yükseklik, yön ve oran yaygın özelliklerdir. Birden çok koşul `and` ile birleştirilebilir; modern aralık sözdizimi de kullanılabilir:

```css
@media (min-width: 48rem) {
  .page { grid-template-columns: 2fr 1fr; }
}

@media (40rem <= width <= 70rem) {
  .page { gap: 2rem; }
}
```

Metin ağırlıklı tasarımlarda `em`/`rem` gibi göreli eşikler çoğu zaman pikselden daha uyumlu olur. Her medya sorgusu için ayrı stil dosyası açmak yerine genellikle aynı stil sayfasındaki `@media` yeterlidir. Sayfa düzenindeki değişiklikler medya sorgusuna, tek bir bileşenin kendi alanına göre değişmesi ise [kapsayıcı sorgusuna](#6-mikro-düzenler) daha uygundur.

## 4. Uluslararasılaştırma

[Uluslararası hale getirme](https://web.dev/learn/design/internationalization?hl=tr)

Çeviri; uzunluğu değişen metinleri, özel karakterleri, yazma yönünü, tarih ve sayı biçimlerini hesaba katmalıdır. Fiziksel yön bildiren `left`/`right` ve `margin-left` yerine yazma akışına göre çalışan mantıksal CSS özelliklerini tercih et:

```css
.label {
  margin-inline-end: 0.5rem;
  text-align: start;
}

.panel {
  padding-block: 1rem;
  padding-inline: 1.25rem;
}
```

Yaygın eşleştirmeler: `margin-left/right` → `margin-inline-start/end`; `top/bottom` → `block-start/end`; `text-align: left/right` → `start/end`. Grid ve Flexbox çoğunlukla mantıksal akışla uyumludur.

Belge dilini ve yönünü semantik olarak belirt. Bu sayfanın dili Türkçe olduğundan örnek `lang` değeri de Türkçe olmalıdır:

```html
<html lang="tr" dir="ltr">
  <p>Türkçe içerik.</p>
  <p>Başka dilde ifade: <span lang="de">Guten Tag</span></p>
  <a href="/ar/" hreflang="ar" lang="ar">العربية</a>
</html>
```

`lang` ekran okuyucu ve konuşma sentezinin telaffuzunu destekler. `hreflang` bağlantının hedef dilini bildirir. Sağdan sola düzeni `dir="rtl"` ile sınayabilir; simgeleri, formları, tabloları ve yönlü yerleşimleri de gözden geçirebilirsin.

## 5. Makro düzenler

[Makro düzenleri](https://web.dev/learn/design/macro-layouts?hl=tr)

Makro düzen, başlık, ana içerik, yan panel ve alt bilgi gibi sayfanın üst düzey bölgeleridir. Önce dar ekranda semantik belge sırasını doğru kur; geniş düzende bunu Grid veya Flexbox ile geliştir.

```css
.page {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 48rem) {
  .page {
    grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
  }
}
```

Kart sayısını belirli kesme noktalarında tek tek tanımlamak yerine, uygun sütun sayısını Grid’e buldurabilirsin:

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: 1rem;
}
```

Grid satır ve sütun hizalamasında; Flexbox çoğunlukla tek eksende akış, sarma ve esnemede uygundur. Her ikisi de makro veya mikro düzenlerde kullanılabilir.

## 6. Mikro düzenler

[Mikro düzenler](https://web.dev/learn/design/micro-layouts?hl=tr)

Mikro düzen, kart, medya nesnesi, form satırı veya başlık gibi bileşenin kendi iç yerleşimidir. Aynı bileşen ana içerikte geniş, yan panelde dar olabilir. Bu durumda yalnız viewport’u sorgulamak bileşenin gerçek alanını yansıtmayabilir.

Kapsayıcı sorgusunda sorgulanacak öğeye `container-type` verilir; bileşen, içinde bulunduğu kapsayıcının boyutuna göre düzenlenir:

```css
.media-list {
  container-type: inline-size;
}

.media {
  display: grid;
  gap: 1rem;
}

@container (min-width: 28rem) {
  .media {
    grid-template-columns: minmax(8rem, 1fr) 3fr;
    align-items: center;
  }
}
```

Sayfanın genel sütun düzeni için medya sorgusu; kartın bulunduğu alana göre iç yerleşiminin değişmesi için kapsayıcı sorgusu düşün.

## 7. Tipografi

[Yazı biçimi](https://web.dev/learn/design/typography?hl=tr)

Okunabilirlik; font seçimi, boyut, satır uzunluğu, satır aralığı ve kullanıcı ayarlarının birlikte ele alınmasına bağlıdır. Sabit piksel boyutları metin büyütmeyi zorlaştırabilir. `rem` ve `ch` gibi göreli birimleri kullan.

Yazı boyutunu akışkanlaştırırken yalnızca `vw` kullanma; metin aşırı küçülebilir/büyüyebilir ve kullanıcı tercihine direnebilir. `clamp(min, ideal, max)` güvenli aralık sağlar:

```css
h1 {
  font-size: clamp(2rem, 1.25rem + 3vw, 3.5rem);
  line-height: 1.1;
}

.article {
  max-inline-size: 65ch;
  line-height: 1.6;
}
```

Uzun, tek sütunlu metin için 45–75 karakter civarı bir satır genişliği başlangıç aralığıdır; bunu gerçek font ve içerikle doğrula. Metin %200–%400 büyütüldüğünde taşma ve örtüşme oluşmamalı. Dilin aksanları ve özel karakterleri seçilen fontta bulunmalı.

## 8. Duyarlı görseller

[Uyumlu görseller](https://web.dev/learn/design/responsive-images?hl=tr)

Temel kural, görselin kutusunu aşmaması ve en-boy oranını korumasıdır:

```css
img {
  max-inline-size: 100%;
  block-size: auto;
}
```

- HTML `width`/`height` nitelikleri tarayıcının önceden alan ayırmasını sağlar; görsel yüklenirken içerik kaymasını azaltır.
- `aspect-ratio` sabit görsel kutusu kurar. `object-fit: contain` tüm resmi gösterir ve boşluk bırakabilir; `cover` kutuyu doldurur ve kırpar. `object-position` kırpmanın odağını ayarlar.
- Aynı görselin farklı boyutları için `srcset`/`sizes` sun; tarayıcı uygun adayı seçsin.
- Ekran altındaki görseller için `loading="lazy"` uygundur. İlk ekrandaki ana görseli geciktirme.
- `fetchpriority` gibi yükleme ipuçlarını hedefli kullan; her görsele aynı önceliği verme.
- Önemli görsele anlamlı `alt`, dekoratif görsele boş `alt=""` ver.

```html
<img
  src="/item-480.webp"
  srcset="/item-480.webp 480w, /item-960.webp 960w"
  sizes="(min-width: 60rem) 50vw, 100vw"
  width="960" height="640"
  alt="Ahşap masada servis edilen kahvaltı tabağı"
  loading="lazy">
```

`sizes` değeri gerçek yerleşim genişliğiyle uyuşmalı; aksi halde uygun olmayan dosya indirilebilir.

## 9. picture öğesi

[Resim öğesi](https://web.dev/learn/design/picture-element?hl=tr)

`srcset` genellikle aynı görselin farklı boyut/yoğunluk adaylarını sunar ve tarayıcı seçim yapar. `picture`, koşula göre farklı kaynak veya farklı kırpım (art direction) seçtirir. İçinde fallback olarak bir `img` bulunması gerekir:

```html
<picture>
  <source srcset="/image.avif" type="image/avif">
  <source srcset="/image.webp" type="image/webp">
  <img src="/image.jpg" width="1200" height="800" alt="Ürün açıklaması">
</picture>
```

Dar ve geniş alanlarda farklı kırpım sunmak:

```html
<picture>
  <source media="(min-width: 50rem)" srcset="/hero-wide.webp">
  <img src="/hero-portrait.webp" width="700" height="900" alt="Ürünü kullanan kişi">
</picture>
```

Kaynak sırası desteklenen ilk seçeneğin kullanılmasını sağlar; son `img` genel fallback’tir. Kırpım değiştiğinde görselin anlamı ve `alt` açıklaması da doğru kalmalı.

## 10. Simgeler

[Simgeler](https://web.dev/learn/design/icons?hl=tr)

SVG ölçeklenebilir ve kolay biçimlenebilir. Simgenin dekoratif mi yoksa tek başına işlev mi bildirdiğini belirle:

- Metin etiketli düğmenin yanındaki ikon dekoratifse `alt=""` veya `aria-hidden="true"` kullan.
- Yalnız simgeli düğmeye anlaşılır erişilebilir ad ver. Örn. “üç çizgi” değil “Menüyü aç”.
- CSS arka plan görseli dekoratif içerik içindir; erişilebilir adı olan işlevsel kontrolün yerine geçmez.
- Simgelerin anlamının herkes için açık olduğunu varsayma; kullanıcılarla doğrula.
- Aynı SVG’yi tekrar tekrar DOM’a kopyalamak yerine uygun sembol tekrar kullanımını değerlendir.

```html
<button type="button" aria-label="Menüyü aç">
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
</button>
```

## 11. Tema oluşturma

[Tema oluşturma](https://web.dev/learn/design/theming?hl=tr)

Renkleri tasarım tokenlarıyla merkezi yönet. Sistem açık/koyu tercihini başlangıç kabul edebilir ve uygulama içi seçim ekleyebilirsin. Form kontrollerinin renk şeması da temayla uyumlu olmalı:

```css
:root {
  color-scheme: light dark;
  --page: #fff;
  --ink: #1b1b1b;
  --surface: #f3f4f6;
}

@media (prefers-color-scheme: dark) {
  :root {
    --page: #151515;
    --ink: #f4f4f4;
    --surface: #242424;
  }
}

body {
  color: var(--ink);
  background: var(--page);
}
```

CSS özel özellikleri renkleri güncellemeyi kolaylaştırır. SVG de aynı tokenları kullanabilir. Fotoğrafları koyu modda otomatik karartmak içeriğin anlamını/renk doğruluğunu bozabilir; harita veya şema gibi görseller için alternatif kaynak gerekebilir. `accent-color` checkbox/radio gibi kontrolleri markaya uydurmaya yarar; kontrastı ayrıca test et. Tarayıcı tema rengi için HTML meta etiketi ve manifest değerlerini de tutarlı yönet.

## 12. Erişilebilirlik

[Erişilebilirlik](https://web.dev/learn/design/accessibility?hl=tr)

Erişilebilirlik, farklı ekran boyutlarına sığmaktan fazlasıdır:

- Durumu yalnız renkle anlatma; metin/şekil gibi başka ipuçları da sun.
- Metin ve arka plan kontrastını test et; her ikisini de açıkça tanımla.
- Yüksek kontrast/zorlanmış renk ayarlarında kenarlık, ikon ve odak anlamını koru.
- Göreli font boyutları ve yeniden akış kullan; büyütülmüş metinde yatay taşma olmasın.
- Tüm işlevleri klavyeyle kullanılabilir yap. `:focus-visible` ile belirgin odak stili ver.
- Görsel sıra ile DOM/klavye sırası uyumlu olsun; CSS `order` ile görsel yer değiştirmek odak sırasını bozabilir.
- `prefers-reduced-motion` tercihinde dekoratif animasyonları azalt veya kaldır.
- Otomatik araçlar yardımcıdır; klavye, ekran okuyucu ve gerçek kullanıcı kontrollerinin yerine geçmez.

```css
:focus-visible {
  outline: 3px solid currentColor;
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 13. Etkileşim

[Etkileşim](https://web.dev/learn/design/interaction?hl=tr)

Ekran büyüklüğü giriş türünü söylemez: dizüstü dokunmatik, tablet klavyeli/fareli, masaüstü dokunmatik olabilir. `pointer`/`any-pointer` ile hassas veya kaba işaretçiyi; `hover`/`any-hover` ile üzerine gelme olanağını sorgula.

- `pointer: coarse` parmak gibi daha az hassas birincil işaretçiyi belirtir; hedefler daha geniş olmalı.
- `pointer: fine` hassas fare/kalemi anlatabilir.
- `any-pointer` cihazdaki diğer girişleri de hesaba katar; aynı anda hem fine hem coarse eşleşebilir.
- Hover’da açılan kontrol klavye odağında da görünmeli; önemli içerik yalnız hover arkasına gizlenmemeli.
- Sanal klavyede doğru düzen için `type="email"`, `tel`, `url` gibi semantik input türleri; sayı girişi için uygun `inputmode` kullan.

```css
.more { visibility: visible; }

@media (hover: hover) {
  .more { visibility: hidden; }
  .card:is(:hover, :focus-within) .more {
    visibility: visible;
  }
}
```

## 14. Kullanıcı arayüzü kalıpları

[Kullanıcı arayüzü kalıpları](https://web.dev/learn/design/ui-patterns?hl=tr)

Dar ekranda kart şeridi yatay kaydırılabilir; geniş ekranda aynı içerik ızgaraya dönüşebilir. Kullanıcıya kenarın ötesinde içerik bulunduğu gösterilmeli:

```css
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 1rem;
}

@media (max-width: 40rem) {
  .cards {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: inline mandatory;
  }
  .cards > * {
    flex: 0 0 min(85vw, 20rem);
    scroll-snap-align: start;
  }
}
```

Scroll snap hizalama sağlayabilir; otomatik kaydırma ise özellikle kullanıcı metin okurken rahatsız edici olabilir. Otomatik oynatma şart değilse ekleme. Veri tablolarını semantik `table` olarak bırak; dar ekranda sarmalayıcıya yatay kaydırma ver. Taşan içeriğe gerçekten erişilebildiğini ve klavyeyle kullanılabildiğini kontrol et. İkincil işlem açıklamaları kısaltılabilir; kritik bilgi sadece simgeyle veya gizli bir etkileşimle sunulmamalı.

## 15. Medya özellikleri

[Medya özellikleri](https://web.dev/learn/design/media-features?hl=tr)

Medya sorguları yalnız genişlik değildir. Kullanılabilir alanı, yön/oranı, renk yeteneğini, erişilebilirlik tercihlerini, giriş türünü veya PWA görüntü modunu sorgulayabilir:

- Görünüm alanı: `width`, `height`, `orientation`, `aspect-ratio`.
- Kullanıcı tercihi: `prefers-color-scheme`, `prefers-contrast`, `prefers-reduced-motion`, `forced-colors`.
- Etkileşim: `pointer`, `any-pointer`, `hover`, `any-hover`.
- Çıktı/ekran: `print`, `resolution`, `update` gibi özellikler.
- Kurulu PWA modu: `display-mode`.

```css
@media (prefers-color-scheme: dark) {
  :root { color-scheme: dark; }
}

@media (prefers-reduced-motion: reduce) {
  .animated { animation: none; transition: none; }
}

@media (display-mode: standalone) {
  .install-hint { display: none; }
}
```

Sorguları kullanıcı deneyimini gerçekten iyileştirdikleri yerde kullan. Uyumluluk değişebileceği için kritik özellikte güncel destek ve fallback kontrol et. `orientation: landscape` cihaz yönü anlamına gelmek zorunda değildir; yatay pencere kullanan masaüstünde de eşleşebilir.

## 16. Ekran yapılandırmaları

[Ekran yapılandırmaları](https://web.dev/learn/design/screen-configurations?hl=tr)

Duyarlı tasarım; çentik, yuvarlatılmış köşe, katlanabilir/çift ekran ve bölünmüş pencere gibi biçimleri de hesaba katar. Semantik HTML ve esnek yerleşim, gelecekte çıkabilecek cihazlarda da dayanıklılık sağlar.

Sayfayı kenarlara kadar genişletiyorsan kritik içeriği çentik/OS alanı altında bırakma. `viewport-fit=cover` ile tüm alana çizim yapıldığında safe-area değerleriyle boşluk bırak:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
.app-shell {
  padding:
    max(1rem, env(safe-area-inset-top))
    max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom))
    max(1rem, env(safe-area-inset-left));
}
```

Katlanabilir ekranlarda viewport segmentlerini bildiren CSS özellikleri/ortam değişkenleri iki bölgeye farklı içerik yerleştirmeye yardımcı olabilir. Destek ve standardizasyonu hedef cihazlarda doğrula; temel işlevi bu özelliklerin varlığına bağlama.

## 17. Sonuç

[Sonuç ve sonraki adımlar](https://web.dev/learn/design/conclusion?hl=tr)

Duyarlı tasarım bir dizi ekran ölçüsü değil, değişken koşullara uyumlu web deneyimleri kurma zihniyetidir. İleri çalışma için CSS, MDN ve web.dev’in pratik düzen örnekleri izlenebilir.

---

## Uygulama kontrol listesi

### Düzen ve içerik
- [ ] Viewport meta etiketi var; dar genişlikte içerik yatay taşmıyor.
- [ ] Semantik DOM sırası küçük ekranda ve klavyede mantıklı.
- [ ] Grid/Flexbox akışkan kullanılıyor; kesme noktaları içerikten türetilmiş.
- [ ] Bileşenler farklı kapsayıcı genişliklerinde çalışıyor.
- [ ] Uzun çeviri, RTL ve özel karakterlerle kontrol edildi.

### Görsel ve tipografi
- [ ] Görseller oranını koruyor; boyut nitelikleri ve uygun alt metinleri var.
- [ ] Farklı boyut için `srcset`/`sizes`, farklı kırpım/format için `picture` değerlendirildi.
- [ ] Ekran altı görseller gerektiğinde lazy; hero görseli geciktirilmiyor.
- [ ] Kullanıcı fontu büyütünce düzen kırılmıyor; satır genişliği okunabilir.

### Erişilebilir etkileşim ve cihaz
- [ ] Dokunma, fare/kalem ve klavye ile işlevler kullanılabiliyor.
- [ ] Odak göstergesi, renk kontrastı, azaltılmış hareket ve yüksek kontrast dikkate alındı.
- [ ] Önemli bilgi yalnız renk/hover/simgeyle aktarılmıyor.
- [ ] Açık/koyu tema, safe-area ve PWA görüntü modu hedefleniyorsa doğrulandı.
- [ ] Yeni ekran API’leri desteklenmediğinde temel deneyim sağlam kalıyor.

## Kaynakların tam listesi

| # | Bölüm | Kaynak |
|---:|---|---|
| 1 | Hoş geldiniz | [web.dev](https://web.dev/learn/design/welcome?hl=tr) |
| 2 | Giriş | [web.dev](https://web.dev/learn/design/intro?hl=tr) |
| 3 | Medya sorguları | [web.dev](https://web.dev/learn/design/media-queries?hl=tr) |
| 4 | Uluslararası hale getirme | [web.dev](https://web.dev/learn/design/internationalization?hl=tr) |
| 5 | Makro düzenler | [web.dev](https://web.dev/learn/design/macro-layouts?hl=tr) |
| 6 | Mikro düzenler | [web.dev](https://web.dev/learn/design/micro-layouts?hl=tr) |
| 7 | Yazı biçimi | [web.dev](https://web.dev/learn/design/typography?hl=tr) |
| 8 | Uyumlu görseller | [web.dev](https://web.dev/learn/design/responsive-images?hl=tr) |
| 9 | Resim öğesi | [web.dev](https://web.dev/learn/design/picture-element?hl=tr) |
| 10 | Simgeler | [web.dev](https://web.dev/learn/design/icons?hl=tr) |
| 11 | Tema oluşturma | [web.dev](https://web.dev/learn/design/theming?hl=tr) |
| 12 | Erişilebilirlik | [web.dev](https://web.dev/learn/design/accessibility?hl=tr) |
| 13 | Etkileşim | [web.dev](https://web.dev/learn/design/interaction?hl=tr) |
| 14 | Kullanıcı arayüzü kalıpları | [web.dev](https://web.dev/learn/design/ui-patterns?hl=tr) |
| 15 | Medya özellikleri | [web.dev](https://web.dev/learn/design/media-features?hl=tr) |
| 16 | Ekran yapılandırmaları | [web.dev](https://web.dev/learn/design/screen-configurations?hl=tr) |
| 17 | Sonuç ve sonraki adımlar | [web.dev](https://web.dev/learn/design/conclusion?hl=tr) |

*İnceleme tarihi: 1 Kasım 2026. Özellikle katlanabilir ekranlar ve yeni medya özellikleri için kullanmadan önce güncel tarayıcı uyumluluğunu kontrol et.*
