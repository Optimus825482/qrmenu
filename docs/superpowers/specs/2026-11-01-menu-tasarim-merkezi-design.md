# Menü Tasarım Merkezi — Tasarım Spesifikasyonu

**Sürüm:** 1.0 · **Tarih:** 1 Kasım 2026 · **Durum:** Kullanıcı incelemesi bekliyor
**Üst belge:** `docs/superpowers/specs/2026-10-31-merit-platform-design.md` (QR Menü + QR Sipariş)
**Kaynak:** Kullanıcının yapıştırdığı "QR Menüler Hibritleşiyor" araştırması ve garson çağırma tarifi (1 Kasım 2026)

---

## 0. Amaç

Mevcut **Menü Tasarım Merkezi**ni (`MenuDesignStudio`, Tema Yönetimi içinde, yetki QM-TEM) araştırmadaki 2025-26 "şık menü" tarifine göre profesyonelleştirmek ve outlet'e özel **garson çağrı seçeneklerini** aynı merkeze eklemek.

Başarı ölçütleri:
- Personel, kod veya CSS bilmeden okunaklı, hızlı ve erişilebilir bir menü yayınlayabilir; yayın öncesi canlı kalite kontrolü görür.
- Misafir "Garson çağır" düğmesine basınca outlet'in tanımladığı hazır seçenekleri (Peçete istiyorum, Sipariş vereceğim…) ve en altta "Sadece çağır"ı kendi dilinde görür; garson ve kasa seçilen ifadeyi çağrı ekranında okur.
- Mevcut siparişi, onay, KDS, kasa ve garson adisyon akışları değişmez.

## 1. Kapsam

### 1.1 Dahil
1. Tasarım seçeneklerinin genişletilmesi (tipografi, yoğunluk, karşılama stili, küratörlü fotoğraf modu, arama/süzgeç anahtarı).
2. Yeni hazır renk paketleri (Krem, Koyu lüks, Deniz) — mevcut `MenuTheme` tohumlarına ek.
3. Canlı **kalite kontrolü** paneli.
4. Outlet'e özel **garson çağrı seçenekleri**: yönetim, 5 dilde çeviri, misafir alt sayfası, çağrı notuna işleme.
5. Stüdyo arayüzünün üç sekmeye (Tasarım / Renkler / Garson çağrısı) ve kalite paneline yeniden düzenlenmesi.

### 1.2 Hariç
- Garson adisyonu, onay, KDS, kasa, yazıcı akışları.
- Serbest CSS veya sürükle-bırak sayfa kurucusu.
- Dış çeviri servisi çağrısı (otomatik çeviri). Çeviriyi yönetici girer.
- Yeni yetki kodu (mevcut QM-TEM kullanılır).
- QR kodun fiziksel baskı tasarımı.

## 2. Mevcut durum (kodda doğrulandı)

- `src/modules/menu/design.ts`: `OutletDesign`, `DesignOptions` (cardStyle, showImages, showAllergens, showTags, showPrices, uppercaseCategories, featuredTitle), 12 şablon, `designFromStored` eksik/geçersiz alanı şablondan tamamlar.
- `prisma` `OutletMenuDesign.options` bir `Json` alanıdır; yeni seçenekler şema değişikliği gerektirmez.
- `MenuTheme`: bg, accent, soft, textOnAccent. Misafir CSS değişkenleri `--m-*`.
- `CallWaiterButton`: sabit iki seçenek (GARSON, HESAP). `WaiterCall.note` (200 karakter) ve `CallType.DIGER` mevcut. Servis `waiterCalls.createFromGuest` masa başına dakikada 3 çağrı sınırı uygular, aynı tipte açık çağrı varsa yenisini açmaz.
- Misafir durumu `guestState` içinde `orderingOpen` ve `design` verir.

## 3. Tasarım seçenekleri

`DesignOptions` şu alanlarla genişler. Hepsinin varsayılanı, eski kayıtların görünümünü **değiştirmeyecek** biçimde seçilir (normalizer eksik alanı varsayılana düşürür).

