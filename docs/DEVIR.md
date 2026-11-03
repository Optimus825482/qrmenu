# DEVİR NOTU — Merit OS projesini başka bir ajanla sürdürme kılavuzu

**Tarih:** 31 Ekim 2026 · **Hazırlayan:** Claude Fable 5.1 (kontrolör) · **Amaç:** Haftalık kullanım sınırı dolduğunda başka bir ajanın (Sonnet/Opus vb.) işi aynı kalite süreciyle sürdürmesi; Pazartesi Fable son kontrolleri yapar.

---

## 1. Projenin durumu (özet)

| Alt proje | Durum | Plan |
|---|---|---|
| A Analiz/tasarım | Bitti | `docs/analiz/2026-10-31-anlayis-notu.md`, spec: `docs/superpowers/specs/2026-10-31-merit-platform-design.md` |
| P0 İskelet | Bitti, `main`'de | `docs/superpowers/plans/2026-10-31-p0-iskelet.md` (+ `-ledger.md`) |
| P1 Çekirdek tanımlar | **Tamamlandı ve `main`'e birleştirildi** (12 görev + Opus dal incelemesi + 2 düzeltme turu) | `docs/superpowers/plans/2026-10-31-p1-cekirdek.md` (+ `-ledger.md`) |
| P5 QR Menü/Sipariş | **Tamamlandı, `main`'de** (T1–T14 + menü tasarım merkezi; son kontrol 02.11 ile güvenlik düzeltmeleri) | `docs/superpowers/plans/2026-10-31-p5-qr-menu.md` (+ `-ledger.md`), `2026-11-01-menu-tasarim-merkezi.md` |
| P2 Minibar tanımları + veri göçü | **14 görevlik tamamlama planında uygulandı ve incelendi; kapanış doğrulaması sürüyor**. Göç e34a0ee ile eşlenmiş hedeflere sınırlandı (171/171 test); gerçek aktarım yapılmadı. UI cilası UX planında. | `docs/superpowers/plans/2026-11-03-minibar-tamamlama.md` |
| P3 Minibar operasyonu | **Çekirdek uygulandı ve incelendi; kapanış doğrulaması sürüyor**. 1dd4bc7: geciken gün sonu yeni günü kapatmaz, geç görevler mevcut kontrol/DND durumunu devralır (96/96 hedefli test). UI cilası UX planında. | `docs/superpowers/plans/2026-11-03-minibar-tamamlama.md` |
| P4 MyBar + bildirimler | **Kısmi prototip**: misafir isteği 02.11'de QR tokena bağlandı; yaşam döngüsü (Gördüm/karşılama/iptal), depo penceresi, Web Push YOK | `docs/superpowers/plans/2026-10-31-p4-mybar.md` |
| P6 QR Oda Servisi | **Kısmi**: sipariş çekirdeği/durum makinesi/`/oda-servisi` plana uygun ve testli; misafir oda servisi UI, SLA tarama/eskalasyon işi YOK | `docs/superpowers/plans/2026-10-31-p6-oda-servisi.md` |
| P7 Rapor / e-posta / izleme | **Kısmi prototip**: CR-RAP penceresi (CSV), e-posta işleri 02.11'de otel kapsamlı+EmailLog yapıldı; Excel/PDF motoru, SMTP ayar/mühür, radar KPI kalan 3 metriği YOK | `docs/superpowers/plans/2026-10-31-p7-rapor-eposta.md` |
| UX Arayüz Yenilemesi | **Kısmi (T1–T9 ve T11 tamamlandı; T10, T12–T15 kaldı)**: belirteçler/matris, iniş/yetkisiz, tek onay/snackbar, emoji→ikon, POS masa haritası, KDS, StaffShell, Erişimim ve Kat sorumlusu akışları (`/kat/**`, `useMybarStream`, `+N` tek dokunuş + Geri al, QR/fener) tamamlandı. | `docs/superpowers/plans/2026-11-03-ux-yenileme.md` (+ `.superpowers/sdd/2026-11-03-ux-yenileme/progress.md`) |
| RADAR Canlı Operasyon Radarı | **Tamamlandı (T1–T12)** (`ux/yenileme` dalında; tüm modüllerin salt-okunur canlı izlemesi, `/radar` duvar ekranı, 30 dk geri sarma ve NDJSON gün tekrarı, `CR-RAD`, `OperationEvent`) | `docs/superpowers/plans/2026-11-03-canli-radar.md` (+ `.superpowers/sdd/2026-11-03-canli-radar/progress.md`) |
| P8 Kabul / eğitim / kurulum | Başlamadı (Docker/Coolify kurulumu var; kabul paketi, yük testi, kılavuzlar yok) | `docs/superpowers/plans/2026-10-31-p8-kabul.md` |

