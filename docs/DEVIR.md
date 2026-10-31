# DEVİR NOTU — Merit OS projesini başka bir ajanla sürdürme kılavuzu

**Tarih:** 31 Ekim 2026 · **Hazırlayan:** Claude Fable 5.1 (kontrolör) · **Amaç:** Haftalık kullanım sınırı dolduğunda başka bir ajanın (Sonnet/Opus vb.) işi aynı kalite süreciyle sürdürmesi; Pazartesi Fable son kontrolleri yapar.

---

## 1. Projenin durumu (özet)

| Alt proje | Durum | Plan |
|---|---|---|
| A Analiz/tasarım | Bitti | `docs/analiz/2026-10-31-anlayis-notu.md`, spec: `docs/superpowers/specs/2026-10-31-merit-platform-design.md` |
| P0 İskelet | Bitti, `main`'de | `docs/superpowers/plans/2026-10-31-p0-iskelet.md` (+ `-ledger.md`) |
| P1 Çekirdek tanımlar | **Tamamlandı ve `main`'e birleştirildi** (12 görev + Opus dal incelemesi + 2 düzeltme turu) | `docs/superpowers/plans/2026-10-31-p1-cekirdek.md` (+ `-ledger.md`) |
| P5 QR Menü/Sipariş | **Uygulanıyor** (dal `p5/qr-menu`; T1–T10 bitti, sıradaki T11–T13; T10 commit `71c5e6c`) | `docs/superpowers/plans/2026-10-31-p5-qr-menu.md` |
| P2 Minibar tanımları + veri göçü | Plan yazıldı (14 görev), uygulanmadı | `docs/superpowers/plans/2026-10-31-p2-minibar-tanimlar.md` |
| P3 Minibar operasyonu | Plan yazıldı (14 görev), uygulanmadı | `docs/superpowers/plans/2026-10-31-p3-minibar-operasyon.md` |
| P4 MyBar + bildirimler | Plan yazıldı (10 görev), uygulanmadı | `docs/superpowers/plans/2026-10-31-p4-mybar.md` |
| P6 QR Oda Servisi | Plan yazıldı (7 görev), uygulanmadı | `docs/superpowers/plans/2026-10-31-p6-oda-servisi.md` |
| P7 Rapor / e-posta / izleme | Plan yazıldı (12 görev), uygulanmadı | `docs/superpowers/plans/2026-10-31-p7-rapor-eposta.md` |
| P8 Kabul / eğitim / kurulum | Plan yazıldı (8 görev), uygulanmadı | `docs/superpowers/plans/2026-10-31-p8-kabul.md` |

**Çapraz tutarlılık geçişi yapıldı (31 Ekim 2026):** P2–P8 planlarının her birinde Global Constraints altında "Koordinasyon notları" vardır (havuz sahipliği `pool.ts`/P2, ortak `SCREEN_LIMITS` listesi, `IADE` anlamı, oda sayfası sahipliği P4/P6, migration numarası `ls prisma/migrations`, `guest.ipRateMultiplier`). Bir planı uygulamadan önce o bölümü oku.

İlerleme sayfası: `ilerleme.html` + `ilerleme-data.js` (kök dizin). **Her görev bitince** `ilerleme-data.js` güncellenir (status `done`, `doneAt`, `updatedAt`, `log`) ve commit edilir. Yeni faz planı yazılınca o fazın görev listesi plan görevleriyle değiştirilir.

## 1a. Kalınan yer (1 Kasım 2026, 01:55 — Codex T10'u tamamladı)

**Planlar:** P2, P3, P4, P6, P7, P8 planları yazıldı, çapraz tutarlılık turundan geçti ve commit edildi (`4d4ff5a`); P5 planı uygulanıyor. Sıra: P5 → P2 → P3 → P4 → P6 → P7 → P8.

