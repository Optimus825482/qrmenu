# Antigravity çıktıları bağımsız doğrulama raporu

Kapsam: radar T3/T9/T10/T11/T12 (`86ee6de`, `70efac6`, `9b77d0b`, `fbf5a56`, `5ea6fd6`), P4 T5 (`d2757e9`), UX T9 (`9ea49b4`). Taban: `6620ad7`, yalıtılmış worktree, port 3052, veritabanları `merit_test_ver2` ve `merit_ver2_e2e` (iş sonunda silindi).

## Adım -> sonuç

| # | Adım | Sonuç |
|---|------|-------|
| 1 | `tsc --noEmit` / `npm run lint` | tsc 0 hata (Prisma client üretildi, `.next/types` için build sonrası); lint 0 hata, 17 uyarı (kullanılmayan değişkenler, eski) |
| 2 | vitest radar-*, mybar-*, uxRatchet, uxSourceRules, minibar-* | 53 dosya / 611 test GEÇTİ |
| 3 | `next build` | Başarılı |
| 4 | `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` | "No difference detected" |
| 5 | chromium e2e (7 spec + canliRadarWall) | İlk koşu: 25 geçti / 4 kaldı / 11 seri atlandı. Düzeltmelerden sonra: tümü geçer, YALNIZ 2 kırmızı kaldı (aşağıda) |
| 6 | Altı görünüm matrisi (16 rota x 3 spec x 6 görünüm = 288) | Temiz koşu: 249 geçti / 39 kaldı. Düzeltmelerden sonra kat, depo-pano, depo-gorevler axe+dokunma+yatay kaydırma geçti; kalan: kat-oda-kontrol dokunma hedefi |
| 7 | Duman | `/radar` duvar ekranı (mudur.mr) geçti; replay NDJSON (403 PREMIUM, 200 ROYAL, `snapshot`..`end`) geçti; `+N` ve "Geri al" (`katFlows` 1) geçti |

Not: matriste `kat-qr`, `kat-gorevler`, `radar` rotası `tests/e2e/matrix/routes.ts` içinde YOK; bu üçü matris kapsamında değil (kat-qr ve duvar için ayrı spec var).

## Hata sınıflandırması

Gerçek regresyon, düzeltildi:
- `useMybarStream.ts`: `mybar.created` olayı yük içermediğinde `needsRefetch` state-updater içinden okunuyordu (updater ertelenir) -> yeniden yükleme sık sık tetiklenmiyor, MyBar modal 8 koşuda ~3 kez açılmadı. ref'ten okuma + bağlantı açılınca yeniden yükleme. 10/10 geçti.
- Çift toast: kabuk (`StaffShell`) ve `ConfirmHost` her biri `SnackbarHost` çiziyor, gömülü düzenlerde üçüncüsü; `katFlows` 1 strict-mode hatası. `Snackbar.tsx` içinde tek host çizer (alt gezinme ofsetli olan öncelikli).
- Kontrast: `bg-accent/10` üstünde `text-accent` küçük etiketler (axe color-contrast) KatDashboard, depo panosu, depo görevler.
- Test kayması: depo-gorevler matris `ready` metni "Görev izleme" idi, sayfa "Günlük Görevler".

Test hatası (ürün doğru), düzeltildi:
- `canliRadarScope:98`, `canliRadarWall`, `katFlows` 2/3: giriş sonrası yönlendirme beklenmeden `goto` (yarış).
- `katFlows` 3: "Aç" düğmesi "Kamerayı Aç" ile çakışıyordu (`exact: true`).
- `canliRadarWall` 1920: kritik uyarı (Doluluk yüklenmedi) duraklatma etiketini ezer; etiket "Dönüş duraklatıldı" veya "Kritik uyarı" kabul edilir.
- `canliRadarScope:131`: önceki testin açık bıraktığı Radar penceresi masaüstü simgesini örtüyordu; test önce kapatır.
- Başka ajan aynı anda `canliRadar.spec.ts` (Doluluk yüklenmedi, panel düğmeleri) ve `Timeline.tsx` (aria-label = görünür metin, axe label-content-name-mismatch) düzeltmelerini çalışma ağacında yapıyordu; ben dokunmadım. Doğrulama: onlarla aynı değişiklik worktree'de geçti.

Ortam / flaky:
- Postgres `TooManyConnections` (max 100, başka ajanların 6+ e2e DB'si açık): matriste kat/depo-stok/kat-oda-kontrol fazlarında 22 sn zaman aşımı ve "Beklenmeyen hata". İlk koşuda yanlışlıkla iki Playwright eşzamanlı koştu (araç zaman aşımı); sonuçlar atılıp temiz yeniden koşuldu.

## Düzeltme commitleri (ux/yenileme)

- `2c30516` fix(mybar): useMybarStream
- `3fae81c` fix(e2e): canliRadarScope, canliRadarWall, katFlows
- `a3ed3bf` fix(ui): Snackbar çift host
- `3a7928d` fix(e2e): Komuta Merkezi testi (canliRadarScope temizliği)
- `dfd99a8` kontrast + routes.ts. HATA: worktree kopyası başka ajanların P4 commitlerini geri aldı; `3587744` bunları geri yükledi. Net etki yalnız 4 dosyada 7 satır (text-accent -> text-text, ready metni).

## Kalan kırmızı

1. `staffShell.spec.ts:153` depo ana sayfası: `9ea49b4` `src/app/depo/page.tsx` dosyasını baştan yazdı. Başlık artık "Merit Royal — Depo Yönetim Paneli" (h1), "Depo panosu" yok; "Kritik stok", "Bekleyen talepler" kartları farklı adlı; `main` içinde iç içe `main`; eski `can(MB-ZIM/MB-RAP)` yetki denetimi ve `metadata` yok (yetki denetimi yerine `depoDashboard` kullanıyor, doğrulanmalı). >30 satır, düzeltilmedi.
2. `canliRadar.spec.ts:162` Zaman şeridi: Esc ile tekrardan çıkış çalışmıyor (3/3). `.rd-root` `tabIndex` taşımıyor; "Sona atla" sonrası odak body'ye düşüyor, `onKeyDown` tetiklenmiyor. Öneri: `.rd-root`a `tabIndex={-1}` ve düğme devre dışı kalınca odağı köke taşı (`RadarRoot.tsx` çalışma ağacında kirli, dokunulmadı).
3. Matris `kat-oda-kontrol` dokunma hedefi: `input#oda-kontrol-not` 42 px < 44 px (6 görünüm). `src/app/kat/oda-kontrol/[roomId]/page.tsx:583` `py-2.5` -> min-height 44; dosya başka ajan tarafından kirli, dokunulmadı.
4. Matris eksikleri: `kat-qr`, `kat-gorevler`, `radar` rotaları kayıtlı değil.
5. Ham ISO tarih sızıntısı: `/kat` Günün Özeti başlığında "2026-11-03T00:00:00.000Z" görünüyor (düzeltilmedi).
