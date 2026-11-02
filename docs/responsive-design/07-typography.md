# Yazı biçimi

**Orijinal Kaynak:** [https://web.dev/learn/design/typography?hl=tr](https://web.dev/learn/design/typography?hl=tr)

---

Metniniz için herhangi bir stil belirtmezseniz tarayıcılar kendi varsayılan stillerini uygular. Bunlara *kullanıcı aracısı stil sayfaları* denir ve tarayıcıdan tarayıcıya değişebilir. Kullanıcılar, metinlerin gösterilmesiyle ilgili kendi tercihlerini de belirleyebilir.

Satır uzunluğu belirtmezseniz tarayıcılar metin satırlarını ekranın kenarında kaydırır. Bu nedenle, web'deki metinler varsayılan olarak duyarlıdır ve kullanıcının görüntü alanına sığacak şekilde akar.

Ancak metnin ekrana sığması, rahat okunabileceği anlamına gelmez. İyi bir tipografi, metninizi uygun bir şekilde sunmakla ilgilidir. Yazı karakteri seçimi, uygun yazı tiplerini seçmekten daha fazlasını içerir. Kullanıcının tercihlerini, metnin boyutunu, satır uzunluğunu ve metin satırları arasındaki mesafeyi göz önünde bulundurmanız gerekir.

**Not:**  Aksanlar ve diğer özel karakterler için yer bırakmanız gerekebileceğinden kullanıcınızın birincil dilini de göz önünde bulundurmanız gerekebilir. Bu konu hakkında daha fazla bilgiyi [uluslararasılaştırma](https://web.dev/learn/design/internationalization?hl=tr) modülünde bulabilirsiniz. 

## Metin boyutu

Web'deki metinlerin boyutunun ne olması gerektiğini bilmek zordur.

Küçük ekran kullanan birinin ekranı, gözlerine oldukça yakın olabilir (bir kol mesafesi).

Ancak ekranlar büyüdükçe bu bağlantıyı kurmak zorlaşıyor. Dizüstü bilgisayar boyutundaki bir ekran izleyiciye oldukça yakın olabilir ancak geniş ekranlı bir masaüstü monitörü, televizyon ekranıyla aynı boyuttadır. Kullanıcılar, masaüstü ekranına bir kol mesafesi uzaklıkta otururken televizyona çok daha uzak bir mesafede oturur.

Yine de bir kişinin ekrandan ne kadar uzakta olduğunu kesin olarak bilemeseniz de uygun olacağını umduğunuz metin boyutlarını kullanmayı deneyebilirsiniz. Küçük ekranlarda daha küçük, büyük ekranlarda ise daha büyük metin boyutları kullanın.

Ekran boyutu genişledikçe `font-size` özelliğini değiştirmek için medya sorgularını kullanabilirsiniz.

```
@media (min-width: 30em) {
  html {
    font-size: 125%;
  }
}

@media (min-width: 40em) {
  html {
    font-size: 150%;
  }
}

@media (min-width: 50em) {
  html {
    font-size: 175%;
  }
}

@media (min-width: 60em) {
  html {
    font-size: 200%;
  }
}
```

[  ](https://web.dev/static/learn/design/typography/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/cH8IU9hV7FGCgN0roNiU.mp4?hl=tr)

## Metni ölçeklendirme

Belirli kesme noktalarında sabit metin boyutları arasında geçiş yaparken oldukça fazla atlama oluyor. Daha duyarlı bir yaklaşım, kullanıcının cihaz genişliğinin metin boyutunu etkilemesine izin vermektir.

CSS'deki `vw` birimi "görüntü alanı genişliği" anlamına gelir. Yazı tipi boyutlarını görüntü alanının genişliğine bağlamak, metnin tarayıcı genişliğiyle orantılı olarak büyüyeceği ve küçüleceği anlamına gelir. Bu nedenle, belirli bir genişlikte metin boyutunun ne olacağını tahmin etmek zorlaşır ancak metin boyutunun kullanıcının tarayıcı genişliğine uygun olacağını bilirsiniz.

Yazı tipi boyutu bildiriminde `vw` değerini tek başına kullanmamanız önemlidir.

Yapılmaması gerekenler:

```
html {
  font-size: 2.5vw;
}
```

Bu durumda kullanıcı metnin boyutunu değiştiremez. `em`, `rem` veya `ch` gibi göreceli bir birim kullanırsanız metnin boyutu değiştirilebilir. Bu işlem için CSS [`calc()`](https://developer.mozilla.org/docs/Web/CSS/calc()) işlevi idealdir.

Yapılması gerekenler

```
html {
  font-size: calc(0.75rem + 1.5vw);
}
```

Tarayıcının hesaplamayı yapmasına izin verin. Bu durum, belirli bir genişlikte metin boyutunun tam olarak ne olacağını tahmin etmeyi zorlaştırır ancak metin boyutunun doğru aralıkta olacağını bilirsiniz. Tam metin boyutu hesaplamalarını kullanıcının tarayıcısı yapar.

[  ](https://web.dev/static/learn/design/typography/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/x5h7TqkGHJIPa61wPvAs.mp4?hl=tr)

Ancak artık dar ekranlarda metnin *çok* küçük, geniş ekranlarda ise *çok* büyük görünme ihtimali var.

## Metni sabitleme

Metninizin aşırı derecede küçülmesini ve büyümesini istemezsiniz. CSS [`clamp()`](https://developer.mozilla.org/docs/Web/CSS/clamp()) işlevini kullanarak ölçeklendirmenin nerede başlayıp nerede biteceğini kontrol edebilirsiniz. Bu işlem, ölçeklendirmeyi belirli bir aralıkta "sıkıştırır".

`clamp()` işlevi, `calc()` işlevine benzer ancak üç değer alır. Ortadaki değer, `calc()` öğesine ilettiğiniz değerle aynıdır. Açılış değeri, minimum boyutu belirtir. Bu örnekte, kullanıcının tercih ettiği yazı tipi boyutunun altına düşmemek için 1rem olarak ayarlanmıştır. Kapanış değeri, maksimum boyutu belirtir.

```
html {
  font-size: clamp(1rem, 0.75rem + 1.5vw, 2rem);
}
```

Artık metin boyutu, kullanıcının ekranıyla orantılı olarak küçülüp büyüyor ancak metin boyutu hiçbir zaman `1rem` değerinden küçük veya `2rem` değerinden büyük olmuyor.

[  ](https://web.dev/static/learn/design/typography/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/vVwP2L0z90zXL28iPYL4.mp4?hl=tr)

## Satır uzunluğu

Web, baskı değildir ancak baskı dünyasından dersler çıkarıp bunları web'de uygulayabiliriz.

Robert Bringhurst, klasik kitabı [*The Elements of Typographic Style*](http://webtypography.net/2.1.2)'da satır uzunluğu (veya ölçü) hakkında şunları söylüyor:

> 45 ila 75 karakter arasındaki her şey, tek sütunlu bir sayfada, metin boyutunda bir serifli metin yüzüyle ayarlanmış tatmin edici bir satır uzunluğu olarak kabul edilir. 66 karakterlik satır (hem harfler hem de boşluklar sayılır) ideal olarak kabul edilir. Birden fazla sütun içeren çalışmalarda daha iyi bir ortalama 40-50 karakterdir.

Satır uzunluğunu doğrudan CSS'de ayarlayamazsınız. `line-length` özelliği yok. Ancak kapsayıcının genişliğini sınırlayarak metnin çok geniş olmasını önleyebilirsiniz. [`max-inline-size`](https://developer.mozilla.org/docs/Web/CSS/max-inline-size) özelliği bu amaç için idealdir.

Satır uzunluklarınızı `px` gibi sabit bir birimle ayarlamayın. Kullanıcılar yazı tipi boyutlarını büyütebilir ve küçültebilir. Satır uzunluklarınız da buna göre ayarlanmalıdır. `rem` veya `ch` gibi bir [göreli birim](https://web.dev/learn/css/sizing?hl=tr#relative_lengths) kullanın.

Yapılmaması gerekenler:

```
article {
  max-inline-size: 700px;
}
```

Yapılması gerekenler

```
article {
  max-inline-size: 66ch;
}
```

Genişlik için `ch` birimlerinin kullanılması, yeni satırların bu yazı tipi boyutunda 66. karakterde kaydırılmasına neden olur.

[  ](https://web.dev/static/learn/design/typography/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/9Nxi6HuU28aQhxtzXq7l.mp4?hl=tr)

## Satır yüksekliği

CSS'de `line-length` özelliği olmasa da [`line-height`](https://developer.mozilla.org/docs/Web/CSS/line-height) özelliği vardır.

Daha kısa metin satırları daha büyük `line-height` değerlerine sahip olabilir. Ancak uzun metin satırları için büyük `line-height` değerleri kullanırsanız okuyucunun gözünün bir satırın sonundan bir sonraki satırın başına geçmesi zorlaşır.

```
article {
  max-inline-size: 66ch;
  line-height: 1.65;
}
blockquote {
  max-inline-size: 45ch;
  line-height: 2;
}
```

[  ](https://web.dev/static/learn/design/typography/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/di6psFbT6JhlwjtMm68j.mp4?hl=tr)

`line-height` beyanlarınız için birimsiz değerler kullanın. Bu, satır yüksekliğinin `font-size` ile orantılı olmasını sağlar.

Yapılmaması gerekenler:

```
line-height: 24px;
```

Yapılması gerekenler

```
line-height: 1.5;
```

## Kombinasyonlar ve ölçek

Daha iyi bir netlik ve sayfa akışı için kullanıcı arayüzlerinizi oluştururken hiyerarşiye öncelik vermeyi unutmayın. Bunu yapmanın en iyi yolu, [tasarım sisteminize yerleştirilmiş bir tipografi ölçeği](https://material.io/design/typography/the-type-system.html#type-scale) kullanmaktır.

## Web yazı tipleri

Yazı tipi, kelimelerinizin sesi gibidir. Web'de uzun süre boyunca çok az yazı tipi seçeneği vardı. Yalnızca sistem yazı tipleri kullanılabiliyordu. Ancak artık içeriğinizin tarzına uygun bir web yazı tipi seçebilirsiniz.

Tarayıcılara web yazı tipi dosyalarınızın nerede bulunacağını bildirmek için `@font-face` kullanın. Web yazı tipi biçimi olarak woff2'yi kullanın. İyi desteklenir ve en iyi performans artışlarını sağlar.

```
@font-face {
  font-family: Roboto;
  src: url('/fonts/roboto-regular.woff2') format('woff2');
}
body {
  font-family: Roboto, sans-serif;
}
```

Ancak eklediğiniz her web yazı tipi dosyası, sayfa yükleme süresini artırdığı için kullanıcı deneyimini olumsuz etkileyebilir. Tasarımın yalnızca son piksellerin görünümüyle ilgili olmadığını unutmayın. Bu piksellerin ne kadar hızlı oluşturulduğu, kullanıcı deneyiminin önemli bir parçasıdır. Hızlı bir deneyim, iyi bir kullanıcı deneyimidir.

## Yazı tipi yükleme

Tarayıcılardan, yazı tipi dosyasını mümkün olan en kısa sürede indirmeye başlamalarını isteyebilirsiniz. Belgenizin `head` bölümüne, web yazı tipi dosyanıza referans veren bir `link` öğesi ekleyin. `preload` değerine sahip bir `rel` özelliği, tarayıcıya bu dosyaya öncelik vermesini söyler. `as` özelliği, `font` değeriyle birlikte tarayıcıya bunun ne tür bir dosya olduğunu söyler. `type` özelliği, daha da ayrıntılı bilgi vermenizi sağlar.

```
<link href="/fonts/roboto-regular.woff2" type="font/woff2"
  rel="preload" as="font" crossorigin>
```

Yazı tipi dosyalarını kendiniz barındırıyor olsanız bile `crossorigin` özelliğini eklemeniz gerekir.

Tarayıcıya, sistem yazı tipinden web yazı tipine geçişi nasıl yöneteceğini bildirmek için CSS [`font-display`](https://developer.mozilla.org/docs/Web/CSS/@font-face/font-display) özelliğini kullanın. Web yazı tipi yüklenene kadar hiç metin göstermemeyi seçebilirsiniz. Sistem yazı tipini hemen görüntülemeyi ve yüklendikten sonra web yazı tipine geçmeyi seçebilirsiniz. Her iki stratejinin de dezavantajları vardır. Herhangi bir metin göstermeden önce web yazı tipinin indirilmesini beklerseniz kullanıcılar sinir bozucu bir şekilde uzun süre boş bir sayfaya bakmak zorunda kalabilir. Metni önce sistem yazı tipinde gösterip ardından web yazı tipine geçerseniz kullanıcılar sayfadaki içeriklerin sarsıcı bir şekilde kaydığını görebilir.

**Not:**  `@font-face` kuralınızda [`size-adjust`](https://web.dev/articles/css-size-adjust?hl=tr) kullanarak metnin kaymasıyla oluşan rahatsız edici etkiyi azaltabilirsiniz. 

İyi bir çözüm, metinleri göstermeden önce kısa bir süre beklemektir. Web yazı tipi, süre dolmadan önce yüklenirse metin, içerikte kayma olmadan web yazı tipi kullanılarak gösterilir. Süre dolduktan sonra web yazı tipi hâlâ yüklenmediyse metin, sistem yazı tipi kullanılarak gösterilir. Böylece kullanıcı içeriği okuyabilir.

Web yazı tipi yüklendiğinde sistem yazı tipinin yerine web yazı tipinin kullanılmasını istiyorsanız `font-display` değeri olarak `swap` kullanın.

```
body {
  font-family: Roboto, sans-serif;
  font-display: swap;
}
```

Metin oluşturulduktan sonra sistem yazı tipini kullanmaya devam etmek istiyorsanız `font-display` değeri olarak `fallback` değerini kullanın.

```
body {
  font-family: Roboto, sans-serif;
  font-display: fallback;
}
```

## Değişken yazı tipleri

Aynı yazı tipinin birçok farklı ağırlığını veya stilini kullanıyorsanız her ağırlık ya da stil için ayrı bir yazı tipi dosyası olmak üzere birçok ayrı yazı tipi dosyası kullanmanız gerekebilir.

[Değişken yazı tipleri](https://web.dev/articles/variable-fonts?hl=tr), tek bir dosya kullanarak bu sorunu çözer. Normal, kalın, ekstra kalın ve diğer varyantlar için ayrı dosyalar yerine, değişken yazı tipi dosyası duyarlıdır. Çeşitli ağırlıklarda veya stillerde gösterilmesi için gereken tüm bilgileri içerir.

![Farklı ağırlıklarda gösterilen A harfi.](https://web.dev/static/learn/design/typography/image/the-letter-shown-diff-ddf0d3e19bf74.png?hl=tr)

Bu nedenle, tek bir değişken yazı tipi dosyası, tek bir normal yazı tipi dosyasından daha büyüktür ancak tek bir değişken yazı tipi dosyası, muhtemelen birden fazla normal yazı tipi dosyasından daha küçüktür. Çok sayıda farklı ağırlık kullanıyorsanız değişken yazı tipi, performansta büyük bir artış sağlayabilir.

**Not:**  `font-face` özelliği için `system-ui` değerini kullanarak öğeleri stillendiriyorsanız herhangi bir yazı tipi dosyası indirmeden değişken yazı tiplerinin tüm avantajlarından yararlanabilirsiniz. [Artık daha fazla sistem yazı tipi değişken yazı tipi olarak kullanılabiliyor](https://web.dev/blog/more-variable-font-options-in-chromium-83?hl=tr). 

Web'de iyi bir tipografi, yalnızca tasarımcı olarak yaptığınız yazı tipi seçimleriyle ilgili değildir. Duyarlı tipografi, kullanıcının cihazına ve ağ bağlantısına saygı duymakla da ilgilidir. Sonuç olarak, nasıl görüntülenirse görüntülensin doğru hissettiren bir tasarım elde edilir.

Duyarlı metin konusunda uzmanlaştığınıza göre şimdi [duyarlı resimlere](https://web.dev/learn/design/responsive-images?hl=tr) geçme zamanı.

### Bilgilerinizi sınayın

Tipografi bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> Metnin görüntü alanında kaydırılması için stiller eklenmelidir.
> Doğru
> Stil eklemeniz gerekmez.
> Yanlış
> Metin, varsayılan olarak ek stil olmadan kaydırılır.
> clamp()
> , akıcı tipografi için yararlıdır çünkü
> calc()
> işlevlerinin daha kolay yerleştirilmesine olanak tanır.
> Bu doğru olsa da tipografi için
> clamp()
> kullanmak iyi bir neden değildir.
> Tarayıcı desteği mükemmeldir.
> Bu doğru olsa da tipografi için
> clamp()
> kullanmak iyi bir neden değildir.
> Bu özellik, yazı tipi boyutunun makul minimum ve maksimum değerler arasında kilitlenmesine olanak tanırken ölçeklenebilir bir orta değer de sağlar.
> Yazı tipi boyutunun sorunsuz bir şekilde ölçeklendirilmesini sağlarken çok küçük veya çok büyük metinleri de önler.
> Bu, hesaplamaları kolaylaştırır.
> Tekrar deneyin.
> Bu kılavuzda hangi tür
> line-height
> değerleri önerildi?
> 24px
> Gönderide,
> line-height
> için piksel değerleri kullanılmaması gerektiği açıkça belirtiliyor.
> 2rem
> Rems, göreli değerler olsa da çok küçük veya çok büyük satır yükseklikleri oluşturabilir.
> 1.5
> Birim içermeyen göreli değerler önerilir.
> 2vw
> Görüntü alanı birimleri (
> line-height
> ) sorunlu olabilir.
> font-display
> ne işe yarar?
> Tarayıcıya, sistem yazı tipinden web yazı tipine geçişin nasıl yönetileceğini bildirir.
> Özel bir yazı tipine geçişe yardımcı olur.
> Yazı tipinin
> block
> veya
> inline-block
> olarak ayarlanmasına izin verir.
> Yazı tiplerinin görüntüleme türleri yoktur.
> Yazı tipinin gizli olup olmadığını değiştirir.
> Yazı tipleri gizlenemez.
> Uzak yazı tiplerinin yüklenmesiyle ilgili kullanıcı deneyiminin zamanlaması üzerinde kontrol sağlar.
> Yazarların özel yazı tiplerinin yükleme deneyimini uyarlamasına yardımcı olur.
