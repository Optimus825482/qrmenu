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

## 1a. Kalınan yer (1 Kasım 2026 — Menü Tasarım Merkezi planı tamamlanıyor)

**Planlar:** P2, P3, P4, P6, P7, P8 planları yazıldı, çapraz tutarlılık turundan geçti ve commit edildi (`4d4ff5a`); P5 planı uygulanıyor. Sıra: P5 → P2 → P3 → P4 → P6 → P7 → P8.

**P5 — dal `p5/qr-menu`, defter `.superpowers/sdd/2026-10-31-p5-qr-menu-plans/progress.md`, kopyası `docs/superpowers/plans/2026-10-31-p5-qr-menu-ledger.md`:**
- T1–T14 uygulandı. T14 ve dal sonu düzeltmeleri commit edildi; `main`'e merge/push yapılmadı (Erkan'ın onayı gerekli).
- **T9 bitti ve inceleme ONAYLANDI (1.11.2026; üç commit: `720f1e5` guestToken global limiter fix + `787e9ab` tools/** kök tsc/eslint kapsam dışı + `74e7841` feat; 710 birim testi + 16 gateway testi, `next build` yeşil). Kapsam: receipt.build, printJobs (enqueueReceipt/enqueueTest/reprint/claim SKIP LOCKED/report 3 deneme/sweepStale/listQueue), printers.heartbeat, `/api/print-queue` üç route (Bearer `PRINT_GATEWAY_KEY`), `jobs.ts` print.sweep, orders.ts ONAYLANDI varsayılan fiş kuyruğu, `merit/tools/print-gateway` (cp857 ESC/POS) ve CI gateway adımı. Sıradaki görev **T10** (`task-10-brief.md`: Yazıcılar penceresi + `/kasa/yazici`, printers CRUD) — taze uygulayıcıyla başlat.
- T14 kapsamı: `order.escalation` pg-boss işi, eskalasyon birim testi, QR sipariş tam kabul akışı, kurulum belgeleri ve ilerleme sayfası. Bağımsız T14 incelemesi eskalasyon/alıcı kapsamı/schedule için PASS; yeni kabul spec'i ve iki mevcut QR sipariş regresyon testi geçiyor.
- **Kapandı (1.11):** `guestToken.ts` global limiter düzeltmesi — defter satır 32 nihai ruling `720f1e5` ile uygulandı (global aşım da DB araması yapar; geçerli token reddedilmez; bilinmeyen RATE_LIMITED +250 ms, log yok). Bu konu kesin kapalıdır, yeniden tasarlama.
- **T9 inceleme bulguları kapandı:** geç gelen gateway raporu yalnız `BASILIYOR` durumunda kabul edilir; `print.noPrinter` günlük tekilleştirmesi outlet/gün advisory lock ile seri hale getirildi; global limiter geçerli tokenı reddetmez (T9 ruling/fix); outlet kuyruğu/yazıcı işlemleri kapsam testleri ve rapor/audit regresyon testleri eklendi. T14 son dal incelemesi PASS.
- Bağlayıcı kararlar (defterde `Ruling:`): migration 0005 (P5); "sepet" yok → "Seçimler"; misafir SSE filtresi outletId'siz olayları tüm outletlere sayar; tarama günlüğü yalnız doküman navigasyonunda; e2e'de `getByRole('combobox',{name:'Outlet'})` (getByLabel yarışı); otel NAT için `guest.ipRateMultiplier` P4 T1'de; **T9'dan:** `/api/print-queue/heartbeat` 200 + gövde `{printers:[{id,ip,port}]}` (brief'in 204 çelişkisi çözüldü, gateway client bu biçimi bekler); tekil bildirim kodlaması `Notification.refType 'Outlet'/'PrintJob' + refId` (sonraki task'lara binding); merit kök tsconfig/eslint `tools/**`ı kapsamaz (787e9ab — yeni alt paketlere aynı desen); `listQueue` T9'da yazıldı (T10 kullanır); `ESC t 13` saha doğrulaması T14/kurulum (`CODEPAGE_TABLE` env).
- P5 sonu: Opus dal incelemesi + düzeltme dalgası + tam doğrulama (check, build, tüm e2e, migrate diff) → kullanıcı onayıyla `main`'e fast-forward.
- **T10 tamamlandı (1.11.2026, 01:55; değişiklik commit edildi):** `printers.ts` CRUD/list/varsayılan outlet ataması ve `QS-FIS` yetki denetimleri; `order.yazicilar` penceresi, `/kasa/yazici` bugünkü kuyruk/test fişi/yeniden bas akışı ve `printers.spec.ts`. Gateway sözleşmesi gereği yalnız `cp857` kabul edilir; pasif varsayılan yazıcı yerine aktif otel yazıcısına düşülür; varsayılan ataması aktif yazıcı ve sipariş outleti gerektirir. Kasa eylemleri `QS-FIS D/O` ile UI'da süzülür; yazıcı çevrimiçi durumu 15 sn aralıkla tazelenir. Bağımsız incelemeler: 0 önemli açık bulgu. Doğrulama: `npm run check` (68 dosya, 726 test), `npm run build` başarılı (uploads.ts için 3 mevcut Turbopack tracing uyarısı), yeni e2e 1/1. E2E için Chromium kuruldu; `3000`'deki bu görevin `next start` süreci durduruldu. `task-10-report.md` oluşturuldu. Sıradaki: T11–T13.
- **İlerleme güncellemesi:** `ilerleme-data.js` P5 satırı “Print gateway (T9) ve Yazıcılar penceresi (T10)” `done`, `doneAt: 01.11 01:55`; başlık ve güncelleme zamanı T10 kapanışını gösterir. `ilerleme.html` bu veriyi dinamik okur.
- **T11 tamamlandı (1.11.2026, 02:49; commit `b4469f4`):** OpsShell, garson kuyruğu/masalarım/çağrılar, masa atama ve garson PWA. Review fix: target switch aktif oturum doğrular; `order.cancelled` SSE; toplu atama audit→publish sırası; tam garson sipariş-atama-onay e2e. `npm run check` 733 test; ops e2e 1/1; build başarılı (uploads için önceki 3 tracing uyarısı). T11 review clean.
- **T12 tamamlandı (1.11.2026, 03:25; commit `7d22158`):** Kasa masa panosu/KPI, onay kuyruğu, çağrılar, masa atama, yazıcı geçişi ve iptal ekranı. Review fix: iptal edilebilir son siparişler iş günü devrinde de kalır; scan/printer KPI testleri eklendi. `npm run check` 737 test; kasa e2e 1/1; build başarılı (uploads için önceki 3 tracing uyarısı). T12 review clean. Sıradaki T13.
- **T11–T13 tamamlandı:** T11 `b4469f4` (garson ekranları/atama; 733 test, e2e 1/1), T12 `7d22158` (kasa panosu/iptal; 737 test, e2e 1/1), T13 `b88b6c2` (KDS; seri 743 test, e2e 1/1). Üçü de build’den geçti; bilinen üç `uploads.ts` Turbopack tracing uyarısı sürüyor. T13 review düzeltmeleri: outlet değişince KDS state remount, `prepStartedAt` olmadan HAZIR geçişi reddi, `ORDER_PREP` audit publish öncesi.
- **İlerleme güncellemesi (T13):** P5 “Garson, kasa ve KDS ekranları; masa ataması (T11–T13)” `done`, `doneAt: 01.11 04:10`; sıradaki T14. `ilerleme.html` durumu `ilerleme-data.js` üzerinden okur.
- **T14 ve son dal kapanışı (1.11.2026 05:20):** onay eskalasyonu, tam QR sipariş kabul akışı, OpsShell bildirim zili, gateway/proxy kurulum belgeleri tamamlandı. Doğrulama: seri Vitest 72 dosya/751 test; lint, typecheck, build ve gateway 16/16 başarılı; Playwright tam e2e **83/83**. İlk tam e2e koşusunda görülen iki test izolasyon/persist bekleme sorunu giderildi ve tekil tekrarlar ile tam suite geçti. T14 uygulayıcı raporu ve son dal güvenlik/iş mantığı incelemesi PASS; bulunan outlet kapsamı, geç basım raporu, bildirim tekilleştirme ve audit otel atfı sorunları düzeltildi.
- **Sonraki adım:** P5 dalı `p5/qr-menu` üzerinde hazır. `main`'e birleştirme veya uzak repoya push yalnız Erkan'ın açık onayıyla yapılır. Yeni faz başlatılacaksa P2 planına geç.
- **Çok ajanlı çalışma notu (1.11, işe yaradı):** T9 iki paralel uygulayıcıyla yapıldı — sunucu yarısı + devralınan fix tek ajanca, `tools/print-gateway` bağımsız ajanca (DB'siz, kendi vitest'i). Kural: merit vitest/test DB kullanan işler TEK ajanda; DB'siz alt paketler paralel olabilir; paralel ajan git'e dokunmaz, commit'i test sürecini koşan ajan yapar.

### Menü Tasarım Merkezi — 1 Kasım 2026 plan devamı

Uygulama kaynağı `docs/superpowers/plans/2026-11-01-menu-tasarim-merkezi.md`; kabul/uygulama kaydı `docs/superpowers/plans/2026-11-01-menu-tasarim-merkezi-ledger.md`. Stüdyo `merit/src/modules/menu/ui/MenuDesignStudio.tsx`, tasarım doğrulamaları `design.ts` / `quality.ts` / `contrast.ts`, misafir sunumu `ui/guest/MenuView.tsx` ve `app/(guest)/guest.css` içindedir. Menü tasarım seçenekleri mevcut `OutletMenuDesign.options` JSON alanında tutulur; ayrı şema değişikliği yoktur. Outlet çağrı seçenekleri `OutletCallOption` tablosu ve eklemeli migration ile saklanır. Outlet başına 8 aktif seçenek sınırı eşzamanlı kayıtları da kapsayacak outlet satır kilidiyle korunur.

- Stüdyo sekmeleri Tasarım, Renkler ve Garson çağrısıdır. Tasarımda tipografi, yoğunluk, karşılama, küratörlü ürün görselleri, arama/süzgeç, canlı telefon önizlemesi ve kalite denetimi bulunur; kontrast engelleri yayın öncesi sunucuda yeniden doğrulanır.
- Çağrı seçenekleri Türkçe etiket ve İngilizce/Almanca/Rusça/Arapça çeviri alır; misafir çağrıları seçenek kimliğiyle gönderilir, kasa ekranında etiket notu görünür. Yeni outlet varsayılanları `callOptionDefaults.ts` ile eklenir; mevcut outletleri migration doldurur. Yönetici seçenekleri bilerek silerse seed tekrar oluşturmaz.
- Misafir menüsü dilleri `tr, en, de, ru, ar, fr, el, it` şeklindedir; Fransızca, Yunanca ve İtalyanca mesaj dosyaları ile seçim testleri de bu kapsamdadır.
- Mobil kabul senaryosu 375 px Arapça RTL görünümünü, çağrı alt sayfasını ve etkileşim hedeflerinin 44×44 px altına düşmediğini ölçer.
- **Doğrulama (1.11.2026):** hedefli birim testleri 7 dosya/62 test, lint, typecheck ve `ilerleme-data.js` sözdizim kontrolü geçti. `npm run check` önceki denemede görev dışı `admin-roles.test.ts` ve `seed.test.ts` hatalarıyla tamamlanmadı. İzole `merit_menu_center_e2e` DB'si ve yeni Next.js sunucusundaki `menuDesignCenter.spec.ts` 7/8 geçti; son senaryodaki çağrı seçeneği pasife alma UI/DB akışı halen başarısız. Hata mesajını `load()` sonrasında gizleyen kusur düzeltildi, kök neden halen bulunmalı. Tam E2E ve görsel tarayıcı kabulü bekliyor.
- **E2E veritabanı notu:** E2E denemesinde `tests/e2e/fixtures.ts` `resetAndSeed()` çağrısı `.env`'deki `merit` veritabanını temizleyip seed etti. Önceki DB durumu geri yüklenmedi ve yedek doğrulanmadı. Kullanıcı verisini içerebilecek `merit` DB üzerinde bu fikstür tekrar çalıştırılmamalı; ayrı test DB'si ve ona bağlı ayrı Next sunucusu kurulmalı.
- **Konsept menüleri ve başlangıç tasarımları (01.11.2026):** Ekli Zephyros üçlü kompleks raporundaki konseptler, mevcut aktif 17 menü outletine özel örnek kategori/ürün/açıklama/alerjen/etiket verilerine dönüştürüldü. `prisma/seed/sampleMenus.ts` tekrar çalıştırılınca aynı demo düğümlerini günceller; outlet operatörünün pasiflik/tükenme durumunu korur, eski üretilmiş kök kategorileri pasife alır. `prisma/seed/menuDesigns.ts` ambiyans + konsept + 12/ek tasarım şablonuna göre başlangıç tasarımı ve tema atar; var olan tasarım ve tema atamasını ezmez. Stüdyo ve misafir ekranında SPA/hamam, bahçe, aktif yaşam ve atrium için ayrı şablon CSS'i eklendi. Geliştirme DB'sine 17 outlet için 102 menü öğesi ve 17 tasarım doğrudan uygulandı; Royal/Diamond/Premium içerikleri Menu Yönetimi ağacında outlet seçimiyle görünür. Örnek fiyatlar all-inclusive sunum için gizli; var olan SVG örnek görselleri kullanıldı. Görsel üretim aracı bu oturumda sunulmadığından yeni raster fotoğraf üretimi yapılmadı. Ekli rapordaki üç ortak Zephyros sahil alanı mevcut DB outlet kayıtlarında bulunmadığından otel sahipliği uydurularak oluşturulmadı.
- Bu ek işin doğrulaması: `npm run typecheck` ve hedefli ESLint başarılı; geliştirme DB sorgusunda 17/17 outlet tasarımı ve 102/102 ürün doğrulandı. Menü Tasarım Merkezi planının genel E2E/görsel kabulü hâlâ bekliyor.
- Bu çalışma sırasında depoda önceden var olan görev dışı değişiklikler bulunduğundan toplu commit yapılmadı. Yalnız bu planın dosyaları ayrı ayrı sahnelenmeden commit yoktur; `main`'e merge ve push için kullanıcı onayı kuralı değişmez.
- **Sonraki adım:** Önce izole E2E ortamında çağrı seçeneği pasifleştirme sorununu düzeltip tam suite ve 375 px RTL görsel kabulini bitir; ondan sonra P2 Minibar tanımları planına geç.

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
