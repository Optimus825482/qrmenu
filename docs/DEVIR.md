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
| P2 Minibar tanımları + veri göçü | **Plan dışı prototip var** (`b52da3b`); 02.11 son kontrolde yetki/kapsam/havuz kilidi/iş günü düzeltildi; plan görevlerinin ~0/14'ü tam, ~8 kısmi; göç scripti yalnız tanımlar | `docs/superpowers/plans/2026-10-31-p2-minibar-tanimlar.md`; durum: `docs/kabul/2026-11-02-tutarlilik-denetimi.md` |
| P3 Minibar operasyonu | **Plan dışı prototip var**; DND 2/120, Nicosia iş günü, kilitli havuz, sahte veri kaldırma 02.11'de düzeltildi; stok talepleri, QR okuyucu, görev motoru, Excel kuralları eksik | `docs/superpowers/plans/2026-10-31-p3-minibar-operasyon.md` |
| P4 MyBar + bildirimler | **Kısmi prototip**: misafir isteği 02.11'de QR tokena bağlandı; yaşam döngüsü (Gördüm/karşılama/iptal), depo penceresi, Web Push YOK | `docs/superpowers/plans/2026-10-31-p4-mybar.md` |
| P6 QR Oda Servisi | **Kısmi**: sipariş çekirdeği/durum makinesi/`/oda-servisi` plana uygun ve testli; misafir oda servisi UI, SLA tarama/eskalasyon işi YOK | `docs/superpowers/plans/2026-10-31-p6-oda-servisi.md` |
| P7 Rapor / e-posta / izleme | **Kısmi prototip**: CR-RAP penceresi (CSV), e-posta işleri 02.11'de otel kapsamlı+EmailLog yapıldı; Excel/PDF motoru, SMTP ayar/mühür, radar ısı haritası YOK | `docs/superpowers/plans/2026-10-31-p7-rapor-eposta.md` |
| P8 Kabul / eğitim / kurulum | Başlamadı (Docker/Coolify kurulumu var; kabul paketi, yük testi, kılavuzlar yok) | `docs/superpowers/plans/2026-10-31-p8-kabul.md` |

**Çapraz tutarlılık geçişi yapıldı (31 Ekim 2026):** P2–P8 planlarının her birinde Global Constraints altında "Koordinasyon notları" vardır (havuz sahipliği `pool.ts`/P2, ortak `SCREEN_LIMITS` listesi, `IADE` anlamı, oda sayfası sahipliği P4/P6, migration numarası `ls prisma/migrations`, `guest.ipRateMultiplier`). Bir planı uygulamadan önce o bölümü oku.

İlerleme sayfası: `ilerleme.html` + `ilerleme-data.js` (kök dizin). **Her görev bitince** `ilerleme-data.js` güncellenir (status `done`, `doneAt`, `updatedAt`, `log`) ve commit edilir. Yeni faz planı yazılınca o fazın görev listesi plan görevleriyle değiştirilir.

## 1a. Kalınan yer (3 Kasım 2026, 13:40 — Fable 5 saatlik sınır; çalışma dalı `ux/yenileme`)

**Sıralama kararı (Erkan, 03.11 12:06):** önce **minibar** tamamen bitirilir (uygulama + inceleme + tam doğrulama), sonra **radar**, sonra **UX**'in kalanı; parçalı ilerleme istenmiyor. Çalışan ajanlar bitirilir ama yeni UX/radar görevi minibar kapanmadan açılmaz.

**Dal durumu:** tüm iş `ux/yenileme` dalında (main'e birleştirme/push yalnız Erkan onayı ile). Paralel ajan kuralları: `.superpowers/sdd/PARALEL-KURALLAR.md` (ajan başına DB `merit_test_<ad>`/`merit_<ad>_e2e`, port, `NEXT_DIST_DIR`; **aynı anda tek vitest süreci** ve tam süit yalnız dalga sonunda tek ajanla — Postgres 100 bağlantı sınırı "too many clients" veriyor). Defterler `.superpowers/sdd/2026-11-03-{minibar-tamamlama,canli-radar,ux-yenileme}/progress.md` + `task-N-brief.md` / `task-N-report.md` / `review-<hash>.diff` (gitignore'lu; kopyaları `docs/superpowers/plans/*-ledger.md` — bu commit ile yenilendi). İlerleme sayfası: `ilerleme-data.js` → `node --check` → `merit/public/` kopyası, her kapanışta commit.

