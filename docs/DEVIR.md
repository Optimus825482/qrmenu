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

## 1a. Kalınan yer (3 Kasım 2026, 17:18 — Antigravity'den Fable'a devir; dal `ux/yenileme`)

**Kim ne yaptı:** Fable (sabah–14:15) minibar planını bitirdi, dalga doğrulamasını yeşil kapattı (`wave-verification-report.md`). Codex (14:50–15:30) minibar kapanış düzeltmeleri (`e34a0ee`, `1dd4bc7`), radar T6 düzeltme turu (`c29df98`), P4 MyBar veri temeli (`c201ba3`) ve commit'siz radar T8 düzeltme turu yaptı. Ardından **Antigravity (15:35–17:18)** devreye girerek Codex'in işlerini doğruladı, Radar T6 stok bazlama hatasını düzeltti (`e8fcb0d`), **P4 T5** (`d2757e9`), **Canlı Operasyon Radarı'nın kalan tüm görevlerini (T3 `86ee6de`, T9 `70efac6`, T10 `9b77d0b`, T11 `fbf5a56`, T12 `5ea6fd6`)** ve **UX T9 (Kat sorumlusu akışları + kat/depo sayfaları)** görevini tamamlayıp birim testleri, `tsc --noEmit` ve `eslint` ile doğruladı. Kullanım sınırına yaklaşıldığı için iş **Fable'a** devrediliyor.

**Sıralama (Erkan, 03.11 12:06):** minibar (kapalı) → radar (kapalı) → UX (T10, T12–T15 kaldı) → P4 kalan (T2–T4, T6–T10) → P6 → P7 → P8.

### Antigravity oturumunda tamamlananlar (03.11 15:35–17:18)
1. **Tamamlandı (`50e5ffa`):** Codex'in commit'siz radar T8 düzeltmesi doğrulandı (`tsc --noEmit`, `eslint src/modules/radar`, `vitest run radar-` 215/215 yeşil) ve commit edildi.
2. **Tamamlandı (`e8fcb0d`):** Codex'in test edilmemiş `c29df98` (Radar T6) ve `c201ba3` (P4 T1) commit'leri doğrulandı (`prisma migrate deploy` + 68/68 P4 T1 testi yeşil), Radar T6'daki alt-pencere stok seviyesi bazlama hatası düzeltildi (`post_upper` CTE + 32/32 replay testi yeşil) ve `next build` doğrulandı.
3. **Tamamlandı:** Radar T6 ve T8 yeniden inceleme raporları (`SPEC: PASS`, `QUALITY: APPROVED`) ve SDD defteri kapatıldı.
4. **Tamamlandı (`d2757e9` + Radar T3–T12):** **P4 T5** (`acknowledge/complete/cancel`, `list/kpis/get/listUnseen/listForRoom`, `mybar.*` olayları — 11/11 birim testi yeşil) ve ardından **Canlı Operasyon Radarı'nın tamamı (T3 `86ee6de`, T9 `70efac6`, T10 `9b77d0b`, T11 `fbf5a56`, T12 `5ea6fd6`)** tamamlandı ve kapatıldı.
5. **Tamamlandı (UX T9):**
   - `useMybarStream.ts` (`setInterval=0`, tek başlangıç sorgusu + SSE `mybar.created/seen/acknowledged/completed/cancelled/realtime.resync`) ve `PersistentMybarModal.tsx` (`role="alertdialog"`, `1/N` sayacı, `playCue("call")` + `navigator.vibrate`, 56 px `"Gördüm"` düğmesi, arka plan sekme görünürlük uyarısı).
   - `/kat/oda-kontrol/[roomId]/page.tsx`: her ürün satırında 48×48 px, 8 px aralıklı ayrı `+1 · +2 · +3 · +4` düğmeleri, tek dokunuşta `POST /api/minibar/room/[roomId]/check` + `"Bugün eklenen: N"` + 6 sn `"Geri al"` snackbar (`DELETE /api/minibar/my-checks/[txId]`); havuz/setup sınır nedenleri; alt yapışkan `"Sarfiyat Yok / DND İşaretle / Kaydet"` çubuğu.
   - `/kat/qr/page.tsx`: kamera izni reddedildiğinde açık uyarı + `"Oda numarası yaz veya QR kodu gir"` alanı (`roomScan.ts` oda numarasını da çözümler) + fener (`torch`) düğmesi.
   - `/kat/(home)/KatDashboard.tsx` (üst tekrarlı hızlı çubuk kaldırıldı), `/kat/gorevler`, `/kat/dnd`, `/depo/gorevler`, `/depo/doluluk-yukle` tasarım belirteçleriyle yenilendi; `/depo/page.tsx` sayılarını `depoDashboard(ctx)` üzerinden okuyor; mutasyon düğmelerine `data-mutates` eklendi.
   - `tests/unit/uxRatchet.json` içinde `src/app/kat/**` ve `doluluk-yukle`/`stok` sıfırlandı (`uxRatchet.test.ts` 2/2 yeşil); `tests/e2e/matrix/knownViolations.ts` içinden `kat` ve `kat-oda-kontrol` çıkarıldı; `mybar-stream.test.ts` (3/3) ve `uxSourceRules.test.ts` (6/6) yeşil, `tsc --noEmit` ve `eslint` 0 hata. `tests/e2e/katFlows.spec.ts` hazırlandı.

