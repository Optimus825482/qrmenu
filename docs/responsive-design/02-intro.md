# Giriş

**Orijinal Kaynak:** [https://web.dev/learn/design/intro?hl=tr](https://web.dev/learn/design/intro?hl=tr)

---

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
