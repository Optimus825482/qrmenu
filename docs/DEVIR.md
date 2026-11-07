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
| UX Arayüz Yenilemesi | **Tamamlandı (T1–T15)**: belirteçler/matris, iniş/yetkisiz, tek onay/snackbar, emoji→ikon, POS masa haritası, KDS, StaffShell, kabuk seçimi/PWA, yetki rehberi ve Erişimim, kat sorumlusu akışları, XP cilası. T15 kapanışı `0d75121`: altı görünüm matrisi 472/472 (26 rota + misafir menüsü tr/ar), `KNOWN_*` listeleri ve cırcırlar sıfır, `final-gates`. Kabul: `docs/kabul/2026-11-03-ux-kabul.md`. | `docs/superpowers/plans/2026-11-03-ux-yenileme.md` (+ `.superpowers/sdd/2026-11-03-ux-yenileme/progress.md`) |
| RADAR Canlı Operasyon Radarı | **Tamamlandı (T1–T12)** (`ux/yenileme` dalında; tüm modüllerin salt-okunur canlı izlemesi, `/radar` duvar ekranı, 30 dk geri sarma ve NDJSON gün tekrarı, `CR-RAD`, `OperationEvent`) | `docs/superpowers/plans/2026-11-03-canli-radar.md` (+ `.superpowers/sdd/2026-11-03-canli-radar/progress.md`) |
| P8 Kabul / eğitim / kurulum | Başlamadı (Docker/Coolify kurulumu var; kabul paketi, yük testi, kılavuzlar yok) | `docs/superpowers/plans/2026-10-31-p8-kabul.md` |

**Çapraz tutarlılık geçişi yapıldı (31 Ekim 2026):** P2–P8 planlarının her birinde Global Constraints altında "Koordinasyon notları" vardır (havuz sahipliği `pool.ts`/P2, ortak `SCREEN_LIMITS` listesi, `IADE` anlamı, oda sayfası sahipliği P4/P6, migration numarası `ls prisma/migrations`, `guest.ipRateMultiplier`). Bir planı uygulamadan önce o bölümü oku.

İlerleme sayfası: `ilerleme.html` + `ilerleme-data.js` (kök dizin). **Her görev bitince** `ilerleme-data.js` güncellenir (status `done`, `doneAt`, `updatedAt`, `log`) ve commit edilir. Yeni faz planı yazılınca o fazın görev listesi plan görevleriyle değiştirilir.

## 1a. Kalınan yer (4 Kasım 2026, 03:45 — Opus; dal `ux/yenileme`, son kod commit'i `0d75121`)

**Sıra (Erkan: alan alan, sırayla):** P4 T10 → P6 → P7 → P8 → Opus dal incelemesi → tam doğrulama → Erkan'dan birleştirme onayı. Kapalı: minibar 14/14, radar 13/13, UX T1–T15 (T14 incelemesi `fa3dcaf`, T15 `0d75121`), P4 T1–T9.

**Token kuralı (Erkan):** basit iş Haiku, orta iş Sonnet, karmaşık iş Opus. Kontrolör konuşmayı kısa tutar. `DEVIR` ve `ilerleme` alan kapanışında toplu güncellenir. Ajan yoklanmaz, ama uzun süren işte Erkan'a ara bilgi verilir.

