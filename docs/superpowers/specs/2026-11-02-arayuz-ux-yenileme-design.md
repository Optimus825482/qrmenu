# Arayüz ve Kullanılabilirlik Yenilemesi — Tasarım Spesifikasyonu

**Sürüm:** 1.0 · **Tarih:** 2 Kasım 2026 · **Durum:** Kullanıcı incelemesi bekliyor
**Kapsam:** `merit/` tüm arayüzleri (XP masaüstü, Android personel, dokunmatik kasa/KDS, misafir)
**Dayanak:** `docs/superpowers/specs/2026-10-31-merit-platform-design.md` §4–§8, `docs/DEVIR.md` §4, `DESIGN.md` (renk belirteçleri), canlı sistem `D:\PROJELLER\minibarlatest\templates\{kat_sorumlusu,depo_sorumlusu}`
**Yöntem:** Kod okuması (JSX/CSS, yetki tohumu, iniş akışı); Nielsen sezgiselleri, WCAG 2.2 AA, dokunma hedefi kademeleri (≥44 px genel, ≥48 dp Material, ≥56 px birincil POS), Material 3 (Android), klasik Windows XP kuralları. Uygulama çalıştırılmadı; bulgular dosya:satır kanıtlıdır.

---

## 0. Özet

Bugün dört ayrı görsel sistem ve üç ayrı gezinme modeli var: XP kabuğu (`theme.css`, `xp-*`), OpsShell (globals.css belirteçleri), Android yönetici kabuğu (`mobile.css`, `--mb-*`) ve kat/depo sayfaları (ham `slate/indigo`, belirteç yok). Kabuk cihaza göre değil **rotaya** göre seçiliyor. En ağır sorunlar kullanılabilirlikten önce **yön bulma** ile ilgili: üç rol girişte var olmayan ya da kendisine kapalı bir sayfaya iniyor; kat sorumlusu ana ekranında yetkisi olmayan düğmeler görüyor ve bunlar onu sessizce `/secim`'e atıyor; kat/depo ekranlarında çıkış, bildirim çanı ve bağlantı göstergesi yok.

Kilit kararlar (bu belge):
1. **Üç kabuk, tek karar noktası:** `XP` (SISTEM/YONETIM, masaüstü), `Personel` (Android/Material, telefon), `POS` (tam ekran dokunmatik: kasa, KDS). Seçim `resolveShell()` ile yapılır: `?mod=` → cihaz kaydı → kullanıcı tercihi → ekranın doğal bağlamı → görünüm genişliği (§4).
2. **Tek onay, satır içi sonuç:** "Evet/Hayır → İşlem tamamlandı" çift modal kaldırılır. Yalnız geri alınamaz işlemler sorulur. Başarı bildirimi XP'de tepsi balonu + durum çubuğu, personel/POS'ta snackbar (gerektiğinde "Geri al") ile verilir (§5.4).
3. **Kasa ana ekranı masa haritasıdır.** Masaya dokunmak sağ yan panelde o masanın siparişlerini, çağrılarını ve eylemlerini açar; bugün garson atama diyaloğu açılıyor (§2.3).
4. **Önce öğren, sonra kullan:** `visibleScreens()` ve yeni `screenGuide.ts` kataloğundan üretilen bir "Erişimim" sayfası, ekran başına 3–5 adımlık tur, yalnız kullanıcının yapabildiğini anlatan "?" yardımı, rol bazlı günlük kontrol listeleri ve yönetici tarafında "Kullanıcıya göster" önizlemesi (§3).
5. **Emoji yok, tek ikon seti:** 40 dosyadaki ~353 emoji/dingbat glifi SVG ikonla değiştirilir (DEVİR §4 kuralı).

---

## 1. Envanter

### 1.1 Rol × ekran × cihaz (bugünkü durum)

Roller `prisma/seed/roles.ts` ve `actionsFor()` kurallarından türetildi. "Cihaz", işin gerçekte yapıldığı yerdir. Karar: **U** uygun · **S** sorunlu.

