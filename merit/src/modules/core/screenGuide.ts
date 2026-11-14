import type { Action } from "@/lib/rbac";
import type { SettingKey } from "@/lib/settings-defs";

/**
 * Rehber kataloğu: her ekran için amaç, adımlar ve sık yapılan hatalar (spec §3.4).
 * Metinler TASLAKTIR; Erkan onaylar (`scripts/export-guides.ts` onay tablosunu üretir).
 * Metin değişince ilgili ekranın `version` değeri artırılır (tur yeniden önerilir).
 */

export type GuideStep = { target: string; title: string; body: string; requires?: Action[] };

export type GuideContext = "xp" | "personel" | "pos";

export type ScreenGuide = {
  code: string;
  version: number;
  purpose: string;
  context: GuideContext;
  actions?: Partial<Record<Action, string>>;
  steps: GuideStep[];
  mistakes: string[];
  settings?: SettingKey[];
  /** Mistake tips that describe an action: shown only to users who hold all listed actions (text -> actions). */
  mistakeRequires?: Record<string, Action[]>;
};

export type RoutineAuto =
  | "uploadsDone"
  | "tasksDone"
  | "mybarAllSeen"
  | "dndOpenZero"
  | "printerOk"
  | "queueEmpty";

export const ROUTINE_AUTO_KEYS: readonly RoutineAuto[] = [
  "uploadsDone",
  "tasksDone",
  "mybarAllSeen",
  "dndOpenZero",
  "printerOk",
  "queueEmpty",
];

export type RoutineItem = { id: string; label: string; screen: string; auto?: RoutineAuto };

export type RoleRoutine = {
  id: string;
  roleCode: string;
  title: string;
  host: { code: string; path: string };
  hours?: [number, number];
  items: RoutineItem[];
};

export const GENERIC_ACTION_TEXT: Record<Action, string> = {
  V: "Görebilirsin",
  O: "Yeni kayıt açabilirsin",
  D: "Değiştirebilirsin",
  A: "Onaylayıp reddedebilirsin",
  R: "Rapor alabilirsin",
};

type StepTuple = readonly [target: string, title: string, body: string];

type Extra = {
  actions?: Partial<Record<Action, string>>;
  settings?: SettingKey[];
  requires?: Record<string, Action[]>;
  mistakeRequires?: Record<string, Action[]>;
};

function guide(
  code: string,
  context: GuideContext,
  purpose: string,
  steps: StepTuple[],
  mistakes: string[],
  extra: Extra = {},
): ScreenGuide {
  return {
    code,
    version: 1,
    purpose,
    context,
    ...(extra.actions ? { actions: extra.actions } : {}),
    steps: steps.map(([target, title, body]) => ({
      target,
      title,
      body,
      ...(extra.requires?.[target] ? { requires: extra.requires[target] } : {}),
    })),
    mistakes,
    ...(extra.settings ? { settings: extra.settings } : {}),
    ...(extra.mistakeRequires ? { mistakeRequires: extra.mistakeRequires } : {}),
  };
}

