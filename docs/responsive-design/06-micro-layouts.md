# Mikro düzenler

**Orijinal Kaynak:** [https://web.dev/learn/design/micro-layouts?hl=tr](https://web.dev/learn/design/micro-layouts?hl=tr)

---

Düzenler söz konusu olduğunda genellikle sayfa düzeyindeki tasarımları düşünürüz.
Ancak sayfa içindeki daha küçük bileşenlerin kendi bağımsız düzenleri olabilir.

İdeal olarak, bu bileşen düzeyindeki düzenler sayfadaki konumlarından bağımsız olarak otomatik olarak ayarlanır.
Bir bileşenin ana içerik sütununa mı, kenar çubuğuna mı yoksa her ikisine mi yerleştirileceğini bilmediğiniz durumlar olabilir.
Bir bileşenin nerede sonlanacağını kesin olarak bilmeden,
bileşenin kendisini kapsayıcısına göre ayarlayabildiğinden emin olmanız gerekir.

![Biri geniş, biri dar olmak üzere iki sütunlu bir düzen. Medya nesneleri, geniş veya dar sütunda olmalarına bağlı olarak farklı şekilde düzenlenir.](https://web.dev/static/learn/design/micro-layouts/image/a-column-layout-wide-a73d0e5e2462.png?hl=tr)

**Not:** Kapsayıcılarına uyum sağlayabilen bileşenler oluşturmak için [kapsayıcı sorgularını](https://developer.mozilla.org/docs/Web/CSS/CSS_Container_Queries) kullanmak daha kolay olabilir.

## Izgara

[CSS ızgarası](https://web.dev/learn/css/grid?hl=tr) yalnızca sayfa düzeyindeki düzenler için değildir.
Ayrıca, bu bileşenlerin içinde yer alan diğer bileşenler için de iyi sonuçlar verir.

Bu örnekte, `::before` ve `::after`
[sözde öğeleri](https://web.dev/learn/css/pseudo-elements?hl=tr), başlığın her iki tarafında dekoratif çizgiler oluşturur. Başlığın kendisi bir ızgara kapsayıcısıdır. Ayrı ayrı öğeler, çizgiler her zaman kullanılabilir alanı dolduracak şekilde düzenlenir.

```
h1 {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1em;
}
h1::before,
h1::after {
  content: "";
  border-top: 0.1em double black;
  align-self: center;
}
```

![Firefox'taki geliştirici araçlarında ızgara yerleşimi gösteriliyor.](https://web.dev/static/learn/design/micro-layouts/image/developer-tools-firefox-41cc2b52eb644.png?hl=tr)
![Chrome'daki geliştirici araçlarında ızgara yerleşimi gösteriliyor.](https://web.dev/static/learn/design/micro-layouts/image/developer-tools-chrome-s-295e54e7843c5.png?hl=tr)

Firefox ve Chrome gibi masaüstü tarayıcılarda, tasarımınızın üzerine yerleştirilmiş ızgara çizgilerini ve alanları gösterebilen geliştirici araçları bulunur.

Chrome Geliştirici Araçları'nda [ızgara düzenlerini nasıl inceleyeceğinizi](https://developer.chrome.com/docs/devtools/css/grid?hl=tr) öğrenin.

## Flexbox

Adından da anlaşılacağı gibi, [flexbox](https://web.dev/learn/css/flexbox?hl=tr)'ı kullanarak bileşenlerinizi esnek hale getirebilirsiniz. Bileşeninizdeki hangi öğelerin minimum veya maksimum boyuta sahip olması gerektiğini belirtebilir ve diğer öğelerin buna göre esnemesine izin verebilirsiniz.

Bu örnekte, resim mevcut alanın dörtte birini, metin ise dörtte üçünü kaplıyor.
Ancak resim hiçbir zaman 200 pikselden büyük olmaz.

```
.media {
  display: flex;
  align-items: center;
  gap: 1em;
}
.media-illustration {
  flex: 1;
  max-inline-size: 200px;
}
.media-content {
  flex: 3;
}
```

![Firefox'taki geliştirici araçlarında esnek kutu katmanı gösteriliyor.](https://web.dev/static/learn/design/micro-layouts/image/developer-tools-firefox-4f0d749fd4328.png?hl=tr)
![Chrome'daki geliştirici araçlarında flexbox katmanı gösteriliyor.](https://web.dev/static/learn/design/micro-layouts/image/developer-tools-chrome-s-49b481f837205.png?hl=tr)

Firefox ve Chrome'daki geliştirici araçları, esnek kutu bileşenlerinizin şeklini
görselleştirmenize yardımcı olabilir.

Chrome Geliştirici Araçları'nda [esnek kutu düzenlerini nasıl inceleyeceğinizi](https://developer.chrome.com/docs/devtools/css/flexbox?hl=tr) öğrenin.

## Kapsayıcı sorguları

Flexbox, içeriğe göre tasarım yapmanıza olanak tanır. Öğelerinizin parametrelerini (ne kadar dar veya geniş olmaları gerektiği) belirtebilir ve son uygulamayı tarayıcının bulmasına izin verebilirsiniz.

Ancak bileşenin kendisi bağlamının farkında değildir.
Ana içerikte mi yoksa kenar çubuğunda mı kullanıldığını bilmiyor.
Bu durum, bileşen düzenlerini sayfa düzenlerinden daha karmaşık hale getirebilir.
Bağlamla alakalı stiller uygulayabilmek için bileşenlerinizin, içinde bulundukları görünüm alanının boyutundan daha fazla bilgiye ihtiyacı vardır.

Sayfa düzenlerinde, kapsayıcı tarayıcı görüntü alanı olduğundan kapsayıcının genişliğini *bilirsiniz*. Medya sorguları, sayfa düzeyindeki kapsayıcının boyutlarını bildirir.

Herhangi bir kapsayıcının boyutlarını bildirmek için [kapsayıcı sorgularını](https://developer.mozilla.org/docs/Web/CSS/CSS_Container_Queries) kullanın.

Başlamak için hangi öğelerin kapsayıcı olarak işlev göreceğini tanımlayın.

```
main,
aside {
  container-type: inline-size;
}
```

Bu, satır içi boyutu sorgulamak istediğiniz anlamına gelir. İngilizce belgelerde bu, yatay eksendir. Stilleri kapsayıcının genişliğine göre değiştireceksiniz.

Bir bileşen bu kapsayıcılardan birinin içindeyse stilleri medya sorgularını uyguladığınız şekilde uygulayabilirsiniz.

```
.media-illustration {
  max-width: 200px;
  margin: auto;
}

@container (min-width: 25em) {
  .media {
    display: flex;
    align-items: center;
    gap: 1em;
  }

  .media-illustration {
    flex: 1;
  }

  .media-content {
    flex: 3;
  }
}
```

Bir medya nesnesi, `25em` değerinden daha dar bir kapsayıcının içindeyse flexbox stilleri uygulanmaz. Resim ve metin dikey olarak sıralanır.

Ancak kapsayan öğe `25em` değerinden daha genişse resim ve metin yan yana görünür.

Kapsayıcı sorgularıyla bileşenleri bağımsız olarak stilize edebilirsiniz. Kapsayan öğenin genişliğine göre kurallar yazabilirsiniz. Artık görünüm alanının genişliği önemli değildir.

![Farklı boyutlarda iki kap.](https://web.dev/static/learn/design/micro-layouts/image/two-containers-different-5a460bfff7342.png?hl=tr)

## Sorguları birleştirme

Sayfa düzeni için medya sorgularını, sayfa içindeki bileşenler için ise kapsayıcı sorgularını kullanabilirsiniz.

Burada sayfanın genel yapısında bir `main` öğesi ve bir `aside` öğesi var.
Her iki öğede de medya nesneleri var.

```
<body>
  <main>
     <div class="media">…</div>
     <div class="media">…</div>
  </main>
  <aside>
     <div class="media">…</div>
  </aside>
</body>
```

Medya sorgusu, görüntü alanı `45em` değerinden geniş olduğunda `main` ve `aside` öğelerine ızgara düzeni uygular.

```
@media (min-width: 45em) {
  body {
    display: grid;
    grid-template-columns: 3fr 1fr;
  }
}
```

Medya nesneleri için kapsayıcı sorgu kuralı aynı kalır:
yalnızca kapsayan öğe `25em` değerinden genişse yatay esnek kutu düzeni uygulayın.

![Biri geniş, biri dar olmak üzere iki sütunlu bir düzen.
Medya nesneleri, geniş veya dar sütunda olmalarına bağlı olarak farklı şekilde düzenlenir.](https://web.dev/static/learn/design/micro-layouts/image/a-column-layout-wide-d26ea1e0030e.png?hl=tr)

Kapsayıcı sorguları, mikro düzenler için oyunun kurallarını değiştiren bir yeniliktir.
Bileşenleriniz tarayıcı görüntü alanından bağımsız, kendi içinde tutarlı olabilir.

### Bilgilerinizi sınayın

Mikro düzenlerle ilgili bilginizi test edin.

> [Öğrendiklerinizi Test Edin]
> Grid ve flexbox, mikro düzenler için kullanışlı mı?
> Doğru
> 🎉 Doğru!
> Yanlış
> Yanlış. Izgara ve esnek kutu, en küçük düzenler için bile çok kullanışlıdır.

Daha önce sayfa düzeyinde makro düzenler hakkında bilgi edindiniz. Artık bileşen düzeyinde mikro düzenler hakkında bilgi sahibisiniz.

Ardından, içeriğinizin temel yapı taşlarını daha ayrıntılı bir şekilde inceleyecek ve resimlerinizi duyarlı hale getirmeyi öğreneceksiniz. İlk olarak [duyarlı tipografi](https://web.dev/learn/design/typography?hl=tr) hakkında bilgi edineceksiniz.