| # | Ekran (kod · yol) | Roller (V yetkili) | Gerçek cihaz | Kabuk bugün | Karar | Başlıca sorunlar (kanıt) |
|---|---|---|---|---|---|---|
| 1 | Giriş · `/giris` | herkes | tümü | staff layout | U | Hedef kartları `min-h-14` (LoginForm.tsx:134), birincil düğme `min-h-11`. Sorun girişten sonra başlıyor, bkz. #2. |
| 2 | İniş yönlendirmesi · `login.ts:115-120` | R-DEP, R-OUT, R-HKS | — | — | **S** | İniş yolu `AppScreen.path`'ten okunuyor ve bu yollar gerçek rotalarla uyuşmuyor. R-DEP → `/depo/havuz` (böyle bir sayfa yok; `tests/e2e/login.spec.ts:73` yalnız URL'yi doğruluyor). R-OUT → `/q` (token'sız rota yok). R-HKS → `/admin#minibar.rapor` (`admin/page.tsx:19` MINIBAR türünü `/secim`'e atıyor). |
| 3 | Hedef seçimi / şifre · `/secim`, `/sifre-degistir` | çok atamalılar | tümü | staff layout | U | `min-h-14` kartlar. Kullanıcıya hangi rol ve yetkiyle gireceğini söylemiyor (§3.1'de çözülür). |
| 4 | Katalog yolları · `screens.ts` | — | — | — | **S** | Şu yolların sayfası yok: `MB-ZIM /depo/havuz`, `MB-TAL /depo/talepler`, `MB-DOL /depo/doluluk`, `MB-PERS /kat/mybar`, `MB-DND /kat/dnd`. Gerçek sayfalar `/depo/stok`, `/depo/doluluk-yukle`, `/kat/duzeltme-onay` (MB-TAL ile korunuyor; adı "Ek Talepler", işlevi düzeltme onayı). Rehber ve gezinme bu kataloğa dayanacağı için önce burası düzeltilmeli. |
| 5 | Kat Planı · MB-KAT · `/kat` | R-KAT, R-DEP, R-HKS, R-OTM, R-FBM, R-SYS | telefon (koridorda tek el); yöneticide XP içinde iframe | kat sayfası (ham Tailwind) | **S** | (a) "Doluluk Girişi" ve "Tanımlamalar" bağlantıları koşulsuz gösteriliyor (`kat/(home)/page.tsx` 113–148). R-KAT'ın `MB-DOL`/`MB-TAN` hakkı yok, `requireScreen` onu sessizce `/secim`'e atar. (b) `/kat` ve `/depo` altında çıkış düğmesi, bildirim çanı ve otel/oturum bilgisi yok (`LogoutButton`/`NotificationBell` hiç kullanılmıyor). 600 dk'lık oturumun "60 dk kaldı" uyarısını kat sorumlusu göremiyor. (c) 8 hızlı eylem düğmesi tek satırda (emoji ikonlu), MyBar rozeti sürekli `animate-bounce` (satır 332), etiketler 10 px. 589 sabit `slate/indigo` rengi var, belirteç kullanımı 0. |
| 6 | Kat Formu — QR · MB-KF · `/kat/qr` | aynı | telefon kamerası | kat sayfası | **S** | Oda bulunamayınca tarayıcının `alert()`'i açılıyor (qr/page.tsx:97). Aynı kod XP'de "Oda QR Kodları & Baskı" penceresine de bağlı (minibar/apps.ts:93): tarayıcı ve QR üretimi tek yetki altında, iki farklı adla. |
| 7 | Oda Kontrolü · MB-TUK · `/kat/oda-kontrol/[roomId]`, `/kat/islemlerim` | R-KAT (+yönetim) | telefon, tek el | kat sayfası | **S** | Adet artı/eksi düğmeleri 40×40 px (`w-10 h-10`, satır 645/662), yani 48'in altında. 9–11 px metinler var (585, 593, 843, 867, 878). Spec §6.3'teki "+1…+min(setup,4)" doğrudan düğmeleri yerine artı/eksi + ayrı onay kullanılmış, her üründe fazladan dokunuş gerekiyor. Bildirim tostu 4 sn (iyi), ama ✓/⚠️ glifleriyle. |
| 8 | MyBar zorunlu onayı · `PersistentMybarModal` | R-KAT | telefon | kat sayfası | **S** | 15 sn'de bir yoklama yapıyor ve her kat için ayrı istek atıyor (satır 30–85); spec §6.6 SSE + ses istiyor. Ses ve titreşim yok. `role="alertdialog"`/`aria-modal` yok. İkon `animate-bounce`. |
| 9 | Zimmet Havuzu · MB-ZIM · `/depo/stok` | R-DEP, R-KAT (V,D), R-HKS | PC/tablet | kat sayfası stili | **S** | Depo için ana sayfa yok. "Geri" bağlantısı `/kat`'a gidiyor (stok/page.tsx:143), yani depo sorumlusu kat sorumlusu ekranına düşüyor. Canlıdaki depo panosunun (`depo_sorumlusu/dashboard.html`) karşılığı yok. |
| 10 | Doluluk Yükleme · MB-DOL · `/depo/doluluk-yukle` | R-DEP | PC (Excel dosyası) | kat sayfası; XP'de iframe | **S** | Masaüstü işi, ama XP penceresinde iframe olarak açılıyor (minibar/apps.ts:45). Sonuç: çift başlık, pencere içinde sayfanın kendi geri bağlantıları, 14 emoji. |
| 11 | Minibar Raporları · MB-RAP · `/depo/raporlar` | R-DEP, R-HKS, yönetim | PC | kat sayfası; XP'de iframe | **S** | R-HKS bu sayfaya inemiyor (#2). İframe çift krom üretiyor. |
| 12 | Minibar Tanımları · MB-TAN · `/depo/tanimlar` (1954 satır) | R-DEP, R-SYS | PC | kat sayfası; XP'de iframe | **S** | 5 tarayıcı `confirm()`'i (332, 383, 433, 478, 587) ve 30 emoji var. XP "Tanımlamalar" penceresiyle birlikte iki ayrı tanım deneyimi oluşuyor. |
| 13 | Ek Talepler / düzeltme · MB-TAL · `/kat/duzeltme-onay` | R-DEP (A), yönetim | PC/tablet | kat sayfası | **S** | Ad, yol ve işlev birbirini tutmuyor (#4). Tarayıcı `confirm()`'i (satır 45). |
| 14 | MyBar Talepleri, DND · MB-PERS, MB-DND | minibar rolleri | — | — | **S** | Matriste görünüyorlar ama sayfaları yok; rehberde ölü giriş olarak kalırlar. |
| 15 | Garson ekranı · QS-KUY · `/garson` | R-GAR, R-SGF, R-BAR, R-BUT (mutfak V) | telefon | OpsShell | **S** | İki sekme çubuğu var: OpsShell'in altta "Kuyruk/Masalarım/Çağrılar"ı ve sayfa içindeki "Kuyruk/Outlet Masaları" (GarsonClient:119-120). Aynı yere iki yol gidiyor, adları farklı. Reddet düğmesi `window.prompt` açıyor (satır 167). Çağrı türü ham kod olarak gösteriliyor (`{item.type}`, satır 218). Onay ve ret geri alınamıyor. |
| 16 | Garson çağrıları · QM-CAG · `/garson/cagrilar` | garson rolleri | telefon | OpsShell | **S** | "Yanıtla" düğmesi `px-2 py-1` (~28 px) (CallsClient.tsx:6). `call.type` ham gösteriliyor. Boş durum metni yalnız "Açık çağrı yok." |
| 17 | Kasa · QS-KAS · `/kasa` | R-KAS, R-SGF | dokunmatik tablet/kiosk | OpsShell + KasaClient | **S** | (a) Masaya dokunmak masanın siparişlerini değil **garson atama diyaloğunu** açıyor (KasaClient:779-788 → AssignDialog). (b) Çift gezinme var: OpsShell alt sekmeleri (Masalar/Kuyruk/Çağrılar/Yazıcı/İptal) ve KasaClient üstündeki 6 sekme (397-480). (c) Hedefler küçük: filtreler `min-h-9` (36 px), fiyat anahtarı `min-h-8` (32), arama temizleme 20 px, AssignDialog düğmeleri ~36 px, `×` ~24 px. Masa kartında 10–11 px metinler var, dokunmatikte görünmeyen `title=` ipuçları kullanılmış, sürekli `animate-bounce`/`animate-ping` çalışıyor. (d) Tutarlar ₺ ile gösteriliyor (TableBoard:192, KasaClient:541). Spec `price.currency=EUR` diyor, garson ekranı da € gösteriyor. |
| 18 | Fiş Yazıcı Kuyruğu · QS-FIS · `/kasa/yazici` | R-KAS, R-SGF | kiosk | OpsShell | **S** | Yazıcı durumu yalnız bir KPI kutusunda görünüyor; kalıcı durum şeridi ve hata sesi yok. |
| 19 | İptal / Düzeltme · QS-IPT · `/kasa/iptal` | R-KAS, R-SGF | kiosk | OpsShell | **S** | Tarayıcı `window.confirm`'i kullanılıyor (IptalClient:39). |
| 20 | Mutfak ekranı · QS-KDS · `/kds` | R-MUS, R-MUP, R-KDS (saha V) | duvar/tezgah ekranı | OpsShell (`max-w-5xl`) | **S** | 3 sütun yalnız `xl`'de (≥1280 px) yan yana; 1024×768 tablette sütunlar alt alta diziliyor. Kalem metni 14 px, 2 m'den okunmuyor. `public/sounds` klasörü yok, bu yüzden ses 0,18 sn'lik, 0,08 kazançlı bir bipten ibaret (useSound.ts). Sayfa yenilenince ilk dokunuşa kadar ses çıkmıyor ve bunu gösteren bir işaret yok. Tek `pending` durumu tüm kartları kilitliyor. "Hazır" geri alınamıyor. Ekran uyku kilidi yok. |
| 21 | Oda Servisi · RO-TAL/TEL/TES · `/oda-servisi` | R-ODS, R-BUT, R-MUS, R-FBM | masa PC'si / tablet | OpsShell + iç sekmeler | **S** | Çift sekme çubuğu var (OpsShell'de 4, iç sekmeler 347–368). 30 emoji var, 5 KPI kutusunda etiketler 11 px. `teyit`/`teslim` rotaları yalnız yönlendirme yapıyor (bu iyi). |
| 22 | XP masaüstü · CR-KOM · `/admin` | SISTEM, YONETIM | PC 1366×768+ | XP | U | Başlat menüsü 9 kategoriyi düz liste olarak gösteriyor (StartMenu.tsx:10-19); "Son kullanılanlar" yok. Tepside yalnız SSE noktası ve saat var; spec §5.1 yazıcı ve DB durumunu da istiyor. |
| 23 | XP penceresi · `Window.tsx` | — | PC | XP | U | Yardım menüsünde yalnız "Hakkında" var (244-252); bağlamsal yardım ve F1 yok. Pencere adları katalogla uyuşmuyor ("Kat Planı" ↔ "Minibar Operasyon & Kat Planı", "Rapor Merkezi" ↔ "Merkezi Raporlama & KPI", "Menü Tasarım Merkezi" ↔ "…Stüdyosu"). |
| 24 | Onay/bilgi kutusu · `ConfirmDialog` + `confirm.ts` | — | PC | XP | **S** | Çift modal: 19 dosyada 29 "İşlem tamamlandı"/"Kayıt silindi" `alertDialog`'u var (ör. MenuManager:148/164/178, UsersPanel:131/148, SystemPanel:239/263, OutletSwitchBar:39/57). Düğmeler "Evet/Hayır", eylem fiili kullanılmıyor. Klavye davranışı iyi (Enter/Esc, odak hapsi). |
| 25 | Kategori klasörleri · `CategoryFolderWindow` | — | PC | XP | U | Tek tıkla açma (XP'nin "web stili" seçeneği) kabul edilebilir. Alt başlık 11 px. |
| 26 | Denetim Masası, Tanımlamalar, Kurulum Rehberi, Online, Denetim, Rapor Merkezi | SISTEM/YONETIM | PC | XP | U | `SETTING_META` açıklamaları var ve rehbere kaynak olabilir. `SetupGuide` otel kurulumunu anlatıyor, kullanıcı yetkisini değil. PermissionMatrixPanel'de "bu kullanıcı ne görür?" önizlemesi yok. KPI'larda emoji var (CommandCenter 29, CentralReports 9). |
| 27 | Menü Yönetimi, Tasarım Stüdyosu, Masa QR, Tema, Yazıcılar | SISTEM/YONETIM (+saha V) | PC | XP | U | Masaüstü bu iş için doğru yer. Çift modal deseni en yoğun burada. Stüdyo varsayılan olarak 1480×900; 1366×768'de büyütülmüş açılmalı. |
| 28 | Minibar iframe pencereleri · `minibar/apps.ts` | yönetim | PC | XP içinde iframe | **S** | Dokunmatik personel sayfası XP penceresinin içinde açılıyor: çift başlık, sayfa içi bağlantılar pencereyi başka sayfaya taşıyor, renk dili farklı. |
| 29 | Android yönetici kabuğu · `MobileShell` (<760 px) | SISTEM/YONETIM telefonda | telefon | Android | U | Material alt sekmeler, ok tuşlarıyla gezinme ve SSE durumu var. Başlıkta otel ve rol yok. Personel bu kabuğu hiç görmüyor (`admin/page.tsx:19`). |
| 30 | Misafir QR menü / Seçimler / durum · `/q/[token]` | misafir (8 dil, RTL) | misafir telefonu | guest | U | `dir` doğru (GuestFrame:18/80), hedefler 44/48 px (guest.css). Alerjenlerde emoji var (ItemSheet, 15 glif). |
| 31 | Misafir MyBar · `/q/[roomToken]` | misafir | telefon | guest | U | Canlı şablonla birebir; RTL doğru. |
| 32 | PWA · `app/manifest.ts` | tümü | — | — | **S** | Tek manifest var ve `start_url: /admin`. Garson, kasa ya da kat sorumlusu "uygulama olarak yükle" dediğinde `/admin` açılıyor, oradan `/secim`'e düşüyor. `orientation` ve kiosk için `display: fullscreen` yok. |
| 33 | Ortak durumlar | tümü | — | — | **S** | `LiveBadge` yalnız OpsShell'de; kat/depo'da bağlantı göstergesi yok. `navigator.onLine` ve işlem kuyruğu yok. `wakeLock` hiçbir yerde kullanılmıyor. Tarayıcı diyalogları: 6 `confirm`, 1 `prompt`, 2 `alert`. 40 dosyada ~353 emoji/dingbat glifi. Dört ayrı renk kaynağı. |

### 1.2 Toplu tespitler (öncelik sırasıyla)

| # | Tespit | Etki | Çözüm |
|---|---|---|---|
| T1 | 3 rolün iniş yolu bozuk, 5 katalog yolunun sayfası yok | İlk dakikada "sistem çalışmıyor" algısı | P-UX-2 |
| T2 | Kat ana ekranında yetkisiz düğmeler ve sessiz `/secim` yönlendirmesi | Güven kaybı, yanlış zihinsel model | P-UX-2, §3 |
| T3 | Kat/depo'da çıkış, bildirim, bağlantı ve oturum süresi göstergesi yok | Paylaşılan cihazda oturum sızıntısı; uyarılar kayboluyor | P-UX-5 |
| T4 | Kasa: masa dokunuşu yanlış işi açıyor, gezinme çift | Yoğun serviste yanlış eylem | P-UX-7 |
| T5 | Çift modal deseni (29 yer) ve tarayıcı diyalogları (9 yer) | Her işlemde 2 tıklama fazla, tutarsızlık | P-UX-1 |
| T6 | Dokunma hedefleri 20–40 px (kasa, oda kontrol, çağrılar) | Hatalı dokunuş; WCAG 2.5.8 sınırında | P-UX-4 |
| T7 | KDS tablette tek sütun, yazı küçük, ses yok denecek kadar zayıf | Mutfakta okunmuyor, sipariş kaçıyor | P-UX-8 |
| T8 | MyBar onayı yoklamayla çalışıyor ve sessiz | Spec §6.6'ya aykırı, gecikme | P-UX-6 |
| T9 | Emoji, sürekli animasyon, dört renk kaynağı | Profesyonel görünmüyor; WCAG 2.2.2 (sürekli hareket) | P-UX-3, §5 |
| T10 | Tek PWA manifesti; kiosk ve uyku kilidi yok | Kasa/KDS ekranı kararıyor; yüklenen uygulama yanlış sayfada açılıyor | P-UX-9 |

---

## 2. Tasarım ilkeleri (bağlama göre)

### 2.1 XP masaüstü (SISTEM, YONETIM; PC ≥1366×768)

| Konu | Karar |
|---|---|
| Pencere | Mevcut sözleşme kalır (§5.1). Varsayılan boyut görünür alandan büyükse pencere **büyütülmüş açılır**. Başlık "Uygulama · Otel" biçiminde; pencere adı `AppScreen.name`'den gelir (tek ad kaynağı; #23'teki farklar katalog adına çekilir). |
| Menü çubuğu | Dosya (Yeni…, Dışa aktar, Kapat) · Görünüm (Yenile F5, Yoğunluk: Rahat/Sıkı) · **Yardım** (Bu pencerede neler yapabilirim? **F1**, Turu başlat, Erişimim, Hakkında). |
| Klavye | Alt+harf ile menü erişimi (altı çizili harf), Ctrl+S kaydet, Del sil (onaylı), F2 yeniden adlandır, F5 yenile, Esc diyalog kapat, Ctrl+F listede ara. Tarayıcı kısayollarıyla çakışmasın diye pencere geçişi Alt+Tab yerine görev çubuğunda Ctrl+Alt+←/→. DataGrid'de ok tuşları ve Enter = aç. |
| Diyaloglar | **Tek onay**, yalnız şu işlemlerde: silme, onay/ret, zorla çıkış, toplu işlem, geri alınamaz ayar. Düğmeler eylem fiiliyle yazılır: "Sil / Vazgeç", "Onayla / Vazgeç". "Evet/Hayır" yalnız soru cümlesi gerçekten evet/hayır sorusuysa kullanılır. Tehlikeli işlemde varsayılan odak **Vazgeç**'tedir. Başarı **modal değildir** (§5.4): durum çubuğu metni + tepsiden XP balon ipucu (4 sn, `aria-live=polite`). Hata: alan hatasıysa satır içinde; işlem hatasıysa uyarı ikonlu, tek "Tamam" düğmeli kutu. `shell.confirmSimpleActions` ayarı korunur ama varsayılanı **kapalı** olur (basit işlemler sorulmaz). |
| Başlat menüsü | Sol sütun: **Son kullanılanlar** (6) + sabitlenenler. "Tüm Programlar ▸" alt menüsünde kategori klasörleri (Outlet, Oda Servisi, Minibar, Raporlar, Sistem, Kullanıcı): 9 düz başlık yerine 6 klasör. Sağ sütun: Erişimim, Denetim Masası, Yardım ve Destek, Oturumu Kapat. Arama kutusu yazıldıkça uygulama adına veya ekran koduna göre süzer. |
| Kategori klasörleri | Tek tıkla açma kalır (öğrenmeyi kolaylaştırır). Her simgenin altında 1 satır amaç metni (`screenGuide.purpose`). |
| Tepsi | SSE, yazıcı (outletin varsayılan yazıcısından son ping), DB bağlantısı, bildirim sayısı, saat. Her simgenin metin ipucu var; tıklayınca durum balonu açılır. |
| Yoğunluk | Satır yüksekliği 22–24 px (XP), yazı 11–12 px Tahoma kabul edilir; masaüstünde işaretçiyle çalışılıyor. `fontScale` zaten var. En küçük etkileşim hedefi 24×24 px (WCAG 2.5.8). |
| İframe | Personel/POS sayfaları XP penceresine iframe ile **girmez**. Yöneticiye aynı veri yerel pencere bileşeni olarak (salt okunur izleme) sunulur ya da "Yeni sekmede aç" ile personel kabuğunda açılır. |

### 2.2 Personel mobil (Android / Material 3; kat sorumlusu, garson, barmen, butler, oda servisi, telefondaki depo)

| Konu | Karar |
|---|---|
| İskelet | Üstte 56 px uygulama çubuğu: solda ekran adı, alt satırında "Otel · Outlet"; sağda bağlantı durumu, bildirim çanı (rozetli), profil menüsü (Erişimim, Yardım, Outlet/otel değiştir, Şifre, **Çıkış**). Altta 80 px gezinme çubuğu (Material 3): **3–5 hedef**, `visibleScreens` ve rol rutininden üretilir. Sayfa içinde ikinci bir sekme çubuğu **olmaz**; alt bölüm gerekiyorsa üstte Material "segmented button" kullanılır. |
| Alt gezinme (rol başına) | Kat sorumlusu: Bugün · Katlar · QR Okut (ortada, FAB gibi vurgulu) · İşlemlerim · Daha. Garson: Kuyruk · Masalarım · Çağrılar · Daha. Oda servisi: Talepler · Teyit · Teslim · Daha. Depo (telefonda): Havuz · Talepler · Raporlar · Daha. "Daha" = kalan yetkili ekranların listesi. |
| FAB | Ekranın tek birincil eylemi: kat → "QR Okut", garsonun Masalarım ekranı → "Yeni adisyon", depo havuzu → "Havuza giriş". 56 px, sağ altta, başparmağın erişeceği yerde. |
| Liste satırı | En az 56 px (tek satır) / 72 px (iki satır). Satırın tamamı dokunulabilir. Sağda tek birincil eylem düğmesi (≥48 px); ikincil eylemler satır menüsünde (⋮ ikonu). Kaydırma hareketiyle eylem yok. |
| Tek el | Birincil eylemler ekranın alt yarısında. Sabit alt eylem çubuğu kullanılır (oda kontrolünde "Sarfiyat Yok / DND / Kaydet"). Üst köşede kritik eylem olmaz. |
| Oda kontrolü adet | Spec §6.3'e dönülür: ürün satırında **"+1 · +2 · +3 · +4"** ayrı düğmeler (48×48, aralık 8 px). Havuz yetmiyorsa düğme pasif olur ve nedeni metinle yazılır. Bugün eklenen sayı yanında gösterilir. Yanlış girişte satırdan "Geri al" (5 sn snackbar) veya bugünkü işlemi silme (§6.3.6). |
| Tarayıcı erişimi | QR Okut her ekrandan en fazla 1 dokunuşta (alt gezinmenin ortası). Kamera izni reddedilirse açıklama ve "Oda numarası yaz" alanı aynı ekranda gösterilir (bugünkü manuel giriş korunur); `alert()` yerine satır içi hata. Cihaz destekliyorsa (`torch`) fener düğmesi. |
| Bildirim / zorunlu onay | MyBar: SSE `mybar.created` gelince tam ekran `alertdialog` açılır (sıralı, "1/3"), ses + `navigator.vibrate([200,100,200])`, 56 px "Gördüm" düğmesi. Ekran kapalıyken Web Push. Diğer bildirimler snackbar ve çan rozetiyle gelir. Oturumun "60 dk kaldı" uyarısı üst çubukta kalıcı şerit olarak durur. |
| Çevrimdışı | Üst çubukta durum: Canlı / Bağlanıyor / Çevrimdışı (renk + metin + ikon). Çevrimdışıyken veri değiştiren düğmeler pasif olur, üstte "Bağlantı yok — işlemler gönderilemez" şeridi çıkar. v1'de çevrimdışı kuyruk **yok** (stok transaction'ı sunucu kilidi istiyor). Okuma ekranları son veriyi "son güncelleme 14:32" etiketiyle gösterir. |
| PWA | "Personel" manifesti (`/personel.webmanifest`, portrait, standalone, `start_url=/baslat`). Yükleme önerisi ilk başarılı girişten sonra bir kez gösterilir (§4.4). |
| Görsel dil | `DESIGN.md`'nin açık kurumsal paleti (globals.css belirteçleri). Kat/depo'daki gradient ve ham renkler kaldırılır. Canlı sistemin alışkanlıkları korunur: büyük dokunmatik düğmeler (`btn-touch-primary` 48 px), görev özeti kartı, kat kartı ızgarası. |

