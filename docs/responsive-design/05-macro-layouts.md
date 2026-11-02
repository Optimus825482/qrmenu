# Makro düzenleri

**Orijinal Kaynak:** [https://web.dev/learn/design/macro-layouts?hl=tr](https://web.dev/learn/design/macro-layouts?hl=tr)

---

Makro düzenler, arayüzünüzün sayfa genelindeki daha büyük düzenini tanımlar.

![İki sütunlu düzenin tel çerçevesi, dar görünüm için tek sütunlu aynı düzenin yanında.](https://web.dev/static/learn/design/macro-layouts/image/a-wireframe-a-column-la-a517dae97f715.jpeg?hl=tr)

Herhangi bir düzen uygulamadan önce içeriğinizin akışının mantıklı olduğundan emin olmalısınız.
Tek sütunlu varsayılan sıralama, daha küçük ekranlarda gösterilir.

```
<body>
  <header>…</header>
  <main>
    <article>…</article>
    <aside>…</aside>
  </main>
  <footer>…</footer>
</body>
```

Bu tek tek sayfa düzeyindeki bileşenleri düzenlediğinizde makro düzen tasarlarsınız: Sayfanızın üst düzey görünümü.
Medya sorgularını kullanarak CSS'de bu görünümün farklı ekran boyutlarına nasıl uyum sağlayacağını açıklayan kurallar sağlayabilirsiniz.

[  ](https://web.dev/static/learn/design/macro-layouts/video/HodOHWjMnbNw56hvNASHWSgZyAf2/3KENjI9FiNARctTiKDak.mp4?hl=tr)

## Izgara

[CSS ızgarası](https://web.dev/learn/css/grid?hl=tr), sayfanıza düzen uygulamak için mükemmel bir araçtır.
Önceki örnekte, yeterli ekran genişliği olduğunda iki sütunlu bir düzen istediğinizi varsayalım.
Tarayıcı yeterince geniş olduğunda bu iki sütunlu düzeni uygulamak için belirli bir kesme noktasının üzerindeki ızgara stillerini tanımlamak üzere bir medya sorgusu kullanın.

```
@media (min-width: 45em) {
  main {
    display: grid;
    grid-template-columns: 2fr 1fr;
  }
}
```

**Not:**  `min-width` yerine `min-inline-size` belirtmek daha mantıklı olsa da mantıksal özellikler henüz medya sorgularında çalışmamaktadır. 

## Flexbox

Bu düzen için [flexbox](https://web.dev/learn/css/flexbox?hl=tr) da kullanabilirsiniz.
Stiller şöyle görünür:

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

Ancak flexbox sürümü daha fazla CSS gerektirir.
Her sütunun ne kadar alan kaplaması gerektiğini açıklayan ayrı bir kural vardır.
Izgara örneğinde, aynı bilgiler kapsayıcı öğe için tek bir kuralda kapsüllenmiştir.

## Medya sorgusuna ihtiyacınız var mı?

Medya sorgusu kullanmanız her zaman gerekmeyebilir.
Birkaç öğede değişiklik yaparken medya sorguları sorunsuz çalışır ancak düzenin çok fazla güncellenmesi gerekiyorsa medya sorgularınız çok sayıda kesme noktasıyla kontrolden çıkabilir.

Kart bileşenleriyle dolu bir sayfanız olduğunu varsayalım.
Kartlar hiçbir zaman `15em` genişliğinden fazla olmuyor ve tek bir satıra mümkün olduğunca çok kart yerleştirmek istiyorsunuz.
`30em`, `45em` ve `60em` gibi kesme noktaları içeren medya sorguları yazabilirsiniz ancak bu oldukça yorucu ve bakımı zor bir yöntemdir.

Bunun yerine, kartların kendilerinin otomatik olarak doğru miktarda alan kaplaması için kurallar uygulayabilirsiniz.

```
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15em, 1fr));
  grid-gap: 1em;
}
```

Flexbox ile benzer bir düzen elde edebilirsiniz.
Bu durumda, son satırı dolduracak kadar kart yoksa kalan kartlar sütunlar halinde sıralanmak yerine kullanılabilir alanı dolduracak şekilde genişletilir.
Satır ve sütunları hizalamak istiyorsanız kılavuzu kullanın.

```
.cards {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1em;
}
.cards .card {
  flex-basis: 15em;
  flex-grow: 1;
}
```

Flexbox veya grid'de bazı akıllı kurallar uygulayarak, minimum CSS ile ve medya sorgusu kullanmadan dinamik makro düzenler tasarlamak mümkündür.
Bu sayede daha az çalışırsınız. Hesaplamaları tarayıcı yapar.
Medya sorguları gerektirmeyen akıcı modern CSS düzenlerinin bazı örneklerini görmek için [1linelayouts.com](https://1linelayouts.glitch.me/) adresini ziyaret edin.

### Bilgilerinizi sınayın

Makro düzenlerle ilgili bilginizi test edin.

> [Öğrendiklerinizi Test Edin]
> Aşağıdaki cümlelerden hangisi makro düzenleri en iyi şekilde tanımlar?
> Başka düzenler içeren düzenler.
> Tekrar deneyin. Çoğu düzende başka düzenler bulunur.
> Tasarımda flexbox veya ızgara kullanıldığında
> Tekrar deneyin. Ne esnek kutu ne de ızgara, makro düzenlerle ilgili özel bir şey içermez.
> Ekranın küçük bir kısmını kaplayan düşük seviyeli düzenler.
> Tekrar deneyin.
> Ekranın büyük bir bölümünü kaplayan üst düzey düzenler.
> 🎉 Makro düzenler, sayfanın temel düzenleridir. Büyük miktarda görsel alanı kapsar ve genellikle sayfa boyutu medya sorgularıyla ayarlanır.
> Makro düzenler, farklı ekran boyutlarına uyum sağlamak için her zaman medya sorgularını mı kullanır?
> Doğru
> Tekrar deneyin. Makro düzen, medya sorgularının kullanımıyla tanımlanmaz.
> Yanlış
> 🎉 Makro düzenler, medya sorgusu olmadan içeriğe uyacak, boş alanı dolduracak ve daha fazlasını yapacak şekilde ayarlanabilir.

Sayfa düzeyinde makro düzenlerle ilgili fikirler edindiğinize göre artık sayfa içindeki bileşenlere odaklanabilirsiniz. Bu, [mikro düzenlerin](https://web.dev/learn/design/micro-layouts?hl=tr) alanıdır.