### Fable için sıradaki adımlar (öncelik sırasıyla)
1. **Canlı e2e doğrulaması (tek süreçte):** Antigravity oturumunda yazılan `tests/e2e/canliRadarScope.spec.ts`, `tests/e2e/canliRadar.spec.ts` (5. test dahil) ve `tests/e2e/katFlows.spec.ts` ile `tests/e2e/matrix/` (`kat` ve `kat-oda-kontrol` ihlalsiz) testlerini çalıştırıp doğrula.
2. **UX Kalan Görevler (`docs/superpowers/plans/2026-11-03-ux-yenileme.md`):**
   - **UX T10:** Kabuk seçimi (`resolveShell`, `deviceRecord`), çift PWA manifesti (`/personel.webmanifest`, `/pos.webmanifest`), `DeviceSetupPrompt` ve kiosk/kurulum rehberi.
   - **UX T12:** Tur motoru (`CoachMarks`, `HelpSheet`, `useScreenTour`), `settingSentences`, `data-guide` öznitelikleri, `F1` / `?` yardım menüsü.
   - **UX T13:** Günlük kontrol listeleri (`routines`, `RoutineCard`) ve yönetici önizlemesi (`accessPreview`, `AccessPreviewDialog` — "Kullanıcıya göster").
   - **UX T14–T15:** XP masaüstü cilası (`depo/raporlar` ve `depo/tanimlar` ham palet/küçük yazı cırcırlarının sıfırlanması, `admin@*` dokunma ihlallerinin temizlenmesi), `final-gates.test.ts`, tüm `knownViolations.ts` ve `uxRatchet.json` tablolarının `{}` yapılması ve belgeler.
3. **UX Sonrası Fazlar:**
   - **P4 MyBar kalan görevler** (`docs/superpowers/plans/2026-10-31-p4-mybar.md`: T2–T4 misafir `/q/[token]` çok dilli akışı ve Gemini çeviri, T6–T10 personel/depo MyBar pencereleri ve Web Push).
   - **P6 Oda Servisi** (`docs/superpowers/plans/2026-10-31-p6-oda-servisi.md`).
   - **P7 Rapor / E-posta / İzleme** (`docs/superpowers/plans/2026-10-31-p7-rapor-eposta.md` — T10/T11 artık yalnız kalan 3 metrik ve Komuta Merkezi KPI çiplerini kapsar).
   - **P8 Kabul / Yük / Kurulum** (`docs/superpowers/plans/2026-10-31-p8-kabul.md`).

### Durum özeti
- **Minibar (14/14 kapalı, doğrulama yeşil):** T1 `6042bab`; T2 `5402b6a`+`cb397bf`+`a66895a`; T3 `83e3b50`; T4 `4444d08`+`4385096`; T5 `c64a6e3`; T6 `fd68ecc`; T7 `c6f7f5d`; T8 `7e3e7a8`+`1fff117`; T9 `45680ab`+`734783c`; T10 `be4a7ab`+`9a03ab9`+`499fa64`; T11 `dff58ad`; T12 `bad0b42`; T13 `8b25eb1`+`c1525ac`; T14 `8db0269`+`924e3c4`; kapanış `e34a0ee`, `1dd4bc7`; doğrulama düzeltmeleri `7fbfaf0`, `9d6d8b6`.
- **Radar (12/12 kapalı, tamamlandı):** T1 `8b99c64`+`3e1be71`, T2 `23df08f`, T3 `86ee6de`, T4 `0552fe5`, T5 `f6fbfee`, T6 `0971845`+`c29df98`+`e8fcb0d`, T7 `df77d46`+`63282d3`, T8 `382d6ae`+`50e5ffa`, T9 `70efac6`, T10 `9b77d0b`, T11 `fbf5a56`, T12 `5ea6fd6`.
- **UX (10/15 kapalı):** kapalı T1–T9, T11; sıradaki **T10, T12, T13, T14, T15**. Onay bekleyen metinler `docs/kabul/ux-rehber-metinleri.md`.
- **P4 MyBar:** kapalı T1 `c201ba3` (migration `20261103121000_p4_mybar`, 68/68 test yeşil) ve T5 `d2757e9` (MyBar yaşam döngüsü servisi + action'lar, 11/11 test yeşil); T2–T4, T6–T10 UX sonrasında.

### Kararlar (bu dalga)
DND `dnd.minChecks`/`dnd.recheckMinutes`, 30 sn çift dokunma, gün sonu EKSIK idempotent, geciken gün sonu yeni günü kapatmaz; `roomcheck.done` SSE_EVENT_TYPES dışında; seed yönetici silmelerini geri getirmez; göçte bcrypt korunur, e-posta küçük harf+tekil, otel tahmini yok, DND birleştirme count=max, göç doğrulaması eşlenmiş hedeflerle; POS durum şeridi 44 px, tam ekran kapısı banner; KDS oda servisi geri alma RO-TAL D; StaffBell; "Şifre değiştir" bilgi sayfası; radar tekrar penceresi (from,to], DST günü duvar saati; P4 sunucu temeli öne çekildi.

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
