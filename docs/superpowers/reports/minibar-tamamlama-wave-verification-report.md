# Dalga doğrulama raporu — ux/yenileme (HEAD 4d82da4)

| Adım | Sonuç |
|---|---|
| 1. `npm run check` (merit_test_ver) | GEÇTİ: eslint 0 hata / 17 uyarı; tsc temiz; vitest 160 dosya, 1781 test geçti (1233 sn) |
| 2. `NEXT_DIST_DIR=.next-ver next build` | GEÇTİ (exit 0; düzeltmelerden sonra yeniden de geçti) |
| 3. prisma migrate diff | "No difference detected". Not: Prisma 7 `--shadow-database-url` bayrağını tanımıyor (config'te `datasource.shadowDatabaseUrl` ister); bu yüzden `--from-config-datasource` (migrate deploy yapılmış merit_test_ver) → şema karşılaştırıldı. |
| 4. chromium e2e (merit_ver_e2e, :3050) | GEÇTİ 153, 1 atlandı (canliRadar.spec.ts:93, kasıtlı skip). İlk koşuda 2 hata (login.spec:83, staffShell.spec:72) + 8 seri atlama |
| 5. Altı görünüm matrisi | İlk koşu: 273 geçti / 15 kalıp. Düzeltmelerden sonra ilgili 54 test geçti |
| 6. uxRatchet | 2/2 geçti; sayaç/knownViolations değişikliği gerekmedi |

## Hataların sınıflandırması
- login.spec:83 ve staffShell.spec:72 (`/cikis` 403): (a) ortam. `POST /cikis` Origin'i `APP_BASE_URL` (.env: :3000) ile karşılaştırıyor; sunucu :3050'de koşunca 403. `APP_BASE_URL=http://localhost:3050` ile yeniden başlatınca tam chromium koşusu temiz. Kod hatası değil.
- touchTargets kat-dnd ve depo-gorevler (6 görünüm x 2 = 12): (b) gerçek. Stilsiz sayfalarda "Geri" bağlantısı 29x21, süzgeç düğmeleri 24 px yüksekliğinde (44 gerekli). Düzeltildi.
- axe kds (768x1024, 800x1280, 390x844): (b) gerçek. `scrollable-region-focusable: .kds-board` (dar görünümde yatay kaydırılan tahta, içinde odaklanabilir öğe olmayan duruma düşebiliyor). Düzeltildi.
- `migrate-tasks` / `migrate-validate` (4 hata iddiası): GERÇEK DEĞİL. Tam koşuda ve ayrıca tek başına (55 test) geçti. Diğer ajanın koşusundaki hatalar paylaşımlı DB paraziti olarak değerlendirildi (sınıf a).

## Commitler
- 7fbfaf0 fix(kds): kaydırılabilir sipariş tahtası klavye odağı alır (role=region, aria-label, tabIndex=0)
- 9d6d8b6 fix(ux): kat/dnd ve depo/gorevler dokunma hedefleri 44px

## Kalan kırmızı / dikkat
- Kırmızı madde yok.
- Çalışma ağacında başkasına ait değişmemiş dosyalar var (scripts/migrate-from-minibarlatest/legacy.ts, steps/definitions.ts); stage edilmedi. Doğrulama sırasında başka bir ajanın minibar jobs/taskGeneration değişiklikleri de belirip commitlendi; vitest tam koşusu bunlardan ÖNCE yapıldı (HEAD 4d82da4 + yalnız ağaçtaki 2 migrate dosyası).
- Makinede :3012-:3040 üzerinde eski `next start/dev` süreçleri (ux2/ux3/ux4/ux5/ux11/uxint/mb10 e2e DB'leri) çalışıyor ve Postgres'in 100 bağlantısının ~50'sini tutuyor; bir ara sunucu günlüğünde "too many clients" görüldü. Bu süreçler öldürülmedi.
- Lint uyarıları (17) önceden var, hata yok.
- Sunucu :3050 durduruldu. DB'ler: merit_ver_e2e, merit_test_ver, merit_ver_shadow (silinebilir).