| Alan | Değerler | Varsayılan |
|---|---|---|
| `typography` | `CLASSIC`, `EDITORIAL`, `MODERN`, `HUMANIST`, `COASTAL`, `SYSTEM` | `SYSTEM` (bugünkü görünüm) |
| `density` | `AIRY`, `BALANCED`, `COMPACT` | `BALANCED` |
| `hero` | `NONE`, `TITLE`, `PHOTO` | `TITLE` (bugünkü karşılama bloğu) |
| `heroImageUrl` | outletin **kendi menü ürünlerinden birinin** görsel URL'si (stüdyoda ürün görselleri arasından seçilir; yeni yükleme hattı yok). Sunucu, URL'nin `/uploads/` ile başladığını ve outletin aktif bir ürününe ait olduğunu doğrular | boş |
| `curatedPhotos` | `true/false`. Açıkken fotoğraf yalnızca `SEFIN_SECIMI` etiketli, görseli olan en çok 3 üründe büyük gösterilir; diğerleri yazı satırı olur | `false` |
| `showSearch` | `true/false` | `true` |
| `showFilters` | `true/false` | `true` |

Notlar:
- Tipografi çiftleri sistem fontlarından oluşur (yeni web fontu indirilmez, yükleme hızı korunur): ör. `CLASSIC` = Georgia + sistem sans. Arapça (`ar`) için gövde yazısı her durumda mevcut Noto Sans Arabic yığınına düşer.
- Dokunma hedefleri (düğme, etiket, kategori sekmesi) CSS'te en az 44×44 px olarak sabitlenir ve seçenek olarak sunulmaz.
- Şablonlar kendi tipografi, yoğunluk ve karşılama değerlerini taşır; şablon seçmek bunları uygular, sonra elle değiştirilebilir. `options` alanı boş (`{}`) kayıt şablonun hazır ayarını kullanır (bugünkü davranış). Kayıtlı ve boş olmayan `options` içinde **eksik yeni anahtarlar** şablondan değil nötr varsayılandan gelir (`SYSTEM`, `BALANCED`, `TITLE`, kapalı/açık yukarıdaki tabloya göre); böylece daha önce kaydedilmiş bir tasarımın görünümü kendiliğinden değişmez.
- `heroImageUrl` yalnızca `hero = PHOTO` iken kullanılır; görsel yoksa `TITLE` gibi çizilir.

### 3.1 Renk paketleri
`prisma/seed/menuThemes.ts`'te Royal Gold, **Deniz** ve Zeytin zaten var. İki tema eklenir: **Krem** (sıcak nötr, açık zemin) ve **Koyu Lüks** (antrasit zemin, bakır vurgu). Mevcut temalar ve varsayılan tema değişmez; seed yalnız eksik adı oluşturur. Tüm yerleşik temalar kalite kontrolündeki kontrast eşiklerini (§4) geçmek zorundadır ve bir birim testi bunu doğrular.

## 4. Kalite kontrolü

Saf bir fonksiyon (`src/modules/menu/quality.ts`): girdi tasarım, tema ve menü ağacı özeti; çıktı bir bulgu listesi. Sunucu çağrısı gerektirmez, stüdyoda her değişiklikte hesaplanır.

| Kontrol | Kural | Düzey |
|---|---|---|
| Metin kontrastı | gövde yazısı / zemin ≥ 4.5:1 | < 4.5 uyarı, **< 3 engel** |
| Vurgu kontrastı | vurgu / zemin ≥ 3:1 | uyarı |
| Düğme kontrastı | vurgu üstü yazı / vurgu ≥ 4.5:1 | uyarı, < 3 engel |
| Fotoğraf yoğunluğu | fotoğraf gösterilen ürün sayısı > 3 ve `curatedPhotos` kapalı ise küratörlük önerilir | bilgi |
| Çeviri tamlığı | aktif dil başına çevirisi eksik ürün yüzdesi | uyarı (> %20) |
| Alerjen | alerjen alanı boş ürün sayısı (alerjen ikonları açıkken) | uyarı |
| Uzun açıklama | 140 karakteri aşan açıklama sayısı | bilgi |

"Yayına al" yalnızca **engel** düzeyi bulgu varken devre dışı kalır; sunucu aynı kontrastı yeniden doğrular (istemciye güvenilmez).

## 5. Garson çağrı seçenekleri