### 2.3 Dokunmatik POS (kasa) ve KDS (tam ekran tablet/kiosk)

| Konu | Karar |
|---|---|
| Ana ekran | **Masa haritası**, alan sekmeleri üstte. Masa bir kart olarak çizilir. v1 bugünkü alan/ızgara düzenini kullanır; gerçek kroki konumu Erkan'ın kararına bağlı (§7 S2). |
| Masa kartı | En az 120×104 px. Masa etiketi 24–28 px kalın. Altında garson adı; atanmamışsa kesik çizgiyle "Atanmadı". Sağ üstte açık sipariş sayısı rozeti, sol üstte çağrı rozeti (ikon + saniye sayacı). Durum **renk + kenar biçimi + metin** ile gösterilir; renge tek başına dayanılmaz (WCAG 1.4.1), bkz. §5.6. |
| Yan panel | Masaya dokununca sağda ekranın %38'i genişliğinde bir panel açılır (portrede alttan, %60 yükseklikte sayfa). İçeriği: masa başlığı, garson (değiştir), açık siparişler (kalemler, süre, durum), çağrılar (Yanıtla) ve eylemler: Onayla / Reddet / Fiş yeniden bas / Yeni adisyon / Garson ata. Panel açıkken harita görünür kalır; başka masaya dokununca panel o masaya geçer. |
| Gezinme | Tek gezinme: solda 72 px'lik dikey ray (ikon + etiket): Masalar · Kuyruk (sayı) · Çağrılar (sayı) · Menü · Yazıcı · İptal. OpsShell'in alt sekmeleri POS'ta **gösterilmez**. |
| Düğmeler | Birincil: 56 px yükseklik, ≥120 px genişlik, 16–18 px yazı. İkincil: 48 px. Aralık ≥12 px. Reddetme/iptal sebebi için hazır sebep düğmeleri (mevcut liste KasaClient:71-75) + "Diğer" metin alanı; `window.prompt` yok. |
| Hover yok | `title=` ipuçları kaldırılır; bilgi kartta veya panelde görünür metin olarak yer alır. `:hover` yalnız süs olarak kalır. Geri bildirim `:active` ile verilir (renk koyulaşır, `scale` yok). |
| Hareket | Ekran hareketsiz durur: `animate-bounce`/`animate-ping` yok. Yeni olay gelince 600 ms'lik tek bir nabız + ses, ardından kalıcı renk/rozet. `prefers-reduced-motion` açıksa nabız da olmaz. |
| Jestler | Kaydırma, çekme ya da uzun basmayla açılan gizli eylem **yok**; her eylem görünür bir düğmedir. Listede tek dikey kaydırma kabı olur (iç içe kaydırma tuzağı yok). |
| Tam ekran / kiosk | POS kabuğu açılışta büyük bir "Tam ekran başlat" düğmesi gösterir (`requestFullscreen` kullanıcı hareketi ister). Tam ekrandayken `navigator.wakeLock.request("screen")` çağrılır ve `visibilitychange`'de yeniden alınır. Manifest: `display: fullscreen`, `orientation: landscape` (kasa) / `any` (KDS). |
| Durum şeridi | Altta 32 px'lik kalıcı şerit: bağlantı (Canlı/Kopuk), yazıcı (Hazır/Hata; tıklayınca Yazıcı ekranı), ses (Açık / Kapalı / **Etkinleştirmek için dokunun**), saat, kullanıcı. |
| Ses | `public/sounds/{new-order,ready,call,error}.mp3` dosyaları eklenir (yüksek, birbirinden ayırt edilir, ≤1 sn). Açılışta ses kilitliyse şeritte uyarı çıkar; tam ekran başlat düğmesine tek dokunuş sesi de açar. Ses seviyesi outlet ayarıdır. |
| Yönlendirme | Yatay (1024×768, 1280×800): harita ve panel yan yana. Dikey (768×1024, 800×1280): harita üstte, panel alttan açılan sayfa; ray alta yatay çubuk olarak iner. |
| KDS | Her genişlikte **3 sütun** (Yeni / Hazırlanıyor / Hazır); 900 px'in altında sütunlar yatay kaydırılır (tek kaydırma ekseni). Kart: masa + sipariş no 24 px, kalemler 20 px, adet kalın, not sarı zeminli ayrı blokta. Süre rozeti 0–5 dk yeşil / 5–10 sarı / 10+ kırmızı (spec §7.3), yanında metin ("12 dk"). İlerletme (bump) düğmesi 64 px, tam genişlik. "Hazır"a geçişten sonra 5 sn'lik "Geri al" snackbar'ı. Bekleyen işlem yalnız ilgili kartı kilitler. Fiyatsız fiş düğmesi ikincil (48 px). |