**Minibar (plan `docs/superpowers/plans/2026-11-03-minibar-tamamlama.md`, 14 görev):**
- Kapalı (uygulandı + incelendi): T1 `6042bab`; T2 `5402b6a`+`cb397bf`+`a66895a`; T3 `83e3b50`; T4 `4444d08`+`4385096`; T5 `c64a6e3`; T6 `fd68ecc`; T7 `c6f7f5d`; T8 `7e3e7a8`+`1fff117`; T9 `45680ab`+`734783c`; T10 `be4a7ab`+`9a03ab9`+`499fa64`; T12 `bad0b42`; T13 `8b25eb1`+`c1525ac`.
- T14 `8db0269` uygulandı, **Haiku incelemesi çalışıyordu** (sonucu görmediysen `git show c1525ac 8db0269` üzerinden kısa inceleme: idempotent idmap, bilinmeyen durum → rapor satırı, createMany, kimlik bilgisi yok).
- **T11 `mb11` çalışıyordu** (port 3041, DB `merit_test_mb11`/`merit_mb11_e2e`): `server/jobs.ts` altı kuyruk (00:01 uzlaştırma + DND catch-up `closeDndDay(öncekiGün)`, 09:00 rapor, 10:00/18:00 doluluk ikazı, 23:59 `closeDndDay(bugün)`, DND hatırlatma, dosya temizliği), `server/depoDashboard.ts` + `GET /api/minibar/depo/dashboard` (**`/depo` ana sayfası UX T8'in**, mb11 yalnız servis+API), `/depo/gorevler`, `minibar-reports` birebir rapor sözleşmesi, `minibarAcceptance.spec.ts`. Commit yoksa `git status` ile dosyalarını bul; yarımsa `task-11-brief.md` ile taze ajan. Beklenen commit mesajı: `feat(minibar): altı pg-boss kuyruğu, depo panosu servisi, görev izleme, birebir rapor sözleşmesi, uçtan uca kabul`.
- **Minibar kapanışı:** T11 inceleme (Sonnet) → düzeltme → **tek ajanla, diğer ajanlar durmuşken** tam doğrulama: `npm run check` (tek vitest; `migrate-*` dahil), `npx next build`, chromium e2e (`minibarAcceptance`, `noBrowserDialogs`, `shell`, `setupGuide`, `definitionChain`), `prisma migrate diff` temiz; `minibar-room-check` yük altında flaky — sessizken tekrar. Sonra ilerleme P2/P3 satırları ve DEVIR §1 tablosu güncellenir (T14 raporunda önerilen satırlar var: `task-14-report.md`).
- Backlog (T15/sonraki tur): roomDetail `toISOString().slice` (UTC dize dilimi), `now` parametreleri kullanılmıyor, in-process QR limiter, güncellemede toplam 0 → SARFIYAT_YOK `reopenIfUncovered` yok, replay bayrakları, silinen görev kalemleri için TaskStatusLog, no-op regenerate audit, priorityPlan `isActive` süzgeci, price assert testleri.

**Radar (plan `2026-11-03-canli-radar.md`, 12 görev):** kapalı T1 `8b99c64`+`3e1be71`, T2 `23df08f`, T4 `0552fe5`, T5 `f6fbfee`, T7 `df77d46`+`63282d3`. **Uygulandı, inceleme ertelendi (minibar sonrası):** T6 `0971845` (gün tekrarı; kararlar: pencere (from,to], cursor isteğinde snapshot yok, audit 10 dk dedup), T8 `382d6ae` (XP penceresi; açık: çift menü çubuğu → T12 kabuk kancası; `/radar` T11'e kadar `/admin`'e yönlenir). Sıradaki: T3 (ön koşul minibar T1–T5, T8, T9 indi → şimdi açılabilir; canliRadar e2e'deki fixme bunu bekliyor), T9, T10, T11, T12.

**UX (plan `2026-11-03-ux-yenileme.md`, 15 görev):** kapalı T1 `fce492b`, T2 `7244d05`+`ded9ca7`, T3 `0d0cc5f`, T4+T11 `b5f8022`, T5 `72c35cf`+`85ba585`, T6 `c441101`+`1927871`. **Uygulandı, inceleme ertelendi:** T7 `41ad912` (KDS). **`ux8` çalışıyordu** (port 3018; StaffShell, navModel, `/depo` ana sayfası, `OpsShell.tsx`, layouts, matrix/ratchet — `uxRatchet.json`'daki mb10 düşüşlerini dahil etmeli; lint hataları `staff/SessionBanner.tsx`, `staff/useOnline.ts` setState-in-effect onun). Commit yoksa `git status`; beklenen mesaj `feat(ux): StaffShell — tek alt gezinme/ray, gezinme modeli, profil menüsü, oturum şeridi, depo ana sayfası`. Sıradaki (minibar ve radar sonrası): T9 (kat sayfaları yeniden tasarım — T10/T8 bare sayfaları), T10, T12, T13, T14–T15. Dalga-1 e2e bütünleştirme `1014aaa` (tam yeşil koşu yok; dalga sonunda tek ajanla).

**Dalga sonu:** Opus dal incelemesi → düzeltme → tam doğrulama → ilerleme + DEVIR → Erkan onayı ile `main`'e birleştirme/push → Coolify (zorunlu env). Onay bekleyen metinler: `docs/kabul/ux-rehber-metinleri.md`.

**Kararlar (bu dalga):** DND `dnd.minChecks`/`dnd.recheckMinutes`, 30 sn çift dokunma, gün sonu EKSIK idempotent; `roomcheck.done` SSE_EVENT_TYPES dışında; seed yönetici silmelerini geri getirmez; göçte bcrypt hash'ler korunur (yalnız scrypt/diğer `SIFRE_SIFIRLANMALI`), e-posta küçük harf+tekil, çok otelli talep sahibinde otel tahmini yok; UX S1–S6 ve radar varsayılanları bağlayıcı; POS durum şeridi 44 px, tam ekran kapısı banner.

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
