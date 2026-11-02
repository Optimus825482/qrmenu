# Eski minibar tanımları (referans seed verisi)

- Kaynak: canlı yedek 02.11.2026
- Çıkarım tarihi: 2026-11-02
- Üretici: `scripts/extract-legacy-definitions.ts` (`LEGACY_DATABASE_URL` ile çalışır; bağlantı bilgisi bu dosyalarda yer almaz)
- İçerik: otel, kat, oda tipi, oda, ürün grubu, ürün, setup, setup içeriği, oda tipi-setup ataması, otel logosu.
- Hariç: QR token/görselleri, kullanıcılar, geçmiş işlemler, stok, menü ve ODA_SERVISI verisi.
- Yükleme: `prisma/seed/legacyDefinitions.ts` (idempotent, var olan kaydı değiştirmez).

| Otel | Kat | Oda tipi | Oda | Oda tipi-setup | Logo |
|---|---|---|---|---|---|
| DIAMOND | 7 | 4 | 303 | 9 | var |
| PREMIUM | 6 | 4 | 130 | 13 | var |
| ROYAL | 5 | 4 | 125 | 9 | var |

Toplam: 3 otel, 7 ürün grubu, 69 ürün, 10 setup, 123 setup içeriği.