---

## 3. Yetki rehberi ("önce öğren, sonra kullan")

### 3.1 Akış

| Adım | Ne zaman | İçerik |
|---|---|---|
| 1. Erişimim özeti | İlk girişte ve rol/yetki değişince (matris özetinin karması değişmişse) kendiliğinden; sonra profil menüsünden veya Başlat → Erişimim'den | "Merhaba Ayşe. Rolün: **Kat Sorumlusu**, otel: **Merit Royal**." Modül → ekran kartları; her ekranda 1 satır amaç ve yapabileceklerinin sade Türkçe listesi (§3.3). Yalnız sahip olunan ekranlar gösterilir; "göremediğin ekranlar" bölümü yok. Altta: "Turu başlat" (birincil), "Sonra". |
| 2. Ekran turu | Ekran ilk açıldığında (o ekran için `guide.seen[code] < guideVersion` ise) | 3–5 adımlık coach mark: hedef öğe vurgulanır (arka plan %50 karartılır, hedefin çevresi açık kalır), metin balonu, "Geri / İleri / Turu kapat", "2/4" gibi adım sayacı. Yalnız yetkili eylemlerin hedefleri gösterilir: `requires: ["D"]` olan adım, kullanıcının D hakkı yoksa atlanır. |
| 3. "?" yardım | Her ekranda sabit: XP'de Yardım menüsü + F1; personel/POS'ta üst çubukta "?" | Yan sayfa: amaç, "Burada yapabileceklerin" (eylem listesi), adım adım yönergeler, sık yapılan hatalar, "Turu tekrar oynat". Yetkisi olmayan eylem anlatılmaz. |
| 4. Günlük kontrol listesi | Rol için rutin tanımlıysa, vardiya başında "Bugün" ekranının üstünde katlanabilir kart olarak | Maddeler sistem verisinden **kendiliğinden işaretlenir** (ör. "Doluluk yüklendi" = 3 UploadTask tamam). Elle işaretlenen maddeler `prefs` içinde gün bazlı saklanır. |
| 5. Yönetici önizlemesi | Kullanıcı Yönetimi → kullanıcı → "Kullanıcıya göster" | Seçilen kullanıcı + otel (+outlet) için Erişimim sayfasının birebir salt okunur görünümü, iniş ekranı ve alt gezinme önizlemesi. Oturum değişmez, kimliğe bürünme yok. |