**Çapraz tutarlılık geçişi yapıldı (31 Ekim 2026):** P2–P8 planlarının her birinde Global Constraints altında "Koordinasyon notları" vardır (havuz sahipliği `pool.ts`/P2, ortak `SCREEN_LIMITS` listesi, `IADE` anlamı, oda sayfası sahipliği P4/P6, migration numarası `ls prisma/migrations`, `guest.ipRateMultiplier`). Bir planı uygulamadan önce o bölümü oku.

İlerleme sayfası: `ilerleme.html` + `ilerleme-data.js` (kök dizin). **Her görev bitince** `ilerleme-data.js` güncellenir (status `done`, `doneAt`, `updatedAt`, `log`) ve commit edilir. Yeni faz planı yazılınca o fazın görev listesi plan görevleriyle değiştirilir.

## 1a. Kalınan yer (3 Kasım 2026, 19:50 — Fable → Codex devri; dal `ux/yenileme`, HEAD `1f30a62` + 3 ajanın commit'siz işi)

**Sıra (Erkan):** minibar (kapalı+doğrulandı) → radar (13/13 kapalı, T13 animasyon dahil) → UX (T1–T13 kapalı; **T14–T15 kaldı**) → P4 MyBar (T1–T7, T9 kapalı; **T8 sürüyor, T10 kaldı**) → **P6** (boşluk analizi sürüyor) → P7 → P8. Codex kalan işleri sürdürür; Fable sınırı sıfırlanınca `git log` ile doğrular ve dalga sonu kapanışını yapar.