### 5.1 Veri modeli
Yeni tablo `outlet_call_options` (`OutletCallOption`):

| Alan | Tip | Not |
|---|---|---|
| `id` | cuid | |
| `outletId` | FK → Outlet, `onDelete: Cascade` | |
| `label` | `VarChar(60)` | Türkçe etiket, zorunlu |
| `translations` | `Json` (`{ en?, de?, ru?, ar? }`, her biri ≤ 60) | boş olabilir |
| `callType` | `CallType` | bu seçenek hangi çağrı tipini açar (ör. Hesap → `HESAP`, diğerleri → `GARSON`/`DIGER`) |
| `sortOrder` | Int | |
| `isActive` | Boolean | |
| `createdAt`, `updatedAt` | Timestamptz(3) | |

İndeks `(outletId, sortOrder)`. Outlet başına en çok 8 aktif seçenek. **"Sadece çağır" tabloda tutulmaz**: istemcide sabit, her zaman son sırada, etiketi i18n anahtarıdır (`guest.call.justCall`), tipi `GARSON`'dur.

Varsayılanlar: **Peçete istiyorum**, **Sipariş vereceğim**, **Su istiyorum**, **Hesap** (HESAP), beş dilde çevirileriyle. Yeni oluşturulan her outlete eklenir; mevcut outletlere migrasyondaki **tek seferlik doldurma** ile eklenir. Yönetici bunları düzenleyip silebilir; boşaltılmış bir outlete hiçbir yol varsayılanları geri getirmez.

### 5.2 Servis ve eylemler
- `src/modules/menu/server/callOptions.ts`: `list(outletId)` (yönetim, QM-TEM okuma), `listActive(outletId)` (oturumsuz; aktif seçenekler çevirileriyle, etiketi dile göre çözme istemcide `callOptionLabel` ile yapılır, Türkçeye düşer), `save(...)`, `reorder(...)`, `remove(...)` (QM-TEM yazma, `ctx.hotelIds` ve outlet erişimi kontrolü, denetim günlüğü). Girdi `zod` ile doğrulanır; etiketler HTML ve kontrol karakterlerinden temizlenir (mevcut `note` temizleme kuralıyla aynı).
- Misafir uç noktası `POST /api/q/[token]/call` gövdesine isteğe bağlı `optionId` eklenir. Sunucu seçeneği **token'ın outlet'inde** arar (başka outletin seçeneği reddedilir), `callType`'ı ve etiketi kendisi belirler; istemci tip dayatamaz. Etiket çağrının `note`'una **o anki Türkçe etiket olarak** kopyalanır (anlık görüntü: sonradan düzenleme eski çağrıları değiştirmez; personel ekranları Türkçedir).
- `optionId` yoksa davranış bugünküyle aynıdır (geriye dönük uyum; "Sadece çağır" ve eski istemciler).
- Tekrar kuralı: aynı masada, aynı tip ve aynı not ile açık çağrı varsa yenisi açılmaz; farklı seçenekler yan yana açık olabilir. Masa başına dakikada 3 çağrı sınırı korunur.
- Yeni gerçek zamanlı olay gerekmez: `call.created` yükü zaten çağrı tipini taşır; bildirim başlığı ve gövdesi notu içerir (mevcut `notify` çağrısı `call.note` kullanıyor).

### 5.3 Misafir arayüzü
`CallWaiterButton` bir **alt sayfa (bottom sheet)** açar: başlık, aktif seçenekler (dile göre), en altta "Sadece çağır". Seçime dokununca çağrı gider, sayfa kapanır, mevcut 3 saniyelik "iletildi" mesajı gösterilir. Sayfa klavye ile kullanılabilir, `Esc` ile kapanır, odak yönetimi ve `aria` rolleri vardır, RTL'de ayna düzen çalışır. Sipariş modülü (`orderingOpen`) kapalıysa "Sipariş vereceğim" seçeneği de listede kalır (garsonu çağırma isteği, sipariş gönderimi değil).

Misafir sayfa verisi `guestState`'e `callOptions` (çevirileriyle) eklenerek taşınır; ek istek gerekmez. Stüdyo önizlemesi de aynı veriyi kullanır.

## 6. Stüdyo arayüzü