const LIST: ScreenGuide[] = [
  // MINIBAR
  guide(
    "MB-KAT",
    "personel",
    "Katları ve odaların bugünkü durumunu görür, kontrol edilecek odaya buradan geçersin.",
    [
      ["kat-listesi", "Katlar", "Kat başlıklarına dokunarak odaları aç veya kapat; her kat kendi özetini gösterir."],
      ["oda-karti", "Oda kartı", "Kartın rengi odanın durumunu söyler. Kontrol etmek istediğin odanın kartına dokun."],
      ["durum-filtresi", "Filtreler", "Yalnız bekleyen, DND veya MyBar işaretli odaları görmek için filtreyi kullan."],
      ["islemlerim", "İşlemlerim", "Gün içinde yaptığın kontrolleri ve bekleyen işlerini buradan gözden geçirirsin."],
    ],
    [
      "Boş odayı da kontrol edebilirsin; sistem yalnız uyarır.",
      "Filtre açık kaldığı için odaları eksik görürsün; filtreyi temizlemeyi dene.",
    ],
    {
      actions: {
        V: "Katları ve odaların bugünkü durumunu görürsün.",
        O: "Odalarda yeni kontrol başlatırsın.",
        D: "Kontrol kayıtlarını düzeltirsin.",
      },
    },
  ),
  guide(
    "MB-KF",
    "personel",
    "Oda QR kodunu okutarak kat formunu açar, odanın kontrolüne hızlıca geçersin.",
    [
      ["qr-okut", "QR okut", "Kameraya izin ver ve oda kapısındaki QR kodu okut."],
      ["oda-bilgisi", "Oda bilgisi", "Açılan formda oda numarasını ve katı kontrol et; yanlışsa geri dön."],
      ["form-gonder", "QR okutulamıyorsa", "Manuel kayıt talebi ile odadaki tüketimi açıklamasıyla onaya gönder; onaylanınca odaya işlenir."],
    ],
    [
      "Başka odanın QR kodunu okutursan form o odaya açılır; oda numarasına bak.",
      "Kamera izni verilmediyse okuma çalışmaz; tarayıcı izinlerinden kamerayı aç.",
    ],
  ),
  guide(
    "MB-TUK",
    "personel",
    "Odanın minibarını kontrol edip eksikleri tamamlarsın.",
    [
      ["urun-listesi", "Ürün listesi", "Eksik ürünü yerine koy ve adedine bas (+1, +2…): kayıt hemen yapılır."],
      ["eksik-ozeti", "Alt çubuk", "Oda için tek seferlik kayıtlar burada: Sarfiyat Yok ve DND."],
      ["dnd-bildir", "DND", "Misafir rahatsız edilmesin diyorsa odayı DND olarak işaretle; oda ikinci kontrole kalır."],
      ["kaydet", "Sarfiyat Yok", "Hiçbir ürün eksik değilse Sarfiyat Yok'a bas. Odaya bugün ürün eklendiyse bu düğme kilitlenir."],
    ],
    [
      "Yanlış adede bastıysan bildirimdeki \"Geri al\" ile düzelt; geri alınca Sarfiyat Yok yeniden açılır.",
      "DND oda belirlenen kontrol sayısında tamamlanır; ilk kontrolde kapatmaya çalışma.",
    ],
    { settings: ["dnd.minChecks"] },
  ),
  guide(
    "MB-ZIM",
    "personel",
    "Otel deposundaki ürün stokunu, SKT durumunu ve kritik seviyeleri izlersin.",
    [
      ["havuz-listesi", "Otel deposu", "Otelin deposundaki ürünler ve eldeki adetleri burada durur."],
      ["kritik-seviye", "Kritik seviye", "Adet kritik seviyenin altına inince satır uyarı rengine döner."],
      ["hareketler", "Hareketler", "Her giriş ve çıkış kayıt altındadır; bir adet şüpheliyse hareketlere bak."],
      ["havuz-giris", "Stok ekle", "Tek bir ürünü otel deposuna eklersin; merkez depodan gelenler Merkez Depo Tedarik ekranından girilir."],
    ],
    [
      "Otel deposu yetersizken kontrol kaydı açılamaz; önce Ek Talep ile stok iste.",
      "Başka otelin deposuna bakıyorsan üstteki otel seçimini kontrol et.",
    ],
    {
      actions: {
        V: "Otel deposundaki ürünleri ve eldeki adetleri görürsün.",
        O: "Otel deposuna stok eklersin.",
        D: "Ürünün kritik seviyesini güncellersin.",
      },
      settings: ["stock.defaultCriticalLevel"],
      requires: { "havuz-giris": ["O"] },
      mistakeRequires: { "Otel deposu yetersizken kontrol kaydı açılamaz; önce Ek Talep ile stok iste.": ["O"] },
    },
  ),
  guide(
    "MB-TAL",
    "personel",
    "Eksik stok için ek talep açar, düzeltme taleplerini yanıtlarsın.",
    [
      ["talep-listesi", "Talepler", "Bekleyen, onaylanan ve reddedilen talepler durumlarıyla listelenir."],
      ["yeni-talep", "Yeni talep", "Ürünü ve adedi seç, gerekçeyi yaz ve gönder."],
      ["onay-reddet", "Yanıt ver", "Yetkin varsa talebi onayla veya gerekçe yazarak reddet."],
    ],
    [
      "Reddederken gerekçe yazmak zorundasın; boş bırakırsan işlem tamamlanmaz.",
      "Aynı ürün için ikinci talep açmadan önce bekleyen talebi kontrol et.",
    ],
    {
      actions: {
        O: "Yeni ek talep açarsın.",
        A: "Gelen talepleri onaylar veya reddedersin.",
      },
    },
  ),
  guide(
    "MB-DOL",
    "personel",
    "Günlük doluluk dosyalarını yükleyip hangi odaların kontrol edileceğini belirlersin.",
    [
      ["dosya-sec", "Dosya seç", "Gün için gereken doluluk dosyasını seç; biçim yanlışsa sistem uyarır."],
      ["onizleme", "Önizleme", "Yüklemeden önce satır sayısını ve oda eşleşmelerini önizlemede doğrula."],
      ["yukle", "Yükle", "Önizleme doğruysa yüklemeyi tamamla; görevler kat sorumlularına dağılır."],
      ["gecmis", "Geçmiş", "Önceki yüklemeleri ve sonuçlarını geçmişten görebilirsin."],
    ],
    [
      "Üç dosyanın hepsi yüklenmeden günün görevleri tam oluşmaz.",
      "Yanlış güne ait dosya yüklersen önizlemedeki tarihe dikkat et.",
    ],
    {
      actions: {
        V: "Yüklenen doluluk dosyalarını görürsün.",
        O: "Yeni doluluk dosyası yüklersin.",
      },
      settings: ["occupancy.fileRetentionDays"],
    },
  ),
  guide(
    "MB-PERS",
    "personel",
    "Misafirlerin MyBar ile gönderdiği taleplere bakar ve odalarını işlersin.",
    [
      ["talep-listesi", "Talepler", "Gönderilen MyBar talepleri oda numarasıyla sıralanır."],
      ["oda-ac", "Odaya git", "Talebin odasını açıp ürünleri kontrolde işle."],
      ["goruldu", "Görüldü", "Talebi gördüğünü işaretle; görülmeyen talep bekleyen sayılır."],
    ],
    [
      "Talebi görüp işaretlemezsen günlük rutinde bekleyen olarak kalır.",
      "Misafir günlük sınırı kadar talep gönderir; fazlası ertesi güne kalır.",
    ],
    { settings: ["mybar.dailyLimit"] },
  ),
  guide(
    "MB-DND",
    "personel",
    "Rahatsız etmeyin işaretli odaları ve kalan kontrolleri takip edersin.",
    [
      ["dnd-listesi", "DND odaları", "Bugün DND işaretli odalar ve yapılan kontrol sayısı listelenir."],
      ["ikinci-kontrol", "Yeniden kontrol", "İlk kontrolden sonra odayı belirlenen sürede yeniden denemen gerekir."],
      ["tamamla", "Tamamla", "Gerekli kontrol sayısına ulaşılınca oda tamamlanır."],
    ],
    [
      "Misafir odadayken zorla girme; kaydı DND olarak bırak.",
      "Gün sonunda açık kalan DND odaları raporda eksik olarak görünür.",
    ],
    { settings: ["dnd.minChecks", "dnd.recheckMinutes"] },
  ),
  guide(
    "MB-RAP",
    "personel",
    "Minibar kullanımını ve eksikleri raporlarsın.",
    [
      ["rapor-secimi", "Rapor seç", "Rapor türünü ve tarih aralığını seç."],
      ["filtreler", "Filtreler", "Kat, ürün veya kişiye göre daralt."],
      ["indir", "İndir", "Sonucu Excel veya PDF olarak indir."],
    ],
    [
      "Tarih aralığı geniş olunca rapor geç açılır; mümkünse daralt.",
      "Otel seçimi farklıysa rakamlar da farklı çıkar; üstteki oteli kontrol et.",
    ],
    {
      actions: {
        V: "Raporları görürsün.",
        R: "Raporları Excel veya PDF olarak indirirsin.",
      },
    },
  ),
  guide(
    "MB-TAN",
    "personel",
    "Minibar ürünlerini, katları ve oda tanımlarını yönetirsin.",
    [
      ["tanim-sekmeleri", "Tanımlar", "Ürün, kat ve oda tanımları ayrı bölümlerde durur."],
      ["yeni-kayit", "Yeni kayıt", "Yeni ürün veya oda eklemek için ekle düğmesini kullan."],
      ["duzenle", "Düzenle", "Bir satıra dokunup bilgisini değiştir ve kaydet."],
    ],
    [
      "Kullanımdaki bir tanımı silemezsin; önce pasife al.",
      "Ürün adını değiştirmek geçmiş kayıtları etkilemez.",
    ],
  ),
  guide(
    "MB-OKI",
    "personel",
    "Bütün personelin oda kontrol kayıtlarını gün ve personele göre listeler, gerekirse düzeltir veya silersin.",
    [
      ["oki-filtre", "Tarih ve personel", "Bir gün ya da tarih aralığı seç; istersen yalnız bir personelin kayıtlarını göster."],
      ["oki-liste", "Kayıt listesi", "Her satırda saat, oda, personel, işlem türü, ürünler ve not görünür; tüm oteller seçiliyse otel sütunu da çıkar."],
      ["oki-duzenle", "Düzenle", "Ürün adetlerini veya notu değiştirirsin; fark otel deposuna işlenir."],
      ["oki-sil", "Sil", "Kaydı gerekçe yazarak silersin; ürünler otel deposuna geri döner."],
    ],
    [
      "MyBar karşılama kayıtları burada yalnız okunur; MyBar talebi üzerinden düzeltilir.",
      "Her silme ve düzeltme denetim günlüğüne yazılır; gerekçeyi açık yaz.",
    ],
    {
      actions: {
        V: "Bütün personelin oda kontrol kayıtlarını görürsün.",
        D: "Kayıtları düzeltir ve silersin.",
      },
      requires: { "oki-duzenle": ["D"], "oki-sil": ["D"] },
    },
  ),
  // QR_MENU
  guide(
    "QM-MIS",
    "personel",
    "Misafirin gördüğü menünün önizlemesini görürsün.",
    [
      ["onizleme-alani", "Önizleme", "Menü misafirin telefonunda göründüğü gibi açılır."],
      ["dil-secimi", "Dil", "Diller arasında geçerek çevirileri kontrol et."],
      ["kategori-gezin", "Kategoriler", "Kategorilere girip ürünlerin görünümünü doğrula."],
    ],
    [
      "Önizleme sipariş vermez; yalnız görünümü gösterir.",
      "Çevirisi eksik bir ürün misafire varsayılan dilde görünür.",
    ],
  ),
  guide(
    "QM-CAG",
    "personel",
    "Masalardan gelen garson çağrılarını görür ve karşılarsın.",
    [
      ["cagri-listesi", "Çağrılar", "Yeni çağrılar en üstte, bekleme süresiyle gösterilir."],
      ["cagri-al", "Üstlen", "Çağrıya dokunarak üstlen; diğer garsonlar da durumu görür."],
      ["cagri-kapat", "Kapat", "Masaya gittikten sonra çağrıyı kapat."],
    ],
    [
      "Üstlenmediğin çağrı süre dolunca yöneticiye yükselir.",
      "Kapatılmayan çağrı masayı meşgul gösterir.",
    ],
    { settings: ["order.callAlertSeconds"] },
  ),
  guide(
    "QM-MEN",
    "xp",
    "Outlet menüsünü kategoriler, ürünler ve fiyatlarla yönetirsin.",
    [
      ["menu-agaci", "Menü ağacı", "Kategori, alt kategori ve ürünler ağaç olarak durur."],
      ["urun-formu", "Ürün formu", "Ad, fiyat, görsel ve çevirileri ürün formundan düzenlersin."],
      ["satisa-ac-kapa", "Satışa aç veya kapat", "Bitmiş ürünü silmeden satışa kapatabilirsin."],
      ["ceviriler", "Çeviriler", "Her dil için ad ve açıklamayı ayrıca gir."],
    ],
    [
      "Ürünü silmek yerine satışa kapatmak geçmiş siparişleri korur.",
      "Fiyat değişikliği açık adisyonlara yansımaz.",
    ],
  ),
  guide(
    "QM-TEM",
    "xp",
    "Menünün renk, yazı tipi ve görünüm temasını tasarlarsın.",
    [
      ["tema-listesi", "Temalar", "Hazır temalardan birini seç veya kendi temanı oluştur."],
      ["renk-duzenle", "Renkler", "Renkleri değiştir; okunabilirlik uyarılarını dikkate al."],
      ["onizle-yayinla", "Önizle ve yayınla", "Önizlemeyi kontrol et, beğendiysen outlete ata."],
    ],
    [
      "Düşük karşıtlıklı renkler misafirin ekranında okunmaz.",
      "Yayınlanmayan tema misafire görünmez.",
    ],
  ),
  guide(
    "QM-RAP",
    "xp",
    "Menü görüntüleme ve ürün ilgisi raporlarına bakarsın.",
    [
      ["rapor-filtre", "Dönem", "Rapor dönemini seç."],
      ["rapor-grup", "Rapor grubu", "Menü raporları Rapor Merkezi'nde modül sekmesi olarak durur."],
      ["rapor-indir", "İndir", "Tabloyu Excel olarak indir."],
    ],
    [
      "Yeni açılan menüde veri birkaç gün sonra anlam kazanır.",
      "Outlet seçimi farklıysa rakamlar da farklı olur.",
    ],
  ),
  // QR_ORDER
  guide(
    "QS-KUY",
    "personel",
    "Masalarına gelen siparişleri onaylar ve masaya yeni sipariş açarsın.",
    [
      ["masalarim", "Masalarım", "Sana atanan masalar durumlarıyla listelenir."],
      ["gelen-siparis", "Gelen sipariş", "Misafirin gönderdiği sipariş burada onayını bekler."],
      ["yeni-siparis", "Yeni sipariş", "Masayı seç, ürünleri Seçimler listesine ekle ve mutfağa gönder."],
      ["siparis-durumu", "Durum", "Siparişin mutfakta hazırlanma durumunu buradan izlersin."],
    ],
    [
      "Onaylamadığın misafir siparişi mutfağa gitmez.",
      "Gönderilmiş siparişi değiştirmek için iptal ve düzeltme yetkisi gerekir.",
    ],
    {
      actions: {
        O: "Masaya yeni adisyon açarsın.",
        A: "Misafirin gönderdiği siparişi onaylar veya reddedersin.",
      },
      settings: ["order.approvalEscalationMinutes"],
    },
  ),
  guide(
    "QS-KAS",
    "pos",
    "Onay kuyruğunu, masaları ve ödemeleri kasadan yönetirsin.",
    [
      ["onay-kuyrugu", "Onay kuyruğu", "Onay bekleyen siparişler sırayla görünür."],
      ["masa-haritasi", "Masalar", "Masaya dokunarak adisyonunu aç."],
      ["adisyon", "Adisyon", "Kalemleri kontrol et, gerekirse düzelt ve kapat."],
      ["yazici-durumu", "Yazıcı", "Fiş yazıcısının hazır olup olmadığını durum çubuğundan izle."],
    ],
    [
      "Yazıcı hazır değilse fiş kuyrukta bekler; yazıcı ekranından kontrol et.",
      "Kapatılan adisyonu yeniden açmak yönetici onayı ister.",
    ],
    { settings: ["price.display"] },
  ),
  guide(
    "QS-KDS",
    "pos",
    "Mutfağa gelen siparişleri hazırlayıp Hazır olarak işaretlersin.",
    [
      ["yeni-siparisler", "Yeni", "Gelen siparişler sırayla burada belirir."],
      ["hazirlaniyor", "Hazırlanıyor", "Hazırlamaya başladığın siparişi bu sütuna al."],
      ["hazir", "Hazır", "Tamamlanan siparişi Hazır yap; garson haberdar olur."],
    ],
    [
      "Hazır işaretlediğin siparişi kısa süre içinde geri alabilirsin.",
      "Ses kapalıysa yeni siparişi kaçırabilirsin; sesi açık tut.",
    ],
  ),
  guide(
    "QS-FIS",
    "pos",
    "Fiş yazıcılarını ve basılmayı bekleyen fişleri izlersin.",
    [
      ["yazici-listesi", "Yazıcılar", "Her yazıcının durumu ve bekleyen fiş sayısı görünür."],
      ["test-fisi", "Test fişi", "Vardiya başında test fişi basarak yazıcıyı doğrula."],
      ["bekleyen-fisler", "Bekleyen fişler", "Basılamayan fişi yeniden dene."],
    ],
    [
      "Kağıt bittiğinde fişler kaybolmaz; kağıdı takınca yeniden dene.",
      "Yanlış yazıcıya yönlenen fişi yazıcı atamasından düzelt.",
    ],
  ),
  guide(
    "QS-IPT",
    "pos",
    "Sipariş ve adisyon iptal veya düzeltmelerini gerekçesiyle yaparsın.",
    [
      ["iptal-listesi", "İptal edilebilirler", "Açık adisyon ve siparişler listelenir."],
      ["gerekce", "Gerekçe", "İptal veya düzeltme için gerekçe seçmek zorundasın."],
      ["onayla", "Onayla", "İşlemi onayla; kayıt denetim günlüğüne yazılır."],
    ],
    [
      "Servis edilmiş siparişin iptali yönetici onayı gerektirebilir.",
      "Gerekçesiz işlem kaydedilmez.",
    ],
  ),
  guide(
    "QS-RAP",
    "xp",
    "Sipariş, ciro ve hazırlık süresi raporlarına bakarsın.",
    [
      ["rapor-filtre", "Dönem", "Gün veya tarih aralığını seç."],
      ["rapor-grup", "Rapor grubu", "Outlet raporları Rapor Merkezi'nde Outlet sekmesindedir."],
      ["rapor-indir", "İndir", "Sonucu Excel veya PDF indir."],
    ],
    [
      "İptal edilen siparişler ciroya girmez.",
      "Para birimi, outlet formunda fiyat gösterimiyle birlikte seçilen birimdir.",
    ],
  ),
  // ROOM_SERVICE
  guide(
    "RO-TAL",
    "personel",
    "Odalardan gelen servis taleplerini görür ve karşılarsın.",
    [
      [
        "talep-listesi",
        "Talepler",
        "Talepler dört sütunda (Talep Alındı, Hazırlanıyor, Gönderildi, Teslim Edildi) geliş saatine göre listelenir; Kuyruk görünümü hepsini tek sırada gösterir.",
      ],
      ["talep-ac", "Talep detayı", "İçeriği, notu ve toplamı detayda gör."],
      ["onayla", "Onayla", "Talebi hazırlığa gönder."],
    ],
    [
      "Yeni talep sesle ve köşedeki bildirim penceresiyle haber verilir; MyBar talepleri yan panelde yalnızca izlenir.",
      "Bekleme süresi dolan talep yöneticiye yükselir.",
    ],
    { settings: ["rs.slaMinutes"] },
  ),
  guide(
    "RO-TES",
    "personel",
    "Hazırlanan siparişlerin odaya teslimini takip edersin.",
    [
      ["teslim-listesi", "Teslim bekleyenler", "Hazır siparişler odalarıyla listelenir."],
      ["yola-cik", "Yola çıktı", "Siparişi alıp yola çıktığını işaretle."],
      ["teslim-edildi", "Teslim edildi", "Odaya bıraktığında teslim edildi olarak işaretle."],
    ],
    [
      "Teslim edildi işaretlenmeyen sipariş süre hedefini aşmış sayılır.",
      "Yanlış odayı işaretlediysen yöneticiye bildir.",
    ],
  ),
  guide(
    "RO-MBT",
    "personel",
    "Minibar oda kontrollerini kat planı üzerinde anlık izlersin; hangi odayı kimin, ne zaman kontrol ettiğini görürsün.",
    [
      ["mbt-otel", "Otel seçimi", "Üstteki listeden oteli değiştir; bütün otellerin kat planını görebilirsin."],
      ["mbt-kat", "Kat planı", "Her kutu bir odadır; renkler Komuta Merkezi'ndeki Kat görünümüyle aynıdır."],
      ["mbt-ayrinti", "Oda ayrıntısı", "Bir odaya dokun: kontrol saati, kontrol eden personel ve sonuç görünür."],
    ],
    [
      "Bu ekran yalnız izleme içindir; buradan kayıt girilmez veya düzeltilmez.",
      "Ekran kendiliğinden yenilenir; sayfayı elle yenilemen gerekmez.",
    ],
  ),
  guide(
    "RO-OTA",
    "xp",
    "Bir kullanıcıya başka bir otelin oda servisi taleplerini süreli olarak izleme ya da işleme izni verirsin.",
    [
      ["ota-yeni", "Yeni izin", "Kullanıcıyı, talepleri görülecek oteli, izleme ya da işleme türünü ve süreyi seç."],
      ["ota-suren", "Süren izinler", "Kimin hangi otele, ne zamana kadar izni olduğunu görürsün; gerekirse kaldırırsın."],
      ["ota-biten", "Süresi dolanlar", "Son bir haftada süresi dolan izinler altta listelenir."],
    ],
    [
      "İzin vermek oluşturma, izni kaldırmak düzenleme yetkisi ister; yalnız görüntüleme yetkisiyle liste açılır.",
      "Süresi dolan izin kendiliğinden biter; her izin ve kaldırma denetim kaydına yazılır.",
    ],
  ),
  guide(
    "RO-SLA",
    "xp",
    "Oda servisi süre hedeflerini raporlarsın.",
    [
      ["sla-ozeti", "Özet", "Hedef içinde ve dışında kalan siparişlerin oranı görünür."],
      ["sla-detay", "Detay", "Hedefi aşan siparişlerin bekleme süreleri listelenir."],
      ["sla-indir", "İndir", "Listelenen siparişleri CSV olarak indir; Excel açar."],
    ],
    [
      "Hedef süre sistem ayarlarından değişir; güncel hedef geçmiş günler dahil tüm günlere uygulanır.",
      "Tek bir gün ya da son 7 gün seçilir.",
    ],
    { settings: ["rs.slaMinutes"] },
  ),
  // CORE
  guide(
    "CR-KOM",
    "xp",
    "Otelin anlık durumunu ve kısayollarını masaüstünde görürsün.",
    [
      ["masaustu", "Masaüstü", "Uygulama simgelerine çift tıklayarak pencere aç."],
      ["gosterge", "Göstergeler", "Komuta merkezi anlık sayıları gösterir."],
      ["kpi-cipleri", "KPI çipleri", "Bekleyen iş ve tüketim sayıları renk ve yazıyla durumunu söyler; tıklayınca ilgili ekran açılır."],
      ["baslat-menusu", "Başlat menüsü", "Tüm ekranlara ve Erişimim özetine buradan ulaşırsın."],
    ],
    [
      "Pencereyi kapatmak yarım kalan formu kaydetmez.",
      "Birden çok otelde çalışıyorsan üstten oteli seç.",
    ],
  ),
  guide(
    "CR-DUR",
    "xp",
    "Bugünkü canlı sayaçları (oda servisi, MyBar, minibar, QR) ve çevrimiçi kullanıcıyı otel otel görürsün.",
    [
      ["durum-tablo", "Anlık Durum", "Masaüstünde widget, tablette üst çubuktaki Anlık Durum düğmesi, telefonda ana ekran kartı."],
      ["durum-renk", "Renkler", "Her satırda bugün alınan, tamamlanan ve bekleyen sayılar ayrı renkle gösterilir."],
      ["durum-satir", "Satır ayrıntısı", "Bir satıra tıklayınca o sayının dökümü açılır."],
    ],
    [
      "Satırlar yalnız yetkin olan modüllerin sayılarını gösterir.",
      "Sayılar canlı olaylarla ve 30 saniyede bir yenilenir.",
    ],
  ),
  guide(
    "CR-RAD",
    "xp",
    "Kompleksin anlık operasyonunu tek pencerede salt okunur izlersin.",
    [
      ["radar-genel", "Genel bakış", "Seçili oteldeki sipariş, minibar ve personel sayıları canlı güncellenir."],
      ["radar-zaman", "Zaman şeridi", "Son yarım saate geri sarıp olayları yeniden izleyebilirsin."],
      ["radar-duvar", "Duvar ekranı", "Tam ekran modu bir ekranda sürekli gösterim içindir."],
      ["radar-demo", "Demo başlat", "Açılan pencerede Minibar, Outlet (QR Sipariş) veya Oda Servisi'ni ve oteli seç; Başlat'la o modülün görünümü animasyonlu açılır. Gerçek kayıt kullanılmaz; bitince veya durdurunca önceki otel ve görünüm geri gelir."],
    ],
    [
      "Radar yalnız izlemek içindir; buradan kayıt değiştirilmez.",
      "Bağlantı koptuğunda sayılar bir an eski kalabilir; Kesinti bandını bekle.",
    ],
  ),
  guide(
    "CR-ONL",
    "xp",
    "Şu an sisteme bağlı kullanıcıları görürsün.",
    [
      ["online-listesi", "Çevrimiçi kullanıcılar", "Kim nerede çalışıyor listelenir."],
      ["oturum-durumu", "Durum", "Uyarı durumu uzun süredir hareketsiz oturumu gösterir."],
      ["oturum-kapat", "Oturumu kapat", "Yetkin varsa takılı kalan oturumu sonlandır."],
    ],
    [
      "Oturumu kapatılan kullanıcı yarım kalan kaydı kaybedebilir.",
      "Liste anlık yenilenir; elle yenilemeye gerek yok.",
    ],
  ),
  guide(
    "CR-RAP",
    "xp",
    "Tüm modüllerin raporlarını tek yerden alırsın.",
    [
      ["rapor-grup", "Rapor grubu", "Modüle göre rapor grubunu seç."],
      ["rapor-filtre", "Filtreler", "Otel, tarih ve kişi filtreleriyle daralt."],
      ["rapor-indir", "İndir", "Excel veya PDF olarak indir."],
    ],
    [
      "Yalnız yetkin olan otelin verisini görürsün.",
      "Dışa aktarılan dosyanın adında filtre bilgisi bulunur.",
    ],
    { actions: { R: "Raporları görüntüler, Excel veya PDF indirirsin." } },
  ),
  guide(
    "CR-KUL",
    "xp",
    "Kullanıcıları, rollerini ve yetkilerini yönetirsin.",
    [
      ["kullanici-listesi", "Kullanıcılar", "Arayarak veya süzerek kullanıcıyı bul."],
      ["yeni-kullanici", "Yeni kullanıcı", "Ad, rol ve otel seçip kullanıcı oluştur."],
      ["rol-yetki", "Rol yetkileri", "Rolün hangi ekranlarda ne yapabileceğini belirle."],
      ["yetki-onizleme", "Önizleme", "Bir rolün Erişimim özetini önceden gör."],
    ],
    [
      "Rol yetkisini değiştirmek o roldeki herkese Erişimim özetini yeniden gösterir.",
      "Kullanıcıyı silmek yerine pasife almak geçmiş kayıtları korur.",
    ],
  ),
  guide(
    "CR-SYS",
    "xp",
    "Sistem ve otel ayarlarını yönetirsin.",
    [
      ["ayar-gruplari", "Gruplar", "Ayarlar konuya göre gruplanır."],
      ["ayar-degistir", "Değiştir", "Bir ayarı değiştir; açıklaması hemen altındadır."],
      ["ayar-kaydet", "Kaydet", "Değişiklikler kaydedildiğinde hemen geçerli olur."],
    ],
    [
      "Bazı ayarlar tüm otelleri etkiler; kapsamı kontrol et.",
      "Süre ayarlarını çok düşürmek personeli sık uyarır.",
    ],
  ),
  guide(
    "CR-DEN",
    "xp",
    "Sistemde kimin neyi ne zaman yaptığını denetim günlüğünden izlersin.",
    [
      ["denetim-listesi", "Kayıtlar", "Son işlemler tarih sırasıyla listelenir."],
      ["denetim-filtre", "Filtreler", "Kullanıcı, eylem veya tarihle daralt."],
      ["denetim-detay", "Detay", "Bir kayda dokunarak önceki ve sonraki değerleri gör."],
    ],
    [
      "Günlük kayıtları silinmez veya değiştirilmez.",
      "Yetkisiz deneme kayıtları da burada görünür.",
    ],
  ),
  guide(
    "CR-TAN",
    "xp",
    "Otel, kat, oda, outlet ve rol tanımlarını yönetirsin.",
    [
      ["tanim-klasorleri", "Klasörler", "Tanımlar konuya göre klasörlerde durur."],
      ["tanim-ekle", "Ekle", "Yeni kayıt için ekle düğmesini kullan."],
      ["tanim-duzenle", "Düzenle", "Satıra çift tıklayıp değiştir."],
    ],
    [
      "Kullanımdaki tanımı silemezsin; pasife al.",
      "Outlet tanımını değiştirmek açık adisyonları etkilemez.",
    ],
  ),
  guide(
    "CR-REH",
    "xp",
    "Yeni kurulum için adım adım kurulum rehberini izlersin.",
    [
      ["rehber-adimlari", "Adımlar", "Kurulum sırası adım adım listelenir."],
      ["rehber-durum", "Durum", "Tamamlanan adımlar işaretlenir."],
      ["rehber-git", "Git", "Eksik adıma dokunarak ilgili ekrana geç."],
    ],
    [
      "Adımları sırayla tamamlamak sonraki ekranları kolaylaştırır.",
      "Tamamlanmış adıma dönüp değişiklik yapabilirsin.",
    ],
  ),
];

