# DEVİR NOTU — Merit OS projesini başka bir ajanla sürdürme kılavuzu

**Tarih:** 31 Ekim 2026 · **Hazırlayan:** Claude Fable 5.1 (kontrolör) · **Amaç:** Haftalık kullanım sınırı dolduğunda başka bir ajanın (Sonnet/Opus vb.) işi aynı kalite süreciyle sürdürmesi; Pazartesi Fable son kontrolleri yapar.

---

## 1. Projenin durumu (özet)

| Alt proje | Durum | Plan |
|---|---|---|
| A Analiz/tasarım | Bitti | `docs/analiz/2026-10-31-anlayis-notu.md`, spec: `docs/superpowers/specs/2026-10-31-merit-platform-design.md` |
| P0 İskelet | Bitti, `main`'de | `docs/superpowers/plans/2026-10-31-p0-iskelet.md` (+ `-ledger.md`) |
| P1 Çekirdek tanımlar | **Devam ediyor** — dal `p1/cekirdek`; T1–T9 ve K1 bitti (T7–T9 incelendi, **commit yok**, çalışma ağacında); sıradaki iş T10 | `docs/superpowers/plans/2026-10-31-p1-cekirdek.md` Task 10 (satır ~207); defter `.superpowers/sdd/2026-10-31-p1-cekirdek/progress.md` |
| P5 QR Menü/Sipariş | Planı yazıldı (14 görev), uygulanmadı | `docs/superpowers/plans/2026-10-31-p5-qr-menu.md` (kopya `main`'e alındı; orijinal worktree dalı `worktree-quizzical-albattani-805b4d`, commit `3d3fa90`) |
| P2, P3, P4, P6, P7, P8 | Plan yazılmadı | Bu belgenin §5'i kapsamı tarif eder; plan `superpowers:writing-plans` ile spec'ten yazılır |

İlerleme sayfası: `ilerleme.html` + `ilerleme-data.js` (kök dizin). **Her görev bitince** `ilerleme-data.js` güncellenir (status `done`, `doneAt`, `updatedAt`, `log`) ve commit edilir. Yeni faz planı yazılınca o fazın görev listesi plan görevleriyle değiştirilir.

## 1a. Tam olarak kalınan yer (31 Ekim 2026, 17:47 — kullanım sınırı devri)

Cursor kullanımına yaklaşıldığı için T10'a girilmedi. Bu bölüm bir sonraki coding agent için tek kaynaktır. Eski çelişkili notlar silindi; ayrıntılı `Ruling:` ve inceleme satırları `.superpowers/sdd/2026-10-31-p1-cekirdek/progress.md` sonundadır. Onları buraya kopyalama.

### Şimdi ne yapılacak

1. Bu bölümü ve §3'ü oku. Repoyu tarama.
2. **T7, T8, T9'u yeniden yazma.** Üçü de uygulandı ve incelendi (0 Critical / 0 Important). Dosyalar çalışma ağacında, commit yok.
3. Sıradaki tek kalem **T10**: Sistem ayarları penceresi (Denetim Masası → Sistem). Plan: `docs/superpowers/plans/2026-10-31-p1-cekirdek.md`, "Task 10" başlığı (yaklaşık satır 207). Yalnız o görevin dosyalarını oku.
4. T10 bitince §3'teki inceleme adımını uygula. Sonra `docs/DEVIR.md` §1a, `progress.md` ve `ilerleme-data.js` güncellenir. T11'e bu oturumda geçilmez; sınır dolmaya yakınsa yine burada durulur.
5. **Commit ve push yok**, Erkan açıkça istemedikçe. T7–T9'u T10'dan önce commit'lemek de onun kararı. İsterse önce çalışma ağacını commit'let, sonra T10'a gir.

### Git ve çalışma ağacı

- Dal: `p1/cekirdek`. HEAD: `3361ae0` (devir commit'i). Son özellik commit'i: `815a61f` (`feat(p1): Rol penceresi ve yetki matrisi`, T6).
- Commit'lenmemiş ve bitmiş: T7 kurulum rehberi, T8 online kullanıcı takibi, T9 bildirim zili + denetim günlüğü, artı `ilerleme-data.js` / `progress.md` / bu dosya. `git status` kirli görünür; bu yarım iş değildir, stash'leme ve T7–T9'u baştan başlatma.
- `ilerleme-data.js` P1 listesinde T1–T9 `done`, T10–T12 `pending`. Başlık T10'u gösterir.

### Son doğrulama

- T9 sonrası `npm run check`: lint, tsc ve 437 birim test geçti. T8 turunda 432, T7 turunda 427 idi.
- e2e spec'ler yazıldı (`onlineUsers.spec.ts`, `auditLog.spec.ts` ve T7 rehber spec'i). **Koşturma:** `npm run test:e2e` demo veritabanını sıfırlar.
- Tarayıcı doğrulanamadı. 3001 bir ara ayaktı; giriş formu `hydrated` false kaldığı için Giriş Yap disabled. Sunucuyu ajan başlatmaz ve durdurmaz. Erkan 3001'i kendisi yeniler. Doğrulanamazsa bunu rapora yaz, görevi geri alma.

### Erkan'ın elle çalıştırabileceği komutlar

- Müdür rolünün T8 zorla çıkış (`CR-ONL` onay) ve T9 denetim (`CR-DEN` V,R) satırlarını görmesi: `merit` içinde `npm run db:seed`. Tabloları silmez. R-SYS zaten görür.
- Uygulamayı ajan başlatmaz (`python app.py`, `npm run dev`, `pip install` yok).

### T10 kabul özeti (planın yerine geçmez)

- Yeni: `src/shell/apps/controlPanel/SystemPanel.tsx`, `server/admin/settingsAdmin.ts`, `actions/settingsAdmin.ts`, `tests/unit/settingsAdmin.test.ts` (`merit/` altında).
- Değişen: `ControlPanel.tsx` (üçüncü kategori "Sistem", yalnız `can(CR-SYS,'D')`), `src/lib/settings-defs.ts` (her anahtar için Türkçe `SETTING_META`).
- `listGrouped` gruplar: Oturum, MyBar, DND, Stok, Fiyat, Sipariş, Oda Servisi, Kabuk, E-posta, QR. Kapsam: sistem geneli yalnız SISTEM; otel kapsamı YONETIM'in kendi otelleri. Kaynak rozeti: varsayılan / sistem / otel. `clearHotelOverride` satırı siler. Birim: sistem kapsamında YONETIM `FORBIDDEN`; otelde `dnd.minChecks` set → `source: 'hotel'`, clear → `system` veya `default`.

### Bilinçli olarak T12'ye bırakılanlar

Ayrıntı `progress.md` içinde. Özet: T6 tümü-false otel kapsamı sessiz no-op (Important, plan böyle); T4–T9 minörleri. T10 sırasında bunları düzeltme.

### Token

Yalnız bu §1a, §3 ve T10 plan bölümü. `progress.md`'nin tamamını okuma; son T9 satırından sonrasına bakman gerekmez, T10'a kadar defter güncel. Kullanım yine dolarsa kodu yarım bırakma: dur, bu §1a'yı yeni durumla değiştir.

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

## 5. Kalan alt projelerin kapsamı (plan yazarken kaynak)

- **P1 (kalan T10–T12)**: plan dosyasında ayrıntılı; defterdeki ertelenmiş minörler T12'de ele alınır. T9 kapandı (commit yok). Sıradaki T10; bkz. §1a.
- **P2 Minibar tanımları + göç** (spec §6.1, §6.2, §12; minibarlatest `routes/sistem_yoneticisi_routes.py` setup bölümü, `utils/qr_service.py`): ürün grubu/ürün (fiyat alanları iç rapor, misafire gösterilmez), setup (dolap içi/dışı, içerik adetleri), otel bazlı oda tipi–setup ataması, oda QR üretimi (HMAC token, SVG/PNG/ZIP, yazdırma şablonu, misafir mesajı), zimmet havuzu giriş/iade/düzeltme/kritik seviye, `scripts/migrate-from-minibarlatest` (idempotent, `legacy_id_map`, `--dry-run`, rapor; kullanıcıdan pg dump gelince).
- **P3 Minibar operasyonu** (spec §6.3–6.5, §6.7; minibarlatest `routes/kat_sorumlusu_routes.py`, `utils/minibar_servisleri.py`, `utils/dnd_service.py`, `utils/gorev_service.py`, `utils/gorev_oncelik_service.py`, `utils/excel_service.py`, `static/js/oda_kontrol.js`): kat sorumlusu PWA (`/kat`: kat planı, kat doluluk, QR okuyucu html5-qrcode, oda kontrolü), depo ekranları (`/depo`), doluluk Excel, günlük görevler, öncelik planı, pg-boss işleri (00:01 yükleme görevleri, 10:00/18:00 uyarı, 23:59 DND gün sonu), raporlar için veri.
- **P4 MyBar + bildirim** (spec §6.6, §9.2; referans şablon): misafir `/q/[token]` (next-intl tr/en/de/ru/ar, RTL), günlük sınır, idempotency, not çevirisi (ayarla kapatılabilir), kat sorumlusu zorunlu onay penceresi, karşılama/kapatma/iptal, Web Push (VAPID).
- **P5** planı hazır (`2026-10-31-p5-qr-menu.md`); P1 T4 (outlet/masa CRUD) ön koşul.
- **P6 Oda servisi** (spec §8): otel başına ODA_SERVISI outleti, misafir akışı, `/oda-servisi` ekranı, teyit adımı, SLA.
- **P7 Rapor/e-posta/izleme** (spec §6.7, §9, §11): rapor merkezi (Excel/PDF), SMTP + 08:00/08:05 e-postaları, Komuta Merkezi radar.
- **P8 Kabul** (spec §13.2, §15): e2e paket, yük denemesi, kılavuzlar, kurulum, GitHub'a push + CI'ın gerçek koşusu.

## 6. Pazartesi (Fable) son kontrol listesi

- Her alt projenin defteri ve `Ruling:` satırları; ertelenmiş minörler.
- `npm run check`, `npm run test:e2e`, `npm run build` yeşil; `prisma migrate diff` boş.
- Spec kabul kriterleri (§15) ile karşılaştırma; güvenlik tarama bulgularının kapanışı.
- `ilerleme-data.js` gerçek durumu yansıtıyor mu.

## 7. Dokunulmaması gerekenler
- `merit/.env` ve gerçek şifreler belgelere yazılmaz; `SEED_ADMIN_PASSWORD` zorunlu.
- `main`'e birleştirme yalnız kullanıcı onayıyla; push yalnız kullanıcı isteğiyle.
- Kök dizindeki prototip HTML'leri (`MENNN/`, `*.html`) referanstır, uygulamanın parçası değildir.
