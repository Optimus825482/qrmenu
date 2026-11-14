# Minibar oda kontrol: ilave talep (setup üstü) kaydı ve raporu

Tarih: 14 Kas 2026 · Boyut: küçük değişiklik · Onay: Erkan (sohbette, "Evet, dahil et")

## Amaç

Garson, misafirin anlık talebiyle bir üründen setup adedinden fazla bırakabiliyor. Ürün adının yanındaki
+ düğmesi bunu zaten kaydettiriyor (commit 740455fa), ama fazlalık normal ikame gibi yazılıyor; "setup
üstü" bilgisi yalnız denetim günlüğünde. İstenen: setup üstündeki adet **ilave talep** olarak ayrı
tutulsun ve ayrıca raporlansın.

## Kararlar

- **İlave adet Tüketim'e dahildir** (Erkan): `consumed` ve tutar bugünkü gibi tüm adedi sayar; ilave
  adet buna ek bir bilgi sütunudur, tüketimden düşülmez.
- **Ayrımı sunucu yapar.** Satırın ilave adedi =
  `max(0, bugünEklenen + adet − kapasite) − max(0, bugünEklenen − kapasite)`.
  Kapasite = ürünün setup adedi × dolap kopyaları (mevcut `capacityByProduct`). Örnek: setup 2, bugün 0,
  +5 → 2 normal + 3 ilave.
- İlave > 0 olan bir satır yalnız `overSetup: true` ile kabul edilir (bilinçli işlem); günlük tavan
  setup + 20 kalır. `overSetup` gönderilip setup aşılmıyorsa ilave 0'dır (setup'ı 6 olan üründe +5 artık
  ilave sayılmaz).
- Eski sistemin `ekstra_miktar` alanı aynı kavramdır (`legacy_extra` olarak aktarılmış); raporlar onu da
  ilave olarak gösterir.

## Yaklaşımlar

1. **İşlem satırına `extra_qty` sütunu (seçilen).** Rapor düz SQL ile okur, silme/düzeltme satırla
   birlikte taşınır.
2. Denetim günlüğünden raporlamak: şema değişmez ama günlük JSON'ı rapor kaynağı olmaz, düzeltmeleri
   izlemez.
3. Ayrı işlem türü (`ILAVE_TALEP`): tek dokunuşta iki kayıt, "Geri al" ve günlük limit hesabı karmaşıklaşır.

## Kapsam

- Şema: `minibar_transaction_items.extra_qty INT NOT NULL DEFAULT 0` + 14 Kas 2026'dan beri yapılmış
  setup üstü kayıtların geriye dönük hesabı.
- Servis: `bookReplacementTx` ilaveyi hesaplayıp yazar; sonuç ve oda görünümü ilaveyi döner; kayıt
  düzeltme (`updateTransactionTx`) ilaveli satırı setup + 20 tavanıyla düzenleyebilir ve ilaveyi yeniden
  hesaplar.
- Ekran (oda kontrol, tek sayfa: masaüstü/tablet/mobil aynı): setup'ı aşan düğmeler ayrı renkte ve
  "ilave" etiketli, satırda "Bugün ilave: N", bildirimde ilave adedi. İşlemlerim'de ilave etiketi.
- Rapor: yeni "İlave Talep Raporu" (`ilave-talep`); Tüketim Raporu'na "İlave" sütunu.

## Kapsam dışı

- "Sarfiyat Yok" kilidi ve oda "Kontrol edildi" durumu değişmez (ilave de bir eklemedir).
- Manuel kayıt talepleri setup üstü adet taşımaz.
