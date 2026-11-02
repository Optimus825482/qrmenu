# Ekran yapılandırmaları

**Orijinal Kaynak:** [https://web.dev/learn/design/screen-configurations?hl=tr](https://web.dev/learn/design/screen-configurations?hl=tr)

---

Duyarlı web tasarımı, pek çok açıdan cep telefonlarına yansıdı. Akıllı telefonlar kullanıma sunulmadan önce, çok az kişi web sitelerinin avuç içi cihazlarda nasıl görünmesi ve nasıl hissettirmesi gerektiğini ciddiye alıyordu. Bu durum, yerleşik web tarayıcılarına sahip cep telefonlarının ani bir şekilde yükselişiyle birlikte değişti.

Duyarlı web tasarımı, varsayımları sorgulayan bir zihniyeti teşvik etti. Daha önce bir web sitesinin yalnızca masaüstü bilgisayarda görüntüleneceği varsayılırken, aynı web sitesinin telefonlar ve tabletler için de tasarlanması standart uygulamadır. Öyle ki, [mobil kullanım artık web'de masaüstü kullanımını geride bıraktı](https://www.statista.com/statistics/277125/share-of-website-traffic-coming-from-mobile-devices/).

Duyarlı bir yaklaşımla ileride size fayda sağlayacak. Web sitelerinizin, bugün hayal bile edemediğimiz cihazlarda ve ekranlarda görüntülenmesi tamamen mümkündür. Bu düşünce yapısı, ekranların ötesine uzanıyor. Şu anda bile kullanıcılar içeriğinize erişmek için ekranı olmayan cihazlar kullanıyor. Güçlü bir semantik HTML temeli kullanıyorsanız sesli asistanlar web sitelerinizi kullanabilir.

Ekran dünyasında da bazı denemeler var. Şu anda piyasada katlanabilir ekranlı cihazlar var. Bu durum, tasarımlarınız için bazı zorluklar yaratır.

![Farklı yapılandırmalardaki katlanabilir telefonların montajı.](https://web.dev/static/learn/design/screen-configurations/image/a-montage-foldable-phone-d04dc5a4ce205.jpg?hl=tr)

## Çift ekran

Katlanabilir cihaz kullanıcıları, web tarayıcılarının ekranlardan yalnızca birini kaplamasını mı yoksa her iki ekranı da kaplamasını seçebilir. Tarayıcı her iki ekranı da kapsıyorsa ekranda gösterilen web sitesi, iki ekran arasındaki menteşeyle bölünür. Pek hoş görünmüyor.

![İki ekrana yayılan bir web sitesi. Metnin yatay akışı ekranlar arasındaki menteşe nedeniyle kesintiye uğrar.](https://web.dev/static/learn/design/screen-configurations/image/a-website-spanning-across-c2638de25a4e7.png?hl=tr)

## Görünüm segmentleri

Web sitenizin çift ekranlı bir cihazda gösterilip gösterilmediğini algılamak için tasarlanmış deneysel bir medya özelliği vardır. Medya özelliğinin önerilen adı: `viewport-segments`. İki türü vardır: `horizontal-viewport-segments` ve `vertical-viewport-segments`.

**Dikkat:**  `viewport-segments` özelliği deneysel bir tekliftir ve söz dizimi değişebilir. Bir `spanning` medya özelliğinin ilk teklifinden sonra söz dizimi zaten değişti. 

`horizontal-viewport-segments` medya özelliği `2` değerini bildirirse ve `vertical-viewport-segments`, `1` değerini bildirirse cihaz menteşesi yukarıdan aşağıya doğru ilerler ve içeriğiniz yan yana iki panele bölünür.

```
@media (horizontal-viewport-segments: 2) and (vertical-viewport-segments: 1) {
  // Styles for side-by-side screens.
}
```

`vertical-viewport-segments` medya özelliği `2` değerini bildirirse ve `horizontal-viewport-segments`, `1` değerini bildirirse menteşe, içeriğiniz üst üste olacak şekilde iki panele bölünerek yanlara doğru ilerler.

```
@media (vertical-viewport-segments: 2) and (horizontal-viewport-segments: 1) {
  // Styles for stacked screens.
}
```

![Görüntü alanı segmentlerini gösteren şema.](https://web.dev/static/learn/design/screen-configurations/image/diagram-demonstrating-vie-4cafa4be4bd46.svg?hl=tr)

[Microsoft Edge Açıklamaları](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/Foldables/explainer.md)'nın şeması.

Hem `vertical-viewport-segments` hem de `horizontal-viewport-segments`, `1` değerini bildirirse bu, cihazın birden fazla ekranı olsa bile web sitesinin yalnızca bir ekranda gösterildiği anlamına gelir. Bu, herhangi bir medya sorgusu kullanmamakla eşdeğerdir.

## Ortam değişkenleri

`viewport-segments` medya özelliği tek başına bu rahatsız edici menteşeyi etrafında tasarım yapmanıza yardımcı olmaz. Menteşenin boyutunu öğrenmenin bir yolunu bulmanız gerekir. Bu noktada [ortam](https://developer.mozilla.org/docs/Web/CSS/env()) değişkenleri yardımcı olabilir.

CSS'deki ortam değişkenleri, stillerinize garip cihaz müdahalelerini dahil etmenize olanak tanır. Örneğin, tasarımda "çentik" kullanarak `safe-area-inset-top`, `safe-area-inset-right`, `safe-area-inset-bottom` ve `safe-area-inset-left` ortam değerlerini kullanarak iPhone X'te telefonunuzu güncelleyin. Bu anahtar kelimeler bir `env()` işlevi içinde sarmalanır.

```
body {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}
```

Ortam değişkenleri özel mülkler gibi çalışır. Bu, ortam değişkeninin mevcut olmaması durumunda bir yedek seçeneği iletebileceğiniz anlamına gelir.

```
body {
  padding-top: env(safe-area-inset-top, 1em);
  padding-right: env(safe-area-inset-right, 1em);
  padding-bottom: env(safe-area-inset-bottom, 1em);
  padding-left: env(safe-area-inset-left, 1em);
}
```

Bu ortam değişkenlerinin iPhone X'te çalışması için `viewport` bilgilerini belirten `meta` öğesini güncelleyin:

```
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Şimdi sayfa düzeniniz tüm görüntü alanını kaplayacak ve dokümanı cihaz tarafından sağlanan ek değerlerle güvenli bir şekilde dolduracaktır.

Katlanabilir ekranlar için altı yeni ortam değişkeni öneriliyor: `viewport-segment-width`, `viewport-segment-height`, `viewport-segment-top`, `viewport-segment-left`, `viewport-segment-bottom`, `viewport-segment-right`.

**Dikkat:** Bunun şu anda yalnızca teklif aşamasında olduğunu unutmayın. Ortam değişkenlerine özel söz dizimi değişebilir.  ziyaret edin.
![Çift ekran için ortam değişkenlerini gösteren şema.](https://web.dev/static/learn/design/screen-configurations/image/diagram-showing-environme-46354fd20f6e2.svg?hl=tr)

[Microsoft Edge Açıklayıcıları](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/Foldables/explainer.md) tarafından sağlanan şema.

 ziyaret edin.
'nı inceleyin.
**Not:**  `left`, `right`, `top` ve `bottom` ile birlikte adların önerildiğini görmek biraz garip görünebilir. Mantıksal özellikler kullanıyorsanız `inline-start`, `inline-end`, `block-start` ve `block-end` gibi terimlerin kullanılmasını beklersiniz. Ancak bu durumda adlar, görüntülenen web sitesi tarafından kullanılan yazma modundan bağımsız olarak donanımın fiziksel özelliklerini ifade eder. 

Aşağıda, biri diğerinden daha geniş olan iki sütunlu bir düzen örneği verilmiştir.

```
@media (min-width: 45em) {
  main {
    display: flex;
    flex-direction: row;
  }
  main article {
    flex: 2;
  }
  main aside {
    flex: 1;
  }
}
```

![Düzen iki ekrana bölünmüş ve menteşe büyük sütunu kesintiye uğratıyor.](https://web.dev/static/learn/design/screen-configurations/image/the-layout-is-split-acros-639076d03147f.png?hl=tr)

Dikey menteşeli çift ekranlarda, ilk sütunu ilk ekranın genişliği, ikinci sütunu ise ikinci ekranın genişliği olacak şekilde ayarlayın.

```
@media (horizontal-viewport-segments: 2) and (vertical-viewport-segments: 1) {
  main article {
    flex: 1 1 env(viewport-segment-width 0 0);
  }
  main aside {
    flex: 1;
  }
}
```

![Düzen, görünür kesinti olmadan iki ekrana eşit olarak bölünmüştür.](https://web.dev/static/learn/design/screen-configurations/image/the-layout-is-split-evenl-0a01cabadce28.png?hl=tr)

Dual Screen'i bir fırsat olarak değerlendirin. Belki kaydırılabilir metin içeriğini göstermek için bir ekran kullanılırken diğerinde resim veya harita gibi sabit bir öğe görüntülenebilir.

![İki ekrana bölünmüş bir konum hizmetini gösteren şema. Bir ekranda harita, diğer ekranda yol tarifi gösteriliyor.](https://web.dev/static/learn/design/screen-configurations/image/diagram-illustrating-loc-34a56309c0184.svg?hl=tr)

[Microsoft Edge Explainers](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/Foldables/explainer.md)'ın şeması.

## Gelecek

Katlanabilir ekranlar gelecekte de popüler olacak mı? Kim bilir. Mobil cihazların ne kadar popüler olacağını hiç kimse tahmin edemezdi. Bu nedenle, gelecekteki form faktörleri hakkında açık fikirli olmak önemlidir.

Hepsinden önemlisi, web sitelerinizin gelecekte karşılaşabileceği her türlü duruma yanıt verebilmesini sağlamak önemlidir. Duyarlı tasarım size bunu sağlar: Bir dizi pratik teknik değil, geleceğin web'ini inşa ederken size iyi hizmet edecek bir düşünce yapısına sahip olursunuz.

### Öğrendiklerinizi sınayın

Ekran yapılandırmaları hakkındaki bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> Hangi medya sorgusu, bölünmüş yatay modda katlanabilir bir cihazı hedefler?
> @media (horizontal-viewport-segments: 2) and (vertical-viewport-segments: 1)
> Yatay olarak bölünmüş 2 sütun ve 1 satırla yapılandırılmış ekran.
> @media (vertical-viewport-segments: 2) and (horizontal-viewport-segments: 1)
> Dikey bölünmüş 2 satır ve 1 sütun.
> @media (vertical-viewport-segments: 2) and (horizontal-viewport-segments: 2)
> 2 satır ve 2 sütun, 4 şekilde bölünür.
> @media (vertical-viewport-segments: 1) and (horizontal-viewport-segments: 1)
> Tek hücreli, bölme yok.
> Ortam değişkenleri nedir? Ör.
> env(safe-area-inset-top)
> Kullanıcının bulunduğu hava durumuyla ilgili değişkenler.
> Yanlış ortam. Bu CSS değişkenleri, kullanıcının bulunduğu fiziksel dünyayla ilgili değildir.
> Özel derleme zamanı değişkenleri.
> Derleme zamanı, derlenmiş şekilde de değişkenler işe yarar ancak belirtilen ortam değişkenleriyle aynı değildir.
> Bir siteyi ilgili tarayıcıya ve cihaza göre ayarlamak için kullanılacak, tarayıcıya özel özellikler içeren değişkenler.
> Tarayıcı ile bir yazarın benzersiz görüntü alanı bağlamları veya tarayıcıyı etkileyen özellikler üzerinde ortak çalışma yapabilmesinin bir yoludur.
> Yeşil hale gelen ve çevre için daha güvenli olan değişkenler.
> CSS ve değişkenleri dünyadaki kirliliği daha az etkilemez.