**P5 — `main` 31.10 23:13 itibarıyla `p5/qr-menu` ile aynı noktada (`3b8445f`, ff-merge; dal açık, T10+ burada sürer). (dal `p5/qr-menu`, defter `.superpowers/sdd/2026-10-31-p5-qr-menu/progress.md`, kopyası `docs/superpowers/plans/2026-10-31-p5-qr-menu-ledger.md`):**
- T1–T8 bitti, incelendi, kapandı. Son kod commit'i `accd319` (684 birim testi, e2e 9/9).
- **T9 bitti ve inceleme ONAYLANDI (1.11.2026; üç commit: `720f1e5` guestToken global limiter fix + `787e9ab` tools/** kök tsc/eslint kapsam dışı + `74e7841` feat; 710 birim testi + 16 gateway testi, `next build` yeşil). Kapsam: receipt.build, printJobs (enqueueReceipt/enqueueTest/reprint/claim SKIP LOCKED/report 3 deneme/sweepStale/listQueue), printers.heartbeat, `/api/print-queue` üç route (Bearer `PRINT_GATEWAY_KEY`), `jobs.ts` print.sweep, orders.ts ONAYLANDI varsayılan fiş kuyruğu, `merit/tools/print-gateway` (cp857 ESC/POS) ve CI gateway adımı. Sıradaki görev **T10** (`task-10-brief.md`: Yazıcılar penceresi + `/kasa/yazici`, printers CRUD) — taze uygulayıcıyla başlat.
- Sonraki görevler T10–T14 (`task-N-brief.md` dosyaları hazır). T14 = eskalasyon işi + uçtan uca kabul + belgeler + defterdeki tüm "Minor T14" maddeleri.
- **Kapandı (1.11):** `guestToken.ts` global limiter düzeltmesi — defter satır 32 nihai ruling `720f1e5` ile uygulandı (global aşım da DB araması yapar; geçerli token reddedilmez; bilinmeyen RATE_LIMITED +250 ms, log yok). Bu konu kesin kapalıdır, yeniden tasarlama.
- **T9 incelemesinden bekleyen minörler (3 P3 + test boşlukları, T14'te):** (1) `printJobs.report` yalnız `BASILIYOR` durumunda kabul etmeli (geç gelen hata raporu `BASILDI` işi geri çekip mükerrer fiş basabiliyor — tek satır + route testi); (2) `print.noPrinter` günde-bir-kez tekilleştirmesi eşzamanlı onayda yarışlı (outlet advisory lock/unique önerisi); (3) global yalnız-engel dalı pasif hedefe çözünen geçerli tokenı da RATE_LIMITED yapıyor (ruling'in "çözülmeyen token" tanımı netleştirilmeli); (4) testler: eşzamanlı claim (SKIP LOCKED), per-IP+global kombine engel.
- Bağlayıcı kararlar (defterde `Ruling:`): migration 0005 (P5); "sepet" yok → "Seçimler"; misafir SSE filtresi outletId'siz olayları tüm outletlere sayar; tarama günlüğü yalnız doküman navigasyonunda; e2e'de `getByRole('combobox',{name:'Outlet'})` (getByLabel yarışı); otel NAT için `guest.ipRateMultiplier` P4 T1'de; **T9'dan:** `/api/print-queue/heartbeat` 200 + gövde `{printers:[{id,ip,port}]}` (brief'in 204 çelişkisi çözüldü, gateway client bu biçimi bekler); tekil bildirim kodlaması `Notification.refType 'Outlet'/'PrintJob' + refId` (sonraki task'lara binding); merit kök tsconfig/eslint `tools/**`ı kapsamaz (787e9ab — yeni alt paketlere aynı desen); `listQueue` T9'da yazıldı (T10 kullanır); `ESC t 13` saha doğrulaması T14/kurulum (`CODEPAGE_TABLE` env).
- P5 sonu: Opus dal incelemesi + düzeltme dalgası + tam doğrulama (check, build, tüm e2e, migrate diff) → kullanıcı onayıyla `main`'e fast-forward.
- **T10 tamamlandı (1.11.2026, 01:55; değişiklik commit edildi):** `printers.ts` CRUD/list/varsayılan outlet ataması ve `QS-FIS` yetki denetimleri; `order.yazicilar` penceresi, `/kasa/yazici` bugünkü kuyruk/test fişi/yeniden bas akışı ve `printers.spec.ts`. Gateway sözleşmesi gereği yalnız `cp857` kabul edilir; pasif varsayılan yazıcı yerine aktif otel yazıcısına düşülür; varsayılan ataması aktif yazıcı ve sipariş outleti gerektirir. Kasa eylemleri `QS-FIS D/O` ile UI'da süzülür; yazıcı çevrimiçi durumu 15 sn aralıkla tazelenir. Bağımsız incelemeler: 0 önemli açık bulgu. Doğrulama: `npm run check` (68 dosya, 726 test), `npm run build` başarılı (uploads.ts için 3 mevcut Turbopack tracing uyarısı), yeni e2e 1/1. E2E için Chromium kuruldu; `3000`'deki bu görevin `next start` süreci durduruldu. `task-10-report.md` oluşturuldu. Sıradaki: T11–T13.
- **İlerleme güncellemesi:** `ilerleme-data.js` P5 satırı “Print gateway (T9) ve Yazıcılar penceresi (T10)” `done`, `doneAt: 01.11 01:55`; başlık ve güncelleme zamanı T10 kapanışını gösterir. `ilerleme.html` bu veriyi dinamik okur.
- **Çok ajanlı çalışma notu (1.11, işe yaradı):** T9 iki paralel uygulayıcıyla yapıldı — sunucu yarısı + devralınan fix tek ajanca, `tools/print-gateway` bağımsız ajanca (DB'siz, kendi vitest'i). Kural: merit vitest/test DB kullanan işler TEK ajanda; DB'siz alt paketler paralel olabilir; paralel ajan git'e dokunmaz, commit'i test sürecini koşan ajan yapar.

**Sonraki ajana talimat:** Bu bölümü, §3 (süreç) ve ilgili `task-N-brief.md`'yi oku; planın Global Constraints'ini her brief'e ekle; her görevde uygulayıcı → inceleme → düzeltme döngüsünü atlama; her görev sonunda `ilerleme-data.js` güncelle ve commit et; test DB paylaşımlı → aynı anda tek vitest süreci; 3001'e dokunma; `main`'e birleştirme ve push yalnız Erkan'ın onayıyla.

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
- **P7 Rapor/e-posta/izleme** (spec §6.7, §9, §11): rapor merkezi (Excel/PDF), SMTP + 08:00/08:05 e-postaları, Komuta Merkezi radar. **Plan yazıldı (12 görev): `docs/superpowers/plans/2026-10-31-p7-rapor-eposta.md`.**
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
