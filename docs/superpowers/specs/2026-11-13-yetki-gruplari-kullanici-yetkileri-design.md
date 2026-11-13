# Yetki grupları ve kullanıcıya özel yetkiler — kısa tasarım (13 Kas 2026)

## Amaç
Sistem yöneticisi yetkileri masaüstündeki alanlarla aynı dilde görsün ve gerektiğinde tek bir kişinin
yetkisini rolünü değiştirmeden artırıp azaltabilsin.

## Kapsam
1. Kullanıcı listesi "Sadece aktifler" filtresiyle açılır.
2. Yetki Matrisi düz liste yerine alan gruplarıyla gösterilir: Oda Servisi Operasyonları, QR Menü / Outlet
   Operasyonları, Minibar Operasyonları, Kullanıcı Yönetimi, Operasyon Radarı, Raporlar, Sistem Yönetimi.
   Grup açılıp kapanır; başlıkta "tümünü aç / kapat" bulunur.
3. Kullanıcı kartında "Yetkiler" sekmesi: rolün verdiği yetkiler görünür, sistem yöneticisi kişi bazında
   ek verir veya kısıtlar.

## Kapsam dışı
- Ayrı "Sil" yetkisi (Erkan, 13 Kas 2026: "Düzenle altında kalsın").
- Ekranın desteklemediği yetki kutularını gizlemek (ekran başına işlev kataloğu yok).
- Kullanıcıya özel yetkinin otel bazında ayrışması (istisna tüm otellerde geçerlidir).

## Yaklaşımlar
- **Yalnız fark saklama (seçildi):** `user_screen_permissions` tablosunda yetki başına üç durum: boş = rolden
  gelir, true = ek verildi, false = kısıtlandı. Rol sonradan değişirse kullanıcı da izler.
- Rolün kopyasını kullanıcıya yazmak: rol değişiklikleri kullanıcıya ulaşmaz, 34 ekran x kullanıcı satır.
- Kişiye özel rol üretmek: rol listesi kişi sayısı kadar büyür.

## Kurallar
- Çözüm sırası: otel modülü kapalıysa ret → kullanıcı istisnası (varsa) → rol (modül erişimi + ekran satırı).
- Kişiye verilen ek yetki rolün modül kapısını aşar, otelin modül kapısını aşamaz.
- Yalnız SISTEM türü roller yazabilir; R-SYS kullanıcıları kilitlidir; kimse kendi yetkisini değiştiremez.
- Kullanıcının rolü değişince istisnaları silinir (yeni rol yeni başlangıç; yetki taşınmaz).
- Her değişiklik denetim günlüğüne yazılır (`PERM_SET_USER_SCREEN`, `PERM_RESET_USER`).
- "Kullanıcıya göster" önizlemesi ve yardım içerikleri istisnaları hesaba katar.

## Yayın
Yeni migration: `20261113120000_kullanici_ekran_yetkileri` (canlıda `prisma migrate deploy`).
