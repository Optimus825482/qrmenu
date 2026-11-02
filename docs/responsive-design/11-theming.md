# Tema oluşturma

**Orijinal Kaynak:** [https://web.dev/learn/design/theming?hl=tr](https://web.dev/learn/design/theming?hl=tr)

---

Markalama bile duyarlı olabilir.
Web sitenizin sunumunu kullanıcının tercihine göre ayarlayabilirsiniz.
Ancak öncelikle web sitenizin markasını tarayıcıyı da içerecek şekilde nasıl genişleteceğinizi öğrenin.

## Tarayıcı arayüzünü özelleştirme

Bazı tarayıcılar, web sitenizin paletine göre tema rengi önermenize olanak tanır.
Tarayıcının arayüzü, önerdiğiniz renge uyum sağlar. Sayfalarınızın `head` bölümüne `theme-color` adlı bir `meta` öğesi ekleyerek rengi belirtin.

```
<meta name="theme-color" content="#00D494">
```

**Not:**  Bu tür stil bilgilerini CSS yerine HTML'ye yerleştirmek biraz garip olsa da bu sayede tarayıcı, CSS'yi beklemek yerine sayfa yüklendiği anda arayüzünü güncelleyebilir. 

![Clearleft dot com web sitesi.](https://web.dev/static/learn/design/theming/image/clearleft-dot-com-fc330772c30d.png?hl=tr)
![Resilient Web Design dot com web sitesi.](https://web.dev/static/learn/design/theming/image/resilient-web-design-dot-79ec7ad52532.png?hl=tr)
![The Session dot org web sitesi.](https://web.dev/static/learn/design/theming/image/the-session-dot-org-138442c2e4689.png?hl=tr)

Safari tarayıcısında üç web sitesi görüntüleniyor. Her temanın, tarayıcı arayüzüne yansıyan kendi tema rengi vardır.

`theme-color` değerini JavaScript kullanarak güncelleyebilirsiniz. Ancak bu gücü akıllıca kullanın.
Tarayıcılarının renk düzeni çok sık değiştiğinde kullanıcılar bu durumdan rahatsız olabilir.
Tema rengini ayarlamanın ince yollarını düşünün. Değişiklikler çok rahatsız ediciyse kullanıcılar sinirlenerek ayrılır.

[Web uygulaması manifest](https://developer.mozilla.org/docs/Web/Manifest) dosyasında tema rengi de belirtebilirsiniz.
Bu, web sitenizle ilgili meta verileri içeren bir JSON dosyasıdır.

Dokümanlarınızın `head` manifest dosyasının bağlantısı. `manifest` `rel` değerine sahip bir `link` öğesi kullanın.

```
<link rel="manifest" href="/manifest.json">
```

Manifest dosyasında, meta verilerinizi anahtar/değer çiftleri kullanarak listeleyin.

```
{
  "short_name": "Clearleft",
  "name": "Clearleft design agency",
  "start_url": "/",
  "background_color": "#00D494",
  "theme_color": "#00D494",
  "display": "standalone"
}
```

Bir ziyaretçi web sitenizi ana ekranına eklemeye karar verirse tarayıcı, uygun bir kısayol göstermek için manifest dosyanızdaki bilgileri kullanır.

**Not:**  [Web uygulaması manifesti ekleme](https://web.dev/articles/add-manifest?hl=tr) hakkında daha fazla bilgi edinin. 

## Koyu mod sunma

Birçok işletim sistemi, kullanıcıların açık veya koyu renk paleti tercihi belirtmesine olanak tanır. Bu nedenle, sitenizi kullanıcılarınızın tema tercihlerine göre optimize etmeniz iyi bir fikirdir.
Bu tercihe `prefers-color-scheme` adlı medya özelliğinden erişebilirsiniz.

```
@media (prefers-color-scheme: dark) {
  // Styles for a dark theme.
}
```

[  ](https://web.dev/static/learn/design/theming/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/hpMyDvtHUyLPz0ltO6SS.mp4?hl=tr)

`meta` öğesi içindeki `prefers-color-scheme` medya özelliğiyle tema renklerini belirtin.

```
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
```

SVG içinde `prefers-color-scheme` medya özelliğini de kullanabilirsiniz.
Favicon'unuz için SVG dosyası kullanıyorsanız bu dosya koyu moda göre ayarlanabilir.
[Thomas Steiner](https://web.dev/authors/thomassteiner?hl=tr), [`prefers-color-scheme` in SVG favicons for dark mode icons](https://blog.tomayac.com/2019/09/21/prefers-color-scheme-in-svg-favicons-for-dark-mode-icons/) (Koyu mod simgeleri için SVG favicon'larında `prefers-color-scheme`) başlıklı bir makale yazdı.

## Özel özelliklerle tema oluşturma

CSS'nizin genelinde aynı renk değerlerini birden çok yerde kullanıyorsanız tüm seçicilerinizi bir `prefers-color-scheme` medya sorgusunda tekrarlamak oldukça sıkıcı olabilir.

```
body {
  background-color: white;
  color: black;
}
input {
  background-color: white;
  color: black;
  border-color: black;
}
button {
  background-color: black;
  color: white;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: black;
    color: white;
  }
  input {
    background-color: black;
    color: white;
    border-color: white;
  }
  button {
    background-color: white;
    color: black;
  }
}
```

Renk değerlerinizi depolamak için CSS özel özelliklerini kullanın.
Özel özellikler, bir programlama dilindeki değişkenler gibi çalışır. Bir değişkenin değerini adını güncellemeden güncelleyebilirsiniz.

Özel özelliklerinizin değerlerini bir `prefers-color-scheme` medya sorgusunda güncellerseniz tüm seçicilerinizi iki kez yazmanız gerekmez.

```
html {
  --page-color: white;
  --ink-color: black;
}
@media (prefers-color-scheme: dark) {
  html {
    --page-color: black;
    --ink-color: white;
  }
}
body {
  background-color: var(--page-color);
  color: var(--ink-color);
}
input {
  background-color: var(--page-color);
  color: var(--ink-color);
  border-color: var(--ink-color);
}
button {
  background-color: var(--ink-color);
  color: var(--page-color);
}
```

Özel özelliklerle tema oluşturmanın daha gelişmiş örnekleri için [renk şeması oluşturma](https://web.dev/articles/building/a-color-scheme?hl=tr) başlıklı makaleyi inceleyin.

## Resimler

HTML'nizde SVG'ler kullanıyorsanız özel özellikleri burada da uygulayabilirsiniz.

```
svg {
  stroke: var(--ink-color);
  fill: var(--page-color);
}
```

Artık simgelerinizin renkleri, sayfanızdaki diğer öğelerle birlikte değişir.

Fotoğrafik resimlerinizin koyu modda görüntülendiğinde parlaklığını azaltmak istiyorsanız CSS'de filtre uygulayabilirsiniz.

```
@media (prefers-color-scheme: dark) {
  img {
    filter: brightness(.8) contrast(1.2);
  }
}
```

![Normal parlaklıkta üç fotoğraf.](https://web.dev/static/learn/design/theming/image/three-photographs-normal-e7cfaee065a3.png?hl=tr)
![Parlaklığı biraz daha az olan üç fotoğraf.](https://web.dev/static/learn/design/theming/image/three-photographs-slight-6ca40f542a4e9.png?hl=tr)

Efekt hafif olsa da koyu modda resimlerin parlaklığını azaltabilirsiniz.

Bazı resimleri koyu modda tamamen değiştirmek isteyebilirsiniz.
Örneğin, daha koyu bir renk şemasına sahip bir harita göstermek isteyebilirsiniz.
`prefers-color-scheme` medya sorgusunu içeren bir `<source>` öğesi içeren `<picture>` öğesini kullanın.

```
<picture>
  <source srcset="darkimage.png" media="(prefers-color-scheme: dark)">
  <img src="lightimage.png" alt="A description of the image.">
</picture>
```

[  ](https://web.dev/static/learn/design/theming/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/8Sz0XmotUrwnbprrHtoZ.mp4?hl=tr)

![Brooklyn'in iki haritası. Birinde açık, diğerinde koyu renkler kullanılıyor.](https://web.dev/static/learn/design/theming/image/two-maps-broolyn-using-5ab9d5d846e67.png?hl=tr)

Aynı haritanın iki sürümü (biri açık mod, diğeri koyu mod için).

## Formlar

Tarayıcılar, form alanları için varsayılan bir renk paleti sağlar.
Tarayıcıya, sitenizin hem koyu hem de açık mod sunduğunu bildirin.
Bu sayede tarayıcı, formlar için uygun varsayılan stili sağlayabilir.

CSS'nize şunu ekleyin:

```
html {
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  html {
    color-scheme: dark;
  }
}
```

HTML de kullanabilirsiniz. Dokümanlarınızın `head` bölümüne şunu ekleyin:

```
<meta name="supported-color-schemes" content="light dark">
```

[  ](https://web.dev/static/learn/design/theming/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/6YuAM0ZCNhGNAjpI8fyT.mp4?hl=tr)

Onay kutularını, radyo düğmelerini ve diğer bazı form alanlarını stilize etmek için CSS'de [`accent-color`](https://web.dev/articles/accent-color?hl=tr) özelliğini kullanın.

```
html {
  accent-color: red;
}
```

Koyu temalarda genellikle markanın renkleri daha soluktur. Koyu mod için `accent-color` değerini güncelleyebilirsiniz.

```
html {
  accent-color: red;
}
@media (prefers-color-scheme: dark) {
  html {
    accent-color: pink;
  }
}
```

Tüm renk bildirimlerinizi tek bir yerde tutabilmek için bu işlemde özel bir özellik kullanmanız mantıklıdır.

```
html {
  color-scheme: light;
  --page-color: white;
  --ink-color: black;
  --highlight-color: red;
}
@media (prefers-color-scheme: dark) {
  html {
    color-scheme: dark;
    --page-color: black;
    --ink-color: white;
    --highlight-color: pink;
  }
}
html {
  accent-color: var(--highlight-color);
}
body {
  background-color: var(--page-color);
  color: var(--ink-color);
}
```

[  ](https://web.dev/static/learn/design/theming/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/Dl00EnG4mwTbSQIkYBF9.mp4?hl=tr)
**Not:**  Öğeleri tema renkleriyle renklendirme hakkında daha fazla bilgi için [daha fazla renklendirme](https://web.dev/articles/accent-color?hl=tr#extra_more_tinting) bölümüne bakın. 

Koyu mod sunmak, sitenizi kullanıcılarınızın tercihlerine uyacak şekilde uyarlamanın yalnızca bir örneğidir.
Ardından, sitenizi her türlü [erişilebilirlik](https://web.dev/learn/design/accessibility?hl=tr) hususuna uyarlanabilir hale getirmeyi öğreneceksiniz.

### Bilgilerinizi sınayın

Temalarla ilgili bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> Tarayıcıyı web sayfasının dışında etkileyen tema renkleri sağlamak için:
> CSS
> CSS teması bilgileri, istenmeyen bir kullanıcı deneyimi olan normal renk parlamasına neden olabilir.
> JavaScript
> Yalnızca "theme-color"
> <meta>
> etiketini güncellemek için kullanıyorsanız.
> Web uygulaması manifesti
> manifest.json
> sağlanabilir ve uygulamanın mobil ana ekrandan açıldığında nasıl görüneceğini belirlemek için tema renklerini belirtme alanlarını içerir.
> "theme-color"
> <meta>
> etiketi
> Tarayıcı, bu tema rengini
> <head>
> etiketinde mümkün olan en kısa sürede fark edebilir ve istenmeyen renk parlamalarını önleyebilir.
> Kullanıcının açık veya koyu tema ile ilgili sistem tercihine bağlanmak için şunu kullanın:
> (prefers-color-scheme)
> medya sorgusu
> Açık veya koyu gibi kontrol etmek istediğiniz değeri iletin.
> JavaScript
> Bu işlev, tercihin mevcut durumunu istemek için CSS medya sorgusu söz dizimini kullanır.
> Bu nedenle koyu temayı destekliyorsunuz ancak tüm form girişleri açık temada kalıyor. Ne yapabilirsin?
> CSS'nize
> html { color-scheme: light dark; }
> ekleyin.
> Bu, CSS'den gelen ve form girişlerinin sistem renk şemasıyla eşleşmesi gerektiğini belirten bir sinyaldir.
> HTML
> <meta name="supported-color-schemes" content="light dark">
> etiketinize
> <head>
> ekleyin.
> Bu, HTML'den gelen ve form girişlerinin sistem renk şemasıyla eşleşmesi gerektiğini belirten sinyallerdir.
> Girişin tüm varsayılanlarını değiştirmek için bir dizi CSS yazın.
> Bu yöntem de işe yarar ancak biraz daha zordur.
