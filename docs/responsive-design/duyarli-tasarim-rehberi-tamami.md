# Google web.dev - Duyarlı Web Tasarımı Öğrenin (Learn Responsive Design)

Bu döküman, Google web.dev üzerindeki **Duyarlı Web Tasarımı (Responsive Web Design)** eğitim serisinin Türkçe makalelerinin eksiksiz birleştirilmiş halidir.

## İçindekiler

1. [Duyarlı Tasarımı Öğrenme'ye Hoş Geldiniz](#bolum-1-01-welcome)
2. [Giriş](#bolum-2-02-intro)
3. [Medya Sorguları](#bolum-3-03-media-queries)
4. [Uluslararası Hale Getirme](#bolum-4-04-internationalization)
5. [Makro Düzenleri](#bolum-5-05-macro-layouts)
6. [Mikro Düzenler](#bolum-6-06-micro-layouts)
7. [Yazı Biçimi](#bolum-7-07-typography)
8. [Uyumlu Görseller](#bolum-8-08-responsive-images)
9. [Resim Öğesi](#bolum-9-09-picture-element)
10. [Simgeler](#bolum-10-10-icons)
11. [Tema Oluşturma](#bolum-11-11-theming)
12. [Erişilebilirlik](#bolum-12-12-accessibility)
13. [Etkileşim](#bolum-13-13-interaction)
14. [Kullanıcı Arayüzü Kalıpları](#bolum-14-14-ui-patterns)
15. [Medya Özellikleri](#bolum-15-15-media-features)
16. [Ekran Yapılandırmaları](#bolum-16-16-screen-configurations)
17. [Sonuç ve Sonraki Adımlar](#bolum-17-17-conclusion)

---


<a id='bolum-1-01-welcome'></a>

## Bölüm 1: Duyarlı Tasarımı Öğrenme'ye hoş geldiniz.

**Kaynak:** [https://web.dev/learn/design/welcome?hl=tr](https://web.dev/learn/design/welcome?hl=tr)


Duyarlı tasarımın tüm yönlerini inceleyen bir kurs. Herkes için iyi görünen ve iyi çalışan siteleri nasıl oluşturacağınızı öğrenin.

Bu kursta, modern duyarlı web tasarımının birçok alanında bir yolculuğa çıkacaksınız.
İlk birkaç modül, duyarlı tasarımın nereden geldiğini öğrenip duyarlı düzenlerle ilgili temel bilgilere göz atmanızı kolaylaştıracak.
Buradan, duyarlı resimler, yazı tipleri, erişilebilirlik ve daha fazlası hakkında bilgi edinebilirsiniz.

Bu süreçte web sitelerini kullanıcı tercihlerine ve cihaz özelliklerine göre nasıl uygun hale getirebileceğinizi öğreneceksiniz.
Eğitimin sonunda, duyarlı tasarımın gelecekteki özelliklerini de öğrenmiş olacaksınız.

Her modülde bilginizi sınamanız için demolar ve kişisel değerlendirme bölümleri bulunur.

Bu kurs yeni ve orta seviye tasarımcılar ve geliştiriciler için hazırlanmıştır.
HTML ve CSS ile ilgili temel bir anlayışa sahip olmak yeterli olacaktır.
Herhangi bir JavaScript bilmeniz gerekmez.
Web sitesi oluşturma konusunda tamamen yeniyseniz [HTML'ye giriş](https://developer.mozilla.org/docs/Learn/HTML/Introduction_to_HTML) ve [CSS'yi öğrenmenize](https://web.dev/learn/css?hl=tr) yardımcı olacak başka bir kursa göz atabilirsiniz.

Öğrenecekleriniz:

### [Giriş](https://web.dev/learn/design/intro?hl=tr)

Duyarlı tasarımın nereden geldiğini öğrenin.

### [Medya sorguları](https://web.dev/learn/design/media-queries?hl=tr)

CSS medya sorgularını kullanarak tasarımlarınızı farklı ekran boyutlarına uyarlayın.

### [Uluslararası hale getirme](https://web.dev/learn/design/internationalization?hl=tr)

Tasarımlarınızı farklı diller ve yazma modları için hazırlayın.

### [Makro düzenleri](https://web.dev/learn/design/macro-layouts?hl=tr)

Seçilen CSS tekniklerini kullanarak sayfa düzenleri tasarlayın.

### [Mikro düzenler](https://web.dev/learn/design/micro-layouts?hl=tr)

İstediğiniz yere yerleştirebileceğiniz esnek bileşenler oluşturun.

### [Yazı biçimi](https://web.dev/learn/design/typography?hl=tr)

Metniniz nerede görünürse görünsün okunaklı ve güzel olsun.

### [Duyarlı resimler](https://web.dev/learn/design/responsive-images?hl=tr)

Ziyaretçilerinize cihazları ve ekranları için en uygun resimleri sunun.

### [Resim öğesi](https://web.dev/learn/design/picture-element?hl=tr)

Resimleriniz üzerinde daha fazla yaratıcı kontrol sağlayın.

### [Simgeler](https://web.dev/learn/design/icons?hl=tr)

Ölçeklenebilir, duyarlı ikonlar için SVG'yi kullanın.

### [Tema oluşturma](https://web.dev/learn/design/theming?hl=tr)

Tasarımlarınızı, koyu mod gibi kullanıcı tercihlerine uyacak şekilde uyarlayın.

### [Erişilebilirlik](https://web.dev/learn/design/accessibility?hl=tr)

Web sitenizin herkesin kullanımına açık olduğundan emin olun.

### [Etkileşim](https://web.dev/learn/design/interaction?hl=tr)

Sayfalarınızı farklı giriş mekanizmalarına (fare, klavye ve dokunma) hazırlayın.

### [Kullanıcı arayüzü kalıpları](https://web.dev/learn/design/ui-patterns?hl=tr)

Farklı ekran boyutlarına uyum sağlayan yaygın kullanıcı arayüzü öğelerinden bazılarını düşünün.

### [Medya özellikleri](https://web.dev/learn/design/media-features?hl=tr)

Medya özelliklerinin cihazlara ve tercihlere yanıt vermenize olanak sağladığı tüm yolların bir özeti.

### [Ekran yapılandırmaları](https://web.dev/learn/design/screen-configurations?hl=tr)

İçeriğinizi birden fazla ekranı olan cihazlara hazırlayın.

### [Sonuç ve sonraki adımlar](https://web.dev/learn/design/conclusion?hl=tr)

Sonraki adımlarınızı atmanıza yardımcı olacak diğer kaynaklar.

Peki, duyarlı tasarımı öğrenmeye hazır mısınız?

**Not:**  Bu kurs [Rachel Andrew](https://twitter.com/rachelandrew), [Una Kravets](https://twitter.com/Una), [Adam Argyle](https://twitter.com/argyleink) ve [Camden Bickel](https://twitter.com/camdenbickel)'in girdileri ve incelemeleri ile [Jeremy Keith](https://twitter.com/adactio) tarafından yazılmıştır.


---


<a id='bolum-2-02-intro'></a>

## Bölüm 2: Giriş

**Kaynak:** [https://web.dev/learn/design/intro?hl=tr](https://web.dev/learn/design/intro?hl=tr)


World Wide Web, başlangıçtan itibaren donanım ve işletim sistemi seçiminizden bağımsız olacak şekilde tasarlanmıştır.
İnternete bağlanabildiğiniz sürece World Wide Web'e de erişebilirsiniz.

Web'in ilk günlerinde çoğu kullanıcı masaüstü bilgisayar kullanıyordu.
Günümüzde web'i masaüstü bilgisayarlarda, dizüstü bilgisayarlarda, tabletlerde, katlanabilir telefonlarda, buzdolaplarında ve arabalarda kullanabilirsiniz. Kullanıcılar, hangi cihazı kullanırlarsa kullansınlar web sitelerinin iyi görünmesini ister. Duyarlı tasarım bunu mümkün kılar.

Duyarlı tasarım, web siteleri tasarlama konusunda ilk yaklaşım değildir.
Uyumlu tasarımdan önceki yıllarda web tasarımcıları ve geliştiricileri birçok farklı teknik denemişti.

## İlk tasarım seçenekleri

Geliştiriciler, [sabit genişlikli](#fixed-width_design) veya [akışkan düzenlere](#liquid_layouts) sahip web siteleri oluşturuyordu.

### Sabit genişlikli tasarım

Web'in ilk popüler olduğu 1990'ların başlarında çoğu monitörün ekran boyutları 640 piksel genişlik ve 480 piksel yükseklikti.
Bunlar, şu anda sahip olduğumuz düz sıvı kristal
ekranların aksine dışbükey katot ışını tüpleriydi.

![İki basit metin sütunu ve bir gezinme menüsü içeren Microsoft web sitesi.](https://web.dev/static/learn/design/intro/image/the-microsoft-website-tw-ce50cc6f6c5b2.png?hl=tr)

90'ların sonlarındaki Microsoft web sitesi 640 piksel genişlik için tasarlanmıştır. [archive.org](https://archive.org)

 ekran görüntüsü

Web tasarımının ilk günlerinde, 640 piksel genişliğinde web sayfaları tasarlamak güvenli bir fikirdi.
Ancak telefon ve kamera gibi diğer teknolojiler küçülürken ekranlar büyüyordu (ve sonunda daha ince hale geldi).
Kısa süre sonra çoğu ekranın boyutu 800x600 piksel oldu.
Web tasarımları buna göre değiştirildi. Tasarımcılar ve geliştiriciler, 800 piksel değerinin güvenli bir varsayılan değer olduğunu varsaymaya başladı.

![Microsoft web sitesinde üç sütunlu, çoğunlukla metne dayalı bir tasarım kullanılıyordu.](https://web.dev/static/learn/design/intro/image/the-microsoft-website-usi-f1a8277511b8f.png?hl=tr)

2000'lerin başında 800 piksel genişliğinde tasarlanmış Microsoft web sitesi. [archive.org](https://archive.org) ekran görüntüsü

Ardından ekranlar tekrar büyüdü. 1024x768 varsayılan olarak ayarlandı.
Bu durum, web tasarımcıları ile donanım üreticileri arasındaki bir silahlanma yarışı gibiydi.

​​

![Metnin yanı sıra resimlerin de kullanıldığı daha karmaşık bir tasarıma sahip Microsoft web sitesi.](https://web.dev/static/learn/design/intro/image/the-microsoft-website-a-3434dfccbd5a4.png?hl=tr)

2000'lerin ortalarında 1024 piksel genişliğinde tasarlanmış Microsoft web sitesi. [archive.org](https://archive.org)

 ekran görüntüsü

640, 800 veya 1024 piksel olsun, tasarım için belirli bir genişlik seçmek sabit genişlikli tasarım olarak adlandırılıyordu.

Düzeniniz için sabit bir genişlik belirtirseniz düzeniniz yalnızca bu genişlikte iyi görünür.
Sitenizin ziyaretçilerinin ekranı seçtiğiniz genişlikten daha genişse ekranda boş alan olur.
Bu alanı daha eşit şekilde dağıtmak için sayfalarınızın içeriğini ortalarsanız (bir tarafta boş alan yerine) kullanılabilir alandan tam olarak yararlanamazsınız.

![Etrafında çok fazla boş alan bulunan dar bir sayfa düzeni.](https://web.dev/static/learn/design/intro/image/a-narrow-layour-a-lot-w-c2dedf8182187.png?hl=tr)

2000'lerin başından kalma Yahoo web sitesi, sitenin 800 piksel genişliğindeki tasarımından daha geniş bir tarayıcıda deneyimlendiği şekilde. [archive.org](https://archive.org)

 ekran görüntüsü

Benzer şekilde, bir ziyaretçi seçtiğiniz genişlikten daha dar bir ekranla gelirse içeriğiniz yatay olarak sığmaz.
Tarayıcı, kaydırma çubuğunun yatay eşdeğeri olan bir tarama çubuğu oluşturur ve kullanıcının tüm içeriği görmek için sayfanın tamamını sola ve sağa hareket ettirmesi gerekir.

![Görüntü alanı için çok geniş olduğu için sağ taraftan kesilmiş görünen bir web sitesi.](https://web.dev/static/learn/design/intro/image/a-website-appears-cut-of-472624a1b5e38.png?hl=tr)

2000'lerin başındaki Yahoo web sitesi, sitenin 800 piksel genişliğindeki tasarımından daha dar bir tarayıcıda gösteriliyor. [archive.org](https://archive.org)

 ekran görüntüsü

### Akışkan düzenler

Tasarımcıların çoğu sabit genişlikli düzenler kullanırken bazıları düzenleri esnek hale getirmeyi tercih etti.
Düzenleriniz için sabit genişlikler kullanmak yerine, sütun genişlikleri için yüzde değerleri kullanarak esnek bir düzen oluşturabilirsiniz.
Bu tasarımlar, yalnızca belirli bir boyutta doğru görünen sabit genişlikli bir düzenden daha fazla durumda işe yarar.

Bunlara sıvı düzenler adı verilir.
Sıvı bir tasarım, çeşitli genişliklerde iyi görünse de uç noktalarda kötüleşir.
Geniş ekranda düzen gerilmiş görünür.
Dar bir ekranda düzen bozuk görünüyor. Her iki senaryo da ideal değildir.

![Dar bir pencereye sıkıştırılmış bir düzen.](https://web.dev/static/learn/design/intro/image/a-layout-is-squashed-a-957ff07c0576c.png?hl=tr)

Wikipedia'nın dar bir tarayıcı penceresindeki 2000'lerin ortalarından kalma sıvı düzeni. [archive.org](https://archive.org)

'dan ekran görüntüsü
​​
![Çok uzun satır uzunluklarına sahip, yatay olarak gerilmiş bir düzen.](https://web.dev/static/learn/design/intro/image/a-layout-stretched-horizo-7621b8dda3062.png?hl=tr)

2000'lerin ortalarından itibaren geniş bir tarayıcı penceresinde kullanılan Wikipedia'nın sıvı düzeni. [archive.org](https://archive.org)

 ekran görüntüsü

Bu sorunları azaltmak için düzeninizde `min-width` ve `max-width` öğelerini kullanabilirsiniz.
Ancak minimum genişliğin altındaki veya maksimum genişliğin üzerindeki herhangi bir boyutta, sabit genişlikli bir düzende karşılaşacağınız sorunlarla karşılaşırsınız.
Geniş bir ekranda kullanılmayan alan boşa gider.
Dar bir ekranda kullanıcının her şeyi görmek için sayfanın tamamını sola ve sağa hareket ettirmesi gerekir.

Pencerenin boyutunu değiştirmenin tasarımı nasıl gerdiğini görmek için [akışkan düzen örneğini](https://codepen.io/web-dot-dev/pen/YzxEzpE) yeni bir tarayıcı penceresinde açın.

*Sıvı* kelimesi, bu tür bir düzeni tanımlamak için kullanılan terimlerden yalnızca biridir.
Bu tür tasarımlara akış düzeni veya esnek düzen de denir.
Terminoloji de teknik kadar akıcıydı.

## Farklı ekran boyutları için geliştirme yapın

21. yüzyılda web gittikçe daha da büyüdü.
Gözlemciler de öyle. Ancak masaüstü cihazlardan daha küçük yeni ekranlar piyasaya sürüldü.
Tam özellikli web tarayıcılarına sahip cep telefonlarının piyasaya çıkmasıyla birlikte tasarımcılar bir ikilemle karşı karşıya kaldı.
Tasarımlarının masaüstü bilgisayarda ve cep telefonunda iyi görünmesini nasıl sağlayabilirler?
İçeriklerini 240 piksel genişliğinden binlerce piksel genişliğine kadar farklı ekranlar için biçimlendirmenin bir yoluna ihtiyaçları vardı.

### Ayrı siteler

Mobil ziyaretçiler için ayrı bir alt alan oluşturabilirsiniz.
Ancak sonrasında iki ayrı kod tabanı ve tasarımı tutmanız gerekir.
Ayrıca, mobil cihazlardaki ziyaretçileri yönlendirmek için [kullanıcı aracısı koklama](https://en.wikipedia.org/wiki/Browser_sniffing) işlemi yapmanız gerekir. Bu işlem güvenilir olmayabilir ve kimliğe bürünmeyle karşılaşabilirsiniz.
Chrome, bu tür pasif parmak izi alma işlemlerini önlemek için [kullanıcı aracısı dizesini azaltmıştır](https://developers.google.com/privacy-sandbox/protections/user-agent?hl=tr).
Ayrıca, mobil cihazlar ile mobil olmayanlar arasında net bir çizgi yoktur. Tablet cihazları hangi siteye gönderiyorsunuz?

### Uyarlanabilir düzenler

Farklı alt alan adlarında ayrı siteler yerine, iki veya üç sabit genişlikli düzene sahip tek bir siteniz olabilir.

Medya sorguları CSS'ye ilk geldiğinde, düzenleri daha esnek hale getirmenin kapısını açtı.
Ancak pek çok geliştirici hâlâ sabit genişlikli düzenler üretmekte en rahat hissediyordu.
Bir teknik, belirli genişliklerde birkaç sabit genişlikli düzen arasında geçiş yapmayı içeriyordu.
Bazıları buna uyarlanabilir tasarım diyor.

Uyarlanabilir tasarım, tasarımcıların birkaç farklı boyutta iyi görünen düzenler sunmasına olanak tanısa da tasarım, bu boyutlar arasında görüntülendiğinde hiçbir zaman tam olarak doğru görünmüyordu.
Sabit genişlikli düzen kadar kötü olmasa da fazla alan sorunu devam ediyordu.

CSS medya sorgularını kullanarak kullanıcılara tarayıcı genişliklerine en yakın düzeni sunabilirsiniz.
Ancak cihaz boyutlarının çok çeşitli olması nedeniyle, ekran düzeni büyük olasılıkla çoğu kullanıcıya pek mükemmel görünmüyor.

Pencerenin boyutunu değiştirmenin tasarımın düzenler arasında geçiş yapmasına nasıl neden olduğunu görmek için [uyarlanabilir düzen örneğini](https://codepen.io/web-dot-dev/pen/oNeoNYw) yeni bir tarayıcı penceresinde açın.

### Duyarlı web tasarımı

Uyumlu düzenler medya sorguları ile sabit genişlikli düzenlerin bir karışımıysa duyarlı web tasarımı da medya sorguları ile sıvı düzenlerin bir karışımıdır.

Pencerenin boyutunun değiştirilmesinin tasarımın düzenini nasıl akışkan bir şekilde değiştirmesine neden olduğunu görmek için [duyarlı tasarım örneğini](https://codepen.io/web-dot-dev/pen/JjyOjbE) yeni bir tarayıcı penceresinde açın.

Terim, 2010 yılında [Ethan Marcotte](https://ethanmarcotte.com/) tarafından [A List Apart'ta yayınlanan bir makalede](https://alistapart.com/article/responsive-web-design/) kullanılmıştır.

Ethan, duyarlı tasarım için üç ölçüt belirledi:

1. Akışkan ızgaralar
2. Değişken medya
3. Medya sorguları

Duyarlı bir sitenin düzeni ve resimleri tüm cihazlarda iyi görünür. Ama bir sorun vardı.

### `viewport` için bir `meta` öğesi

Cep telefonlarındaki tarayıcılar, daha geniş ekranlar için sabit genişlikli düzenlerle tasarlanmış web siteleriyle uğraşmak zorunda kalıyordu.
Varsayılan olarak mobil tarayıcılar, kullanıcıların tasarım yaparken hedeflediği genişliğin 980 piksel olduğunu varsayıyordu (ve yanılmıyorlardı).
Bu nedenle, sıvı bir düzen kullansanız bile tarayıcı 980 piksel genişlik uygular ve ardından oluşturulan web sayfasını ekranın gerçek genişliğine göre ölçeklendirir.

Duyarlı tasarım kullanıyorsanız tarayıcıya bu ölçeklendirmeyi yapmamasını söylemeniz gerekir.
Bunu, web sayfasının `head` bölümündeki `meta` öğesiyle yapabilirsiniz:

```
<meta name="viewport" content="width=device-width, initial-scale=1">
```

Virgülle ayrılmış iki değer vardır.
İlki `width=device-width`.
Bu, tarayıcıya, web sitesinin genişliğinin cihazın genişliğiyle aynı olduğunu (web sitesinin genişliğinin 980 piksel olduğunu varsaymak yerine) varsaymasını söyler.
İkinci değer `initial-scale=1`.
Bu, tarayıcıya ne kadar veya ne kadar az ölçeklendirme yapılacağını bildirir. Uyumlu tasarımda, tarayıcı tarafından hiç ölçeklendirme yapılmasını istemezsiniz.

![Meta etiketi bulunmadığı için uzaklaştırılmış olarak görünen bir cep telefonu ve metin içeren iki cep telefonu resmi.](https://web.dev/static/learn/design/intro/image/images-two-mobile-phones-6d335a19e1c9c.png?hl=tr)

Soldaki telefonda, meta etiket eklenmeden önce sayfanın nasıl göründüğü sağdaki sayfayla karşılaştırmalı olarak gösterilmektedir.

Bu `meta` öğesi eklendiğinde web sayfalarınız duyarlı olmaya hazır olur.

## Modern duyarlı tasarım

Artık görüntü alanı boyutlarının çok ötesinde duyarlı web siteleri oluşturabiliyoruz.
Medya özellikleri, geliştiricilere kullanıcı tercihlerine erişim sağlar ve özelleştirilmiş deneyimler sunar.
Kapsayıcı sorguları, bileşenlerin kendi duyarlı bilgilerine sahip olmasını sağlar.
`picture` öğesi, tasarımcıların ekran oranlarına göre sanat yönü kararları vermesine yardımcı olur.

### Öğrendiklerinizi test etme

Duyarlı web tasarımı hakkındaki bilgilerinizi test edin

> [Öğrendiklerinizi Test Edin]
> 2021'de web sayfalarını sabit genişlikte tasarlamak güvenli bir seçim mi?
> true
> 2021'de sabit genişlikli tasarıma güvenmek güvenli değildir.
> yanlış
> 🎉 Doğru. Olası ekran boyutlarının sayısı, ziyaretçilerin tek bir boyuttan geleceğini varsaymak için çok fazladır.
> Sıvı düzenler genellikle hangi ekran boyutlarında sorun yaşanır?
> Dar ekranlar
> 🎉 Doğru. Dar bir ekranın aşırı boyutu sıvı yerleşimlerini sıkışık görünebilir.
> Ortalama ekran sayısı
> Tekrar deneyin. Sıvı düzenler, ortalama boyutlu ekranlarda iyi performans gösterir.
> Geniş ekranlar
> 🎉 Geniş veya hatta ultra geniş ekranların aşırı boyutu, akışkan düzenleri rahatsız edici okuma uzunluklarına kadar uzatabilir.
> Kısa ekranlar
> Tekrar deneyin. Kısa ekranlar genellikle sıvı düzenleri destekleme konusunda sorun yaşamaz.
> Uzun ekranlar
> Tekrar deneyin. Uzun ekranlar genellikle sıvı yerleşimleri desteklemekte zorlanmaz.
> Tüm ekranlar
> Tekrar deneyin. Sıvı düzenler, birçok ekran boyutu için mükemmel bir seçimdir.
> Duyarlı tasarım için orijinal üç kriter nedir?
> Akışkan yazı biçimi
> Tekrar deneyin. Değişken yazı tipi, ilk ölçütlerden biri değildi.
> Akışkan ızgaralar
> 🎉 Doğru.
> Uyarlanabilir ızgaralar
> Tekrar deneyin. Uyarlanabilir ızgara, ayarlanan görüntü alanı boyutlarına göre değişir.
> Değişken medya
> 🎉 Doğru.
> Sabit genişlikli tasarım
> Tekrar deneyin. Sabit genişlikli tasarımlar, sabit ve duyarlı olmayan genişliğe sahip bir tasarımı ifade eder.
> Medya sorguları
> 🎉 Doğru.

Duyarlı tasarım, heyecan verici ve büyüyen bir olasılıklar dünyasıdır.
Bu kursun geri kalanında bu teknolojiler hakkında bilgi edinecek ve herkes için güzel, duyarlı web siteleri oluşturmak üzere bunları nasıl kullanacağınızı öğreneceksiniz.


---


<a id='bolum-3-03-media-queries'></a>

## Bölüm 3: Medya sorguları

**Kaynak:** [https://web.dev/learn/design/media-queries?hl=tr](https://web.dev/learn/design/media-queries?hl=tr)


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


---


<a id='bolum-4-04-internationalization'></a>

## Bölüm 4: Uluslararası hale getirme

**Kaynak:** [https://web.dev/learn/design/internationalization?hl=tr](https://web.dev/learn/design/internationalization?hl=tr)


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


---


<a id='bolum-5-05-macro-layouts'></a>

## Bölüm 5: Makro düzenleri

**Kaynak:** [https://web.dev/learn/design/macro-layouts?hl=tr](https://web.dev/learn/design/macro-layouts?hl=tr)


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


---


<a id='bolum-6-06-micro-layouts'></a>

## Bölüm 6: Mikro düzenler

**Kaynak:** [https://web.dev/learn/design/micro-layouts?hl=tr](https://web.dev/learn/design/micro-layouts?hl=tr)


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


---


<a id='bolum-7-07-typography'></a>

## Bölüm 7: Yazı biçimi

**Kaynak:** [https://web.dev/learn/design/typography?hl=tr](https://web.dev/learn/design/typography?hl=tr)


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


---


<a id='bolum-8-08-responsive-images'></a>

## Bölüm 8: Uyumlu görseller

**Kaynak:** [https://web.dev/learn/design/responsive-images?hl=tr](https://web.dev/learn/design/responsive-images?hl=tr)


Web'deki metin, taşmaması için ekranın kenarında otomatik olarak kaydırılır. Resimlerin ise doğal bir boyutu vardır. Ekrandan daha geniş olan resimler taşar ve kullanıcının tamamını görebilmek için yatay olarak kaydırması gerekir.

Neyse ki CSS, bu durumun yaşanmasını önlemek için kullanabileceğiniz araçlar sunar.

## Resimlerinizi sınırlama

Stil sayfanızda, resimlerin hiçbir zaman kapsayan öğeden daha geniş bir boyutta oluşturulamayacağını belirtmek için [`max-inline-size`](https://developer.mozilla.org/docs/Web/CSS/max-inline-size) kullanabilirsiniz.

Browser Support

- ![Chrome: 57.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  57
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 41.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  41
- ![Safari: 12.1.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  12.1

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/max-inline-size)

```
img {
  max-inline-size: 100%;
  block-size: auto;
}
```

**Not:** İsterseniz `max-inline-size` yerine `max-width` kullanabilirsiniz ancak [mantıksal özellikler](https://web.dev/learn/design/internationalization?hl=tr#logical_properties) açısından düşünme alışkanlığı kazanmanızı öneririz.

Aynı kuralı, videolar ve iFrame'ler gibi diğer yerleştirilmiş içerik türlerine de uygulayabilirsiniz.

```
img,
video,
iframe {
  max-inline-size: 100%;
  block-size: auto;
}
```

Bu kural uygulandığında tarayıcılar, resimleri ekrana sığacak şekilde otomatik olarak küçültür.

![İki ekran görüntüsü: Birincisinde, tarayıcı genişliğini aşan bir resim gösteriliyor. İkincisinde ise aynı resmin tarayıcı görüntü alanıyla sınırlandırıldığı gösteriliyor.](https://web.dev/static/learn/design/responsive-images/image/two-screenshots-first-s-fbd980b13ed58.png?hl=tr)

Resminizi sınırladığınızda kullanıcılar, ekranı kaydırmadan resmin tamamını görebilir.

[`block-size`](https://developer.mozilla.org/docs/Web/CSS/block-size)
değerini `auto` olarak ayarladığınızda tarayıcı, resimlerinizi yeniden boyutlandırırken en boy oranını korur.

Bazen bir resmin boyutları içerik yönetim sistemi (İYS) veya başka bir içerik yayınlama sistemi tarafından ayarlanır. Tasarımınızda İYS'nin varsayılanından farklı bir en-boy oranı kullanılıyorsa sitenizin tasarımını korumak için [`aspect-ratio`](https://developer.mozilla.org/docs/Web/CSS/aspect-ratio) özelliğini kullanabilirsiniz:

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
}
```

Maalesef bu durum genellikle tarayıcının, resmi amaçlanan alana sığdırmak için sıkıştırması veya genişletmesi gerektiği anlamına gelir.

![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin profil resmi. Ancak resim sıkıştırılmış.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-6886fa1061908.jpg?hl=tr)

Resmin en-boy oranının değiştirilmesi, resmin
sıkıştırılmış veya uzatılmış görünmesine neden olur.

Sıkıştırmayı ve uzatmayı önlemek için [`object-fit`](https://developer.mozilla.org/docs/Web/CSS/object-fit) özelliğini kullanın.

Browser Support

- ![Chrome: 32.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  32
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 36.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  36
- ![Safari: 10.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  10

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/object-fit)

`object-fit` değeri `contain` olduğunda tarayıcıya, gerekirse resmin etrafında boş alan bırakarak resmin en boy oranını koruması söylenir.

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
  object-fit: contain;
}
```

`object-fit` değeri `cover` olan bir resim, tarayıcıya resmin en boy oranını korumasını ve gerekirse resmi kırpmasını söyler.

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
  object-fit: cover;
}
```

![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin profili. Resmin her iki tarafında da boş alan var.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-19f229b25e797.jpg?hl=tr)
![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin profili. Resmin üst ve alt kısımları kırpılmış.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-9a3c6aedc16d2.jpg?hl=tr)

`object-fit` için iki farklı değerin uygulandığı aynı resim. Birincisinde "contain" (içer) değeri, ikincisinde ise "cover" (kapla) değeri kullanılıyor.

Resim kırpma işleminin konumunu [object-position](https://developer.mozilla.org/docs/Web/CSS/object-position) özelliğini kullanarak değiştirebilirsiniz. Bu işlem, kırpma işleminin odağını ayarlar. Böylece resmin en önemli kısmının görünür kalmasını sağlayabilirsiniz.

Browser Support

- ![Chrome: 32.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  32
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 36.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  36
- ![Safari: 10.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  10

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/object-position)

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
  object-fit: cover;
  object-position: top center;
}
```

![Ağzında top olan, mutlu ve yakışıklı bir köpeğin profili. Resim yalnızca alt kısımdan kırpılmış.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-a9de08840e85f.jpg?hl=tr)

`object-position` seçeneğini kullanarak resminizin yalnızca bir tarafını kırpabilirsiniz.

## Resimlerinizi yayınlama

Bu CSS kuralları, tarayıcıya resimlerin nasıl oluşturulmasını istediğinizi bildirir. Tarayıcının bu resimleri nasıl işleyeceğiyle ilgili olarak HTML'nizde ipuçları da verebilirsiniz.

### Boyutlandırma ipuçları

Resminizin boyutlarını biliyorsanız her zaman `width` ve `height` özelliklerini ekleyin. Resim, `max-inline-size` kuralınız nedeniyle farklı bir boyutta oluşturulsa bile tarayıcı, genişlik-yükseklik oranını bilir ve doğru miktarda alan ayırabilir. Bu sayede, resim yüklendiğinde diğer içeriklerinizin yer değiştirmesi önlenir.

```
<img
 src="image.png"
 alt="A description of the image."
 width="300"
 height="200"
>
```

[  ](https://web.dev/static/learn/design/responsive-images/video/tcFciHGuF3MxnTr1y5ue01OGLBn2/WOQn6K6OQcoElRw0NCkZ.mp4?hl=tr)
[  ](https://web.dev/static/learn/design/responsive-images/video/tcFciHGuF3MxnTr1y5ue01OGLBn2/sFxDb36aEMvTPIyZHz1O.mp4?hl=tr)

İlk videoda, tanımlanmış resim boyutları olmayan bir düzen gösteriliyor. Resimler yüklendiğinde metnin nasıl atladığına dikkat edin. İkinci videoda resim boyutları belirtildiği için tarayıcı, resim için yer bırakır ve resim yüklendiğinde metin yer değiştirmez.

### Yüklemeyle ilgili ipuçları

Tarayıcıya, resmin yüklenmesini görünüm alanına girene veya görünüm alanına yaklaşana kadar erteleyip ertelemeyeceğini bildirmek için `loading` özelliğini kullanın. Katlanma çizgisinin altındaki resimler için `lazy` değerini kullanın. Tarayıcı, kullanıcı yeterince aşağı kaydırıp resim görünmek üzere olana kadar geç yüklenen resimleri yüklemez. Kullanıcı hiç kaydırmazsa resim yüklenmez.

```
<img
 src="image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
>
```

[  ](https://web.dev/static/learn/design/responsive-images/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/jazsyaOjXfHS0g8yUijR.mp4?hl=tr)

Geç yüklenen resimler, kullanıcı kaydırarak bu resimlere ulaşana kadar yüklenmeyi bekler.

Sayfanın üst kısmında yer alan bir banner resminde `loading` kullanmayın. Siteniz `loading="lazy"` özelliğini otomatik olarak uyguluyorsa resimlerin geç yüklenmesini önlemek için genellikle `loading` özelliğini `eager` varsayılan değerine ayarlayabilirsiniz:

```
<img
 src="hero.jpg"
 alt="A description of the image."
 width="1200"
 height="800"
 loading="eager"
>
```

### Getirme Önceliği

[LCP](https://web.dev/articles/lcp?hl=tr) resmi gibi önemli resimler için `fetchpriority` özelliğini `high` olarak ayarlayarak [Fetch Priority](https://web.dev/articles/fetch-priority?hl=tr) ile yüklemeye daha fazla öncelik verebilirsiniz:

```
<img
 src="hero.jpg"
 alt="A description of the image."
 width="1200"
 height="800"
 loading="eager"
 fetchpriority="high"
>
```

Bu, tarayıcıya düzenini tamamlayıp resimleri normal şekilde getirmesini beklemek yerine resmi hemen ve yüksek öncelikli olarak getirmesini söyler.

Ancak tarayıcıdan bir kaynağın (ör. resim) indirilmesine öncelik vermesini istediğinizde tarayıcı, başka bir kaynağın (ör. komut dosyası veya yazı tipi dosyası) önceliğini düşürmek zorundadır. `fetchpriority="high"` değerini yalnızca gerçekten önemliyse bir resme ayarlayın.

### Önceden yüklemeyle ilgili ipuçları

Mümkün olduğunda tüm resimleri ilk HTML dosyasına ekleyerek önceden yüklemeyi önlemek en iyisidir. Ancak JavaScript veya CSS [arka plan resmi](#background-images) ile eklenen resimler gibi bazı resimler kullanılamayabilir.

Tarayıcının bu önemli resimleri önceden getirmesini sağlamak için önceden yükleme özelliğini kullanabilirsiniz. Gerçekten önemli resimler için bu önceden yükleme işlemini `fetchpriority` özelliğiyle birleştirebilirsiniz:

```
<link rel="preload" href="hero.jpg" as="image" fetchpriority="high">
```

Tarayıcının önceliklendirme sezgisel yöntemlerini çok sık geçersiz kılmamak için bu özellikleri yine dikkatli bir şekilde kullanın. Bunları aşırı kullanmak performansın düşmesine neden olabilir.

Bazı tarayıcılar, `imagesrcset` ve `imagesizes` özelliklerini kullanarak [srcset](#srcset)'e göre [duyarlı resimlerin önceden yüklenmesini](https://web.dev/articles/preload-responsive-images?hl=tr) destekler.
Örneğin:

```
<link rel="preload" imagesrcset="hero_sm.jpg 1x hero_med.jpg 2x hero_lg.jpg 3x" as="image" fetchpriority="high">
```

`href` geri dönüşünü hariç tutarak `srcset` desteği olmayan tarayıcıların doğru resmi önceden yüklemesini sağlayabilirsiniz.

Belirli biçimlerin tarayıcı desteğine bağlı olarak farklı biçimlerdeki resimleri önceden yükleyemezsiniz. Bunu yapmaya çalışmak, kullanıcıların verilerini boşa harcayan ek indirmelere neden olabilir.

## `srcset` ile duyarlı resimler

Bu `max-inline-size: 100%` bildirimi sayesinde resimleriniz kapsayıcılarının dışına çıkamaz. Ancak küçük ekranı ve düşük bant genişliğine sahip bir ağı olan kullanıcıların, daha büyük ekranlı kullanıcılarla aynı boyuttaki resimleri indirmesi veri israfına yol açar.

Bu sorunu düzeltmek için aynı resmin farklı boyutlardaki birden fazla sürümünü ekleyin ve bu boyutların var olduğunu ve ne zaman kullanılacağını tarayıcıya bildirmek için [`srcset`](https://developer.mozilla.org/docs/Web/HTML/Element/img#attr-srcset) özelliğini kullanın.

### Genişlik tanımlayıcısı

Virgülle ayrılmış liste kullanarak `srcset` tanımlayabilirsiniz. Her değer, bir resmin URL'si, ardından bir boşluk ve ardından resimle ilgili bazı meta verilerdir. Bu meta verilere *açıklama* adı verilir.

Bu örnekte, meta veriler `w` birimi kullanılarak her resmin genişliğini tanımlamaktadır. Bir `w`, bir pikselin genişliğidir.

```
<img
 src="small-image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
 decoding="async"
 srcset="small-image.png 300w,
  medium-image.png 600w,
  large-image.png 1200w"
>
```

`srcset` özelliği, `src` özelliğinin yerini almak yerine onu tamamlar.
Geçerli bir `src` özelliğinizin olması gerekir ancak tarayıcı, değerini `srcset` içinde listelenen seçeneklerden biriyle değiştirebilir. Bant genişliğinden tasarruf etmek için tarayıcı yalnızca gerekirse daha büyük resmi indirir.

### Boyutlar

Genişlik tanımlayıcısını kullanıyorsanız tarayıcıya daha fazla bilgi vermek için [`sizes`](https://developer.mozilla.org/docs/Web/HTML/Element/img#attr-sizes) özelliğini de kullanmanız gerekir. Bu, tarayıcıya farklı koşullarda resmin hangi boyutta gösterilmesini beklediğinizi bildirir. Bu koşullar bir medya sorgusunda belirtilir.

`sizes` özelliği, virgülle ayrılmış bir medya sorguları ve resim genişlikleri listesi alır.

**Not:** CSS medya sorgularının bir HTML öğesinin içinde olması tuhaf bir durumdur. Sunum ve yapı ayrımını bozar. Ancak bu, gerekli boyutlandırma bilgilerini etkili olacak kadar hızlı bir şekilde sağlamanın tek yoludur.

```
<img
 src="small-image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
 decoding="async"
 srcset="small-image.png 300w,
  medium-image.png 600w,
  large-image.png 1200w"
 sizes="(min-width: 66em) 33vw,
  (min-width: 44em) 50vw,
  100vw"
>
```

Bu örnekte, tarayıcıya genişliği `66em` olan bir görünüm alanında resmin, ekranın üçte birinden daha geniş olmayacak şekilde gösterilmesi gerektiğini söylüyorsunuz (örneğin, üç sütunlu bir düzende).

Görüntü alanı genişliği `44em` ile `66em` arasında olduğunda resmi ekran genişliğinin yarısı kadar genişlikte gösterin (iki sütunlu düzende olduğu gibi).

`44em` değerinden daha dar olan her şey için resmi ekranın tam genişliğinde gösterin.

Bu nedenle, en büyük resim en geniş ekran için kullanılmayabilir. Çok sütunlu düzeni görüntüleyebilen geniş bir tarayıcı penceresinde, tek sütunlu düzende kullanılan ve daha dar bir ekranda tek sütunlu düzene sığan resimden daha küçük olabilecek bir resim kullanılır.

[  ](https://web.dev/static/learn/design/responsive-images/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/MkUAq5XQyjlUXLvkT4jL.mp4?hl=tr)

Sayfanızın farklı ekran boyutlarında nasıl düzenleneceğini değiştirmek için boyut tanımlayıcılarını kullanın.

### Piksel yoğunluğu tanımlayıcısı

Ayrıca, yüksek yoğunluklu ekranlarda gösterilecek resimlerin alternatif bir sürümünü sağlamak için tanımlayıcıları kullanabilirsiniz. Böylece, resimler sağladıkları daha yüksek çözünürlüklerde net görünmeye devam eder.

![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin aynı resminin iki versiyonu. Bir resim net, diğeri ise bulanık görünüyor.](https://web.dev/static/learn/design/responsive-images/image/two-versions-the-same-im-f13b154ee2cc8.png?hl=tr)

Piksel yoğunluğu düşük olan resimler bulanık görünebilir.

Yoğunluk tanımlayıcısı, resmin piksel yoğunluğunu `src` özelliğindeki resimle ilişkili olarak tanımlamak için kullanılır. Yoğunluk tanımlayıcısı, x harfiyle takip edilen bir sayıdır (ör. `1x` veya `2x`).

```
<img
 src="small-image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
 decoding="async"
 srcset="small-image.png 1x,
  medium-image.png 2x,
  large-image.png 3x"
>
```

`small-image.png` 300x200 piksel boyutunda ve `medium-image.png` 600x400 piksel boyutunda ise `srcset` listesinde `medium-image.png` öğesinden sonra `2x` öğesi yer alabilir.

Tam sayı kullanmanız gerekmez. Resmin başka bir sürümü 450x300 piksel boyutundaysa bunu `1.5x` ile açıklayabilirsiniz.

**Not:** Genişlik tanımlayıcıları *veya* yoğunluk tanımlayıcıları kullanabilirsiniz, ancak ikisini *birlikte* kullanamazsınız.

## Sunum amaçlı resimler

HTML'deki görseller içeriktir. Bu nedenle, ekran okuyucular ve arama motorları için resmin açıklamasını içeren `alt` özelliğini eklemeniz gerekir.

Anlamlı içerik içermeyen, yalnızca dekoratif amaçlı bir resim yerleştirirseniz boş bir `alt` özelliği kullanabilirsiniz.

```
<img
 src="flourish.png"
 alt=""
 width="400"
 height="50"
>
```

Boş olsa bile `alt` özelliğini her zaman eklemeniz gerekir.
Boş bir `alt` özelliği, ekran okuyucuya resmin sunum amaçlı olduğunu bildirir. Eksik bir `alt` özelliği bu bilgiyi sağlamaz.

İdeal olarak, sunum amaçlı veya dekoratif resimler HTML yerine CSS ile eklenir. HTML, yapı için kullanılır. CSS, sunum içindir.

**İpucu:** [Erişilebilir resimler](https://web.dev/learn/accessibility/images?hl=tr) oluşturmayı öğrenin.

## Arka plan resimleri

Sunum amaçlı resimleri yüklemek için CSS'deki `background-image` özelliğini kullanın.

```
element {
  background-image: url(flourish.png);
}
```

`background-image` için [`image-set`](https://developer.mozilla.org/docs/Web/CSS/image/image-set()) işlevini kullanarak birden fazla resim adayı belirtebilirsiniz.

CSS'deki `image-set` işlevi, HTML'deki `srcset` özelliğine benzer şekilde çalışır.
Her biri için piksel yoğunluğu tanımlayıcısı içeren bir resim listesi sağlayın.

```
element {
  background-image: image-set(
    small-image.png 1x,
    medium-image.png 2x,
    large-image.png 3x
  );
}
```

Tarayıcı, cihazın piksel yoğunluğu için en uygun resmi seçer.

Sitenize resim eklerken dikkate almanız gereken birçok faktör vardır. Bunlardan bazıları:

- Her resim için doğru alanı ayırma
- Kaç boyuta ihtiyacınız olduğunu belirleme
- Resmin içerik mi yoksa dekoratif mi olduğuna karar verme

Resimlerinizi doğru şekilde ayarlamak için zaman ayırmanız önemlidir. Kötü görüntü stratejileri, kullanıcılarınızı rahatsız edip hayal kırıklığına uğratabilir. İyi bir resim stratejisi, kullanıcının cihazından veya ağ bağlantısından bağımsız olarak sitenizin hızlı ve net görünmesini sağlar.

Resimleriniz üzerinde daha fazla kontrol sahibi olmanızı sağlayacak bir HTML öğesi daha vardır: [`picture` öğesi](https://web.dev/learn/design/picture-element?hl=tr).

### Bilgilerinizi sınayın

Resimlerle ilgili bilginizi test edin.

> [Öğrendiklerinizi Test Edin]
> Resimlerin görünüm alanına sığması için stiller eklenmelidir.
> Doğru
> Kapsama alanı olmayan resimler, doğal boyutlarında olur.
> Yanlış
> Stiller zorunludur.
> Bir resmin yüksekliği ve genişliği doğal olmayan bir en boy oranına zorlandığında, hangi stiller resmin bu oranlara nasıl sığacağını ayarlamaya yardımcı olabilir?
> object-fit
> Resmin,
> contain
> ve
> cover
> gibi anahtar kelimelerle nasıl uyum sağladığını belirtin.
> image-fit
> Bu mülk mevcut değil, ben uydurdum.
> fit-image
> Bu mülk mevcut değil, ben uydurdum.
> aspect-ratio
> Bu işlem, doğal olmayan bir görüntü oranına neden olabilir veya bu oranı düzeltebilir.
> Resimlerinize
> height
> ve
> width
> eklediğinizde CSS, resimleri farklı şekilde stilize edemez.
> Doğru
> Bunları kurallardan ziyade ipuçları olarak düşünebilirsiniz.
> Yanlış
> CSS, yükseklik ve genişlik etikette satır içi olsa bile resimleri boyutlandırmak için çok sayıda dinamik seçeneğe sahiptir.
> srcset
> özelliği,
> src
> özelliğini \_\_\_\_\_\_\_ değil, \_\_\_\_\_\_\_ eder.
> tamamlayıcı, yerine geçen
> srcset
> ,
> src
> özelliğinin yerini kesinlikle almaz.
> replace, complements
> Tarayıcı destekliyorsa tarayıcının seçebileceği ek seçenekler sunar.
> Resimde
> alt
> olmaması, boş bir
> alt
> ile aynıdır.
> Doğru
> Boş bir
> alt
> özelliği, ekran okuyucuya bu resmin sunum amaçlı olduğunu bildirir.
> Yanlış
> Eksik
> alt
> , ekran okuyucuya hiçbir şey ifade etmez.


---


<a id='bolum-9-09-picture-element'></a>

## Bölüm 9: Resim öğesi

**Kaynak:** [https://web.dev/learn/design/picture-element?hl=tr](https://web.dev/learn/design/picture-element?hl=tr)


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


---


<a id='bolum-10-10-icons'></a>

## Bölüm 10: Simgeler

**Kaynak:** [https://web.dev/learn/design/icons?hl=tr](https://web.dev/learn/design/icons?hl=tr)


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


---


<a id='bolum-11-11-theming'></a>

## Bölüm 11: Tema oluşturma

**Kaynak:** [https://web.dev/learn/design/theming?hl=tr](https://web.dev/learn/design/theming?hl=tr)


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


---


<a id='bolum-12-12-accessibility'></a>

## Bölüm 12: Erişilebilirlik

**Kaynak:** [https://web.dev/learn/design/accessibility?hl=tr](https://web.dev/learn/design/accessibility?hl=tr)


Sayfalarınızın farklı ekran boyutlarına yanıt vermesine izin vermek, web sitenizin mümkün olduğunca çok kişi tarafından erişilebilir olmasını sağlamanın yalnızca bir yoludur. Aklınızda bulundurmanız gereken diğer faktörlerden bazılarını göz önünde bulundurun.

## Renk görme bozukluğu

Farklı insanlar renkleri farklı şekilde algılar. Protanopi olan kişiler kırmızıyı ayrı bir renk olarak algılamaz. Yeşil körlüğünde yeşil renk eksiktir. Mavi körlüğü olan kişiler için mavi renktedir.

Bazı araçlar, renk şemalarınızın farklı türde renk görme yetisine sahip kullanıcılara nasıl görüneceği hakkında genel bir fikir verebilir.

[Firefox'un Erişilebilirlik sekmesinde](https://developer.mozilla.org/docs/Tools/Accessibility_inspector/Simulation), **Simüle et** etiketli bir açılır liste ve seçenekler listesi bulunur.

![Simüle edilmiş kırmızı körlüğü (kırmızı yok).](https://web.dev/static/learn/design/accessibility/image/simulated-protanopia-re-1d45e86addd67.png?hl=tr)
![Mavi körlüğü simülasyonu](https://web.dev/static/learn/design/accessibility/image/simulated-tritanopia-bl-84fb927cae768.png?hl=tr)

Farklı renk görme türlerinin simülasyonlarını içeren bir web sitesini görüntüleme

Chrome Geliştirici Araçları'ndaki oluşturma sekmesi, [görme bozukluklarını emüle etmenize](https://developer.chrome.com/blog/new-in-devtools-83?hl=tr#vision-deficiencies) olanak tanır.

Bunlar tarayıcıya özgü araçlardır. Ayrıca, işletim sistemi düzeyinde farklı görme türlerini taklit etmek de mümkündür.

Mac'te şu adrese gidin:

1. Sistem Tercihleri
2. Erişilebilirlik
3. Görüntülü Reklam Ağı
4. Renk Filtreleri
5. Renk filtrelerini etkinleştirme

Seçeneklerden birini belirleyin.

![Sistem tercihlerindeki renk filtresi seçenekleri.](https://web.dev/static/learn/design/accessibility/image/color-filter-options-sys-545d3daa70374.png?hl=tr)

Genel olarak, farklı öğeleri ayırt etmek için yalnızca renge güvenmek iyi bir fikir değildir. Örneğin, bağlantılarınızı çevreleyen metinden farklı bir renkte yapabilirsiniz ve yapmanız gerekir. Ancak bağlantıların altını çizme veya kalınlaştırma gibi başka stil göstergeleri de uygulamanız gerekir.

Yapılmaması gerekenler:

```
a {
  color: red;
}
```

Yapılması gerekenler

```
a {
  color: red;
  font-weight: bold;
}
```

## Renk kontrastı

Bazı renk kombinasyonları sorunlara neden olabilir. Ön plan rengi ile arka plan rengi arasında yeterli kontrast yoksa metin okunamaz. Kötü renk kontrastı, web'deki en yaygın erişilebilirlik sorunlarından biridir ancak neyse ki tasarım sürecinin başlarında tespit edilebilir.

Metin ve arka plan renklerinizin kontrast oranını test etmek için kullanabileceğiniz bazı araçlar şunlardır:

- [VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug), tüm büyük masaüstü tarayıcılarında kullanılabilen bir tarayıcı uzantısıdır.
- [Firefox'un Accessibility Inspector](https://developer.mozilla.org/docs/Tools/Accessibility_inspector)'ı, görsel kontrastla ilgili sorunları kontrol edebilir.
- Ayrıca [Chrome Geliştirici Araçları ile düşük kontrastlı metinleri tespit edip düzeltebilirsiniz](https://developers.google.com/codelabs/devtools-cvd?hl=tr).
- Microsoft'un Edge tarayıcısında [renk seçiciyi kullanarak metin-renk kontrastını test edebilirsiniz](https://docs.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium/accessibility/color-picker).

CSS'nizde `color` ve `background-color` değerlerini her zaman birlikte bildirmeniz önerilir. Arka plan renginin tarayıcı varsayılanı olacağını varsaymayın. Kullanıcılar, tarayıcılarının kullandığı renkleri değiştirebilir.

Yapılmaması gerekenler:

```
body {
  color: black;
}
```

Yapılması gerekenler

```
body {
  color: black;
  background-color: white;
}
```

## Yüksek kontrast

Bazı kullanıcılar, işletim sistemlerini yüksek kontrast modunda kullanır. Bu özelliği işletim sisteminizde deneyebilirsiniz.

Mac'te şu adrese gidin:

1. Sistem Tercihleri
2. Erişilebilirlik
3. Görüntülü Reklam Ağı

Kontrastı artırma seçeneğini belirleyin.

![Sistem tercihlerinde kontrastı artırın.](https://web.dev/static/learn/design/accessibility/image/increase-contrast-system-e16ab35c94033.png?hl=tr)

Kullanıcıların yüksek kontrast modunu etkinleştirip etkinleştirmediğini algılayan bir medya özelliği vardır. [`prefers-contrast`](https://developer.mozilla.org/docs/Web/CSS/@media/prefers-contrast) medya özelliği için üç değer sorgulanabilir: `no-preference`, `less` ve `more`. Bu bilgileri, sitenizin renk paletini ayarlamak için kullanabilirsiniz.

Browser Support

- ![Chrome: 96.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  96
- ![Edge: 96.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  96
- ![Firefox: 101.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  101
- ![Safari: 14.1.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  14.1

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/At-rules/@media/prefers-contrast)

**Not:**  [CSS özel özellikleri](https://developer.mozilla.org/docs/Web/CSS/Using_CSS_custom_properties), renk bildirimlerini gruplandırmak için harika bir yöntemdir. Özel nitelik değerlerinizi güncellemek için `prefers-contrast` medya özelliğini kullanın. 

Kullanıcılar, işletim sistemlerinde renkleri ters çevirme tercihini de ayarlayabilir.

Mac'te şu adrese gidin:

1. Sistem Tercihleri
2. Erişilebilirlik
3. Görüntülü Reklam Ağı

Renkleri ters çevirme seçeneğini belirleyin.

![Sistem tercihlerinde renkleri ters çevirin.](https://web.dev/static/learn/design/accessibility/image/invert-colors-system-pre-f4abf725a3cd4.png?hl=tr)

Web sitenizin, renkleri ters çevrilmiş şekilde göz atan kullanıcılar için anlamlı olmaya devam ettiğinden emin olun. Kutu gölgelerine dikkat edin. Renkler ters çevrildiğinde bunların ayarlanması gerekebilir.

## Yazı tipi boyutu

Kullanıcılar tarayıcılarında yalnızca rengi değil, varsayılan yazı tipi boyutunu da ayarlayabilir. Görme yetileri azaldıkça tarayıcılarındaki veya işletim sistemlerindeki varsayılan yazı tipi boyutunu ayarlayabilir ve yıllar geçtikçe bu boyutu büyütebilirler.

Bu ayarlara göre yanıt vermek için göreceli yazı tipi boyutlarını kullanabilirsiniz. `px` gibi birimleri kullanmaktan kaçının. Bunun yerine `rem` veya `ch` gibi göreli birimler kullanın.

Tarayıcınızdaki varsayılan metin boyutu ayarını değiştirmeyi deneyin. Bunu tarayıcı tercihlerinizden yapabilirsiniz. İsterseniz bir web sayfasını ziyaret ederken yakınlaştırarak da yapabilirsiniz. [Varsayılan yazı tipi boyutu%200 artırıldığında](https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html) web siteniz hâlâ çalışıyor mu? %400'e ne dersin?

Yazı tipi boyutu% 400'e çıkarılmış bir masaüstü bilgisayarda web sitenizi ziyaret eden bir kullanıcı, sitenizi küçük ekranlı bir cihazda ziyaret eden bir kullanıcıyla aynı düzeni görmelidir.

![Clearleft.com web sitesi.](https://web.dev/static/learn/design/accessibility/image/clearleft-dot-com-5486d64205cac.png?hl=tr)

Aynı web sitesi, masaüstü cihazda ve mobil cihazda görüntüleniyor. Masaüstü tarayıcının yazı tipi boyutu %400'e çıkarıldı.

## Klavyeyle gezinme

Web sayfalarında gezinmek için herkes fare veya dokunmatik yüzey kullanmaz. Klavye de sayfada gezinmenin bir başka yoludur. Özellikle `tab` tuşu bu konuda çok faydalıdır. Kullanıcılar bir bağlantıdan veya form alanından diğerine hızlıca geçebilir.

`:hover` ve `:focus` [sözde sınıflarıyla](https://web.dev/learn/css/pseudo-classes?hl=tr) stil verilen bağlantılar, fare, dokunmatik yüzey veya klavye kullanılıp kullanılmadığına bakılmaksızın bu stilleri gösterir. Bağlantılarınızı yalnızca klavye ile gezinme için stilize etmek üzere `:focus-visible` [sözde sınıfını](https://web.dev/learn/css/pseudo-classes?hl=tr) kullanın. Bu stilleri daha da belirgin hale getirebilirsiniz.

```
a:focus,
a:hover {
  outline: 1px dotted;
}
a:focus-visible {
  outline: 3px solid;
}
```

Kullanıcı bağlantıdan bağlantıya veya form alanından form alanına geçerken bu öğeler, doküman yapısında göründükleri sırayla odaklanır. Bu, görsel sırayla da eşleşmelidir.

CSS `order` özelliğini kullanırken dikkatli olun. Öğeleri HTML'deki sıralarından farklı bir görsel sırada yerleştirmek için bu özelliği flexbox ve grid ile birlikte kullanabilirsiniz. Bu özellik güçlü olsa da klavye ile gezinmeyi tercih eden kullanıcıların kafasını karıştırabilir.

Sekme sırasının mantıklı olduğundan emin olmak için klavyenizdeki `tab` tuşunu kullanarak web sayfalarınızı test edin.

Firefox tarayıcının geliştirici araçlarının **Erişilebilirlik** panelinde **Sekme Sırasını Göster** seçeneği bulunur. Bu ayar etkinleştirildiğinde odaklanılabilir her öğenin üzerine sayılar yerleştirilir.

![Firefox'un erişilebilirlik sekmesini kullanarak sekme sırasını görselleştirme.](https://web.dev/static/learn/design/accessibility/image/visualizing-tab-order-usi-544e8f125f14e.png?hl=tr)

**Not:**  [İçeriklerin yeniden sıralanmasının](https://web.dev/articles/content-reordering?hl=tr) neden olduğu sorunlar hakkında daha fazla bilgi edinin. 

## İndirgenmiş hareket

Animasyon ve hareket, web tasarımlarına hayat vermenin harika yollarıdır. Ancak bu hareketler bazı kişilerde yön kaybına ve hatta mide bulantısına neden olabilir.

Kullanıcının daha az hareket tercih edip etmeyeceğini belirten bir özellik sorgusu vardır. Bu özelliğin adı [`prefers-reduced-motion`](https://web.dev/articles/prefers-reduced-motion?hl=tr). CSS geçişlerini veya animasyonlarını kullandığınız her yere ekleyin.

Browser Support

- ![Chrome: 74.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  74
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 63.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  63
- ![Safari: 10.1.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  10.1

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)

```
a:hover {
  transform: scale(150%);
}
@media (prefers-reduced-motion: no-preference) {
  a {
    transition-duration: 0.4s;
    transition-property: transform;
  }
}
```

`prefers-reduced-motion` medya sorgusu özellikle ekrandaki hareket içindir. `prefers-reduced-motion` öğesinden etkilenmemesi gereken bir öğenin renginde geçişler kullanıyorsanız. Opaklık geçişi ve çapraz geçiş de yapabilirsiniz. İndirgenmiş hareket, animasyonun tamamen devre dışı bırakılması anlamına gelmez.

## Ses

Kullanıcılar web'i farklı şekillerde deneyimler. Web sitenizi herkes ekranda görmez. Ekran okuyucular gibi yardımcı teknolojiler, ekrana verilen bilgileri konuşma diline dönüştürür.

Ekran okuyucular, web tarayıcıları da dahil olmak üzere her türlü uygulamayla çalışır. Bir web tarayıcısının ekran okuyucuyla faydalı bir şekilde iletişim kurabilmesi için erişilen web sayfasında faydalı semantik bilgiler olması gerekir.

Daha önce, [yalnızca simge içeren düğmelerin](https://web.dev/learn/design/icons?hl=tr), görme engelli kullanıcılara düğmenin amacını belirten bir özellik içermesi gerektiğini öğrenmiştiniz. Bu, güçlü bir temel HTML'nin önemine dair yalnızca bir örnektir.

## Başlıklar

`<h1>`, `<h2>`, `<h3>` gibi başlıkları mantıklı bir şekilde kullanın. Ekran okuyucular, klavye kısayollarıyla gezinebileceğiniz bir doküman ana hattı oluşturmak için bu başlıkları kullanır.

Yapılmaması gerekenler:

```
<div class="heading-main">Welcome to my page</div>

<div class="heading-secondary">About me</div>

<div class="heading-tertiary">My childhood</div>

<div class="heading-secondary">About this website</div>

<div class="heading-tertiary">How this site was built</div>
```

Yapılması gerekenler

```
<h1>Welcome to my page</h1>
  <h2>About me</h2>
    <h3>My childhood</h3>
  <h2>About this website</h2>
    <h3>How this site was built</h3>
```

## Yapı

Sayfanızın içeriğini yapılandırmak için `<main>`, `<nav>`, `<aside>`, `<header>` ve `<footer>` gibi önemli yer öğelerini kullanın. Ekran okuyucu kullanıcıları daha sonra doğrudan bu önemli noktalara gidebilir.

Yapılmaması gerekenler:

```
<div class="header">...</div>

<div class="navigation">...</div>

<div class="maincontent">...</div>

<div class="sidebar">...</div>

<div class="footer">...</div>
```

Yapılması gerekenler

```
<header>...</header>
<nav>...</nav>
<main>...</main>
<aside>...</aside>
<footer>...</footer>
```

## Formlar

Her form alanının ilişkili bir `<label>` öğesi olduğundan emin olun. `for` öğesindeki `<label>` özelliğini ve form alanındaki karşılık gelen `id` özelliğini kullanarak bir etiketi form alanıyla ilişkilendirebilirsiniz.

Yapılmaması gerekenler:

```
<span class="formlabel">Your name</span>
<input type="text">
```

Yapılması gerekenler

```
<label for="name">Your name</label>
<input id="name" type="text">
```

**Not:**  Erişilebilirlik ve formlar hakkında daha fazla bilgi için [Formlar Kursu'ndaki Formlar'da Erişilebilirlik Modülü](https://web.dev/learn/forms/accessibility?hl=tr)'ne bakın. 

## Resimler

`alt` özelliğini kullanarak her zaman resimlerin metin açıklamasını sağlayın.

Yapılmaması gerekenler:

```
<img src="dog.jpg">
```

Yapılması gerekenler

```
<img src="dog.jpg" alt="A golden retriever sitting on the grass looking happy.">
```

Resim yalnızca sunum amaçlıysa `alt` özelliğini yine de eklemeniz gerekir ancak boş bir değer verebilirsiniz.

Yapılmaması gerekenler:

```
<img src="texture.png">
```

Yapılması gerekenler

```
<img src="texture.png" alt="">
```

Jake Archibald, [mükemmel `alt` metinler yazma](https://jakearchibald.com/2021/great-alt-text/) hakkında bir makale yayınladı.

## Bağlantılar

Bağlantılarda açıklayıcı metinler kullanmaya çalışın. "Burayı tıklayın" veya "daha fazla" gibi ifadeler kullanmayın.

Yapılmaması gerekenler:

```
<p>To find out more about our latest offers, <a href="/offers.html">click here</a>.</p>
```

Yapılması gerekenler

```
<p>Find out more about <a href="/offers.html"> our latest offers</a>.</p>
```

## ARIA

Anlamlı semantik HTML kullanmak, web sayfalarınızı ekran okuyucular gibi yardımcı teknolojilerin yanı sıra sesli asistanlar gibi diğer ses çıkışları için daha erişilebilir hâle getirir.

Arayüzdeki bazı widget'lar (ör. carouseller, sekmeler ve akordeonlar) karşılık gelen bir HTML öğesine sahip değildir. Bunlar HTML, CSS, JavaScript ve ARIA kombinasyonuyla sıfırdan oluşturulmalıdır.

ARIA, Accessible Rich Internet Applications (Erişilebilir Zengin İnternet Uygulamaları) anlamına gelir. Bu sözlük, uygun bir HTML öğesi olmadığında semantik bilgiler sağlamanıza olanak tanır.

Henüz HTML öğesi olarak kullanılamayan arayüz öğeleri oluşturmanız gerekiyorsa [ARIA hakkında bilgi edinin](https://developer.mozilla.org/docs/Learn/Accessibility/WAI-ARIA_basics).

JavaScript ile ne kadar çok özel işlev eklerseniz ARIA'yı o kadar iyi anlamanız gerekir. Standart HTML öğelerini kullanırsanız ARIA'ya ihtiyacınız olmayabilir.

Mümkünse ekran okuyucu kullanan gerçek kullanıcılarla test yapın. Bu sayede, kullanıcıların web'de nasıl gezindiğini daha iyi anlayabilir ve erişilebilirlik göz önünde bulundurularak tasarım yapma konusunda tahminde bulunmak zorunda kalmazsınız.

Gerçek kullanıcılarla test yapmak, varsayımlarınızı ortaya çıkarmanın harika bir yoludur. Sonraki modülde, kullanıcıların web sitelerinizle etkileşim kurma şekilleri hakkında bilgi edineceksiniz. Bu da varsayımda bulunmanın çok kolay olduğu bir başka alandır.

### Bilgilerinizi sınayın

Erişilebilirlik bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> CSS ile geliştiriciler, yazı tipi boyutu gibi kullanıcı tercihlerini geçersiz kılabilir mi?
> Doğru
> body { font-size: 12px; }
> simgesini kullanmanız yeterlidir.
> Yanlış
> Kullanıcı tercihlerinin etkisi büyüktür ancak tam kontrol sağlamaz.
> Kullanıcının yazı tipi boyutu tercihinin üzerine yazmamak için ne kullanmalısınız?
> px
> gibi mutlak birimler.
> Bunlar kullanıldığında kullanıcının yazı tipi boyutu tercihi dikkate alınmaz.
> rem
> gibi göreli birimler.
> Bu birimler, geliştiricilerin kullanıcı yazı tipi boyutu tercihlerini de içeren uzunluklar kullanmasına olanak tanır.
> Dünyadaki herkes fare kullanır.
> Doğru
> Bazı kullanıcılar etkileşim kurmak için seslerini, klavyeyi, oyun kumandasını, ekran okuyucuyu veya başka yöntemleri kullanır.
> Yanlış
> Popüler fareye birçok alternatif vardır.
> Boş bir alt özelliğine sahip resim ne yapar?
> Tarayıcı, bunları kullanıcı için otomatik olarak ekler.
> Herhangi bir tarayıcının özelliği değildir.
> Resim, sunu amaçlı olarak ele alınır.
> Görselin, içeriğin tüketilmesinde önemli olmadığı varsayılır.
> Ekran okuyucuya "boş dize" ifadesini okur.
> Bu durum söz konusu değildir.
> Nothing
> Kesinlikle bir şeyler oluyor.


---


<a id='bolum-13-13-interaction'></a>

## Bölüm 13: Etkileşim

**Kaynak:** [https://web.dev/learn/design/interaction?hl=tr](https://web.dev/learn/design/interaction?hl=tr)


Cep telefonları gibi küçük ekranlı cihazlarda genellikle dokunmatik ekran bulunur. Dizüstü bilgisayarlar ve masaüstü bilgisayarlar gibi büyük ekranlı cihazlar genellikle fare veya dokunmatik alan gibi donanımlarla birlikte gelir. Küçük ekranları dokunmayla, büyük ekranları ise işaretçilerle ilişkilendirmek cazip gelebilir.

Ancak gerçek daha karmaşıktır. Bazı dizüstü bilgisayarlarda dokunmatik ekran özelliği bulunur. Kullanıcılar dokunmatik ekranla, dokunmatik alanla veya her ikisiyle de etkileşim kurabilir. Aynı şekilde, tablet gibi dokunmatik ekranlı bir cihazla harici klavye veya fare de kullanabilirsiniz.

Giriş mekanizmasını ekran boyutundan çıkarmaya çalışmak yerine CSS'deki medya özelliklerini kullanın.

## İşaretçi

`pointer` medya özelliğiyle üç olası değeri test edebilirsiniz: `none`, `coarse` ve `fine`.

Bir tarayıcı `pointer` değeri bildiriyorsa kullanıcı, web sitenizle etkileşim kurmak için klavye kullanıyor olabilir.`none`

Bir tarayıcı `pointer` değeri olarak `coarse` bildiriyorsa birincil giriş mekanizmasının çok doğru olmadığı anlamına gelir. Dokunmatik ekrandaki parmak, kaba bir işaretçidir.

Bir tarayıcı `pointer` değeri olarak `fine` bildiriyorsa birincil giriş mekanizması ayrıntılı kontrol sağlayabilir. Fare veya ekran kalemi iyi bir işaretçi olabilir.

Arayüz öğelerinizin boyutunu `pointer` değerine uyacak şekilde ayarlayabilirsiniz. Arayüzün nasıl uyum sağladığını görmek için [bu demo web sitesini](https://gui-challenges.web.app/settings/dist/) farklı cihazlarda ziyaret etmeyi deneyin.

Bu örnekte, kaba işaretçiler için düğmeler büyütülmüştür:

```
button {
  padding: 0.5em 1em;
}
@media (pointer: coarse) {
  button {
    padding: 1em 2em;
  }
}
```

İnce işaretçiler için öğeleri küçültmek de mümkündür ancak bu işlemi yaparken dikkatli olmanız gerekir:

Yapılmaması gerekenler:

```
@media (pointer: fine) {
  button {
    padding: 0.25em 0.5em;
  }
}
```

Kullanıcıların ayrıntılı kontrol yapmasına olanak tanıyan birincil giriş mekanizması olsa bile etkileşimli öğelerin boyutunu küçültmeden önce iki kez düşünün. [Fitts Yasası](https://en.wikipedia.org/wiki/Fitts's_law) geçerliliğini korur. Küçük bir hedef, ince bir işaretçiyle bile daha fazla konsantrasyon gerektirir. Daha büyük bir hedef alanı, işaretleme cihazından bağımsız olarak herkese fayda sağlar.

## Herhangi bir işaretçi

`pointer` medya özelliği, *birincil* giriş mekanizmasının hassasiyetini bildirir. Ancak birçok cihazda birden fazla giriş mekanizması bulunur. Bir kullanıcının web sitenizle aynı anda hem dokunmatik ekran hem de fare kullanarak etkileşim kurması mümkündür.

`any-pointer`, herhangi bir işaretleme cihazının testi geçip geçmediğini bildirmesi bakımından `pointer` medya özelliğinden farklıdır.

`any-pointer` değeri `none` ise işaretleme cihazı olmadığını gösterir.

`any-pointer` değeri `coarse` ise en az bir işaretleme cihazının çok doğru olmadığı anlamına gelir. Ancak bu, birincil giriş mekanizması olmayabilir.

`any-pointer` değeri `fine` ise en az bir işaretleme cihazının ayrıntılı kontrol yapabildiği anlamına gelir. Ancak bu, birincil giriş mekanizması olmayabilir.

`any-pointer` medya sorgusu, giriş mekanizmalarından *herhangi biri* testi geçerse olumlu sonuç bildireceğinden bir tarayıcının `any-pointer: fine` için sonuç bildirmesinin yanı sıra `any-pointer: coarse` için de sonuç bildirmesi mümkündür. Bu durumda medya sorgularınızın sırası önemlidir. En sonuncusu öncelikli olur.

Bu örnekte, cihazda hem hassas hem de kaba giriş mekanizması varsa kaba stiller uygulanır.

```
@media (any-pointer: fine) {
  button {
    padding: 0.5em 1em;
  }
}
@media (any-pointer: coarse) {
  button {
    padding: 1em 2em;
  }
}
```

## İmleçle üzerine gelin

`hover` medya özelliği, birincil giriş mekanizmasının öğelerin üzerine gelip gelemeyeceğini bildirir. Bu genellikle ekranda fare veya dokunmatik yüzeyle kontrol edilen bir imleç olduğu anlamına gelir.

İnce ve kaba işaretçiler arasında ayrım yapan `pointer` medya özelliğinin aksine, `hover` medya özelliği ikilidir. Birincil giriş cihazı, öğelerin üzerine gelme özelliğine sahipse `hover` değerini bildirir. Aksi takdirde değer `none` olur.

Bu örnekte, fareyle üzerine gelindiğinde bazı ek simgeler gösterilir ancak yalnızca birincil giriş cihazı bir öğenin üzerine gelmeye uygunsa.

```
button .extra {
  visibility: visible;
}
@media (hover: hover) {
  button .extra {
    visibility: hidden;
  }
  button:hover .extra {
    visibility: visible;
  }
}
```

Fare imlecinizi bu düğmenin üzerine getirirseniz simge görünür. Ancak klavyenizi kullanarak düğmeye sekme ile giderseniz simge görünmez kalır. Klavyeyi kullandığınızda fareyle üzerine gelmek yerine odaklanırsınız. Fare bağlı bir masaüstü cihaz, birincil giriş mekanizmasının üzerine gelme özelliğine sahip olduğunu (doğru) bildirir. Ancak fare bağlıyken klavye kullananlar `:hover` stillerinden yararlanamaz. Bu nedenle, her iki etkileşimi de kapsamak için `:hover` ve `:focus` stillerini birleştirmeniz önerilir.

```
button .extra {
  visibility: visible;
}
@media (hover: hover) {
  button .extra {
    visibility: hidden;
  }
  button:is(:hover, :focus) .extra {
    visibility: visible;
  }
}
```

Birincil giriş cihazı öğelerin üzerine gelme özelliğine sahip olsa bile bilgileri fareyle üzerine gelme etkileşiminin arkasına gizleme konusunda dikkatli olun. Bilgilerin bulunması zorlaşır. Önemli bilgileri veya önemli bir arayüz öğesini gizlemek için fareyle üzerine gelme özelliğini kullanmayın.

## Herhangi bir fareyle üzerine gelme işlemi

`hover` medya sorgusu yalnızca *birincil* giriş mekanizması hakkında rapor verir. Bazı cihazlarda birden fazla giriş mekanizması bulunur: dokunmatik ekran, fare, klavye, izleme dörtgeni.

`any-pointer` giriş mekanizmalarından herhangi biri hakkında rapor oluşturduğu gibi, `any-hover` de mevcut giriş mekanizmalarından herhangi biri öğelerin üzerine gelme özelliğine sahipse doğru olur.

Önceki örnekteki mantığı tersine çevirmeye karar verirseniz fareyle üzerine gelme stillerini varsayılan yapabilir ve `any-hover` değişkeninin değeri `none` ise bu stilleri kaldırabilirsiniz.

```
button .extra {
  visibility: hidden;
}
button:hover .extra,
button:focus .extra {
  visibility: visible;
}
@media (any-hover: none) {
  button .extra {
    visibility: visible;
  }
}
```

Üzerine gelme özelliğine sahip bir giriş mekanizması olmayan cihazlarda ek simge her zaman görünür.

## Sanal klavyeler

Kullanıcılar, arayüzleri keşfetmek için imleç ve parmaklarını kullanır ancak bilgi girmeleri gerektiğinde klavyeye ihtiyaç duyarlar. Cihazlarına fiziksel bir klavye bağlıysa bu yöntem işe yarar ancak dokunmatik ekranlı bir cihaz kullanıyorlarsa biraz daha karmaşık bir durum söz konusudur. Bu cihazlar, ekranda sanal klavye sağlar.

### Giriş türleri

Fiziksel klavyelerin aksine, sanal klavyeler beklenen girişe uyacak şekilde özelleştirilebilir. Beklenen giriş hakkında bilgi verirseniz cihazlar en uygun sanal klavyeyi sunabilir.

`input` öğelerinizi açıklamak için [HTML5 giriş türlerini](https://developer.mozilla.org/docs/Learn/Forms/HTML5_input_types) kullanabilirsiniz. `type` özelliği `email`, `number`, `tel`, `url` gibi değerleri kabul eder.

```
  <label for="email">Email</label>
  <input type="email" id="email">
```

```
  <label for="number">Number</label>
  <input type="number" id="number">
```

```
  <label for="tel">Tel</label>
  <input type="tel" id="tel">
```

```
  <label for="url">URL</label>
  <input type="url" id="url">
```

[  ](https://web.dev/static/learn/design/interaction/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/xdbqHZ1fp2O8FpwXWQAH.mp4?hl=tr)

### Giriş modları

Browser Support

- ![Chrome: 66.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  66
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 95.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  95
- ![Safari: 12.1.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  12.1

[Source](https://developer.mozilla.org/docs/Web/HTML/Reference/Global_attributes/inputmode)

[`inputmode` özelliği](https://developer.mozilla.org/docs/Web/HTML/Global_attributes/inputmode), sanal klavyeler üzerinde ayrıntılı kontrol sahibi olmanızı sağlar. Örneğin, değeri `number` olan bir `input` `type` varken tam sayılar ve ondalık sayılar arasında ayrım yapmak için `inputmode` özelliğini kullanabilirsiniz.

Birinin yaşı gibi tam sayı istiyorsanız `inputmode="numeric"` kullanın.

```
<label for="age">Age</label>
<input type="number" id="age" inputmode="numeric">
```

Fiyat gibi ondalık basamak içeren bir sayı istiyorsanız `inputmode="decimal"` kullanın.

```
<label for="price">Price</label>
<input type="number" id="price" inputmode="decimal">
```

[  ](https://web.dev/static/learn/design/interaction/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/gr0tQXIZDgRNFcExwN8W.mp4?hl=tr)

### Otomatik tamamlama

Kimse form doldurmaktan hoşlanmaz. Tasarımcı olarak, kullanıcılarınızın form alanlarını otomatik olarak doldurmalarını sağlayarak deneyimlerini iyileştirebilirsiniz. [`autocomplete` özelliği](https://developer.mozilla.org/docs/Web/HTML/Attributes/autocomplete), iletişim formlarını, giriş formlarını ve ödeme formlarını iyileştirmek için çeşitli seçenekler sunar.

```
<label for="name">Name</label>
<input type="text" id="name" autocomplete="name">
```

```
<label for="country">Country</label>
<input type="text" id="country" autocomplete="country">
```

```
<label for="email">Email</label>
<input type="email" id="email" autocomplete="email">
```

[  ](https://web.dev/static/learn/design/interaction/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/6CvIrXjmzMbXX4CNuzCe.mp4?hl=tr)

`type`, `inputmode` ve `autocomplete` HTML özellikleri, form alanlarınıza yapılan küçük eklemelerdir ancak kullanıcı deneyiminde büyük bir fark yaratabilirler. Kullanıcılarınızın cihaz özelliklerini tahmin edip bunlara yanıt vererek kullanıcılarınızı güçlendirirsiniz. Daha ayrıntılı bilgi için [formları öğrenmenize](https://web.dev/learn/forms?hl=tr) yardımcı olacak özel bir kursa göz atabilirsiniz.

Bu kursta bir sonraki adımda, bazı [yaygın arayüz kalıplarını](https://web.dev/learn/design/ui-patterns?hl=tr) inceleyeceğiz.

### Bilgilerinizi sınayın

Etkileşimlerle ilgili bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> Kullanıcının giriş türünü ekran boyutundan tahmin etmeye çalışmak yerine hangi özelliği kullanmalısınız?
> CSS medya özellikleri
> @media (pointer: coarse)
> veya
> @media (-any-pointer: coarse)
> gibi
> JavaScript'in
> prompt()
> işleviyle kullanıcıya soru sorma
> Doğrudan sormak ideal değildir.
> CSS medya türü
> handheld
> Bu özellik, Media Queries 4'te kullanımdan kaldırılmıştır.
> @media (pointer)
> ile
> @media (any-pointer)
> arasındaki fark nedir?
> İşaretçi olarak parmağınız gibi öğeler kullanılabilir.
> İşaretçi, giriş türü olarak dokunmayı zaten içeriyor.
> İşaretçiler fare gibi öğeleri içermez.
> İşaretçiler, giriş cihazı olarak fareyi içerir.
> Kalem gibi ek, birincil olmayan girişler testi geçtiğinde herhangi bir işaretçi doğru değerini bildirir.
> any-pointer
> , eşleşme için tüm cihaz giriş türlerini sorgular.
> Hangi giriş türleri, kullanıcılar için daha uygun bir sanal klavye gösterir?
> type="url"
> Klavye, URL yazmayı destekleyen düğmeler sunar.
> type="tel"
> Klavye, telefon numarası yazmayı destekleyen düğmeler sunar.
> type="number"
> Klavyede yalnızca sayı yazmayı destekleyen düğmeler gösterilir.
> type="email"
> Klavyede, e-posta adreslerinin yazılmasını destekleyen düğmeler gösterilir.


---


<a id='bolum-14-14-ui-patterns'></a>

## Bölüm 14: Kullanıcı arayüzü kalıpları

**Kaynak:** [https://web.dev/learn/design/ui-patterns?hl=tr](https://web.dev/learn/design/ui-patterns?hl=tr)


Küçük ekranda görüntülenen bir tasarım, büyük ekran düzeninin küçültülmüş bir versiyonu gibi görünmemelidir. Aynı şekilde, büyük bir ekranda görüntülenen tasarım, küçük ekran düzeninin büyütülmüş bir versiyonu gibi görünmemelidir. Bunun yerine, tasarımın tüm ekran boyutlarına uyum sağlayacak kadar esnek olması gerekir. Başarılı bir duyarlı tasarım, her form faktöründen en iyi şekilde yararlanır.

Bu nedenle, bazı arayüz öğelerinin, görüntülendikleri bağlama bağlı olarak oldukça farklı görünmesi gerekebilir. Farklı ekran boyutlarından en iyi şekilde yararlanmak için aynı HTML kod tabanına çok farklı CSS'ler uygulamanız gerekebilir. Bu, tasarım açısından oldukça zorlayıcı olabilir.

Karşılaşabileceğiniz bazı yaygın zorlukları aşağıda bulabilirsiniz.

## Gezinme

Gezinme bağlantılarının listesini büyük ekranda göstermek oldukça kolaydır. Bu bağlantıları barındırmak için yeterli alan vardır.

Küçük ekranlarda alan çok değerlidir. Bu durum için tasarım yaparken gezinmeyi bir düğmenin arkasına gizlemek cazip gelebilir. Bu çözümün sorunu, kullanıcıların herhangi bir yere ulaşmak için iki adım atması gerekmesidir: Menüyü açıp bir seçenek belirlemeleri gerekir. Menü açılana kadar kullanıcı "Nereye gidebilirim?" diye düşünür.

Gezinme çubuğunuzu gizlemeyen bir strateji bulmaya çalışın. Öğelerinizin sayısı nispeten azsa gezinme bölümünü küçük ekranlarda iyi görünecek şekilde tasarlayabilirsiniz.

![Mobil tarayıcıda ve tablet tarayıcıda görüntülenen, beş gezinme bağlantısı içeren aynı web sitesi. Gezinme, her iki cihazda da görünür.](https://web.dev/static/learn/design/ui-patterns/image/the-same-website-five-na-5068e5d65921e.png?hl=tr)

Bu kalıp, gezinmenizde çok sayıda bağlantı varsa ölçeklenmez. Bağlantılar küçük bir ekranda iki veya üç satıra kayarsa gezinme alanı dağınık görünür.

Olası çözümlerden biri, bağlantıları tek satırda tutmak ancak listeyi ekranın kenarında kesmektir. Kullanıcılar, hemen görünmeyen bağlantıları ortaya çıkarmak için ekranı yatay olarak kaydırabilir. Bu, taşma desenidir.

[  ](https://web.dev/static/learn/design/ui-patterns/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/jNM3gZrkksJc6banrxcE.mp4?hl=tr)

Bu tekniğin avantajı, her cihaz genişliğine ve her sayıda bağlantıya göre ölçeklenebilmesidir. Dezavantajı, kullanıcıların başlangıçta görünür olmayan bağlantıları kaçırabilmesidir. Bu tekniği ana gezinme menünüzde kullanıyorsanız ilk birkaç bağlantının en önemli bağlantılar olduğundan ve listede daha fazla öğe olduğunu görsel olarak belirttiğinizden emin olun. Önceki örnekte bu gösterge için renk geçişi kullanılıyor.

Son çare olarak, gezinmenizi varsayılan olarak gizlemeyi ve kullanıcıların içeriği göstermesi ve gizlemesi için bir açma/kapatma mekanizması sağlamayı seçebilirsiniz. Buna aşamalı açıklama denir.

![Mobil tarayıcıda ve tablet tarayıcıda görüntülenen, beş gezinme bağlantısı içeren aynı web sitesi. Gezinme, tablette görünürken mobil cihazda gizleniyor.](https://web.dev/static/learn/design/ui-patterns/image/the-same-website-five-na-382970acfbe0f.png?hl=tr)

Gezinmenin gösterilmesini açıp kapatan düğmenin etiketlendiğinden emin olun. Anlaşılmak için simgelere güvenmeyin.

![Etiketsiz üç simge: Birincisi üç yatay çizgi, ikincisi üç çarpı üç ızgara, üçüncüsü dikey olarak düzenlenmiş üç daire.](https://web.dev/static/learn/design/ui-patterns/image/three-unlabelled-icons-8ad9bd0609ab9.png?hl=tr)

Etiketsiz bir simge, "gizemli içerik" navigasyonudur. Kullanıcılar, içine tıklayana kadar ne olduğunu bilemez. Kullanıcılara düğmenin neyi göstereceğini bildirmek için bir metin etiketi sağlayın.

[  ](https://web.dev/static/learn/design/ui-patterns/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/jzRDWQyKNcV1JNBU6mYS.mp4?hl=tr)

## Bantlar

Gezinme için geçerli olan diğer içerikler için de geçerlidir: Hiçbir şeyi gizlememeye çalışın. İçeriği gizlemenin yaygın bir yöntemi de karusel kullanmaktır. Bu yöntem oldukça düzenli görünse de kullanıcılarınızın gizli içeriği keşfetme ihtimali düşüktür. Döngüler, kullanıcıların ihtiyaçlarını karşılamaktan ziyade organizasyonel sorunları (ör. ana sayfada hangi içeriklerin yer alması gerektiği) çözmek için daha uygundur.

Bununla birlikte, alanın sınırlı olduğu durumlarda bantlar, sayfanın çok uzun ve karmaşık olmasını önleyebilir. Hibrit bir yaklaşım kullanabilirsiniz: İçeriği küçük ekranlarda bant şeklinde gösterirken aynı içeriği daha büyük ekranlarda ızgara şeklinde gösterebilirsiniz.

Dar ekranlarda, öğeleri flexbox kullanarak bir satırda gösterin. Öğeler satırı, ekranın kenarının ötesine uzanır. Yatay kaydırmaya izin vermek için `overflow-x: auto` kullanın.

```
@media (max-width: 50em) {
  .cards {
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    scroll-snap-type: inline mandatory;
    scroll-behavior: smooth;
  }
  .cards .card {
    flex-shrink: 0;
    flex-basis: 15em;
    scroll-snap-align: start;
  }
}
```

**Not:**  `overflow-x` öğesinin mantıksal sürümü, `scroll-snap-type` öğesinin değeriyle daha iyi eşleşecek olan [`overflow-inline`](https://developer.mozilla.org/docs/Web/CSS/overflow-inline)'dir. Bu örnekte, tarayıcılar arası daha iyi destek için fiziksel sürüm kullanılmaktadır. 

[`scroll-snap`](https://web.dev/articles/css-scroll-snap?hl=tr) özellikleri, öğelerin sorunsuz bir şekilde kaydırılabilmesini sağlar. `scroll-snap-type: inline mandatory` sayesinde öğeler yerine oturur.

Ekran yeterince büyük olduğunda (bu örnekte `50em`'dan daha geniş) ızgaraya geçin ve öğeleri hiçbir şeyi gizlemeden satırlar ve sütunlar halinde görüntüleyin.

```
@media (min-width: 50em) {
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15em, 1fr));
  }
}
```

[  ](https://web.dev/static/learn/design/ui-patterns/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/jw00jziSxqLm3JBYRk5o.mp4?hl=tr)

En önemlisi, bant görünümündeki bir öğe tam genişliği kaplamaz. Bu durumda, görüntü alanının kenarının ötesinde daha fazla içerik olduğu belirtilmez.

Kaydırma çubukları, taşma deseninin kullanıldığı başka bir örnektir. Kullanıcıların göz atabileceği çok sayıda öğeniz varsa televizyonlar da dahil olmak üzere büyük ekranlarda bile taşma düzenini kullanmaya devam edebilirsiniz. Bu [medya kaydırılabilir alanı](https://gui-challenges.web.app/media-scroller/dist/), çok sayıda seçeneği yönetmek için birden fazla bant kullanır.

Yine `scroll-snap` özellikleri, etkileşimin sorunsuz olmasını sağlar. Ayrıca, döngüdeki resimlere `loading="lazy"` uygulandığını da unutmayın. Bu durumda, resimler ekranın alt kısmında değil, kenarın ötesindedir ancak aynı ilke geçerlidir: Kullanıcı hiçbir zaman bu öğeye kadar kaydırmazsa resim indirilmez ve bant genişliğinden tasarruf edilir.

**Not:**  Önceki örnekte daha kapsamlı bir demo gösteriliyor. Bu demo hakkında daha fazla bilgiyi [Medya kaydırma bileşeni oluşturma](https://web.dev/articles/building/a-media-scroller-component?hl=tr) makalesinde bulabilirsiniz. 

JavaScript'in eklenmesiyle birlikte, bir ruloya etkileşimli kontroller ekleyebilirsiniz. Hatta öğeler arasında otomatik olarak geçiş yapmasını sağlayabilirsiniz. Ancak bunu yapmadan önce iyice düşünün. Otomatik oynatma, bant sayfadaki tek içerikse işe yarayabilir ancak kullanıcılar diğer içeriklerle (ör. metin okuma) etkileşim kurmaya çalışırken otomatik oynatılan bir bant son derece rahatsız edicidir. [Döngü reklamlarla ilgili en iyi uygulamalar](https://web.dev/articles/carousel-best-practices?hl=tr) hakkında daha fazla bilgi edinebilirsiniz.

## Veri tabloları

`table` öğesi, tablo biçimindeki verileri (ilgili bilgilerin satır ve sütunları) yapılandırmak için idealdir. Ancak tablo çok büyürse küçük ekran düzeninizi bozabilir.

Taşma desenini tablolara uygulayabilirsiniz. Bu örnekte tablo, `table-container` sınıfına sahip bir `div` ile sarmalanmıştır.

```
.table-container {
  max-inline-size: 100%;
  overflow-x: auto;
  scroll-snap-type: inline mandatory;
  scroll-behavior: smooth;
}
.table-container th,
.table-container td {
  scroll-snap-align: start;
  padding: var(--metric-box-spacing);
}
```

## Yönergeler

Taşma deseni, küçük ekranlar için iyi bir uzlaşma çözümüdür ancak ekran dışındaki içeriğe ulaşılabildiğinden emin olun. İçeriğin kesildiği kenara gölge veya gradyan yerleştirebilirsiniz.

İlerleme durumu açıklaması, yerden tasarruf etmek için yararlı bir yöntemdir ancak çok önemli içeriklerde kullanırken dikkatli olunmalıdır. İkincil işlemler için daha uygundur. Açıklamayı tetikleyen arayüz öğesinin net bir şekilde etiketlendiğinden emin olun. Yalnızca simgelerden yararlanmayın.

Öncelikle küçük ekranlar için tasarım yapın. Küçük ekran tasarımlarını daha büyük ekranlara uyarlamak, büyük ekran tasarımlarını küçük ekranlara uyarlamaktan daha kolaydır. Öncelikle büyük ekran için tasarım yaparsanız küçük ekran tasarımınız sonradan düşünülmüş gibi görünebilir.

Daha fazla düzen ve kullanıcı arayüzü öğesi kalıbı için web.dev'deki [Kalıplar](https://web.dev/patterns?hl=tr) bölümünü inceleyin.

Arayüz öğelerini farklı ekran boyutlarına uyarlarken medya sorguları, cihazın boyutlarını belirlemek için çok faydalıdır. Ancak `min-width` ve `min-height` gibi medya özellikleri sadece başlangıçtır. Ardından, diğer medya özelliklerini keşfedebilirsiniz.


---


<a id='bolum-15-15-media-features'></a>

## Bölüm 15: Medya özellikleri

**Kaynak:** [https://web.dev/learn/design/media-features?hl=tr](https://web.dev/learn/design/media-features?hl=tr)


Medya sorguları olmadan duyarlı tasarım mümkün olmazdı. Medya sorgularından önce, kullanıcıların web sitenizi ziyaret etmek için ne tür bir cihaz kullandığını bilmenin bir yolu yoktu. Tasarımcılar varsayımlarda bulunmak zorunda kaldı. Bu varsayımlar, sabit genişlikli tasarımlara veya akışkan düzenlere kodlanmıştır.

[Medya sorgularının](https://web.dev/learn/design/media-queries?hl=tr) kullanıma sunulmasıyla bu durum değişti. Tasarımcılar ilk kez insanlarla yarı yolda buluşabiliyordu. Tasarımcılar, düzenlerini kullanıcıların cihazlarına göre ayarlayabilir.

Medya sorgusunun isteğe bağlı bir medya türü ve zorunlu bir medya özelliği içerdiğini unutmayın. Yıllar içinde medya türlerinde pek değişiklik olmadı. Yine yalnızca dört olası değer vardır:

```
@media all
@media screen
@media print
@media speech
```

Diğer yandan [medya özellikleri](https://developer.mozilla.org/docs/Web/CSS/@media#media_features) büyük ölçüde genişledi. Tasarımcılar artık kullanıcıların beklentilerini yarı yoldan daha fazla karşılayabilir ve tasarımları yalnızca ekran boyutuna değil, çok daha fazla şeye uyacak şekilde uyarlayabilir.

Browser Support

- ![Chrome: 1.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  1
- ![Edge: 12.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  12
- ![Firefox: 1.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  1
- ![Safari: 3.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  3

[Source](https://developer.mozilla.org/docs/Web/CSS/@media)

## Görüntü alanı boyutları

Web'deki en popüler medya sorguları, görüntü alanı genişliğiyle ilgili olanlardır. Ancak burada bile bir seçim yapmanız gerekir. Belirli bir genişliğin altındaki stilleri uygulamak için `max-width` medya özelliğini, belirli bir genişliğin üzerindeki stilleri uygulamak için ise `min-width` medya özelliğini kullanabilirsiniz.

```
main {
  display: grid;
  grid-template-columns: 2fr 1fr;
}

@media (max-width: 45em) {
  main {
    display: block;
  }
}
```

```
@media (min-width: 45em) {
  main {
    display: grid;
    grid-template-columns: 2fr 1fr;
  }
}
```

Ben şahsen `min-width` kullanmayı tercih ediyorum. Düzen stillerini eklemeli olarak uygularım. Önceki kuralları geri almak yerine her kesme noktasında yeni düzen kuralları uyguluyorum.

Bu ekleme yaklaşımı, yükseklik için de geçerlidir. `min-height` kullanarak daha fazla görüntü alanı yüksekliği kullanılabilir hale geldikçe daha fazla kural ekleyebilirsiniz. Örneğin, yeterli dikey alan varsa tarayıcı penceresinin en üstüne sabitlemek istediğiniz bir başlık öğeniz olabilir.

```
@media (min-height: 30em) {
  header {
    position: fixed;
  }
}
```

Ancak isterseniz `max-height` medya özelliğini kullanabilirsiniz. Burada üstbilgi varsayılan olarak sabitlenir ancak yeterli dikey alan yoksa sabitlik kaldırılır.

```
header {
  position: fixed;
}
@media (max-height: 30em) {
  header {
    position: static;
  }
}
```

`min-` ve `max-` önekleri arasında seçim yapma yalnızca [`width`](https://developer.mozilla.org/docs/Web/CSS/@media/width) ve [`height`](https://developer.mozilla.org/docs/Web/CSS/@media/height) için geçerli değildir. [`aspect-ratio`](https://developer.mozilla.org/docs/Web/CSS/@media/aspect-ratio) medya özelliği de aynı seçeneği sunar. Genişlik ve yükseklik arasında tam bir oranla stil uygulamak isterseniz önek içermeyen bir sürüm de sunar.

```
@media (min-aspect-ratio: 16/9) {
  // The ratio of width to height is at least 16 by 9.
}
@media (max-aspect-ratio: 16/9) {
  // The ratio of width to height is less than 16 by 9.
}
@media (aspect-ratio: 16/9) {
  // The ratio of width to height is exactly 16 by 9.
}
```

Farklı en-boy oranları için farklı stiller sağlamak kısa sürede kontrolden çıkabilir. Bu ayrıntılı kontrol düzeyine ihtiyacınız yoksa [`orientation`](https://developer.mozilla.org/docs/Web/CSS/@media/orientation) medya özelliği ihtiyaçlarınıza daha uygun olabilir. İki olası değeri vardır: `portrait` veya `landscape`.

```
@media (orientation: portrait) {
  // The width is less than the height.
}
@media (orientation: landscape) {
  // The width is greater than the height.
}
```

[  ](https://web.dev/static/learn/design/media-features/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/gtBzPVsBu5mtnX8RuSqJ.mp4?hl=tr)

"Dikey" ve "yatay" terimleri en sık mobil cihazların yönünü ifade etmek için kullanılsa da `orientation` medya özelliği cihaza özel değildir. Normal bir dizüstü bilgisayardaki tam ekran tarayıcı penceresinin `orientation` değeri `landscape` olur.

## Ekranlar

Farklı ekranların piksel yoğunlukları farklıdır ve `dpi` (inç başına nokta) cinsinden ölçülür. [`resolution`](https://developer.mozilla.org/docs/Web/CSS/@media/resolution) medya özelliğini kullanarak farklı piksel yoğunlukları için stillerinizi ayarlayabilirsiniz. `aspect-ratio` gibi, `resolution` de üç çeşittir: minimum, maksimum ve tam.

```
@media (min-resolution: 300dpi) {
  // The display has a pixel density of at least 300 dots per inch.
}
@media (max-resolution: 300dpi) {
  // The display has a pixel density less than 300 dots per inch.
}
@media (resolution: 300dpi) {
  // The display has a pixel density of exactly 300 dots per inch.
}
```

Hiçbir zaman `resolution` medya sorgusu kullanmanız gerekmeyebilir. Piksel yoğunluğu genellikle yalnızca resimler için sorun teşkil eder ve [duyarlı resimler](https://web.dev/learn/design/responsive-images?hl=tr), piksel yoğunluğuyla doğrudan HTML'de başa çıkmanın bir yoludur.

Öte yandan, animasyonlarınızı ve geçişlerinizi CSS'de tanımlarsınız. [`update`](https://developer.mozilla.org/docs/Web/CSS/@media/update-frequency) medya özelliğini kullanarak bu animasyonları ve geçişleri farklı yenileme hızlarına yanıt verecek şekilde ayarlayabilirsiniz. Bu medya özelliği üç değerden birini bildirir: `none`, `slow` ve `fast`.

`update` değeri `none` ise yenileme hızı olmadığı anlamına gelir. Örneğin, yazdırılan bir sayfa güncellenemez.

`update` değeri `slow` ise ekranın hızlı yenilenemediği anlamına gelir. E-mürekkep ekran, yenileme hızı düşük bir ekran örneğidir.

`update` `fast` değeri, ekranın animasyonları ve geçişleri işleyecek kadar hızlı yenilendiği anlamına gelir.

```
@media (update: fast) {
  a {
    transition-duration: 0.4s;
    transition-property: transform;
  }
  a:hover {
    transform: scale(150%);
  }
}
```

Ekranın tüm yönleri donanım özellikleriyle ilgili değildir. [Tema oluşturma modülünde](https://web.dev/learn/design/theming?hl=tr), [web uygulaması manifest](https://web.dev/articles/add-manifest?hl=tr) dosyasında özelliklerin nasıl tanımlandığını görmüştünüz. Bu özelliklerden birine `display` adı verilir ve bu özelliğe `fullscreen`, `standalone`, `minimum-ui` veya `browser` değeri verebilirsiniz. İlgili [`display-mode`](https://developer.mozilla.org/docs/Web/CSS/@media/display-mode) medya özelliği, stillerinizi bu farklı seçeneklere göre uyarlamanıza olanak tanır.

Web uygulaması manifestinizde `display` değeri olarak `standalone` sağladığınızı varsayalım. Bir kullanıcı sitenizi ana ekranına eklerse site, tarayıcı arayüzü olmadan başlatılır. Bu kullanıcılar için geri düğmesi göstermeye karar verebilirsiniz.

```
button.back {
  display: none;
}
@media (display-mode: standalone) {
  button.back {
     display: inline;
  }
}
```

## Renk

Bir cihazın renk özelliklerini sorgulamak için çok sayıda medya özelliği vardır. Stillerinizi yalnızca gri tonları çıkaran herhangi bir ekran için ayarlamak istiyorsanız [`monochrome`](https://developer.mozilla.org/docs/Web/CSS/@media/monochrome) medya özelliğini herhangi bir değer olmadan kullanabilirsiniz.

```
@media (monochrome) {
  body {
    color: black;
    background-color: white;
  }
}
```

İlgili bir [`color`](https://developer.mozilla.org/docs/Web/CSS/@media/color) medya özelliği vardır.

```
@media (color) {
  body {
    color: maroon;
    background-color: linen;
  }
}
```

Renkli ekranlarda [`color-gamut`](https://developer.mozilla.org/docs/Web/CSS/@media/color-gamut), [`color-index`](https://developer.mozilla.org/docs/Web/CSS/@media/color-index) veya [`dynamic-range`](https://www.w3.org/TR/mediaqueries-5/#dynamic-range) medya özelliklerini kullanarak sorgu yazabilirsiniz. Bunların tümü, ekranın renk özellikleri hakkında ayrıntılı bilgi verir.

Bu örnekte, renk değerleri, ekranın maksimum parlaklık, renk derinliği ve kontrast oranı kombinasyonunu bildiren `dynamic-range` medya özelliğine yanıt olarak güncellenir. Olası değerler `standard` veya `high`'dir. `dynamic-range` değeri `high` olan yüksek çözünürlüklü bir ekrana, yeni CSS `color()` işlevi kullanılarak farklı bir renk alanı atanır.

```
.neon-red {
  color: hsl(355 100% 95%);
}
@media (dynamic-range: high) {
  .neon-red {
    color: color(display-p3 1 0 0);
  }
}
```

## Etkileşim

Medya özellikleri, sitenizle etkileşimde bulunmak için kullanılan giriş mekanizmasının türünü de (`hover`, `any-hover`, `pointer` ve `any-pointer`) bildirebilir. Daha fazla bilgi için [etkileşimle ilgili modüle](https://web.dev/learn/design/interaction?hl=tr) bakın.

## Kullanıcı tercihi sorguları

CSS'yi kullanarak, kullanıcılarınızın içeriğinize kendilerine uygun bir şekilde erişebildiğinden emin olmak için onlarla ortak çalışabilirsiniz. Bu derste, kullanıcının cihazının boyutlarına ve özelliklerine göre farklı CSS'leri nasıl uygulayacağınızı öğrendiniz. Ancak kullanıcının ayarlarına göre farklı CSS'ler de uygulayabilirsiniz.

### Koyu ve açık mod

Kullanıcınızın açık veya koyu tema tercihine yanıt verebilirsiniz. Birçok kullanıcı bunu sistem tercihi olarak ayarlar.

#### Kullanıcı arayüzü öğeleri için renk şemasını ayarlama

Tarayıcı, kaydırma çubukları ve form öğeleri gibi şeyler için varsayılan renkler sağlar. `color-scheme: light` olanlar için açık tema mı yoksa `color-scheme: dark` olanlar için koyu tema mı kullanılacağını belirtebilirsiniz. Ayrıca, `color-scheme: light dark` ile sayfanın her ikisini de desteklediğini belirtebilirsiniz. Bu özelliği `:root` veya `html` öğesinde ayarlayarak tüm sayfanın şemasını belirleyebilir ya da belirli öğeler için geçersiz kılabilirsiniz.

Stilleriniz yüklenmeden önce bir sayfanın şemasını ayarlamak için `meta` etiketi de belirleyebilirsiniz.`color-scheme` Sayfadaki bir öğede `color-scheme: normal` değerini ayarlarsanız bu meta etiketinde ayarladığınız `color-scheme` değeri kullanılır.

```
<meta name="color-scheme" content="dark light">
```

#### `prefers-color-scheme` medya özelliği

Ayrıca, `prefers-color-scheme` için bir medya sorgusuyla kullanıcının tercih ettiği renk temasına yanıt olarak özel stiller de tanımlayabilirsiniz.

#### `light-dark`

Kullanıcılarınıza hem açık hem de koyu tema seçeneği sunuyorsanız her rengi bir medya sorgusunun içine ayarlamak ayrıntılı bir işlem olabilir. `light-dark()`, her ikisini de tek bir mülkte belirtmenize olanak tanır.

Bunu etkinleştirmek için öğede veya öğenin üst öğelerinden birinde `color-scheme: light dark` değerini ayarlamanız gerekir.
Önce açık modda kullanılacak bir renk, ardından koyu modda kullanılacak bir renk ayarlarsınız.

```
h1{
  color: light-dark( var(--text-light), var(--text-dark));
}
```

Sistem tercihi açık mod isteyecek şekilde ayarlanmışsa başlık siyah olur. Tercihleri koyu mod ise başlık beyaz olur.

## Kontrast tercihleri

Kullanıcılarınız, yüksek veya düşük kontrastlı içerikleri daha kolay okuyabilir ve sistemlerini, temanızı kendileri için en uygun olanla değiştirecek şekilde ayarlayabilir. Sizin rolünüz, sitenizin kullanıcıların tercihlerine uygun şekilde çalışmaya devam etmesini sağlamaktır.

[Basamaklı stil modülünde](https://web.dev/learn/css/the-cascade?hl=tr#origin), `!important` yerel kullanıcı stillerinin, bir web sayfasının sağladığı yazılmış stilleri geçersiz kılabileceğini hatırlayabilirsiniz. Bu sayede kullanıcılar, kendileri için daha uygun olan stilleri kullanabilir.

### Zorunlu renkler

Windows, kullanıcıların web sitesindeki temaları geçersiz kılmak için seçebileceği "Kontrast temaları" sunar. Bu temalar genellikle yüksek kontrastlıdır ve açık veya koyu modda olabilir. CSS'de bu özelliğe zorunlu renkler adı verilir ve çoğu durumda siteniz bu modda beklendiği gibi çalışır. Düğmeler, bağlantılar, girişler ve diğer içerikler temanın renklerini kullanır.

Bazen, örneğin standart dışı öğeler kullanıyorsanız stillerinizi ayarlamanız gerekebilir. Kullanıcı zorunlu renkleri etkinleştirdiğinde stilleri uygulamak için `@media (forced-colors: active)` medya sorgusunu kullanabilirsiniz.

Bazı durumlarda, bir sitenin stilleri içeriğin kendisini anlamak için gereklidir. Örneğin, renk seçici veya renk anahtarı içeren bir grafik. Zorunlu renkler modunu devre dışı bırakmak için bir öğede `forced-color-adjust: none;` ayarlayabilirsiniz. Yalnızca belirli öğeleri devre dışı bıraktığınızdan ve içeriğe zorunlu renkler modunda erişilebildiğinden emin olun.

### Yüksek kontrast

Bazı kullanıcılar, sistemlerini kontrastı artıracak şekilde ayarlayabilir. Yanıtınızdaki stilleri `prefers-contrast: more` medya sorgusuyla ayarlayabilirsiniz.

**Not:** Zorunlu renkler, sayfanızdaki renklerin yerini alsa da daha yüksek kontrast tercih edildiğini göstermez. Zorunlu renkler etkinleştirildiğinde, yüksek kontrastlı temalar için `prefers-contrast` de `more`, düşük kontrastlı temalar için `less` ve sistem yüksek veya düşük olup olmadığını belirleyemezse `custom` olarak ayarlanır. Yüksek kontrast isteyen ancak zorunlu renkleri etkinleştirmemiş kullanıcıları hedeflemek için `@media (prefers-contrast: more) and (forced-colors: none) {}` kullanabilirsiniz.

## İndirgenmiş hareket

Kullanıcının azaltılmış hareket tercihine `prefers-reduced-motion` medya sorgusuyla yanıt verebilirsiniz. Bu özellik genellikle epilepsi, vestibüler hareket bozuklukları veya migren hassasiyeti olan kişilerde tetikleyici olabilecek büyük hareketlerden kaçınan alternatif animasyonlar sağlamak için kullanılır. Daha fazla bilgiyi [Animasyonla çalışırken dikkat edilmesi gerekenler](https://web.dev/learn/css/animations?hl=tr#tips) başlıklı makalede bulabilirsiniz.

## Senaryo Yazma

Kullanıcılarınız sitenizi JavaScript devre dışıyken ziyaret edebilir. Bu durumda, `scripting` medya sorgusunu kullanarak CSS'nizi ayarlayabilir ve kullanıcıların içeriğinize erişmeye devam etmesini sağlayabilirsiniz.

```
@media (scripting: none) {
  /* Styles when JavaScript is disabled*/
 }

@media (scripting: initial-only) {
  /* Styles when JavaScript is available only for an initial render, for example with a printed page or server side rendering */
}

@media (scripting: enabled) {
   /* Styles when Javascript is enabled */
}
```

## Anlayıp anlamadığınızı kontrol etme

Medya özellikleriyle ilgili bilginizi test edin

> [Öğrendiklerinizi Test Edin]
> Medya sorgusu, belirli bir genişlikteki (ör.
> @media (width: 1024px)
> ) cihazları kontrol edebilir mi?
> Doğru
> Belirli bir genişlik yalnızca
> 1023px
> üstü ve
> 1025px
> altı genişlik eşzamanlı olarak kontrol edilerek elde edilebilir.
> Yanlış
> min-width
> ve
> max-width
> ile abone olunabilir.
> Bir medya sorgusu, belirli bir
> aspect-ratio
> cihazı
> @media (aspect-ratio: 4/3)
> gibi kontrol edebilir mi?
> Doğru
> En boy oranına özgü olarak tek bir oran eşleştirilebilir.
> Yanlış
> Bu seçenek,
> aspect-ratio
> için mevcuttur.
> Geçerli renk medya sorguları hangileridir?
> @media (color)
> Her renk cihazla eşleşir.
> @media (monochrome)
> Renk özelliği olmayan herhangi bir cihazla eşleşir.
> @media (color-gamut: srgb)
> sRGB renk özelliğine sahip cihazlarla eşleşir.
> @media (min-color-index: 15000)
> En az 15.000 renk seçeneği sunan cihazlarla eşleşir.
> @media (dynamic-range: high)
> HD renk aralıklarını destekleyen cihazlarla eşleşir.
> Aşağıdaki kullanıcı tercihi medya sorgularından hangileri geçerlidir?
> @media (prefers-color-scheme: dark)
> Kullanıcının işletim sistemi karanlık moda ayarlandığında eşleşir.
> @media (prefers-colors: high-definition)
> Gerçek değil.
> @media (prefers-reduced-motion: reduce)
> Kullanıcının işletim sistemi hareket azaltma moduna ayarlandığında eşleşir.
> @media (prefers-contrast: more)
> Kullanıcının işletim sistemi yüksek kontrasta ayarlandığında eşleşir.
> @media (prefers-site-speed: fast)
> Gerçek değil.
> color-scheme
> için geçerli değerler nelerdir?
> light
> Doğru!
> dark
> Doğru!
> night
> Yanlış.
> contrast
> Yanlış.
> Bir öğeyi zorunlu renkler dışında nasıl bırakabilirsiniz?
> forced-colors: active
> Yanlış.
> forced-colors: inactive
> Yanlış.
> forced-colors-adjust: none
> Doğru!
> forced-colors-adjust: normal
> Yanlış.


---


<a id='bolum-16-16-screen-configurations'></a>

## Bölüm 16: Ekran yapılandırmaları

**Kaynak:** [https://web.dev/learn/design/screen-configurations?hl=tr](https://web.dev/learn/design/screen-configurations?hl=tr)


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


---


<a id='bolum-17-17-conclusion'></a>

## Bölüm 17: Sonuç ve sonraki adımlar

**Kaynak:** [https://web.dev/learn/design/conclusion?hl=tr](https://web.dev/learn/design/conclusion?hl=tr)


Tebrikler! Sonuna kadar geldiniz. Duyarlı tasarımla ilgili bu genel bakıştan memnun kaldığınızı umuyoruz. Daha fazla bilgi için aşağıdaki ek kaynaklara göz atabilirsiniz:

## Ek kaynaklar

- [LearnCSS](https://web.dev/learn/css?hl=tr)
- [MDN'deki CSS belgeleri](https://developer.mozilla.org/docs/Web/CSS)
- [CSS Podcast'ini dinleme](https://thecsspodcast.libsyn.com)
- [web.dev'deki CSS makaleleri](https://web.dev/tags/css?hl=tr)
- [CSS-Tricks](https://css-tricks.com/tag/css/)
- [Layout Land - YouTube](https://www.youtube.com/channel/UC7TizprGknbDalbHplROtag?hl=tr)

## Sunan:

![Jeremy Keith](https://web.dev/images/authors/adactio.jpg?hl=tr)

Jeremy Keith

[X](https://twitter.com/adactio)
[GitHub](https://github.com/adactio)
[Ana sayfa](https://adactio.com/)

![Adam Argyle](https://web.dev/images/authors/adamargyle.jpg?hl=tr)

Adam Argyle

[X](https://twitter.com/argyleink)
[GitHub](https://github.com/argyleink)
[Ana sayfa](https://nerdy.dev)

![Camden Bickel](https://web.dev/images/authors/cambickel.jpg?hl=tr)

Camden Bickel

[X](https://twitter.com/camdenbickel)
[GitHub](https://github.com/camden)
[Ana sayfa](https://cambickel.com)

![Rachel Andrew](https://web.dev/images/authors/rachelandrew.jpg?hl=tr)

Rachel Andrew

[GitHub](https://github.com/rachelandrew)
[LinkedIn](https://www.linkedin.com/in/rachelandrew)
[Mastodon](https://front-end.social/@rachelandrew)
[Bluesky](https://bsky.app/profile/rachelandrew.bsky.social)
[Ana sayfa](https://rachelandrew.co.uk)

![Una Kravets](https://web.dev/images/authors/una.jpg?hl=tr)

Una Kravets

[X](https://twitter.com/una)
[GitHub](https://github.com/una)
[Bluesky](https://bsky.app/profile/una.im)
[Ana sayfa](https://una.im/)


---