### Sıradaki adımlar
1. **UX kapandı (T15, `0d75121`):** T14'ten devreden dört madde kapandı: `/kat?filtre=dnd` süzgeci geri geldi (`landing.spec.ts:78` yeşil), `canliRadarWall` 1366/1920 tam chromium koşusunda yeşil, `pushSubscribe` geçici VAPID anahtarıyla yeşil, `preferredShell` arayüzü Erkan kararına bırakıldı (§4). Koşu sonuçları `docs/kabul/2026-11-03-ux-kabul.md`; rapor `.superpowers/sdd/2026-11-03-ux-yenileme/task-15-report.md`.
2. **Açık kırmızılar (T15 dışı):** `tests/unit/sse-filtered.test.ts` (P4 `acdf2e1` ile eklenen dört `mybar.*` misafir olayı testte yok) ve `mybarFlow.spec.ts:26` (P4 T10).
3. **Sıradaki: P4 T10:** commit'siz yığın `docs/kurulum.md`, `tests/e2e/mybarFlow.spec.ts` (izlenmiyor). `mybarFlow.spec.ts:26` KIRMIZI. T4/T7/T9 minörleri raporlarda.
4. **P6:** T2R `9b7dda3`, T3R `299cafc`, T4a `45d0d24` indi. T4b commit'siz yığın: `src/modules/menu/ui/guest/{GuestFooter,GuestFrame,MenuBrowser,MenuView,SelectionsDrawer}.tsx`, `tests/unit/guest-room-mode.test.tsx`. Sonra T5a, T6b, S0, T4c/T4d, T5b/c, T6a/c, T7; `ROOM_SERVICE_READY` en son açılır. Liste `.superpowers/sdd/2026-10-31-p6-oda-servisi/gap-analysis.md`; §5'te Erkan'a 4 soru var (SLA başlangıcı, pencere kimliği `rs.rapor`, kapalı menü kart metni, KDS `kind` süzgeci), yanıt yoksa varsayılanlar.
5. **P7, P8:** `.superpowers/sdd/2026-10-31-p7-rapor-eposta/gap-analysis.md`, `.superpowers/sdd/2026-10-31-p8-kabul/gap-analysis.md`.
6. **Yalnız Erkan:** gerçek göç, SMTP, Coolify dağıtımı ve `VAPID_*`, `docs/kabul/ux-rehber-metinleri.md` onayı, birleştirme onayı.

### Çalışma düzeni
brief → uygulayıcı (TDD, commit, LF, Co-Authored-By) → inceleme (misafire açık/yetki/para: Sonnet, diğerleri Haiku) → düzeltme → defter. `.superpowers/sdd/PARALEL-KURALLAR.md`: ajan başına DB/port/`NEXT_DIST_DIR`, açık yollarla stage, `git add -A`/stash/reset yok, tek vitest süreci, tam süit tek ajanla. `next build` `merit/tsconfig.json`'u değiştirir; commit'lenmez, geri alınır. E2E sunucusu `APP_BASE_URL=http://localhost:<port>` ile başlar, vitest onsuz koşar. 3000/3001 portlarına dokunulmaz. E2E yalnız `*_e2e`/`*_test` DB'lerinde. Postgres sınırı 100 bağlantı; biten ajanların sunucularını kapat.

### Durum özeti (commit'ler)
- **Minibar 14/14**, dalga doğrulaması yeşil (`wave-verification-report.md`). **Radar 13/13**, T13 `08ff735`+`43dbe2e`. Sürekli animasyon istisnası yalnız `radar/ui/motion/motion.css` (`434d4e6`).
- **UX** T1–T15 kapalı: T14 `d9b46a8`, `f158b60`, `b4e5a17` + inceleme düzeltmesi `fa3dcaf`; T15 `0d75121` (matris 472/472, chromium 209/210, tek kırmızı `mybarFlow` P4 T10).
- **P4** T1–T9 kapalı: T8 `32cd5cf`+`0d5cfe6`, T9 `13b3e62`+`5752ab9`, push genel metin `174d866`.

### Kararlar (bu dalga, ek)
`/kat?filtre=dnd|mybar` süzgeci geri geldi: yalnız DND kaydı / MyBar talebi olan katlar listelenir, "Süzgeç: …" satırı ve "Süzgeci kaldır" bağlantısı görünür (Erkan'a bildirildi, varsayılan karar); göçte bcrypt korunur; KDS oda servisi geri alma RO-TAL D; "simülatif" = animasyonlu (radar T13); push gövdesi genel metin, `push.includeNote` yok; çıkışta tüm push abonelikleri silinir; XP kabuğunda yoğunluk özniteliği `data-xp-density` (genel `data-density` tokenlarıyla çakışmaz); aynı ekranı paylaşan uygulamalar `launchLabel` ile ayrı pencere adı taşır.

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
- `preferredShell` yalnız kayıtta (`User.prefs.shell`) korunur; seçim arayüzü Erkan kararı bekliyor (T15'te UI eklenmedi).
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
