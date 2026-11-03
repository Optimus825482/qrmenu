### Task 15: Görünüm matrisi kapanışı, erişilebilirlik, cırcırların sıfırlanması ve belgeler (P-UX-15 kapanışı)

**Files:**
- Modify: `tests/e2e/matrix/{routes.ts,knownViolations.ts,layout.spec.ts,touchTargets.spec.ts,axe.spec.ts}`, `tests/unit/uxRatchet.json`, `tests/unit/uxRatchet.test.ts`, `.github/workflows/ci.yml`, `merit/README.md` (UX komutları), `docs/kurulum.md`, `docs/DEVIR.md` (§1 UX satırı, §4 kararlar), `D:\PROJECTS\qrmenu\ilerleme-data.js` (UX fazı kapanış, `headline`, `log`), `docs/kabul/2026-11-03-ux-kabul.md` (§8 kabul tablosu, koşu çıktıları)
- Create: `tests/unit/final-gates.test.ts`

**Interfaces:**
- `final-gates.test.ts`: `KNOWN_TOUCH_VIOLATIONS`, `KNOWN_AXE_VIOLATIONS`, `KNOWN_SCROLL` **boş** (`toEqual({})`); `uxRatchet.json` `smallText` ve `rawPalette` tüm değerleri **0**; `uxSourceRules` kuralları (emoji, animasyon, para birimi, tarayıcı diyalogları, başarı modalı) yeşil.
- Matris kapsamı: `ROUTE_MATRIX` **tüm** personel/POS/XP rotalarını içerir — `kat, kat-oda-kontrol, kat-islemlerim, kat-qr, kat-duzeltme-onay, depo, depo-stok, depo-raporlar, garson, garson-cagrilar, kasa, kasa-yazici, kasa-iptal, kds, oda-servisi, erisimim, yetkisiz, giris, secim, admin`; her biri **altı projede**: yatay kaydırma yok, `expectNoSeriousAxe` 0, `expectTouchTargets` 0 ve `gapViolations` 0. XP için `admin`: ciddi/kritik axe 0 (XP temasının bilinçli sınırları için `exclude` listesi **yalnız** gerekçeli ve `final-gates` içinde sabitlenmiş; liste boş başlar). Misafir menüsü (`/q/<token>`) RTL (`?lang=ar`) ve 390×844'te yatay kaydırma/axe denetimine girer (8 dil mesaj eşitliği zaten `i18n.test.ts`'te).
- Kabul eşlemesi: spec §8 madde 1 → `landing.spec.ts`; 2 → `noBrowserDialogs.spec.ts` + `uxSourceRules`; 3 → `touchTargets.spec.ts`; 4 → `posKiosk.spec.ts`; 5 → `opsScreens.spec.ts` KDS; 6 → `guide.spec.ts`; 7 → `uxSourceRules` + axe; 8 → matris.