### Codex için ilk adımlar (sırayla)
1. `git status --short`: çalışma ağacında üç ajanın **commit'siz** işi var (19:45):
   - **UX T12 düzeltme turu (`ux12`)**: `src/components/guide/{HelpSheet,ScreenGuideHost,guide.css,guideClient,tourModel,useScreenTour}`, `src/modules/core/{screenGuide.ts,server/{guideState,helpActions,helpData}.ts}`, `src/shell/components/Window.tsx`, `src/app/(admin)/admin/ShellClient.tsx`, `tests/e2e/guide.spec.ts`. Hedef: hata ipuçları yetkiye göre süzülür (`requires`), XP penceresinin oteli `helpActions`'a geçirilir (ctx.hotelIds doğrulamalı), 13→14 px POS, guide.css tokenları, pendingStart, sabit bekleme yerine `expect(...).not.toBeVisible`. Testleri (`coach-marks`, `setting-sentences`, `screen-guide`, `guide.spec` port 3022) koşup commit: `fix(ux): tur/yardım — yetkiye göre hata ipuçları, pencere oteli, token renkler`.
   - **P4 T8 (`p4t8`)**: `src/shell/icons.tsx` + (henüz görünmeyen) `src/shell/apps/MybarRequests*.tsx`, registry, `adminViews.ts`, testler, `tests/e2e/mybarAdmin.spec.ts`. Brief: plan Task 8 (`docs/superpowers/plans/2026-10-31-p4-mybar.md` 220–237) + `task-{5,6}-report.md`; ekran kodu `MB-PERS` (seed'de var). Commit mesajı: `feat(p4): MyBar Talepleri XP penceresi — liste, süzgeçler, KPI, iptal, dışa aktarma`.
   - `merit/tsconfig.json` → `git checkout -- merit/tsconfig.json` (next build yan etkisi, asla commit'lenmez).
   Yarım kalanı aynı brief ile taze ajan bitirir; her iki görev de Haiku/Sonnet incelemesinden geçer.
2. **P6 boşluk analizi** `.superpowers/sdd/2026-10-31-p6-oda-servisi/gap-analysis.md` (ajan çalışıyordu; yoksa aynı görevi yeniden ver: plan `2026-10-31-p6-oda-servisi.md` ile mevcut `order/server/roomService/*`, `(ops)/oda-servisi`, `(guest)/q/[token]/siparis`, `rsSlaSweep`, `RoomServiceReportsWindow` karşılaştırması). Çıkan "YOK/KISMİ" görevler için brief'ler → uygula. Kural: UI'da "sepet" yok → "Seçimler".
3. **UX T14–T15** (`task-14-brief.md` sonundaki "Doğrulama kalıntıları" listesi dahil; T15 belgeler/final gates). T14 ux12/p4t8 indikten sonra (shell dosyaları çakışır).
4. **P4 T10** kabul (plan 259–276): e2e verisi, `push.includeNote` kararı (Erkan onayı — push gövdesinde ürün adı + ≤150 kr misafir notu), T4/T7/T9 minörleri (`task-{4,7,9}-report.md`, `task-9-review.md`), eski `/api/manifest/garson` temizliği.
5. Her kapanışta defter + `ilerleme-data.js` (`node --check`, `merit/public/` kopyası) + commit; ayrılırken bu bölümü güncelle.

### Çalışma düzeni (değişmedi)
brief → uygulayıcı (TDD, tek commit, LF, Co-Authored-By) → inceleme (misafire açık/yetki/para: Sonnet; diğerleri Haiku) → düzeltme turu (aynı ajan) → defter → ilerleme. `.superpowers/sdd/PARALEL-KURALLAR.md`: ajan başına DB/port/`NEXT_DIST_DIR`, **tek vitest süreci**, tam süit yalnız dalga sonu tek ajanla; Postgres 100 bağlantı — biten ajanların e2e DB bağlantıları `pg_terminate_backend` ile kapatılabilir (bugün yapıldı). `git log`'a güven. `main` birleştirme/push yalnız Erkan onayı. Dalga sonu: Opus dal incelemesi → düzeltme → tam doğrulama (tek ajan: check, build, migrate diff, chromium, matris) → DEVIR §1 + ilerleme → onay → birleştirme → Coolify (yeni env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; isteğe bağlı `PUSH_ENDPOINT_ALLOWLIST`, `TRANSLATE_PROVIDER`).

### Durum özeti (commit'ler)
- **Minibar 14/14** kapalı; dalga doğrulaması yeşil (`wave-verification-report.md`), Codex kapanış `e34a0ee`/`1dd4bc7`.
- **Radar 13/13** kapalı: T3 `86ee6de`, T6 `0971845`+`c29df98`+`e8fcb0d`, T8 `382d6ae`+`50e5ffa`, T9 `70efac6`, T10 `9b77d0b`, T11 `fbf5a56`, T12 `5ea6fd6`, **T13 animasyon `08ff735`+`43dbe2e`** (Erkan: "simülatif" = animasyonlu; `Animasyon` anahtarı, reduced-motion, ≤120 öğe).
- **UX**: T1–T9, T11 kapalı; T10 `c8d6db1`; T12 `92cf504` (+düzeltme bekliyor); T13 `cb17f17`+`50c4542`; e2e `1014aaa`, `b6dfccd`; Antigravity doğrulaması `antigravity-verification-report.md` (düzeltmeler `2c30516`, `a3ed3bf`, `dfd99a8`+`3587744`, `3fae81c`, `3a7928d`).
- **P4 MyBar**: T1 `c201ba3`; T2 `0a40ea8`+`041d49c`+`461b01d`; T3 `72c289e`+`3fe2959`+`2195e42`+`6da62f1`+`49ce303`; T4 `acdf2e1`; T5 `d2757e9`; T6 `ade0c1f`; T7 `1922496`+entegrasyon `51a5700`+`84f9091`; T9 `13b3e62`+`5752ab9`. Kalan T8 (sürüyor), T10.
- Backlog/minörler defterlerde (`docs/superpowers/plans/*-ledger.md`) ve T14 brief'inde.

### Kararlar (bu dalga, ek)
Göçte bcrypt korunur; KDS oda servisi geri alma RO-TAL D; "simülatif" = animasyonlu (radar T13, yalnız `radar/ui/motion/**` sürekli animasyon istisnası); P4 misafir API şeması strict değil (servis girdisi ip/userAgent taşır), katalog dışı ürün adı çözümü kabul; çıkışta tüm push abonelikleri silinir (çok cihaz dahil); T7 plan dosya listesi yerine StaffShell/soundGate altyapısı; kat layout MyBar penceresine oturum oteli geçer.

## 2. Çalışma ortamı

- Uygulama `merit/` (Next.js 16.4, React 19, TS 5.9, Prisma 7.10, PostgreSQL 17, Tailwind 4, zustand, Vitest 5, Playwright). `merit/README.md` ve `docs/kurulum.md` kurulum/komutlar.
- `merit/.env` mevcut (git dışı): `DATABASE_URL` (db `merit`), `DATABASE_URL_TEST` (db `merit_test`), `SEED_ADMIN_PASSWORD` vb.
- Komutlar (merit/): `npm run check` (lint + tsc + vitest, gerçek test DB), `npm run test:e2e` (Playwright; **dev veritabanını sıfırlar**; `npm run dev` 3001'de çalışıyorsa aynı klasörden ikinci dev sunucusu açılmaz → `npx next build && npx next start -p 3000` ile koş, sonra 3000'deki süreci durdur), `npm run build`, `npm run db:migrate`, `npm run db:seed`.
- Kullanıcının demo sunucusu `3001` portunda olabilir; durdurma. Testleri aynı anda iki süreçte çalıştırma (test DB çakışıyor) → **tek uygulayıcı**.
- Git: dal başına çalış (`p1/cekirdek`, sonra `p2/...`), `main`'e fast-forward birleştir. Commit kimliği: `git -c user.name="Erkan Erdem" -c user.email="ikinciyenikitap54@gmail.com" commit -m "…"`; mesajlar Türkçe Conventional Commits; son satır `Co-Authored-By: <model adı> <noreply@anthropic.com>`. LF (`.gitattributes`).

## 3. Süreç (değiştirme)

1. **Plan**: `superpowers:writing-plans` biçimi (Global Constraints, Review Focus, dosya yapısı, görev başına Files/Interfaces/adımlar/testler). Örnek: P1 planı.
2. **Uygulama**: `superpowers:subagent-driven-development` — görev başına taze uygulayıcı (Sonnet), görev incelemesi (Sonnet), düzeltme turu + kapsamlı yeniden inceleme (Haiku), alt proje sonunda tüm dal incelemesi (Opus) + tek düzeltme dalgası. Defter (`.superpowers/sdd/<plan>/progress.md`) her adımda güncellenir; `Ruling:` satırları kullanıcıya raporlanır. Defter alt proje sonunda `docs/superpowers/plans/<plan>-ledger.md` olarak arşivlenir.
3. **Her yazma işlemi**: zod → `assertCan`/`withAdminTx(ctx,{screen,action,hotelId},fn)` (otel kapsamlı yazmalarda `hotelId` ZORUNLU; verilmezse sistem kapsamı = yalnız SISTEM rolü) → `prisma.$transaction` → `audit` → `publishDefinition`/`publish`. Silme: bağlı kayıt varsa Türkçe `CONFLICT`; `confirm({danger:true})`.
4. **Testler**: birim testleri gerçek test DB (`tests/helpers/db.ts`, `fixtures.ts`, `runSeed`); e2e dev DB (`tests/e2e/fixtures.ts`, kullanıcılar admin/mudur.mr/kat.mr/depo.cok/garson.havuz/bos.kullanici, şifre `Test!2026`). Her görev `npm run check` + ilgili e2e + `next build` yeşil olmadan commit edilmez.
5. **Güvenlik tarama bulguları** (otomatik) ciddiye alınır; karar deftere `Ruling:` olarak yazılır.

## 4. Bağlayıcı kararlar (özet; tamamı P0 ledger'ında)

- Minibar modülü canlı `D:\PROJELLER\minibarlatest` ile birebir (bkz. `docs/analiz/...` §3): otel ortak zimmet havuzu; MyBar oda başına iş günü başına 1 talep (ayarlanabilir), +/- adet; oda kontrolünde yalnız +N ikame / Sarfiyat Yok / DND / MyBar karşılama (ekstra/sıfırla/setup dışı YOK); DND 2 kontrolle tamam, 120 dk hatırlatma; doluluk Excel + günlük görevler + e-posta raporları dahil; ana depo/FIFO ve ML hariç.
- Veri göçü: canlı DB yedeği `minibar_legacy` olarak restore edilir, tüm tanımlar + işlem geçmişi taşınır (spec §12 eşleme tablosu). Otel logoları `oteller.logo` base64 → dosyaya (`merit/public/uploads/hotels/`) → `Hotel.logoUrl`.
- Görseller: `merit/public/brand` (Merit Royal logosu), `merit/public/icons/legacy`. MyBar misafir arayüzü canlı şablonla birebir: `docs/referans-misafir_dolum_talebi.html`.
- Zaman: tüm kolonlar `timestamptz(3)`, iş günü `Europe/Nicosia` (`lib/time.ts` `businessDate/businessDay`), Prisma bağlantıları UTC'ye sabit (`lib/pgAdapter.ts`).
- Yetki: rol × otel × modül × ekran × işlem (`lib/rbac.ts`); OUTLET/MUTFAK oturumları yalnız oturum otelini görür; hedef listesi modül kapılarıyla süzülür.
- Gerçek zaman: Postgres NOTIFY/LISTEN → SSE (`lib/realtime.ts`, `/api/sse`); olay tipleri `lib/realtime-events.ts`; sekme başına tek EventSource (`shell/sseStore.ts`).
- Kabuk: XP; uygulama kaydı `src/modules/core/apps.ts` (`AppDefinition`); tanım pencereleri `needsHotel: true`; Denetim Masası görünüm/marka ayarları `User.prefs.shell`.

- Terminoloji: arayüzlerde **"sepet" yok, "Seçimler"** (bkz. P5/P6/P4 planlarındaki karar satırı); alışveriş çağrışımlı ifadeler kullanılmaz.

## 5. Kalan alt projelerin kapsamı (plan yazarken kaynak)

- **Uygulama sırası ve bağımlılıklar:** P5 (uygulanıyor) → P2 → P3 → P4 → P6 → P7 → P8. P2, P5 T1 kütüphanelerine (`qr.ts`, `rate-limit.ts`, `uploads.ts`) dayanır; P3 P2'nin `pool.ts`/`checklist.ts`/`stockStatus.ts`'ine; P4 P2 + P3 (slotlar `AckHostSlot`/`MybarSlot`) + P5 T5/T6'ya; **P6 P5 + P4'e** (oda sayfası `RoomServiceSlot`); **P7 P2/P3/P5/P6 verisini okur** (kodlarına bağlanmaz); P8 hepsine. Migration numarası her planda `ls prisma/migrations` ile alınır; ekran yetki sınırları `prisma/seed/roles.ts`'te ortak `SCREEN_LIMITS` listesine P5 → P2 → P3 → P7 sırasıyla eklenir.
- **P1**: tamamlandı ve `main`'de (bkz. §1).
- **P2 Minibar tanımları + göç** (spec §6.1, §6.2, §12; minibarlatest `routes/sistem_yoneticisi_routes.py` setup bölümü, `utils/qr_service.py`): ürün grubu/ürün (fiyat alanları iç rapor, misafire gösterilmez), setup (dolap içi/dışı, içerik adetleri), otel bazlı oda tipi–setup ataması, oda QR üretimi (HMAC token, SVG/PNG/ZIP, yazdırma şablonu, misafir mesajı), zimmet havuzu giriş/iade/düzeltme/kritik seviye, `scripts/migrate-from-minibarlatest` (idempotent, `legacy_id_map`, `--dry-run`, rapor; kullanıcıdan pg dump gelince). **Plan yazıldı (14 görev): `docs/superpowers/plans/2026-10-31-p2-minibar-tanimlar.md`.**
- **P3 Minibar operasyonu** (spec §6.3–6.5, §6.7; minibarlatest `routes/kat_sorumlusu_routes.py`, `utils/minibar_servisleri.py`, `utils/dnd_service.py`, `utils/gorev_service.py`, `utils/gorev_oncelik_service.py`, `utils/excel_service.py`, `static/js/oda_kontrol.js`): kat sorumlusu PWA (`/kat`: kat planı, kat doluluk, QR okuyucu html5-qrcode, oda kontrolü), depo ekranları (`/depo`), doluluk Excel, günlük görevler, öncelik planı, pg-boss işleri (00:01 yükleme görevleri, 10:00/18:00 uyarı, 23:59 DND gün sonu), raporlar için veri. **Plan yazıldı (14 görev): `docs/superpowers/plans/2026-10-31-p3-minibar-operasyon.md`.**
- **P4 MyBar + bildirim** (spec §6.6, §9.2; referans şablon): misafir `/q/[token]` (next-intl tr/en/de/ru/ar, RTL), günlük sınır, idempotency, not çevirisi (ayarla kapatılabilir), kat sorumlusu zorunlu onay penceresi, karşılama/kapatma/iptal, Web Push (VAPID). **Plan yazıldı (10 görev): `docs/superpowers/plans/2026-10-31-p4-mybar.md`.**
- **P5** planı hazır ve uygulanıyor (`2026-10-31-p5-qr-menu.md`, dal `p5/qr-menu`); P1 T4 (outlet/masa CRUD) ön koşul.
- **P6 Oda servisi** (spec §8): otel başına ODA_SERVISI outleti, misafir akışı, `/oda-servisi` ekranı, teyit adımı, SLA. **Plan yazıldı (7 görev): `docs/superpowers/plans/2026-10-31-p6-oda-servisi.md`.**
- **RADAR Canlı Operasyon Radarı** (spec `2026-11-03-canli-radar-design.md`): tüm modüllerin salt-okunur canlı izlemesi (`core.radar`, `CR-RAD`), `/radar` duvar ekranı (otomatik dönüş, kritikte duraklama, ses kapısı, wakeLock), 30 dk bellek içi geri sarma ve `/api/radar/replay` NDJSON gün tekrarı (`OperationEvent`, `radar.*` 8 ayar, `roomcheck.done`/`dnd.completed`/`mybar.*`/`task.*`/`stock.*`/`occupancy.*`/`presence.tick`/`mail.failed`/`order.sla`/`scan.room`/`printer.status` olayları; T3 ön koşulu P4 T1+T5). **Tamamlandı (12 görev): `docs/superpowers/plans/2026-11-03-canli-radar.md`.**
- **P7 Rapor/e-posta/izleme** (spec §6.7, §9, §11): rapor merkezi (Excel/PDF), SMTP + 08:00/08:05 e-postaları, Komuta Merkezi KPI çipleri (kat ısı haritası ve outlet panosu Canlı Radar'a taşındı). **Plan yazıldı (12 görev): `docs/superpowers/plans/2026-10-31-p7-rapor-eposta.md`.**
- **P8 Kabul** (spec §13.2, §15): e2e paket, yük denemesi, kılavuzlar, kurulum, GitHub'a push + CI'ın gerçek koşusu. **Plan yazıldı (8 görev): `docs/superpowers/plans/2026-10-31-p8-kabul.md`.**

## 6. Pazartesi (Fable) son kontrol listesi

- Her alt projenin defteri ve `Ruling:` satırları; ertelenmiş minörler.
- `npm run check`, `npm run test:e2e`, `npm run build` yeşil; `prisma migrate diff` boş.
- Spec kabul kriterleri (§15) ile karşılaştırma; güvenlik tarama bulgularının kapanışı.
- `ilerleme-data.js` gerçek durumu yansıtıyor mu.

## 7. Dokunulmaması gerekenler
- `merit/.env` ve gerçek şifreler belgelere yazılmaz; `SEED_ADMIN_PASSWORD` zorunlu.
- `main`'e birleştirme yalnız kullanıcı onayıyla; push yalnız kullanıcı isteğiyle.
- Kök dizindeki prototip HTML'leri (`MENNN/`, `*.html`) referanstır, uygulamanın parçası değildir.