export const SCREEN_GUIDES: Record<string, ScreenGuide> = Object.fromEntries(
  LIST.map((g) => [g.code, g]),
);

const WORK: RoleRoutine["host"] = { code: "MB-KAT", path: "/kat" };

export const ROLE_ROUTINES: RoleRoutine[] = [
  {
    id: "kat",
    roleCode: "R-KAT",
    title: "Kat sorumlusunun günü",
    host: WORK,
    items: [
      { id: "gorevleri-ac", label: "Bugünkü görevleri aç", screen: "MB-KAT" },
      { id: "mybar-yok", label: "Bekleyen MyBar talebi yok", screen: "MB-PERS", auto: "mybarAllSeen" },
      { id: "oncelikli-odalar", label: "Öncelikli odalar kontrol edildi", screen: "MB-KAT", auto: "tasksDone" },
      { id: "dnd-ikinci", label: "DND odalarına ikinci kontrol yapıldı", screen: "MB-DND", auto: "dndOpenZero" },
      { id: "kritik-bildir", label: "Kritik stokları ek talep ile bildir", screen: "MB-TAL" },
      { id: "gun-sonu", label: "Gün sonunda İşlemlerim ekranını gözden geçir", screen: "MB-KAT" },
    ],
  },
  {
    id: "depo",
    roleCode: "R-DEP",
    title: "Depo sorumlusunun günü",
    host: { code: "MB-ZIM", path: "/depo/stok" },
    items: [
      { id: "doluluk-yuklendi", label: "Üç doluluk dosyası yüklendi", screen: "MB-DOL", auto: "uploadsDone" },
      { id: "ek-talepler", label: "Ek talepler yanıtlandı", screen: "MB-TAL" },
      { id: "kritik-liste", label: "Kritik stok listesi kontrol edildi", screen: "MB-ZIM" },
      { id: "dnd-eksik", label: "Gün sonu DND eksikleri raporu alındı", screen: "MB-DND" },
    ],
  },
  {
    id: "kasa-acilis",
    roleCode: "R-KAS",
    title: "Kasa açılış",
    host: { code: "QS-KAS", path: "/kasa" },
    hours: [6, 16],
    items: [
      { id: "yazici-hazir", label: "Yazıcı hazır ve test fişi basıldı", screen: "QS-FIS", auto: "printerOk" },
      { id: "garson-atama", label: "Garson ataması yapıldı", screen: "QS-KAS" },
      { id: "fiyat-gosterim", label: "Fiyat gösterimi doğru", screen: "QS-KAS" },
      { id: "ses-acik", label: "Ses açık", screen: "QS-KAS" },
      { id: "tam-ekran", label: "Tam ekran", screen: "QS-KAS" },
    ],
  },
  {
    id: "kasa-kapanis",
    roleCode: "R-KAS",
    title: "Kasa kapanış",
    host: { code: "QS-KAS", path: "/kasa" },
    hours: [16, 24],
    items: [
      { id: "kuyruk-bos", label: "Onay kuyruğu boş", screen: "QS-KAS", auto: "queueEmpty" },
      { id: "cagri-yok", label: "Açık çağrı yok", screen: "QM-CAG" },
      { id: "hazir-bekleyen-yok", label: "Hazır bekleyen sipariş yok", screen: "QS-KDS" },
      { id: "cikis", label: "Çıkış yapıldı", screen: "QS-KAS" },
    ],
  },
  {
    id: "kds",
    roleCode: "R-KDS",
    title: "Mutfak ekranı vardiyası",
    host: { code: "QS-KDS", path: "/kds" },
    items: [
      { id: "ses-acik", label: "Ses açık", screen: "QS-KDS" },
      { id: "tam-ekran", label: "Tam ekran", screen: "QS-KDS" },
      { id: "hazir-bos", label: "Hazır sütununda bekleyen yok", screen: "QS-KDS" },
    ],
  },
  {
    id: "garson",
    roleCode: "R-GAR",
    title: "Garson vardiyası",
    host: { code: "QS-KUY", path: "/garson" },
    items: [
      { id: "masalarim", label: "Masalarım doğru", screen: "QS-KUY" },
      { id: "bildirim-izni", label: "Bildirim izni verildi", screen: "QS-KUY" },
      { id: "cagrilar-bos", label: "Çağrılar boş", screen: "QM-CAG" },
    ],
  },
];

export function guideFor(code: string): ScreenGuide {
  const found = SCREEN_GUIDES[code];
  if (!found) throw new Error(`Rehber kaydı yok: ${code}`);
  return found;
}
