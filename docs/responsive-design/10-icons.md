# Simgeler

**Orijinal Kaynak:** [https://web.dev/learn/design/icons?hl=tr](https://web.dev/learn/design/icons?hl=tr)

---

Görüntülerin çoğu içeriğinizin bir parçasıdır ancak simgeler kullanıcı arayüzünüzün bir parçasıdır.
Kullanıcı arayüzünüzdeki metinlerin ölçeklenip uyarlanmasıyla aynı şekilde ölçeklenip uyarlanmalıdır.

## Ölçeklenebilir Vektör Grafiği

Fotoğrafik görüntülerde, resim biçimi için birçok seçenek vardır: JPG, WebP ve AVIF.
Fotoğraf içermeyen görüntüler için Taşınabilir Ağ Grafiği (PNG) biçimi ile Ölçeklenebilir Vektör Grafiği (SVG) biçimi arasında seçim yapabilirsiniz.

Hem PNG hem de SVG, düz renk alanlarıyla başa çıkma konusunda iyidir ve her ikisi de resimlerinizin şeffaf arka planlara sahip olmasına olanak tanır.
PNG kullanıyorsanız muhtemelen resminizin farklı boyutlarda birden fazla sürümünü oluşturmanız ve `img` öğenizde `srcset` özelliğini kullanarak [resmi duyarlı hale getirmeniz](https://web.dev/learn/design/responsive-images?hl=tr) gerekir. SVG kullanıyorsanız varsayılan olarak duyarlıdır.

PNG'ler (ve JPG, WebP ve AVIF) bit eşlem resimlerdir. Bit eşlem resimler, bilgileri piksel olarak depolar. SVG'de bilgiler çizim talimatları olarak saklanır. Tarayıcı, SVG dosyasını okuduğunda talimatlar piksellere dönüştürülür. En iyi yanı da bu talimatların göreceli olmasıdır. Çizgileri ve şekilleri tanımlamak için kullandığınız boyutlardan bağımsız olarak her şey doğru netlikte oluşturulur. Farklı boyutlarda birden fazla SVG oluşturmak yerine, tüm boyutlarda çalışacak tek bir SVG oluşturabilirsiniz. `srcset` özelliğini kullanmanıza gerek yoktur.

```
<img src="image.svg" alt="A description of the image." width="25" height="25">
<img src="image.svg" alt="A description of the image." width="250" height="250">
```

XML, SVG dosyasındaki talimatları yazmak için kullanılır. Bu, HTML gibi bir işaretleme dilidir.

```
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE svg>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="-21 -21 42 42" width="100" height="100">
  <title>Smiling face</title>
  <circle r="20" fill="yellow" stroke="black"/>
  <ellipse rx="2.5" ry="4" cx="-6" cy="-7" fill="black"/>
  <ellipse rx="2.5" ry="4" cx="6" cy="-7" fill="black"/>
  <path stroke="black" d="M -12,5 A 13.5,13.5,0 0,0 12,5 A 13,13,0 0,1 -12,5"/>
</svg>
```

![Pikselleşmeden büyüyen sarı bir yüz emojisi.](https://web.dev/static/learn/design/icons/image/smiley-face-c6edfc71214c.svg?hl=tr)

SVG'yi HTML'nin içine bile yerleştirebilirsiniz.

```
<figure>
  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="-21 -21 42 42" width="100" height="100">
    <title>Smiling face</title>
    <circle r="20" fill="yellow" stroke="black"/>
    <ellipse rx="2.5" ry="4" cx="-6" cy="-7" fill="black"/>
    <ellipse rx="2.5" ry="4" cx="6" cy="-7" fill="black"/>
    <path stroke="black" d="M -12,5 A 13.5,13.5,0 0,0 12,5 A 13,13,0 0,1 -12,5"/>
  </svg>
  <figcaption>
  A description of the image.
  </figcaption>
</figure>
```

Bu şekilde bir SVG yerleştirirseniz tarayıcının yapması gereken istek sayısı bir azalır. Resim HTML ile birlikte geldiğinden indirilmesi için beklemeniz gerekmez. *HTML'de* HTML! Ayrıca, yakında öğreneceğiniz gibi, bu tür SVG'leri yerleştirmek, stil üzerinde daha fazla kontrol sahibi olmanızı sağlar.

## Simgeler ve metin

Simge resimlerinde genellikle şeffaf arka plan üzerinde basit şekiller bulunur. SVG, simgeler için idealdir.

İçinde metin ve simge bulunan bir düğme veya bağlantınız varsa simge sunum amaçlıdır. Önemli olan metindir. `img` öğesi kullanılırken boş bir `alt` özelliği, resmin sunum amaçlı olduğunu gösterir.

**Not:**  Boş bir `alt` özelliği, eksik bir `alt` özelliğiyle aynı şey değildir. Resim yalnızca sunum amaçlı olsa ve `alt` özelliğinde içerik olmasa bile her zaman bir `alt` özelliği sağlayın. 

```
<button>
<img src="hamburger.svg" alt="" width="16" height="16">
Menu
</button>
```

CSS sunum için olduğundan, simgeyi CSS'nize arka plan resmi olarak yerleştirebilirsiniz.

```
<button class="menu">
Menu
</button>
```

```
.menu {
  background-image: url(hamburger.svg);
  background-position: 0.5em;
  background-repeat: no-repeat;
  background-size: 1em;
  padding-inline-start: 2em;
}
```

SVG'yi HTML'nizin içine yerleştirirseniz yardımcı teknolojiden gizlemek için `aria-hidden` özelliğini kullanın.

```
<button class="menu">
  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" width="16" height="16">
    <rect width="100" height="20" />
    <rect y="30" width="100" height="20"/>
    <rect y="60" width="100" height="20"/>
  </svg>
  Menu
</button>
```

**Not:**  Aynı simgeyi bir sayfada birden çok kez kullanıyorsanız her seferinde SVG işaretlemesinin tamamını tekrarlamak verimsiz olur. SVG'de [`use`](https://developer.mozilla.org/docs/Web/SVG/Element/use) adlı bir öğe bulunur. Bu öğe, farklı bir SVG öğesinden olsa bile bir SVG'nin bir bölümünü "klonlamanıza" olanak tanır. 

## Bağımsız simgeler

Düğmelerinizin ve bağlantılarınızın amacının net olmasını istiyorsanız içlerinde metin kullanın. Metin içermeyen bir simge kullanabilirsiniz ancak herkesin belirli bir simgenin anlamını anlayacağını varsaymayın. Şüpheye düştüğünüzde gerçek kullanıcılarla test yapın.

Metin içermeyen bir simge kullanmaya karar verirseniz simge artık sunum amaçlı olmaz. CSS'deki arka plan resmi, simgeyi görüntülemek için uygun bir yöntem değildir. Simgeye HTML'de erişilebilir özellikli ad verilmesi gerekir.

`img` öğesi kullanıyorsanız simge, erişilebilir özellikli adını `alt` özelliğinden alır.

**Not:**  Genellikle `alt` özelliği, resmin içeriğini ("Üç yatay çizgi.") açıklar ancak bağımsız simgelerde `alt` özelliği, resmin anlamını ("Menü") açıklar. 

```
<button>
<img src="hamburger.svg" alt="Menu" width="16" height="16">
</button>
```

Diğer bir seçenek de erişilebilir adı bağlantının veya düğmenin kendisine yerleştirmek ve resmin sunum amaçlı olduğunu bildirmektir. Erişilebilir özellikli adı sağlamak için `aria-label` özelliğini kullanın.

```
<button aria-label="Menu">
<img src="hamburger.svg" alt="" width="16" height="16">
</button>
```

SVG'yi HTML'nizin içine yerleştirirseniz bağlantı veya düğmede `aria-label` özelliğini kullanarak erişilebilir bir ad verin ve simgede `aria-hidden` özelliğini kullanın.

```
<button aria-label="Menu">
  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" width="16" height="16">
    <rect width="100" height="20" />
    <rect y="30" width="100" height="20"/>
    <rect y="60" width="100" height="20"/>
  </svg>
</button>
```

## Stil simgeleri

SVG simgelerinizi doğrudan HTML'nize yerleştirirseniz bunların bazı kısımlarını sayfanızdaki diğer öğeler gibi stilize edebilirsiniz. Simgelerinizi göstermek için `img` öğesini kullanıyorsanız bunu yapamazsınız.

Aşağıdaki örnekte, SVG içindeki `rect` öğeleri, düğmenin metninin stilleriyle eşleşmesi için `blue` değerine sahip `fill` özelliğini kullanıyor.

```
button {
 color: blue;
}
button rect {
  fill: blue;
}
```

`hover` ve `focus` stillerini de uygulayabilirsiniz.

```
button:hover,
button:focus {
  color: red;
}
button:hover rect,
button:focus rect {
  fill: red;
}
```

## Kaynaklar

- CSS'nizdeki arka plan resimleri olan SVG'leri stilize etmeniz gerekiyorsa Una'nın [SVG arka planlarını renklendirme](https://css-tricks.com/solved-with-css-colorizing-svg-backgrounds/) hakkındaki makalesini okuyun.
- Sara Soueidan, [erişilebilir simge düğmeleri](https://www.sarasoueidan.com/blog/accessible-icon-buttons/) hakkında yazmıştır.
- Scott O'Hara, [erişilebilir resimlerin ve SVG'lerin bağlamsal olarak işaretlenmesi](https://www.scottohara.me/blog/2019/05/22/contextual-images-svgs-and-a11y.html) hakkında yazmıştır.
- SVG'leri dışa aktarmak için grafik tasarım aracı kullanıyorsanız çıktıyı optimize etmek için [SVGOMG](https://jakearchibald.github.io/svgomg/)'yi kullanın.

Simgeler, sitenizin marka tanıtımının önemli bir parçasıdır. Ardından, [temalar](https://web.dev/learn/design/theming?hl=tr) sayesinde markanızın diğer yönlerini nasıl duyarlı hale getireceğinizi öğreneceksiniz.

### Bilgilerinizi sınayın

Simgelerle ilgili bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> SVG, tek bir dosya veya
> <svg>
> kod bloğuyla tüm piksel yoğunluklarını işleyebilir.
> Doğru
> SVG, şekillerin ve çizgilerin herhangi bir piksel yoğunluğunda, ölçekte veya yakınlaştırmada nasıl çizileceğini içerir.
> Yanlış
> .png
> veya
> .jpg
> 'nin aksine, SVG'de
> srcset
> veya
> <picture>
> öğesine gerek yoktur.
> Doğrudan HTML'de bulunan SVG kodunun avantajları nelerdir?
> CSS'den stil verilebilir
> SVG simge şekillerini düğmeler ve marka renkleriyle eşleştirin.
> İndirme gerekmez.
> Tüm talimatlar orada yer alır.
> Varsayılan olarak tembel yüklenir.
> İndirme işlemiyle ilgili tembellik etmeyin.
> Daha az CPU kullanımı.
> Bu bilgiyi ben uydurdum.
> Yeni öğe olmadan açık veya koyu temalı.
> Medya sorguları, satır içi SVG stillerini değiştirebilir.