- [ ] **Step 1: Başarısız testleri yaz** — `final-gates.test.ts` (yukarıdaki boşluk kuralları); matris listesi eksik rotalar ve beklenen-ihlal girdileriyle genişletilir (artık hiç beklenen ihlal yoktur → ilk koşuda kalan ihlaller görünür olur).
- [ ] **Step 2: Çalıştır → FAIL** — `npx vitest run tests/unit/final-gates.test.ts` ve `npm run test:e2e:matrix` (kalan ihlal listesi çıktıda).
- [ ] **Step 3: Uygula** — kalan hedef/axe/kaydırma ihlalleri ilgili bileşenlerde giderilir (renk kontrastı, etiketsiz ikon düğmeleri `aria-label`, sayfa dil/başlık, form etiketleri); cırcır kayıtları sıfırlanır; belgeler ve `ilerleme-data.js` güncellenir (`UX` fazı bütün satırlar `done`, `headline` ve `log` satırı).
- [ ] **Step 4: Çalıştır → PASS** — `npm run check` (lint 0 hata, tsc temiz, vitest), `npm run test:e2e:matrix` (altı proje, hepsi yeşil), `npx playwright test --project=chromium` (tam paket 96/96 + bu planın yeni spec'leri), `npx next build`, `npx prisma migrate diff` boş. Sonuçlar `docs/kabul/2026-11-03-ux-kabul.md` dosyasına tablo olarak yazılır.
- [ ] **Step 5: Commit** `test(ux): altı görünüm matrisi, axe ve kapanış kapıları; belgeler ve ilerleme sayfası`

---

## İlerleme sayfası eşlemesi (`ilerleme-data.js`, yeni faz)

`{ code: "UX", title: "Arayüz ve kullanılabilirlik yenilemesi", weight: 10, summary: "Üç kabuk (XP, personel, POS), tek bileşen sistemi, kasa masa haritası, KDS, yetki rehberi ve görünüm matrisi", tasks: [...] }` — `P8`'den sonra eklenir. Satırlar (`status` başlangıçta `pending`; ilgili görev(ler) bitince `done` + `doneAt`):

| # | Satır başlığı | Görevler |
|---|---|---|
| 1 | Tasarım belirteçleri, dokunma kademeleri, altı görünüm matrisi ve axe altyapısı | T1 (kapanış T15) |
| 2 | İniş ve katalog düzeltmesi, `/baslat`, "Bu ekran sana atanmadı" sayfası | T2 |
| 3 | Tek onay + satır içi bildirim, tarayıcı diyaloglarının kaldırılması | T3, T4 |
| 4 | Emoji → SVG ikon, sürekli animasyon yerine tek nabız, ayardaki para birimi | T5 |
| 5 | POS kabuğu: kasa masa haritası + yan panel, ses/tam ekran/uyku kilidi kapısı | T6 |
| 6 | KDS yenilemesi: 3 sütun, kart bazlı bekleme, geri alma, ses dosyaları | T7 |
| 7 | Personel kabuğu (tek gezinme, çevrimdışı, oturum süresi) ve depo ana sayfası | T8 |
| 8 | Kat sorumlusu akışları: yoklamasız MyBar onayı, +1…+4, QR okutma | T9 |
| 9 | Kabuk seçimi (`resolveShell`), Personel/POS manifestleri, kiosk kurulumu | T10 |
| 10 | Yetki rehberi: `screenGuide`, zorunlu Erişimim özeti, tur ve "?" yardım | T11, T12 |
| 11 | Günlük kontrol listeleri ve "Kullanıcıya göster" önizlemesi | T13 |
| 12 | XP cilası: Başlat menüsü, tepsi, klavye, katalog adları, iframe'siz minibar | T14 |
| 13 | Kabul: altı görünüm projesinde yatay kaydırma/axe/hedef denetimi sıfır ihlal | T15 |

---

## Öz-değerlendirme notları

- **Spec kapsamı:** §1 envanter bulguları → T1 (#33 ortak durumlar, belirteçler), T2 (#2, #4, #5, T1/T2 tespitleri), T3–T4 (#24, T5 tespiti: 29 başarı kutusu + 9 tarayıcı diyaloğu), T5 (#17d, T9 tespiti, emoji/animasyon/küçük yazı), T6 (#17, #18, #19), T7 (#20, T7 tespiti), T8 (#5b/c, #9, #15, #16, #21, #29 personel kabuğu, T3 tespiti), T9 (#6, #7, #8, T8 tespiti), T10 (#32, T10 tespiti), T11–T13 (§3 tamamı: 1–5. adımlar, eylem sözlüğü, `screenGuide` şeması, rutinler), T14 (#22, #23, #25–#28), T15 (§8 kabul, P-UX-15). §2 bağlam tabloları T6–T9/T14'e dağıtıldı; §4 → T2 + T10; §5 → T1, T3, T5, T6. **Bilinçli kapsam dışı:** P-UX-16 (kroki), Web Push'un ekran kapalıyken MyBar (P4 kapsamı), çevrimdışı işlem kuyruğu (spec v1'de yok), akıllı saat titreşimi (S5 cevabı yok → yapılmaz).
- **Spec'ten ve görev listesinden sapmalar / ek kararlar:** (1) `accessSummary` `rbac.ts` yerine `modules/core/server/accessSummary.ts`; `rbac.ts` yalnız `actionsByScreen` ekler (katman yönü). (2) Ses dosyaları **mp3 yerine WAV** (`scripts/generate-sounds.ts` ile üretilir, ≤1 sn, kodlayıcı bağımlılığı yok). (3) "Geri al" penceresi 5 sn/6 sn çelişkisi **6 sn** ile çözüldü (spec §5.4 snackbar kuralı); sunucu toleransı 30 sn. (4) `MB-TUK` yolu `/kat` (oda kontrolü `[roomId]` ister); `MB-PERS`/`MB-DND` ekranları yetki kapısı olduğundan **pasifleştirilmedi**, `/kat?filtre=` yolu kullanıldı. (5) KDS "Hazır" geri alma için yeni sunucu davranışı `orders.revertReady` (spec yalnız arayüzü anlatıyordu). (6) XP menü erişimi için **F10/Alt** esas yol (tarayıcı Alt+D çakışması); Alt+harf ek. (7) KDS manifesti ayrı `ekran=kds` varyantı (tek manifestte landscape/any birlikte olmaz). (8) E2E bayrağı: `seed-e2e` kullanıcılarına `welcomeSeenHash="*"` (yalnız e2e DB'de), böylece S4 zorunlu geçidi 96 mevcut spec'i bozmaz. (9) Cırcır (ratchet) test mekanizması: ihlal listeleri yalnız küçülür, T15'te boş olmak zorunda. (10) `OpsShell.tsx` silinmez; kabuk seçici sarmalayıcıya iner (mevcut importlar çalışır). (11) Kasa panelindeki "Yeni adisyon", mevcut `createStaffOrderAction` yetkisine bağlıdır (yeni yetki üretilmez). (12) Erişimim XP penceresi yeni bir `AppScreen` eklemez (`CR-KOM` yetkisine bağlı); matris/seed değişmez. (13) `welcome` geçidi kullanıcı başına `User.prefs.guide`, cihaz başına değil (paylaşımlı cihazda her kullanıcı kendi özetini görür).
- **Tip tutarlılığı:** `Density`/`tapFor` (T1) → `Button`, `PosShell` (T6), `StaffShell` (T8); `Icon`/`IconName` (T5) → `PosRailItem`, `NavItem` (T6, T8); `notify`/`confirm.askReason` (T3, T4) → `TablePanel` (T6), `KdsClient` (T7), oda kontrolü (T9); `screenForPath`/`routeOf` (T2) → `StaffShell` başlığı (T8), `buildNav` testleri; `resolveLanding(ctx, {shell})` (T2) ↔ `resolveShell` (T10) ↔ `/baslat`; `accessSummary`/`AccessSummary.hash` (T11) → hoş geldin geçidi, `previewAccessAction` (T13); `ScreenGuide`/`RoleRoutine` (T11) → `useScreenTour`/`HelpSheet` (T12), `getRoutines` (T13); `statusTone`/`soundGate`/`usePrinterStatus` (T6) → KDS (T7), tepsi (T14); `KNOWN_*` listeleri (T1) ↔ `final-gates` (T15).
- **Review Focus testleri:** 1 → T2 (`landing.test`, `/yetkisiz`) + T11 (`access-summary` hash değişimi, e2e yeniden zorunlu özet); 2 → T3 (`notify` çift/iptal/undo reddi) + T7 (`orders-revert` süre/durum/yarış, "8 sn sonra Geri al yok"); 3 → T6 (`soundGate` unsupported, wakeLock/fullscreen taklit e2e) + T10 (`device-record` erişilemez depolama); 4 → T12 (`resolveSteps` eksik hedef, boş tur, Esc/odak, onaysız hoş geldin); 5 → T8 (`nav-model` ikinci otel alt kümesi, çıkışta yerel durum temizliği) + T11 (iki otel için ayrı özet).
- **Orantı:** plan; adları, imzaları, spec değerlerini, test adlarını ve doğrulama komutlarını yazar; gövde yalnız spec'in belirlemediği yerlerde (`revertReady` kuralı, `resolveShell` sırası, ratchet) tarif edilir. Rehber metinlerinin kendisi (34 ekran + 6 rutin) plana yazılmadı: görev T11 taslağı üretir, `scripts/export-guides.ts` onay listesini çıkarır, Erkan onaylar (S6).
