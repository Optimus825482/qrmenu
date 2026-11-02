# Medya sorguları

**Orijinal Kaynak:** [https://web.dev/learn/design/media-queries?hl=tr](https://web.dev/learn/design/media-queries?hl=tr)

---

Tasarımcılar, tasarımlarını kullanıcılara göre ayarlayabilir.
Bunun en net örneği, kullanıcının cihazının form faktörüdür. Genişliği, cihazın en-boy oranı ve diğer yönleri bu kapsamdadır. Tasarımcılar, medya sorgularını kullanarak bu farklı form faktörlerine yanıt verebilir.

Medya sorguları `@media` anahtar kelimesiyle (bir CSS @ kuralı) başlatılır ve çeşitli kullanım alanlarında kullanılabilir.

## Farklı türlerde çıktıları hedefleme

Web siteleri genellikle ekranlarda gösterilir ancak CSS, web sitelerini diğer çıktılar için de stilize etmek amacıyla kullanılabilir.
Web sayfalarınızın ekranda bir şekilde, yazdırıldığında ise farklı bir şekilde görünmesini isteyebilirsiniz.
Medya türlerini sorgulayarak bu mümkün hale gelir.

Bu örnekte, arka plan rengi gri olarak ayarlanmıştır.
Ancak sayfa yazdırılıyorsa arka plan rengi şeffaf olmalıdır.
Bu sayede kullanıcının yazıcı mürekkebi tasarruf edilir.

```
body {
  color: black;
  background-color: grey;
}

@media print {
  body {
    background-color: transparent;
  }
}
```

Stil sayfanızda `@media` @ kuralını bu şekilde kullanabilir veya ayrı bir stil sayfası oluşturup `link` öğesinde `media` özelliğini kullanabilirsiniz:

```
<link rel="stylesheet" href="global.css">
<link rel="stylesheet" href="print.css" media="print">
```

CSS'niz için herhangi bir medya türü belirtmezseniz CSS'niz otomatik olarak `all` medya türü değerine sahip olur. Bu iki CSS bloğu eşdeğerdir:

```
body {
  color: black;
  background-color: white;
}
```

```
@media all {
   body {
     color: black;
     background-color: white;
   }
}
```

Şu iki HTML satırı da eşdeğerdir:

```
<link rel="stylesheet" href="global.css">
```

```
<link rel="stylesheet" href="global.css" media="all">
```

### Sorgu koşulları

Medya türlerine koşullar ekleyebilirsiniz. Bunlara medya sorguları denir.
CSS yalnızca medya türü eşleşirse ve koşul da doğruysa uygulanır.
Bu koşullara *medya özellikleri* adı verilir.

Medya sorgularının söz dizimi şöyledir:

```
@media type and (feature)
```

Stilleriniz ayrı bir stil sayfasındaysa `link` öğesinde medya sorgularını kullanabilirsiniz:

```
<link rel="stylesheet" href="specific.css" media="type and (feature)">
```

Tarayıcı penceresinin yatay modda (görüntü alanı genişliği, yüksekliğinden büyük) veya dikey modda (görüntü alanı yüksekliği, genişliğinden büyük) olmasına bağlı olarak farklı stiller uygulamak istediğinizi varsayalım.
Bunu test etmek için kullanabileceğiniz `orientation` adlı bir medya özelliği vardır:

```
@media all and (orientation: landscape) {
   /* Styles for landscape mode. */
}

@media all and (orientation: portrait) {
   /* Styles for portrait mode. */
}
```

Alternatif olarak, ayrı stil sayfaları kullanmayı tercih ederseniz:

```
<link rel="stylesheet" href="landscape.css" media="all and (orientation: landscape)">
<link rel="stylesheet" href="portrait.css" media="all and (orientation: portrait)">
```

Bu örnekte medya türü `all`'dır. Varsayılan değer bu olduğundan isterseniz bunu atlayabilirsiniz:

```
@media (orientation: landscape) {
   /* Styles for landscape mode. */
}

@media (orientation: portrait) {
   /* Styles for portrait mode. */
}
```

Veya ayrı stil sayfaları kullanma:

```
<link rel="stylesheet" href="landscape.css" media="(orientation: landscape)">
<link rel="stylesheet" href="portrait.css" media="(orientation: portrait)">
```

[  ](https://web.dev/static/learn/design/media-queries/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/gtBzPVsBu5mtnX8RuSqJ.mp4?hl=tr)

Farklı medya *türleri* (ör. `print`) için ayrı stil sayfaları kullanmak sorun olmasa da her medya *sorgusu* için ayrı bir stil sayfası kullanmak iyi bir fikir değildir. Bunun yerine `@media` at-rules kullanın.

## Stilleri görüntü alanı boyutuna göre ayarlama

Duyarlı tasarım için en yararlı medya özelliklerinden biri tarayıcı görünümünün boyutlarını içerir.
Tarayıcı penceresi belirli bir genişlikten daha geniş olduğunda stil uygulamak için `min-width` kullanın.

```
@media (min-width: 400px) {
  /* Styles for viewports wider than 400 pixels. */
}
```

Belirli bir genişliğin altındaki stilleri uygulamak için `max-width` medya özelliğini kullanın:

```
@media (max-width: 400px) {
  /* Styles for viewports narrower than 400 pixels. */
}
```

Bu medya sorgusu, `width` medya özelliği ve "küçük veya eşit" operatörü kullanılarak da yazılabilir.

```
@media (width <= 400px) {
  /* Styles for viewports narrower than 400 pixels. */
}
```

Medya sorgularınızda herhangi bir CSS [uzunluk birimini](https://developer.mozilla.org/docs/Web/CSS/length) kullanabilirsiniz.
İçeriğiniz çoğunlukla resim tabanlıysa pikseller en uygun seçenek olabilir.
İçeriğiniz çoğunlukla metin tabanlıysa metin boyutuna dayalı bir [göreceli birim](https://web.dev/learn/css/sizing?hl=tr#relative_lengths) (ör. `em` veya `ch`) kullanmak daha mantıklı olabilir:

```
@media (min-width: 25em) {
  /* Styles for viewports wider than 25em. */
}
```

Birden fazla koşul uygulamak için medya sorgularını da birleştirebilirsiniz.
Medya sorgularınızı birleştirmek için `and` kelimesini kullanın:

```
@media (min-width: 50em) and (max-width: 60em) {
  /* Styles for viewports wider than 50em and narrower than 60em. /*
}
```

Bu, aralık söz dizimi kullanılarak da yazılabilir.

```
@media (50em <= width <=60em) {
  /* Styles for viewports wider than 50em and narrower than 60em. */
}
```

[  ](https://web.dev/static/learn/design/media-queries/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/eDf5v1QMwLX19pcJAgYE.mp4?hl=tr)

## İçeriğe göre kesme noktaları seçme

Bir medya özelliği koşulunun doğru olduğu noktaya kesme noktası adı verilir.
Kesme noktalarınızı popüler cihaz boyutlarına göre değil, içeriğinize göre seçmeniz önerilir. Popüler cihaz boyutları, her teknoloji sürüm döngüsünde değişebilir.

Bu örnekte, `50em` metin satırlarının rahatsız edici derecede uzun hale geldiği noktayı gösterir.
Bu nedenle, arayüzü daha okunaklı hale getirmek için bir kesme noktası oluşturulur.
`column-count` özelliği kullanıldığında metin, bu noktadan itibaren iki sütuna bölünür.

```
@media (min-width: 50em) {
  article {
    column-count: 2;
  }
}
```

[  ](https://web.dev/static/learn/design/media-queries/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/mrQlcyih7IcZxswI1lMx.mp4?hl=tr)

## Kombinasyonlar

Yalnızca genişliğe değil, görüntü alanının yüksekliğine göre medya sorguları kullanabilirsiniz.
Bu, arayüz içeriğini "ekranın üst kısmında" optimize etmek için yararlı olabilir. Önceki örnekte, okuyucular geniş ancak kısa bir tarayıcı penceresi kullanıyorsa bir sütunu aşağı kaydırmaları ve ardından ikinci sütunun en üstüne ulaşmak için tekrar yukarı kaydırmaları gerekir.
Sütunları yalnızca görüntü alanı hem yeterince geniş hem de yeterince uzun olduğunda uygulamak daha güvenli olacaktır.

Stillerin yalnızca tüm koşullar doğru olduğunda uygulanması için medya sorgularını birleştirebilirsiniz.
Bu örnekte, sütun stillerinin uygulanabilmesi için görünüm alanının en az `50em` genişliğinde ve `30em` yüksekliğinde olması gerekir.
Bu kesme noktaları, içerik miktarına göre seçilmiştir.

```
@media (min-width: 50em) and (min-height: 30em) {
  article {
    column-count: 2;
  }
}
```

[  ](https://web.dev/static/learn/design/media-queries/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/oKRBxhrHzAzebYwxptsv.mp4?hl=tr)

Stil uygulamak istediğinizde daha karmaşık durumları ifade etmek için `or` ve `not` anahtar kelimelerini de kullanabilirsiniz. Bunlar mantıksal olarak zorlayıcı olabilir. Bu nedenle, beklediğiniz şekilde çalışıp etkileşimde bulunduklarını test ettiğinizden emin olun.

```
@media not ((width >= 30em) or (orientation: landscape)) {
  /* These styles won't be shown if the viewport is wider than 30em, or if the orientation is landscape. */
  .navlist {
    flex-direction: column;
  }
}
```

Bu örneklerde, tasarımları kullanıcının cihazının form faktörüne uyarlamak için medya sorgularının nasıl kullanılabileceği gösterilmektedir. Ancak bu örnekler, olasılıkların yalnızca küçük bir kısmını kapsamaktadır. Medya sorguları, genişlik ve yüksekliğin çok ötesine geçerek erişilebilirlik özellikleri ve tema renkleriyle ilgili kullanıcı tercihlerine erişebilir.
Düzen ayarlamaları yapmak için medya sorgularını kullanmak, bu özelliklerin ve daha fazlasının üzerine inşa edilen duyarlı tasarım için harika bir başlangıçtır.

### Anlayıp anlamadığınızı kontrol etme

Duyarlı medya sorgularıyla ilgili bilginizi test edin.

> [Öğrendiklerinizi Test Edin]
> Medya sorguları yalnızca ekran boyutu için mi geçerlidir?
> doğru
> Tekrar deneyin. Yazdırma, koyu ve açık sistem tercihi gibi birçok şey için medya sorguları.
> yanlış
> 🎉
> Web içeriğinin tüketildiği veya gösterildiği tek yer ekranlar mı?
> doğru
> Tekrar deneyin. Bir web sitesi kağıda yazdırılabilir, arama motoru örümcekleri tarafından taranabilir, ekran okuyucu teknolojileri tarafından sesli okunabilir veya hatta bir asistan kullanan botlar tarafından kullanıcılara okunabilir.
> yanlış
> 🎉
> Varsayılan medya türü nedir?
> screen
> Tekrar deneyin.
> screen
> varsayılan tür değil.
> none
> Tekrar deneyin.
> none
> geçerli bir medya türü değil.
> all
> 🎉
> some
> Tekrar deneyin.
> some
> geçerli bir medya türü değil.
> landscape
> Tekrar deneyin.
> landscape
> geçerli bir medya türü değil.
> Tarayıcının mobil cihazlarda bir tasarımı ölçeklendirmesini önlemek için ne kullanırsınız?
> width: 100%
> Tekrar deneyin.
> font-size: 200%
> Tekrar deneyin.
> <meta name="viewport" content="width=device-width, initial-scale=1">
> 🎉
> Medya Sorguları
> Tekrar deneyin.
> HTML5
> Tekrar deneyin.
> Tarayıcı penceresi
> 720px
> değerinin üzerindeyken hangi medya sorgusu uygulanır?
> @media (width: 720px)
> Tekrar deneyin. Bu medya sorgusu yalnızca tarayıcı penceresi
> 720px
> değerine eşit olduğunda geçerlidir.
> @media (max-width: 720px)
> Tekrar deneyin. Bu medya sorgusu, tarayıcı penceresi
> 720px
> 'nın altında olduğunda kullanılır.
> @media (min-width: 720px)
> 🎉 Bu değeri, tarayıcı penceresinin en az
> 720px
> olduğu şeklinde okuyabilirsiniz.
> @media (clamp-width: 720px)
> Tekrar deneyin.
> clamp-width
> , geçerli bir medya sorgusu özelliği koşulu değil.