- Üst sekmeler: **Tasarım** · **Renkler** · **Garson çağrısı**.
- **Tasarım**: şablonlar (mevcut ambiyans grupları), genişletilmiş "Elle düzenle" bölümü (tipografi çifti, yoğunluk, karşılama, küratörlü fotoğraf, arama/süzgeç anahtarları, mevcut anahtarlar, bölüm sırası).
- **Renkler**: mevcut tema tablosu ve outlet ataması (taşınır, davranış aynı).
- **Garson çağrısı**: seçilen outlet için seçenek listesi (ekle, düzenle, sürükle-sırala, aç/kapa, sil); düzenleme diyaloğunda Türkçe etiket ve 4 dil alanı; eksik dil alanı için "Türkçe gösterilecek" uyarısı; sabit "Sadece çağır" satırı salt okunur görünür.
- **Kalite paneli**: önizlemenin yanında sürekli açık; bulgular düzeyine göre sıralı.
- Önizleme: mevcut cihaz çerçevesi; çağrı düğmesine basınca alt sayfa önizlemede de açılır (gönderim yapılmaz).
- Tüm yeni arayüz metinleri Türkçe (yönetim arayüzü mevcut deseni); misafir metinleri 5 dilde `i18n` dosyalarına eklenir.

## 7. Güvenlik, yetki ve veri bütünlüğü

- Yönetim eylemleri QM-TEM yazma yetkisi ve otel kapsamı kontrolü ile; misafir uç noktası yalnızca token'ın outlet'i ile çalışır.
- Çevirilerde ve etiketlerde kullanıcı girdisi metin olarak render edilir (HTML basılmaz).
- Migrasyon eklemelidir (yeni tablo); mevcut tablo ve sütunlar değişmez, geri alınabilir.
- Tasarım kaydı mevcut `saveOutletMenuDesignAction` hattından geçer; sunucu tarafı normalizer bilinmeyen alanı atar, sınırları uygular, `heroImageUrl`'i yalnızca menü görsel deposundan gelen yola kısıtlar.

## 8. Test ve doğrulama

- **Birim:** genişletilmiş `designFromStored`/normalizer (eksik, geçersiz, eski kayıt), kontrast hesabı ve `quality.ts` kuralları, çağrı seçeneği dil çözümü ve Türkçeye düşme.
- **Servis (veritabanlı):** seçenek CRUD ve yetki reddi, başka outletin `optionId`'si reddi, `callType` ve not anlık görüntüsü, tekrar kuralı, dakikada 3 sınırı, sınır 8 aktif seçenek.
- **Uçtan uca:** misafir çağrı alt sayfası seçeneklerle çağrı açar, kasa/garson çağrı ekranı notu gösterir; seçenek yokken eski davranış.
- **Arayüz:** geliştirme sunucusunda tarayıcı önizlemesiyle stüdyo ve misafir menüsü (mobil genişlik, koyu ve krem palet, RTL) görsel doğrulama.
- Mevcut test takımı (684 test) yeşil kalmalı.

## 9. Fazlandırma (uygulama planının girdisi)

1. Tasarım seçenekleri + normalizer + testler.
2. Renk paketleri tohumu.
3. Kalite kontrolü (`quality.ts`) + sunucu tarafı kontrast doğrulaması.
4. Misafir CSS: tipografi, yoğunluk, karşılama, küratörlü fotoğraf.
5. `OutletCallOption` şeması, migrasyon, varsayılan seed, servis ve eylemler.
6. Çağrı uç noktası `optionId` desteği ve `guestState.callOptions`.
7. Misafir çağrı alt sayfası ve i18n (5 dil).
8. Stüdyo yeniden düzenlemesi: sekmeler, genişletilmiş denetçi, kalite paneli, çağrı seçenekleri sekmesi.
9. Uçtan uca testler, tarayıcı doğrulaması, belge ve ilerleme sayfası güncellemesi.

## 10. Açık noktalar

Yok. Varsayımlar (bu belgeyi onaylayarak kabul edilmiş sayılır): web fontu yüklenmez; çeviri elle girilir; kontrast < 3:1 yayını engeller, diğer bulgular yol göstericidir; çağrı notu Türkçe anlık görüntüdür.
