# Kullanıcı arayüzü kalıpları

**Orijinal Kaynak:** [https://web.dev/learn/design/ui-patterns?hl=tr](https://web.dev/learn/design/ui-patterns?hl=tr)

---

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