**Karar:** Erişimim özeti ilk girişte gösterilir ama **atlanabilir** ("Sonra"); tur her zaman atlanabilir. Zorunluluk Erkan'ın kararına açık (§7 S4).

### 3.2 Engel ve yönlendirme kuralı
- Yetkisiz bağlantı **çizilmez** (kat ana ekranındaki Doluluk ve Tanımlar dahil). Her gezinme öğesi `visibleScreens()` sonucuyla süzülür.
- Yetkisiz bir rota doğrudan açılırsa `/secim`'e sessizce yönlendirmek yerine **"Bu ekran sana atanmadı"** sayfası gösterilir: ekran adı, gereken yetki, "Erişimime dön" ve "Yöneticine bildir" (yöneticilere bildirim gider; `YETKISIZ_DENEME` kaydı zaten yazılıyor).
- Ekran içindeki eylem düğmesi yetkisizse gizlenir. Düğme yalnız **bağlam gereği** pasifse (ör. havuz yetersiz) görünür kalır ve nedeni metinle yazılır.

### 3.3 Eylem sözlüğü (V/O/D/A/R → sade Türkçe)
Genel karşılıklar aşağıda; ekrana özel cümle `screenGuide.actions` ile ezilir.

| Kod | Genel | Örnek (ekrana özel) |
|---|---|---|
| V | Görebilirsin | Kat Planı: "Katları ve odaların bugünkü durumunu görürsün." |
| O | Yeni kayıt açabilirsin | Garson: "Masaya yeni adisyon açarsın." |
| D | Değiştirebilirsin | Zimmet Havuzu (R-KAT): "Ürünün kritik seviyesini güncellersin." |
| A | Onaylayıp reddedebilirsin | Garson Ekranı: "Misafirin gönderdiği siparişi onaylar veya reddedersin." |
| R | Rapor alabilirsin | Rapor Merkezi: "Raporları görüntüler, Excel/PDF indirirsin." |

### 3.4 Veri ihtiyaçları

| Veri | Kaynak | Not |
|---|---|---|
| Görünen ekranlar | `visibleScreens(ctx, hotelId)` (var) | Erişimim, gezinme ve tur süzgeci buradan beslenir |
| Ekran başına eylemler | Yeni `accessSummary(ctx \| {roleId, hotelId}, hotelId)` → `{code, actions: Action[]}[]`; `rbac.ts`'teki `loadRoleMatrix` ve `allowed()` yeniden kullanılır | `visibleScreens` yalnız V döndürüyor; özet için beş eylemin hepsi gerekiyor |
| Ekran adı/modül/yol | `AppScreen` (`screens.ts`) | Önce yollar düzeltilir (P-UX-2) |
| Ayar açıklamaları | `SETTING_META` (`lib/settings-defs.ts`) | "?" yardımında ilgili ayarın davranışı **güncel değeriyle** anlatılır ("DND 2 kontrolde tamamlanır" = `dnd.minChecks`) |
| Rehber metinleri | Yeni `src/modules/core/screenGuide.ts` | Şema aşağıda |
| İlerleme | `User.prefs.guide` (prefsSchema genişletilir) | `{ welcomeSeenHash, seen: {[code]: version}, checklist: {[YYYY-MM-DD]: string[]} }` |
| Önizleme | `accessSummary({roleId, hotelId, outletId})`, yetki: CR-KUL `V` | Okuma işlemidir; `AuditLog(YETKI_ONIZLEME)` yazılır |

`screenGuide.ts` şeması:
```ts
type GuideStep = { target: string; title: string; body: string; requires?: Action[] }; // target = data-guide="…"
type ScreenGuide = {
  code: string;                          // AppScreen.code
  version: number;                       // metin değişince artar → tur yeniden önerilir
  purpose: string;                       // 1 satır: "Odanın minibarını kontrol edip eksikleri tamamlarsın."
  context: "xp" | "personel" | "pos";    // doğal kabuk (§4)
  actions?: Partial<Record<Action, string>>; // §3.3'ü ekrana özel ezer
  steps: GuideStep[];                    // 3–5
  mistakes: string[];                    // "Boş odayı da kontrol edebilirsin; sistem yalnız uyarır."
  settings?: SettingKey[];               // "?" yardımında güncel değeriyle anlatılır
};
type RoleRoutine = {
  roleCode: string; title: string;       // "Kat sorumlusunun günü"
  items: { id: string; label: string; screen: string; auto?: "uploadsDone" | "tasksDone" | "mybarAllSeen" | "dndOpenZero" | "printerOk" | "queueEmpty" }[];
};
```
Doğrulama: bir birim testi her `AppScreen.code` için bir `ScreenGuide` kaydı olduğunu ve her `target`'ın ilgili bileşende `data-guide` olarak geçtiğini (kaynak taramasıyla) denetler.

### 3.5 Günlük rutinler (ilk sürüm içeriği)

| Rutin | Maddeler (parantez içi: otomatik işaret) |
|---|---|
| Kat sorumlusunun günü (R-KAT) | Bugünkü görevleri aç (Tavsiye iş planı) · Bekleyen MyBar talebi yok (`mybarAllSeen`) · Öncelikli odalar kontrol edildi (`tasksDone`) · DND odalarına 2. kontrol (`dndOpenZero`) · Kritik stokları bildir (Ek Talep) · Gün sonunda İşlemlerim'i gözden geçir |
| Depo sorumlusu (R-DEP) | 3 doluluk dosyası yüklendi (`uploadsDone`) · Ek talepler yanıtlandı · Kritik stok listesi kontrol edildi · Gün sonu DND eksikleri raporu |
| Kasa açılış (R-KAS) | Yazıcı hazır ve test fişi basıldı (`printerOk`) · Garson ataması yapıldı · Fiyat gösterimi doğru · Ses açık · Tam ekran |
| Kasa kapanış | Onay kuyruğu boş (`queueEmpty`) · Açık çağrı yok · Hazır bekleyen sipariş yok · Çıkış |
| KDS vardiya | Ses açık · Tam ekran · "Hazır" sütununda bekleyen yok |
| Garson vardiya | Masalarım doğru · Bildirim izni verildi · Çağrılar boş |

---

## 4. Cihaz tespiti ve kabuk seçimi

### 4.1 Karar sırası (`resolveShell`, `src/shell/resolveShell.ts`)

