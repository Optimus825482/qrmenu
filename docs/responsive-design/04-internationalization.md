# Uluslararası hale getirme

**Orijinal Kaynak:** [https://web.dev/learn/design/internationalization?hl=tr](https://web.dev/learn/design/internationalization?hl=tr)

---

Web, dünyanın her yerindeki herkesin kullanımına açıktır. Adı da bunu gösterir.
Bu, web sitenizin, nerede oldukları, hangi cihazı kullandıkları veya hangi dili konuştukları fark etmeksizin internete erişimi olan herkes tarafından kullanılabileceği anlamına gelir.

Duyarlı tasarımın amacı, içeriğinizi herkesin erişebileceği şekilde sunmaktır.
Aynı felsefeyi insan dillerine uygulamak, uluslararasılaştırmanın temelini oluşturur. Uluslararasılaştırma, içeriklerinizi ve tasarımlarınızı uluslararası bir kitleye göre hazırlama sürecidir.

## Mantıksal özellikler

İngilizce soldan sağa ve yukarıdan aşağıya yazılır ancak tüm diller bu şekilde yazılmaz.
Arapça ve İbranice gibi bazı diller sağdan sola, Japonca'daki bazı yazı tipleri ise yatay yerine dikey olarak okunur.
Bu yazma modlarını desteklemek için CSS'de mantıksal özellikler kullanıma sunuldu.

CSS yazıyorsanız "left" (sol), "right" (sağ), "top" (üst) ve "bottom" (alt) gibi yön belirten anahtar kelimeler kullanmış olabilirsiniz.
Bu anahtar kelimeler, kullanıcının cihazının fiziksel düzenini ifade eder.

Diğer yandan [mantıksal özellikler](https://web.dev/learn/css/logical-properties?hl=tr), bir kutunun kenarlarını içeriğin akışıyla ilişkili olarak ifade eder.
Yazma modu değişirse mantıksal özelliklerle yazılan CSS buna göre güncellenir.
Yönlendirme özelliklerinde durum böyle değildir.

Yönsel özellik `margin-left` her zaman bir içerik kutusunun sol tarafındaki kenar boşluğunu ifade ederken mantıksal özellik `margin-inline-start` soldan sağa dillerde bir içerik kutusunun sol tarafındaki kenar boşluğunu, sağdan sola dillerde ise bir içerik kutusunun sağ tarafındaki kenar boşluğunu ifade eder.

Tasarımlarınızın farklı yazma modlarına uyum sağlaması için yönlü özelliklerden kaçının. Bunun yerine mantıksal özellikleri kullanın.

Yapılmaması gerekenler:

```
.byline {
  text-align: right;
}
```

Yapılması gerekenler

```
.byline {
  text-align: end;
}
```

CSS'de `left` veya `right` gibi belirli bir yön değeri olduğunda, buna karşılık gelen bir mantıksal özellik vardır. Eskiden `margin-left` olan yerlerde artık `margin-inline-start` da var.

Metnin soldan sağa aktığı İngilizce gibi bir dilde `inline-start` "sol"a, `inline-end` ise "sağ"a karşılık gelir.

Benzer şekilde, metnin yukarıdan aşağıya yazıldığı İngilizce gibi bir dilde `block-start` "üst"e, `block-end` ise "alt"a karşılık gelir.

![Latin, İbranice ve Japonca dillerinde, cihaz çerçevesi içinde yer tutucu metin oluşturma işlemi gösteriliyor. Oklar ve renkler, blok ve satır içi olmak üzere iki yönü ilişkilendirmeye yardımcı olmak için metni takip eder.](https://web.dev/static/learn/design/internationalization/image/latin-hebrew-japanese-a-538b56c52363b.webp?hl=tr)

CSS'nizde mantıksal özellikler kullanıyorsanız sayfalarınızın çevirileri için aynı stil sayfasını kullanabilirsiniz.
Sayfalarınız sağdan sola veya aşağıdan yukarıya doğru yazılan dillere çevrilse bile tasarımınız buna göre ayarlanır.
Her dil için ayrı tasarım yapmanız gerekmez.
Mantıksal özellikleri kullanarak tasarımınız her yazma moduna yanıt verir.
Bu sayede, her dil için ayrı tasarımlar oluşturmakla zaman kaybetmeden tasarımınızın daha fazla kullanıcıya ulaşmasını sağlayabilirsiniz.

[Grid](https://web.dev/learn/css/grid?hl=tr) ve [flexbox](https://web.dev/learn/css/flexbox?hl=tr) gibi modern CSS düzen teknikleri, varsayılan olarak mantıksal özellikleri kullanır.
`left` ve `top` yerine `inline-start` ve `block-start` açısından düşünürseniz bu modern teknikleri daha kolay anlayabilirsiniz.

[Bir metnin yanındaki simge](https://web.dev/learn/css/logical-properties?hl=tr#solving_the_icon_issue) veya bir form alanının yanındaki etiket gibi yaygın bir kalıbı ele alalım.
"Etiketin sağda kenar boşluğu olmalı" diye düşünmek yerine "Etiketin satır içi ekseninin sonunda kenar boşluğu olmalı" diye düşünün.

Yapılmaması gerekenler:

```
label {
  margin-right: 0.5em;
}
```

Yapılması gerekenler

```
label {
  margin-inline-end: 0.5em;
}
```

Bu sayfa sağdan sola yazılan bir dile çevrilirse stillerin güncellenmesi gerekmez.
`dir` öğenizde `html` özelliğini kullanarak sayfalarınızı sağdan sola yazılan bir dilde görme etkisini taklit edebilirsiniz.
`ltr` değeri "soldan sağa" anlamına gelir. "rtl" değeri "sağdan sola" anlamına gelir.

Belge yönlerinin (blok ekseni) ve yazma modlarının (satır içi eksen) tüm permütasyonlarıyla deneme yapmak isterseniz [etkileşimli bir gösterime](https://codepen.io/argyleink/pen/vYNwbgM) göz atın.

## Sayfa dilini belirleme

`html` öğesinde `lang` özelliğini kullanarak sayfanızın dilini tanımlamanız önerilir.

```
<html lang="en">
```

Bu örnek, İngilizce bir sayfa içindir. Daha da ayrıntılı olabilirsin. Bir sayfanın ABD İngilizcesi kullandığını şu şekilde beyan edebilirsiniz:

```
<html lang="en-us">
```

Belgenizin dilini belirtmek arama motorları için faydalıdır.
Ayrıca ekran okuyucular ve sesli asistanlar gibi yardımcı teknolojiler için de faydalıdır.
Dil meta verileri sağlayarak bu tür konuşma sentezleyicilerin içeriğinizi doğru şekilde telaffuz etmesine yardımcı olursunuz.

`lang` özelliği yalnızca `html` öğesinde değil, herhangi bir HTML öğesinde kullanılabilir. Web sayfanızda dili değiştirirseniz bu değişikliği belirtin.
Bu durumda, bir kelime Almanca'dır:

```
<p>I felt some <span lang="de">schadenfreude</span>.</p>
```

## Bağlı bir dokümanın dilini belirleme

Bağlantılarda kullanabileceğiniz `hreflang` adlı başka bir özellik daha vardır.
`hreflang`, `lang` özelliğiyle aynı dil kodu notasyonunu alır ve bağlantılı belgenin dilini açıklar.
Sayfanızın tamamının Almanca çevirisi varsa şu şekilde bağlantı verin:

```
<a href="/path/to/german/version" hreflang="de">German version</a>
```

Almanca sürümün bağlantısını açıklamak için Almanca metin kullanıyorsanız hem `hreflang` hem de `lang` karakterini kullanın.
Burada, "Deutsche Version" metni Almanca olarak işaretlenmiş ve hedef bağlantı da Almanca olarak işaretlenmiştir:

```
<a href="/path/to/german/version" hreflang="de" lang="de">Deutsche Version</a>
```

`link` öğesinde `hreflang` özelliğini de kullanabilirsiniz. Bu, belgenizin `head` bölümüne eklenir:

```
<link href="/path/to/german/version" rel="alternate" hreflang="de">
```

Ancak herhangi bir öğeye eklenebilen `lang` özelliğinin aksine, `hreflang` yalnızca `a` ve `link` öğelerine uygulanabilir.

## Tasarımınızda uluslararasılaştırmayı göz önünde bulundurun

Diğer dillere ve yazma modlarına çevrilecek web siteleri tasarlarken şu faktörleri göz önünde bulundurun:

- Almanca gibi bazı dillerde yaygın olarak kullanılan uzun kelimeler vardır. Arayüzünüzün bu kelimelere uyum sağlaması gerekir. Bu nedenle dar sütunlar tasarlamayın. [CSS kullanarak tire de ekleyebilirsiniz](https://developer.mozilla.org/docs/Web/CSS/hyphens).
- `line-height` değerlerinizin aksan gibi karakterleri ve diğer özel karakterleri desteklediğinden emin olun. İngilizce'de iyi görünen metin satırları, farklı bir dilde çakışabilir.
- Web yazı tipi kullanıyorsanız çeviri yapacağınız dilleri kapsayacak kadar geniş bir karakter aralığına sahip olduğundan emin olun.
- Metin içeren resimler oluşturmayın. Bu durumda her dil için ayrı resimler oluşturmanız gerekir. Bunun yerine, metni ve resmi ayırın ve metni resmin üzerine yerleştirmek için CSS kullanın.

## Kitlenizi ülkenizle sınırlamayın

`lang` ve `hreflang` gibi özellikler, HTML'nizi uluslararasılaştırma için daha anlamlı hale getirir.
Aynı şekilde, mantıksal özellikler CSS'nizi daha uyarlanabilir hale getirir.

`top`, `bottom`, `left` ve `right` açısından düşünmeye alıştıysanız bunun yerine `block start`, `block end`, `inline start` ve `inline end` açısından düşünmeye başlamak zor olabilir.
Ancak bu çabaya değer. Gerçekten duyarlı düzenler oluşturmak için mantıksal özellikler çok önemlidir.

### Bilgilerinizi sınayın

Ulusallaştırma hakkındaki bilginizi test edin.

> [Öğrendiklerinizi Test Edin]
> İngilizcede bir kutunun fiziksel
> right
> tarafı mantıksal olarak hangi taraftır?
> block-start
> Tekrar deneyin. İngilizce'de bu
> top
> block-end
> Tekrar deneyin. İngilizce'de bu
> bottom
> inline-start
> Tekrar deneyin. İngilizce'de bu
> left
> inline-end
> 🎉
> Uluslararasılaştırma için HTML'nizi daha anlamlı hale getirmek üzere hangi özelliği eklemelisiniz?
> english
> Tekrar deneyin.
> lang
> 🎉 Bu, tarayıcılara belgenin hangi dilde olduğunu bildirir. Böylece yazma modu, belge yönü ve çeviriler ayarlanabilir.
> language
> Tekrar deneyin.
> i18n
> Tekrar deneyin.

Ardından, [makro düzenler](https://web.dev/learn/design/macro-layouts?hl=tr) olarak da bilinen sayfa düzeyindeki düzenlere nasıl yaklaşacağınızı öğreneceksiniz.
