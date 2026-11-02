# Resim öğesi

**Orijinal Kaynak:** [https://web.dev/learn/design/picture-element?hl=tr](https://web.dev/learn/design/picture-element?hl=tr)

---

[Önceki modülde](https://web.dev/learn/design/responsive-images?hl=tr), `srcset` özelliğinin aynı resmin farklı boyutlardaki sürümlerini sağlamanıza nasıl olanak tanıdığı gösterilmişti. Tarayıcı daha sonra kullanılacak doğru sürüme karar verebilir. Resmi tamamen değiştirmek istiyorsanız [`picture`](https://developer.mozilla.org/docs/Web/HTML/Element/picture) öğesini kullanmanız gerekir.

`srcset`, `src` özelliğini temel aldığı gibi `picture` öğesi de `img` öğesini temel alır. `picture` öğesi, `img` öğesini sarar.

```
<picture>
  <img src="image.jpg" alt="A description of the image.">
</picture>
```

`picture` öğesinin içine yerleştirilmiş bir `img` öğesi yoksa `picture` öğesi çalışmaz.

`srcset` özelliği gibi, `picture` öğesi de söz konusu `img` öğesindeki `src` özelliğinin değerini günceller. Aradaki fark, `srcset` özelliği tarayıcıya önerilerde bulunurken `picture` öğesinin komutlar vermesidir. Bu sayede kontrol sizde olur.

## `source`

Bir `picture` öğesinin içinde, her biri kendi `srcset` özelliğine sahip birden fazla `source` öğesi belirtebilirsiniz. Tarayıcı daha sonra yapabildiği ilk işlemi yürütür.

## Resim biçimleri

Bu örnekte, üç farklı biçimde üç farklı resim vardır:

```
<picture>
  <source srcset="image.avif" type="image/avif">
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="A description of the image."
    width="300" height="200">
</picture>
```

İlk `source` öğesi, [yeni AVIF biçimindeki](https://web.dev/articles/compress-images-avif?hl=tr) bir resmi işaret eder. Tarayıcı, AVIF resimleri oluşturabiliyorsa bu resim dosyası seçilir. Aksi takdirde, sonraki `source` öğesine geçer.

İkinci `source` öğesi, [WebP biçimindeki](https://web.dev/articles/serve-images-webp?hl=tr) bir resmi işaret ediyor. Tarayıcı, WebP resimleri oluşturabiliyorsa bu resim dosyasını kullanır.

Aksi takdirde tarayıcı, `img` öğesinin `src` özelliğindeki resim dosyasına geri döner. Bu resim JPEG biçimindedir.

Bu sayede, geriye dönük uyumluluktan ödün vermeden yeni resim biçimlerini kullanmaya başlayabilirsiniz.

Bu örnekte, `type` özelliği tarayıcıya hangi tür resim biçiminin belirtildiğini bildiriyordu.

## Resim boyutları:

Resim biçimleri arasında geçiş yapmanın yanı sıra resim boyutları arasında da geçiş yapabilirsiniz. Tarayıcıya, resmin ne kadar genişlikte gösterileceğini bildirmek için `media` özelliğini kullanın. `media` özelliğinin içine bir medya sorgusu yerleştirin.

```
<picture>
  <source srcset="large.png" media="(min-width: 75em)">
  <source srcset="medium.png" media="(min-width: 40em)">
  <img src="small.png" alt="A description of the image."
    width="300" height="200">
</picture>
```

Burada tarayıcıya, görüntü alanı genişliği `75em` değerinden büyükse büyük resmi kullanması gerektiği söyleniyor. Tarayıcı, `40em` ile `75em` arasında orta boyuttaki resmi kullanmalıdır. Tarayıcı, `40em` değerinin altında küçük resmi kullanmalıdır.

[  ](https://web.dev/static/learn/design/picture-element/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/tXME65OZikEMwvPAEgX2.mp4?hl=tr)

Bu, `img` öğesinde `srcset` ve `sizes` özelliklerini kullanmaktan farklıdır. Bu durumda tarayıcıya öneriler sunuyorsunuz. `source` öğesi, öneriden ziyade komut gibidir.

Ayrıca, piksel yoğunluğu tanımlayıcısını `source` öğesinin `srcset` özelliği içinde de kullanabilirsiniz.

```
<picture>
  <source srcset="large.png 1x" media="(min-width: 75em)">
  <source srcset="medium.png 1x, large.png 2x" media="(min-width: 40em)">
  <img src="small.png" alt="A description of the image." width="300" height="200"
    srcset="small.png 1x, medium.png 2x, large.png 3x">
</picture>
```

Bu örnekte, tarayıcıya farklı kesme noktalarında ne yapması gerektiğini söylemeye devam ediyorsunuz ancak artık tarayıcı, cihazın piksel yoğunluğu için en uygun resmi seçme seçeneğine sahip.

## Kırpma

Aynı resmin yalnızca farklı boyutlardaki sürümlerini yayınlamanız gerekiyorsa `srcset` en iyi seçenektir. Ancak bir resim daha küçük boyutlarda iyi görünmüyorsa bunun yerine resmin kırpılmış bir versiyonunu oluşturmayı deneyebilirsiniz.

Farklı resimler, bağlamlarına daha iyi uyacak şekilde farklı genişlik ve yükseklik oranlarına sahip olabilir. Örneğin, mobil tarayıcıda dar ve uzun bir kırpma yayınlamak isteyebilirsiniz. Masaüstü tarayıcıda ise geniş ve kısa bir kırpma yayınlamak isteyebilirsiniz.

İçeriğini ve şeklini görüntü alanı genişliğine göre değiştiren bir banner resmi örneğini burada bulabilirsiniz. Her `source` öğesine `width` ve `height` özelliklerini ekleyin.

```
<picture>
  <source srcset="full.jpg" media="(min-width: 75em)" width="1200" height="500">
  <source srcset="regular.jpg" media="(min-width: 50em)" width="800" height="400">
  <img src="cropped.jpg" alt="A description of the image." width="400" height="400" fetchpriority="high">
</picture>
```

[  ](https://web.dev/static/learn/design/picture-element/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/WZLJGIUHqlP1j9s9aJaj.mp4?hl=tr)

Resim kaynağına bağlı olarak `alt` özelliğini değiştiremeyeceğinizi unutmayın. Hem tam boyutlu resmi hem de kırpılmış resmi açıklayan bir `alt` özelliği yazmanız gerekir.

Duyarlı resimlerinizin çoğu için `picture` öğesini kullanmanız gerekmeyebilir. `img` öğesindeki `srcset` ve `sizes` özellikleri birçok kullanım alanını kapsar. Ancak daha ayrıntılı kontrol gerektiren durumlarda `picture` öğesi güçlü bir araçtır.

Bu çözümlerden hiçbirine ihtiyacınız olmayacağı bir resim türü vardır: simgeler. [Sırada bu var](https://web.dev/learn/design/icons?hl=tr).

### Bilgilerinizi sınayın

Resim öğesiyle ilgili bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> srcset
> özelliği tarayıcıya \_\_\_\_\_\_\_\_ verirken
> <picture>
> öğesi \_\_\_\_\_\_\_\_ verir.
> öneriler, komutlar
> Resim öğesi kontrol sağlar ve bu nedenle sanat yönetimi için idealdir.
> komutlar, öneriler
> Yanlış anladınız.
> <picture>
> öğesinin bazı özellikleri şunlardır:
> Alternatif kırpma
> Örn: Görüntü alanına bağlı olarak yatay veya dikey resimler.
> Alternatif biçimler
> Örneğin, mümkünse daha küçük ve indirmesi daha kolay
> avif
> veya
> webp
> dosyaları.
> Alternatif boyutlar
> Örn: Daha büyük monitörler için daha büyük resimler.
> Alternatif yoğunluklar
> Ör: HD ekranlar için zengin piksel kalitesi sağlama.
> Alternatif oranlar
> Resim öğesinde oran özellikleri yok.