| Sıra | Girdi | Kural |
|---|---|---|
| 1 | URL `?mod=xp\|personel\|pos` (`?mobil=1`, geriye uyum için `personel`'in takma adı) | Geçici; o sekme için geçerli |
| 2 | Cihaz kaydı (`localStorage merit.device = {shell, outletId, kiosk}`) | Kasa/KDS cihazı bir kez "Bu cihaz kasa ekranıdır" diye işaretlenir (POS kabuğundan, kullanıcı hareketiyle) |
| 3 | Kullanıcı tercihi `User.prefs.shell.preferredShell` | Yalnız izin verilen kabuklar arasından (aşağıdaki tablo) |
| 4 | Ekranın doğal bağlamı `screenGuide.context` | QS-KAS, QS-FIS, QS-IPT, QS-KDS → `pos`; MB-* (MB-DOL/MB-TAN/MB-RAP hariç), QS-KUY, QM-CAG, RO-* → `personel`; CR-*, QM-MEN/TEM/RAP, QS-RAP, MB-DOL/TAN/RAP → `xp` |
| 5 | Görünüm genişliği | `xp` seçildiyse ve genişlik <760 px ise → Android yönetici kabuğu (mevcut `MobileShell`). `pos` seçildiyse ve genişlik <600 px ise → `personel` (kasayı telefondan açan şef garson için) |

Rol türüne göre izin verilen kabuklar:

| Rol türü | xp | personel | pos |
|---|---|---|---|
| SISTEM, YONETIM | ✔ (varsayılan) | ✔ (telefonda) | ✔ (önizleme/destek) |
| OUTLET | — | ✔ | ✔ (QS-KAS yetkisi varsa) |
| MUTFAK | — | ✔ | ✔ (varsayılan) |
| MINIBAR | — (R-DEP masaüstü işlerini personel kabuğunun geniş düzeninde yapar; XP yok, `admin/page.tsx:19` kuralı korunur) | ✔ | — |

Not: R-DEP ve R-HKS için personel kabuğu 1024 px ve üstünde **sol gezinme raylı geniş düzene** geçer (Material "navigation rail"). Bu, canlı sistemin sol menüsünün (`base.html` `#sidebar`) karşılığıdır.

### 4.2 İniş
- Yeni `/baslat` rotası: oturumdan `defaultScreen` okunur; ekran `visibleScreens` içinde değilse ilk görünen ekran alınır; `resolveShell` uygulanır; ekranın **gerçek** rotasına gidilir. `login.ts`, `/admin` dışındaki tüm hedefler için `/baslat` döndürür.
- İlk girişte `/baslat` önce Erişimim özetini gösterir (§3.1).

### 4.3 Kiosk girişi (kasa/KDS)
1. Kullanıcı girer; POS kabuğu (bir kez) "Bu cihazı kasa ekranı olarak ayarla" önerir ve cihaz kaydını yazar.
2. Her açılışta karşılama ekranında büyük "Tam ekranı başlat" düğmesi çıkar: tek dokunuş tam ekranı açar, ses kilidini kaldırır ve `wakeLock` alır.
3. Tam ekrandan çıkılırsa şerit çıkar: "Tam ekran kapandı — yeniden başlat".
4. Cihaz Android tabletse önerilen yöntem: PWA'yı yükle (`display: fullscreen`) + Android "Uygulama sabitleme". Windows dokunmatik PC ise Edge kiosk modu (`--kiosk --edge-kiosk-type=fullscreen`). Kesin seçim §7 S1'e bağlı.

### 4.4 PWA manifestleri

| Manifest | `id` / `start_url` | `display` | `orientation` | Kısa ad | Bağlandığı layout |
|---|---|---|---|---|---|
| `/manifest.webmanifest` (mevcut) | `/admin` | standalone | any | F&B Center | `(admin)` |
| `/personel.webmanifest` (yeni route handler) | `/baslat?kabuk=personel` | standalone | portrait | Merit Personel | `/kat`, `/depo`, `/garson`, `/oda-servisi` (`metadata.manifest`) |
| `/pos.webmanifest` (yeni) | `/baslat?kabuk=pos` | fullscreen | landscape (KDS: any) | Merit Kasa | `/kasa`, `/kds` |

İkonlar: aynı Merit logosu, ama her manifestte farklı maske zemini (personel: lacivert, POS: koyu gri), ki ana ekranda birbirinden ayırt edilsinler. `theme_color` kabuk renginden alınır.

Yükleme önerisi metinleri (Türkçe, emoji yok):
- Personel: "Merit Personel'i ana ekrana ekleyin. Tek dokunuşla açılır, bildirimler ekran kapalıyken de gelir." Düğmeler: "Ana ekrana ekle" / "Şimdi değil". "Şimdi değil" öneriyi 7 gün susturur.
- POS: "Bu cihazı kasa ekranı olarak kurun. Tam ekran açılır, ekran kararmaz, sipariş sesleri çalar." Düğmeler: "Kur" / "Bu cihaz kasa değil".
- Yönetici (mevcut `PwaInstallButton`): metin aynı kalır.

---

## 5. Bileşen sistemi

### 5.1 Belirteç kaynağı
Tek kaynak `merit/src/app/globals.css` `@theme` (DESIGN.md değerleri). `mobile.css`'teki `--mb-*` değişkenleri bu belirteçlere eşlenir (`--mb-primary: var(--accent)` vb.). XP kabuğu `theme.css` temasıyla kalır (dönem görünümü bilinçli bir seçim), ama **anlamsal durum renklerini** (§5.6) ortak belirteçten okur. Kat/depo'daki ham `slate/indigo/purple` kullanımları (1093 adet) belirteçlere taşınır.

### 5.2 Ölçek

| Belirteç | Değer | Kullanım |
|---|---|---|
| `--space-1…8` | 4, 8, 12, 16, 24, 32, 48, 64 px | Tek boşluk ölçeği |
| `--tap-xp` | 24 px | XP işaretçi hedefi (WCAG 2.5.8 alt sınırı) |
| `--tap-min` | 44 px | Her dokunmatik bağlamda alt sınır |
| `--tap-std` | 48 px | Personel ikincil eylem, liste eylemi (Material) |
| `--tap-pri` | 56 px | Personel birincil eylem, POS ikincil eylem, FAB |
| `--tap-pos` | 64 px | POS/KDS birincil eylem (bump, Onayla) |
| `--tap-gap` | ≥8 px (personel), ≥12 px (POS) | Bitişik hedefler arası boşluk |
| `--radius-s/m/l` | 6 / 10 / 16 px | XP hariç |

Kademe kabuk kökündeki `data-density="xp|personel|pos"` ile seçilir; bileşenler `min-height: var(--tap-*)` kullanır.

### 5.3 Düğme

| Tür | XP | Personel | POS |
|---|---|---|---|
| Birincil | `xp-button` varsayılan (koyu çerçeve), 23 px | dolu `--accent`, 56 px, 16 px yazı | dolu, 64 px, 18 px yazı |
| İkincil | `xp-button` | çerçeveli, 48 px | çerçeveli, 56 px |
| Tehlikeli | `xp-button` + uyarı ikonlu onay | dolu `--danger`, metin "Sil"/"Reddet" | aynı |
| Pasif | gri + `aria-disabled`, nedeni görünür metinde | aynı | aynı |
| İkon düğmesi | 24 px | 48 px kutu, 24 px ikon, `aria-label` zorunlu | 56 px |

### 5.4 Diyalog ve geri bildirim (karar: çift modal kaldırılır)

| Durum | Desen |
|---|---|
| Geri alınabilir basit işlem (kaydet, durum değiştir, sıralama, varsayılan yap, fiyat göster/gizle) | **Soru sorulmaz.** İşlem yapılır, sonuç bildirilir. Mümkünse "Geri al" (5 sn). |
| Geri alınamaz / riskli işlem (sil, onay/ret, zorla çıkış, toplu üretim, QR yenileme — eski QR geçersiz olur) | **Tek onay diyaloğu**: başlık eylemi sorar ("Masanın QR kodu yenilensin mi?"), gövde sonucunu bir cümleyle anlatır, düğmeler fiil + "Vazgeç", odak Vazgeç'te. Başarıdan sonra **modal açılmaz**. |
| Başarı | XP: durum çubuğu metni + tepsi balonu (4 sn). Personel/POS: altta snackbar (4 sn; eylem varsa 6 sn; `role=status`, `aria-live=polite`). |
| Hata | Alan hatası: alanın altında metin + `aria-invalid`. İşlem hatası: XP'de "Tamam" düğmeli uyarı kutusu; personel/POS'ta "Tekrar dene" düğmeli kalıcı kırmızı snackbar (`role=alert`). |
| Zorunlu onay (MyBar; kasada sipariş geldi) | Tam ekran `alertdialog`, kuyruk sayacı, ses + titreşim, tek birincil düğme ("Gördüm" / "Kuyruğa git"). |
| Sebep isteyen işlem (ret, iptal, eksikle kapama) | Diyalog içinde hazır sebep düğmeleri + serbest metin; en az uzunluk kuralı satır içi sayaçla gösterilir. |

Uygulama: `src/shell/notify.ts` (zustand; `notify.success/error/undo`). XP'de `TrayBalloon`, diğer kabuklarda `Snackbar` ile gösterilir. `alertDialog` yalnız bilgi kutuları (Hakkında, Özellikler) ve işlem hataları için kalır. Tarayıcının `confirm/prompt/alert` diyalogları yasaklanır (ESLint `no-restricted-globals`).

### 5.5 Liste ve tablo

| Bağlam | Kural |
|---|---|
| XP DataGrid | 22–24 px satır, sütun başlığından sıralama, satıra çift tık = aç, sağ tık menüsü, klavye. Boş tabloda "Kayıt yok · [Yeni ekle]" |
| Personel listesi | 56/72 px satır, solda durum ikonu + metni, sağda tek eylem; bölüm başlıkları yapışkan |
| POS kartları | Izgara `repeat(auto-fill, minmax(120px, 1fr))`, 12 px aralık |

Her ekran şu dört durumun hepsini tanımlar:

| Durum | Görünüm |
|---|---|
| Yükleniyor | İskelet satırlar (en fazla 3); 300 ms'den kısa yüklemelerde gösterilmez |
| Boş | İkon + ne olduğunu anlatan 1 cümle + varsa birincil eylem ("Bugün görev yok. Doluluk yüklenince görevler burada belirir.") |
| Hata | Neden + "Tekrar dene"; teknik kod gizlidir, "Ayrıntı" ile açılır |
| Çevrimdışı | Üst şerit + son güncelleme saati; veri değiştiren düğmeler pasif |

### 5.6 Anlamsal durum renkleri (ortak)

| Anlam | Belirteç | Masa kartı (renk + biçim + metin) | Sipariş durumu |
|---|---|---|---|
| Nötr / boş | `--muted` | beyaz zemin, ince gri kenar, "Boş" | — |
| QR okutuldu (misafir masada) | `--accent` | mavi **kesik** kenar, "Misafir masada" | — |
| Onay bekliyor | `--warn` (metin amber 700) | amber zemin, kalın kenar, "Onay bekliyor · 2" | GONDERILDI / TEYIT_BEKLIYOR |
| Hazırlanıyor | `--info` (sky 700) | açık mavi zemin, "Hazırlanıyor" | ONAYLANDI |
| Hazır — servis bekliyor | `--success` | yeşil zemin, **çift** kenar, "Hazır" | HAZIR |
| Yolda | `--info` | — | YOLDA |
| Çağrı | `--danger` | sol üstte kırmızı rozet "Çağrı 0:45"; 60 sn sonra kalın kırmızı kenar (yanıp sönme yok) | — |
| Tamam / servis edildi | `--success` (soluk) | — | SERVIS_EDILDI / TESLIM_EDILDI |
| Reddedildi / iptal | `--danger` (soluk) | — | REDDEDILDI / IPTAL |

Tüm metin/zemin çiftleri ≥4.5:1, kenar ve ikonlar ≥3:1 kontrastta olur (WCAG 1.4.3/1.4.11). Para birimi her ekranda `Setting('price.currency')` ile `Intl.NumberFormat` kullanılarak biçimlenir; sabit `₺`/`€` yazılmaz.

### 5.7 Tipografi

| Bağlam | Yazı tipi | Gövde | Başlık | Not |
|---|---|---|---|---|
| XP | Tahoma (mevcut seçenekler) | 11–12 px (`fontScale`) | 13 px kalın | dönem uyumu |
| Personel | sistem / Roboto | 16 px | 20–22 px | en küçük 13 px, yalnız yardımcı metinde |
| POS | Roboto / sistem, `tabular-nums` | 16–18 px | masa 24–28 px | en küçük 14 px |
| KDS | aynı | kalem 20 px | 24 px | 2 m'den okunur |
| Misafir | outlet teması; Arapça için Noto Sans Arabic yedeği | 16 px | — | `dir=rtl`, mantıksal özellikler (`ms-/me-/ps-/pe-`, `inset-inline-*`), sayılar `<bdi>` içinde |

Personel ve POS bağlamındaki 9–11 px metinler (kasa, kat, oda kontrol, oda servisi; 127 kullanım) kaldırılır.

### 5.8 İkonlar
- Emoji ve dingbat **kullanılmaz** (DEVİR §4). XP mevcut `XpIcon` setini (`shell/icons.tsx`) kullanır. Personel, POS ve misafir için tek bir SVG çizgi seti: `src/components/icons/` (24 px ızgara, 2 px çizgi, `currentColor`). Lucide şekilleri bağımlılık eklemeden yerel bileşen olarak alınır (MIT lisans notuyla).
- Alerjenler ikon + metin etiketiyle (misafirin dilinde) gösterilir.
- İkonlu her düğmenin görünür etiketi veya `aria-label`'ı olur.

### 5.9 Hareket
- Geçişler ≤200 ms, `ease-out`; sayfa/panel girişi 150 ms'lik kayma.
- Sürekli animasyon yasak (bounce, ping, döngülü pulse). Dikkat çekmek için: 600 ms'lik tek nabız + ses + kalıcı durum.
- `prefers-reduced-motion: reduce` açıksa tüm geçişler 0 ms olur, tur balonları animasyonsuz açılır.
- POS'ta `active:scale-*` kaldırılır (düzen titriyor); yerine renk geri bildirimi.

---

## 6. Uygulama planı

Sıra: hızlı kazançlar → kasa masa haritası → personel kabukları → yetki rehberi → cila. Her görev kendi dalında, TDD ile yapılır; mevcut e2e testleri korunur.

| Kod | Görev | Dosyalar | Efor | Bağımlılık | Kabul |
|---|---|---|---|---|---|
| P-UX-1 | Tek onay + satır içi bildirim | yeni `shell/notify.ts`, `shell/components/TrayBalloon.tsx`, `components/ui/Snackbar.tsx`; `confirm.ts` (düğme etiketleri, odak Vazgeç'te); 19 dosyadaki 29 başarı `alertDialog`'u; `depo/tanimlar`, `kat/duzeltme-onay`, `kasa/iptal` içindeki `confirm`; `garson`'daki `prompt`; `kat/qr`'daki `alert`; ESLint kuralı | M | — | İşlemden sonra başarı modalı açılmaz (e2e: işlem sonrası `role=dialog` sayısı 0, `role=status` metni var); tarayıcı diyaloğu açılmaz (`page.on('dialog')` hiç tetiklenmez); `shell.confirmSimpleActions` varsayılanı false |
| P-UX-2 | İniş ve katalog düzeltmesi | `screens.ts` yolları (MB-ZIM→`/depo/stok`, MB-DOL→`/depo/doluluk-yukle`, MB-RAP→`/depo/raporlar`, MB-TAL→`/kat/duzeltme-onay` + ad "Düzeltme ve Ek Talepler"; R-OUT için iniş ekranı QM-CAG veya yeni bir bilgi sayfası); MB-PERS/MB-DND → `/kat?filtre=mybar|dnd` ya da `isActive=false`; AppScreen.path göçü; yeni `/baslat`; `login.ts`; "Bu ekran sana atanmadı" sayfası (`pageGuard.ts`); `kat/(home)/page.tsx` bağlantılarının `visibleScreens` ile süzülmesi; `login.spec.ts:73` | S–M | — | Tohumdaki her rol girişten sonra 200 dönen gerçek bir sayfaya iner (e2e, 17 rolün hepsi); hiçbir gezinme öğesi yetkisiz ekrana gitmez (birim: üretilen nav ⊆ visibleScreens); katalogdaki her `path` bir `page.tsx`'e çözülür (birim: dosya sistemi taraması) |
| P-UX-3 | Emoji → ikon, sürekli animasyonu kaldır, para birimi | `components/icons/*`; 40 dosya (en yoğunları: depo/tanimlar, oda-servisi, CommandCenter, kat/islemlerim, oda-kontrol, KasaClient); `₺` → `formatPrice(currency)` | M | — | Kaynak taraması: `src/**/*.tsx` içinde emoji/dingbat aralığında 0 glif (birim testi); `animate-(bounce|ping|pulse)` 0; tutarlar ayardaki para biriminde |
| P-UX-4 | Belirteçler + dokunma kademeleri + hedef denetimi | `globals.css` (`--space`, `--tap-*`, durum renkleri), `mobile.css` eşlemesi; `tests/e2e/touchTargets.spec.ts` (personel/POS rotalarında görünür `button,a,[role=button],input` kutuları ≥44 px; `[data-primary]` ≥56 px; aralık kontrolü) | M | P-UX-3 ile paralel | Hedef testi /kat, /kat/oda-kontrol, /garson, /garson/cagrilar, /kasa, /kds, /oda-servisi'de geçer |
| P-UX-5 | Personel kabuğu (StaffShell) | yeni `components/staff/StaffShell.tsx` (üst çubuk, profil menüsü, çıkış, çan, bağlantı, oturum süresi şeridi, alt gezinme/ray, FAB yuvası); `/kat`, `/depo`, `/garson`, `/oda-servisi` layout'ları; OpsShell'deki sekme setleri ve sayfa içi ikinci sekme çubukları (GarsonClient:119, OdaServisiClient:347) kaldırılır; depo için `/depo` ana sayfası | L | P-UX-2, P-UX-4 | Her personel ekranında tek gezinme çubuğu var (e2e: `nav` sayısı 1); çıkış en fazla 2 dokunuş; çevrimdışı benzetiminde şerit görünür ve veri değiştiren düğmeler pasif; 390×844'te yatay kaydırma yok |
| P-UX-6 | Kat sorumlusu akışları | `PersistentMybarModal` → SSE `mybar.*` + ses + titreşim + `alertdialog`; oda kontrolünde "+1…+4" düğmeleri, sabit alt eylem çubuğu, Geri al; `kat/qr` satır içi hata + fener; ham renklerin belirteçlere taşınması | M | P-UX-1, P-UX-5 | MyBar talebi oluşunca ≤2 sn içinde modal açılır (e2e; yoklama yok, ağ isteği sayısıyla doğrulanır); +N işlemi tek dokunuş; spec §6.3 kuralları korunur (birim testleri değişmez) |
| P-UX-7 | Kasa masa haritası + yan panel (PosShell) | yeni `components/pos/PosShell.tsx` (ray, durum şeridi, tam ekran/uyku kilidi, ses kapısı); `kasa/TableBoard.tsx` (kart düzeni §2.3/§5.6); yeni `kasa/TablePanel.tsx` (siparişler, çağrılar, eylemler, garson atama); `AssignDialog` panele taşınır; ret sebebi diyaloğu | L | P-UX-1, P-UX-3, P-UX-4 | Masaya dokununca panel o masanın siparişlerini gösterir (e2e); onay en fazla 2 dokunuş (masa → Onayla); 1024×768 ve 768×1024'te harita + panel düzeni doğru; yazıcı hatası ≤5 sn içinde şeritte görünür |
| P-UX-8 | KDS yenilemesi | `kds/*` PosShell'e taşınır; her genişlikte 3 sütun; yazı boyutları; kart bazlı bekleme; "Hazır" için Geri al; `public/sounds/*.mp3`; ses kapısı | M | P-UX-7 (PosShell) | 1024×768'de 3 sütun yan yana (e2e kutu konumları); bump düğmesi 64 px; ses kapalıyken şeritte uyarı |
| P-UX-9 | Kabuk seçimi + manifestler + kiosk | `shell/resolveShell.ts`; `useShellMode.ts` (`?mod=`, `?mobil=1` uyumu); `prefsSchema`'ya `preferredShell`; cihaz kaydı; `app/personel.webmanifest/route.ts`, `app/pos.webmanifest/route.ts`; layout `metadata.manifest`; `usePwaInstall` metinleri | M | P-UX-5, P-UX-7 | Her rol/viewport çifti beklenen kabuğu alır (birim: karar tablosu); manifest `start_url`'leri doğru (e2e `link[rel=manifest]`); wakeLock istenir (e2e'de `navigator.wakeLock` taklidi) |
| P-UX-10 | `screenGuide.ts` + Erişimim | `modules/core/screenGuide.ts` (33 ekran + 6 rutin); `rbac.ts`'e `accessSummary`; `/erisimim` (personel) + XP'de "Erişimim" penceresi (`core/apps.ts`); `prefsSchema`'ya `guide` | M | P-UX-2 | Her AppScreen için rehber kaydı var (birim); her rolün Erişimim sayfası yalnız `visibleScreens` ekranlarını ve doğru eylem cümlelerini listeler (birim: 17 rol × matris anlık görüntüsü) |
| P-UX-11 | Tur motoru + "?" yardım | `components/guide/CoachMarks.tsx`, `HelpSheet.tsx`; hedeflere `data-guide`; XP Yardım menüsü + F1 (`Window.tsx`) | M | P-UX-10, P-UX-5, P-UX-7 | Tur yalnız yetkili adımları gösterir (e2e: R-KAT'ın MB-ZIM turunda "Havuza giriş" adımı yok); Esc turu kapatır ve odak geri döner; tamamlanan tur bir daha açılmaz (prefs) |
| P-UX-12 | Günlük kontrol listeleri | `components/guide/RoutineCard.tsx`; otomatik işaret sorguları (`modules/core/server/routines.ts`) | M | P-UX-10 | Otomatik maddeler veri değişince SSE ile işaretlenir; elle işaretlenen maddeler gün değişince sıfırlanır (iş günü `Europe/Nicosia`) |
| P-UX-13 | "Kullanıcıya göster" | `UsersPanel.tsx`'e eylem; `PermissionMatrixPanel`'e "Bu rol ne görür?" sekmesi; `accessSummary({roleId,…})`; denetim kaydı | S–M | P-UX-10 | Önizleme o kullanıcının Erişimim çıktısıyla aynıdır (birim eşitlik testi); oturum değişmez; `AuditLog(YETKI_ONIZLEME)` yazılır |
| P-UX-14 | XP cilası | `StartMenu.tsx` (Son kullanılanlar, Tüm Programlar, arama); `Taskbar.tsx` tepsisi (yazıcı, DB, çan); pencere adları katalogdan; büyük pencereler büyütülmüş açılır; menü kısayolları; minibar iframe pencereleri yerel bileşenle değiştirilir ya da "personel kabuğunda aç" olur | M | P-UX-1 | Başlat → uygulama → pencere → kapat zinciri yalnız klavyeyle yapılabilir (e2e); 1366×768'de hiçbir pencere taşmaz |
| P-UX-15 | Görünüm matrisi + erişilebilirlik | `playwright.config.ts` projeleri: `desktop-1366x768`, `tablet-1024x768`, `tablet-1280x800`, `tablet-768x1024`, `tablet-800x1280`, `phone-390x844` (`hasTouch`); `@axe-core/playwright` (renk kontrastı, ad/rol); klavye gezinme testi | M | P-UX-4 | Her projede, her ekranda: yatay kaydırma yok, ciddi/kritik axe ihlali 0, hedef testi geçer; XP'de tüm eylemler klavyeyle erişilebilir |
| P-UX-16 | (İsteğe bağlı) Masa krokisi düzenleyici | `OutletTable`'a `x,y,w,h,shape,rotation` alanları + göç; `TablesPanel`'de sürükle-bırak düzenleyici; haritada konum modu | L | P-UX-7, §7 S2 | Kaydedilen kroki kasada aynen çizilir; ızgara moduna geri dönülebilir |

Önerilen dalga sırası: **Dalga 1** P-UX-1, 2, 3, 4 (1 hafta) · **Dalga 2** P-UX-7, 8 · **Dalga 3** P-UX-5, 6, 9 · **Dalga 4** P-UX-10…13 · **Dalga 5** P-UX-14, 15. P-UX-15'in matris iskeleti Dalga 1'de kurulur, kontroller dalga dalga açılır. P-UX-16 karara bağlı.

---

## 7. Erkan'a sorular

| # | Karar | Seçenekler | Varsayılan (cevap gelmezse) |
|---|---|---|---|
| S1 | Kasa ve KDS cihazı | (a) Android tablet (Chrome PWA + uygulama sabitleme) (b) Windows dokunmatik PC (Edge kiosk) (c) karışık | (a); manifest `fullscreen/landscape`, tasarım 1280×800 ve 1024×768 için |
| S2 | Masa haritası | (a) alan bazlı ızgara (bugünkü veriyle) (b) gerçek kroki: konum/şekil + yönetici düzenleyicisi (P-UX-16) | v1'de (a), (b) sonraki sürümde |
| S3 | KDS ekranı | Boyut (ör. 21–32" duvar ekranı / 10" tablet)? Dokunmatik mi, yoksa yalnız izleme + bump tuşu mu? Outlet başına kaç ekran? | 15–22" dokunmatik, outlet başına 1 |
| S4 | Rehberin zorunluluğu | (a) Erişimim özeti ilk girişte zorunlu (tek ekran, "Anladım"), turlar atlanabilir (b) hepsi atlanabilir (c) tur da zorunlu | (a) |
| S5 | Personel cihazı | Kat sorumlusu ve garson kişisel telefon mu kullanacak, otelin paylaşılan cihazını mı? Paylaşılansa hızlı kullanıcı değişimi / kısa PIN gerekir. Akıllı saat titreşimi isteniyor mu (DESIGN.md §1)? | Otel cihazı, paylaşımlı; her vardiya sonunda çıkış zorunlu, PIN yok |
| S6 | Rehber içeriğinin sahibi ve basılı kılavuz | Metinleri kim onaylayacak (Erkan / otelin eğitim sorumlusu)? Canlı sistemdeki gibi (`templates/kullanim_kilavuzu`) rol bazlı yazdırılabilir PDF kılavuz da isteniyor mu? | Erkan onaylar; PDF yok, "?" yardımı yazdırılabilir |

---

## 8. Kabul kriterleri (özet)

1. Tohumdaki 17 rolün her biri girişten sonra kendi gerçek ekranına iner; hiçbir gezinme öğesi yetkisiz ekrana gitmez.
2. Hiçbir işlemden sonra başarı modalı açılmaz; tarayıcı diyaloğu kullanılmaz.
3. Personel ve POS ekranlarında tüm hedefler ≥44 px, birincil eylemler ≥56 px (POS'ta ≥64 px).
4. Kasada masa haritası ana ekrandır; masaya dokunmak o masanın siparişlerini ve eylemlerini açar.
5. KDS 1024×768'de üç sütun gösterir, ses kapısı görünür, ekran kararmaz.
6. Her kullanıcı "Erişimim"de yalnız kendi ekranlarını ve yapabileceklerini sade Türkçe görür; yönetici aynı görünümü "Kullanıcıya göster" ile önizler.
7. Arayüz dizgilerinde emoji yok, sürekli animasyon yok, renk kontrastı WCAG 2.2 AA'yı karşılar.
8. Altı görünüm projesinin hiçbirinde yatay kaydırma yok ve ciddi/kritik axe ihlali 0.
