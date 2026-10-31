# SDD ledger — plan: docs/superpowers/plans/2026-10-31-p1-cekirdek.md

Spec: docs/superpowers/specs/2026-10-31-merit-platform-design.md (bağlayıcı). Dal: p1/cekirdek (main 367b17c+ → e97dad6'dan). Paralel: P5 planı ayrı oturumda (local_fa9f538c, kendi worktree'si) yazılıyor — bu dala dokunmaz.

## Ön uçuş taraması
| Satır | Üretilen / Tüketilen | Bulgu |
|---|---|---|
| T1 crud.ts/DataGrid/useLiveList ↔ T2–T10 | withAdminTx, ListQuery/Page, definition.changed | uyumlu |
| T1 screens.ts (+CR-TAN, +CR-REH) ↔ seed.test (31 ekran) | AppScreen sayısı 33 | ÇELİŞKİ: seed.test ve rbac/visibleScreens(R-GAR) testleri ekran sayısına bağlı → T1'de testler güncellenir (R-GAR görünür listesi değişmez: CORE ekranları profil dışı) |
| T2 Definitions.tsx ↔ T3–T6 panelleri | panel state | sıralı, uyumlu |
| T6 roles "setActive?" | Role.isActive alanı yok | BELİRSİZ → Ruling: setActive yok; silme yalnız kullanıcısı yoksa |
| T7 AppProps.openApp ↔ registry/Window | yeni prop | T7 ekler; T2 paneli `panel` opsiyonunu T2'de tanımlar |
| T8 session.changed ↔ sessions.ts publish | closeSessionInTx/createSession tx | uyumlu (mevcut tx içinde publish) |
| T9 audit.created ↔ audit.ts | audit tx içinde publish | uyumlu; yalnız SISTEM alıcı |
| T10 SETTING_META ↔ settings-defs.ts | saf tanımlar | uyumlu |
| T11 login/entitlements/time değişiklikleri | bağımsız dosyalar | uyumlu |
| T1 jsdom/testing-library ↔ vitest.config.mts | environmentMatchGlobs | vitest 5'te `environmentMatchGlobs` kaldırılmış olabilir → Ruling: `test.projects` veya dosya başına `// @vitest-environment jsdom` yorumu kullanılır (uygulayıcı seçer, raporlar) |
Ruling: AppScreen sayısı 33 (CR-TAN, CR-REH); YONETIM profili CR-TAN/CR-REH için V,O,D; R-ITT V — maliyet: yok.
Ruling: Role.setActive yok; rol silme yalnız kullanıcısı yoksa (CONFLICT aksi halde) — maliyet: yok.
Ruling: jsdom ortamı dosya başına `@vitest-environment` yorumuyla — maliyet: yok.

## İlerleme
Task 1: dispatched (BASE e97dad6, implementer sonnet)
Ruling (kullanıcı isteği 14:32): Ek görev "K1 telif bandı + filigran" T1 ile paralel dispatch edildi (sonnet); dosya kümeleri ayrık (Taskbar/Desktop/theme.css/types/prefsSchema/ControlPanel ↔ T1 crud/ui/screens/seed). Çakışma olursa K1 rebase eder — maliyet: düşük.
Task 1: implementer DONE_WITH_CONCERNS (commit 1f1618c). Not: controlPanelPrefs 2 fail K1'in uncommitted DEFAULT_APPEARANCE değişikliğinden (K1 kapatır). Kabul: listQuery.ts client-safe ayrımı; --xp-body başlık.
Task 1: Ruling (güvenlik taraması): withAdminTx hotelId verilmediğinde (sistem kapsamı) ctx.user.roleKind==='SISTEM' zorunlu; aksi YETKISIZ_DENEME audit + FORBIDDEN (settings ile aynı desen) → fix round 1 — maliyet: otel kapsamlı tüm yazmalar hotelId geçmek zorunda (zaten plan böyle).
Task 1: review (sonnet) Approved, 0 Important. fix round 1 = güvenlik kararı (withAdminTx sistem kapsamı SISTEM) + minör: sıralanabilir başlık klavye erişimi (ruled in).
Task 1: minor (deferred): aria-rowcount başlık satırı; FormDialog FormData çoklu değer; useLiveList testleri (stale drop, page step-back, hotelId filtre); DataGrid yorumu; crud.ts server-only guard
Task 1: fix round 1 DONE (d4a6b71). Not: paralel test koşuları test DB'de çakışıyor → bundan sonra tek uygulayıcı.
Task 1: fix round 1/5 (2 addressed; re-review N1: başlık tıklaması odağı gridden alıyor → ok tuşları çalışmaz). Ruling: N1 tek satırlık düzeltme (header onClick → gridRef.focus()) + stale yorum Task 2 dispatch'ine ek — maliyet: yok.
Task 1: complete (commits eaa7f6e..d4a6b71, review clean)
K1: implementer DONE (19061a5). Task 2: dispatched (BASE 19061a5, sonnet)
K1: review (sonnet) Needs fixes — 1 Important: safe-area inset store matematiğinde yok. Ruling: FooterBand kendi yüksekliğini ResizeObserver ile ölçüp store'a verir (setFooterHeight); minör #1 (başlık 48px taban) ruled in → fix round 1 (T2 ile paralel; farklı dosyalar). Deferred: ozel renkte filigran okunurluğu; zeytin/gumus footer tokenları; bant kapalıyken safe-area; color input testi; test state leak; uzun satır; ikon klamp kalıcı.
K1: fix round 1 DONE (3f743ef); tam check T2 kapanışında doğrulanacak (T2'nin yarım dosyaları tsc'yi kırıyor).
K1: complete (commits 19061a5..3f743ef, re-review clean). Deferred: ölçüm/observer bileşen testi; gerçek cihazda safe-area doğrulaması.
Task 2: implementer DONE_WITH_CONCERNS (c8248a7). Task 3: dispatched (BASE c8248a7, sonnet)
Task 2: review (sonnet) Approved, 0 Important. complete (commits 3f743ef..c8248a7).
Task 2: minor (deferred): audit before/after içerikleri test edilmiyor; hotel update DB'den okunmuyor; copyFromHotel yarış P2002 map'siz; roomType silme RoomTypeSetup cascade'ini audit'e yazmıyor; HotelPanel key=JSON remount; placeholder Türkçe ek; V-only kullanıcıya Yeni/Sil gizlenmeli (Task 12'de ortak kural: yetkiye göre düğme gizleme)
Ruling (kullanıcı 15:17): minibarlatest görselleri alındı → merit/public/brand (logo, thumb), merit/public/icons/legacy (192/512/apple 180); otel bazlı logolar DB'deki base64'ten P2 göçünde Hotel.logoUrl'e dosya olarak çıkarılacak. Task 4 dispatch'ine ek: manifest/apple-touch-icon ve /giris başlığı Merit Royal logosunu kullanır. MyBar misafir arayüzü (P4) canlıdaki templates/misafir_dolum_talebi.html konseptiyle birebir (referans kopyası docs/referans-misafir_dolum_talebi.html).
Task 3: implementer DONE (27020f4). Kabul: bulkPreview ek servisi; fieldErrors.conflicts; export V yetkisi; RoomsPanel adı. Task 4: dispatched (BASE 27020f4, sonnet)
Task 3: review (sonnet) Approved, 0 Important. complete (commits 8df895d..27020f4).
Task 3: minor (deferred): doğrulama yetkiden önce (tüm admin servisleri için Task 12'de sıra değişimi değerlendirilir); setActive existence leak (kabul); bulkCreate P2003 ham; P2002 fallback testsiz; bulk publish id=floorId
Task 4: implementer DONE (c8befe1). Ruling: OutletTable.qrToken nullable (migration 0004) kabul — P5 token üretir.
Task 4: review APPROVED (Sonnet, c8befe1). 0 Critical / 0 Important / 5 Minor deferred to T12: (1) outlets.ts conflictFromPrisma mesajı eager hesaplanıyor → lazy; (2) ODA_SERVISI P2002 yarışı birim testi yok; (3) patchById/tables hotel lookup assertCan'den önce → NOT_FOUND/FORBIDDEN farkı (id varlığı sızıntısı, düşük risk); (4) tables.bulkPreview ölü kod; bulkCreate publish id=outletId; (5) modül OFF confirm danger:false → danger:true düşünülmeli.
Task 5: dispatched (Sonnet).
Task 5: implementer DONE (59338ec). Ruling: seed'de CR-KUL yalnız R-SYS/R-ITT → YONETIM (R-OTM) için CR-KUL V,O,D satırı Task 6 seed/yetki matrisinde eklenecek (brief YONETIM'in kapsamındaki kullanıcıları yönetmesini öngörüyor). Ek kurallar kabul: kendini pasife alamaz; kapsam dışı otele bağlı kullanıcı YONETIM'e salt okunur; pasif/otel dışı kullanıcı ekibe eklenemez. supervisorId UI'da yok → T12 minör.
Task 5: review APPROVED (Sonnet, 59338ec). 0 Critical / 0 Important / 5 Minor deferred to T12: (1) setPassword kendi hesabı → kendi oturumu kapanır; test/dokümante veya mevcut oturumu hariç tut; (2) conflictFromPrisma USERNAME_TAKEN tüm FK hatalarını eşliyor, update'te ön kontrol yok; (3) setPassword bcrypt yetki kontrolünden önce; (4) update kapsam atlatma birim testi yok; (5) kullanıcı kendi rol/otelini update ile değiştirebilir.
Task 6: dispatched (Sonnet).
Task 5: güvenlik taraması 2 HIGH (rol hiyerarşisi). Ruling: YONETIM yalnız SISTEM/YONETIM dışı rol atar; SISTEM/YONETIM hedefleri yönetemez (kendi şifresi hariç); kendi rol/otelini değiştiremez. Fix round 1 dispatched (Sonnet). Task 6 bu düzeltme bitince başlar (test DB paylaşımı).
Task 5: fix round 1 DONE (ee8eef7, 395 tests). Re-review (Haiku) dispatched; Task 6 dispatched (Sonnet).
Task 5: re-review (Haiku) APPROVED — 5/5 FIXED. Yeni minörler T12'ye: options() YONETIM'e müdür rolü gösteriyor (filtrele); create'te hash yetkiden önce; YETKISIZ_DENEME testi global count; non-self update roleId sabit + otel ekleme testi yok. Task 5 CLOSED.
Task 6: implementer DONE (815a61f; 412 tests, e2e 11/11). İNCELENMEDİ — sıradaki adım: review-package ed2e983..815a61f → Sonnet inceleme. Sapmalar kabul adayı: R-SYS yetkileri kilitli (self-lockout önlemi); copyFromRole/roles.options eklendi; tümü-false satır silinir (explicit deny yok → T12). TDD strict RED-first değildi (not).
Task 6: doğrulama (ikinci oturum, commit yok). Birim admin-roles+seed+admin-users 43 geçti; eslint ve tsc temiz. Tarayıcıda uçtan uca akış doğrulanamadı: 3001 ayakta, gömülü tarayıcı giriş formunu hydrate etmedi (düğme disabled, form action SSR stub). e2e yeniden koşulmadı (dev DB'yi sıfırlar, 3001 demo). Uncommitted: admin-users.test.ts yorum satırı (eski "seed CR-KUL vermez" artık yanlış) + ilerleme-data.js T6 done. Sıradaki kalem: T6 incelemesi.
Task 6: review (Sonnet, ed2e983..815a61f, paket `.superpowers/sdd/2026-10-31-p1-cekirdek/review-ed2e983..815a61f.diff`) APPROVED. 0 Critical. Spec ✅. ⚠️ çözüldü: (1) `can()` otel satırını sistem satırından önce seçer (`rbac.ts` `pick`); (2) `screensByHotel` sunucu sayfasında `visibleScreens` ile dolar, `ShellClient` izin olayında `router.refresh()`; (3) çalışma ağacında yarım T6 kodu yok.
Ruling: "tümü false → satır silinir" brief'in bağlayıcı kuralı; explicit deny yok. Otel kapsamında devralınan satırın bütün bayrakları kapanınca satır yazılmaz ve devralınan değer geri gelir (sessiz no-op). Bu P1 modeli, düzeltme turu yok. T12: ya açık reddet satırı ya da UI'da "otel kapsamında tamamen kapatılamaz" uyarısı. Maliyet: bir otelde ekranı sistem satırı dururken tamamen kapatmak mümkün değil.
Task 6: minor (deferred to T12): (1) rol/kapsam değişince matris `data` temizlenmiyor, eski bayrak yeni role yazılabilir; (2) kendi kendinden kopya VALIDATION olmalı, YETKISIZ_DENEME değil; (3) seed/roles.ts CR-KUL yorumu yetim; (4) setTick + SSE ile matris iki kez çekiliyor; (5) matris/modül anahtarı onaysız kaydoluyor; (6) e2e mudur.mr testi önceki testin R-TST satırına bağlı; (7) hotelId null iken findFirst+create yarışı.
Task 6: complete (commit 815a61f, review clean; Important plan-mandated T12'ye ertelendi). Sıradaki: T7.
Ruling (bu oturum): kullanıcı commit/push yasakladı. T7 çalışma ağacında kalır, commit Erkan isteyince. Maliyet: dal HEAD T6'da kalır, yarım iş git status'ta görünür.
Task 7: dispatched (BASE 3361ae0, Sonnet). Commit yok. Brief: task-7-brief.md.
Task 7: implementer DONE_WITH_CONCERNS (commit yok; çalışma ağacı). Birim setupGuide 15/15; npm run check 427 geçti. e2e spec yazıldı, koşulmadı (demo DB). TDD strict RED değildi (not).
Ruling: otel-bilgi `done` = ad dolu; adres yalnız `count`. Brief "%≈11 yalnız otel-bilgi" seed adresleri boşken adres kapısıyla tutmaz. Adresin done kapısı olması T12. Maliyet: adresi boş otel bu adımda tamam görünür.
Ruling: `masalar` ve `ekipler` sipariş outletlerinin toplamında ≥1. Outlet başına değil. Maliyet: iki outletten biri masasız olsa adım tamam görünebilir.
Task 7: review (Sonnet, review-t7-worktree.diff) APPROVED. 0 Critical / 0 Important. Spec ✅. Minor T12: (1) Aç düğmesi CR-TAN yoksa sessiz; (2) kullanicilar count kat+garson toplamı; (3) masalar/ekipler toplam ≥1 (yukarıdaki ruling); (4) summary her definition.changed'de tüm otelleri yeniden sayar; (5) setTimeout(0) ilk yükleme.
Task 7: complete (commit yok — oturum yasağı; dosyalar çalışma ağacında). Tarayıcı: 3001 ayakta, giriş düğmesi doldurulunca da disabled kaldı (önceki oturumla aynı); T7 arayüzü doğrulanamadı. Sıradaki: T8.
Task 8: dispatched (BASE 3361ae0, bu oturum). Commit yok.
Task 8: implementer DONE (commit yok; çalışma ağacı). Birim onlineUsers 5/5; npm run check 432 geçti. e2e spec yazıldı, koşulmadı (demo DB). TDD strict RED değildi (not).
Ruling: CR-ONL onay (A) otel müdürü rollerine verilir (R-OTM/R-FBM). R-SYS zaten TAM profilinden A taşır. R-ITT yalnız V,R. Mevcut veritabanında seed izin satırını yeniden yazmaz; `seedPermissions` CR-ONL için YONETIM `canApprove` bayrağını günceller. Maliyet: demo DB'de müdür zorla çıkışı `npm run db:seed` sonrası.
Ruling: `/kat` P3 kat kabuğuna kadar yalnız SSE tutucusudur (`session.closed` → /giris). Maliyet: kat planı bu sayfada yok.
Task 8: review (bu oturum) APPROVED. 0 Critical / 0 Important. Spec ✅. Minor T12: (1) outlet filtresi serviste var, pencerede yok; (2) endIdle seç-sonra-kapat (süpürücü ile aynı yarış); (3) ilk yükleme setTimeout(0).
Task 8: complete (commit yok — oturum yasağı; dosyalar çalışma ağacında). Tarayıcı: 3001 ayakta, giriş düğmesi `hydrated` false (disabled); T8 arayüzü doğrulanamadı. Sıradaki: T9.
Task 9: dispatched (BASE 3361ae0, bu oturum). Commit yok.
Task 9: implementer DONE (commit yok; çalışma ağacı). Birim auditLog 5/5; npm run check 437 geçti. e2e spec yazıldı, koşulmadı (demo DB). TDD strict RED değildi (not).
Ruling: `audit.created` çağıranın transaction'ı içinde yayınlanır (NOTIFY commit'te gider, rollback'te düşer). Alıcı yalnız `roleKinds: ["SISTEM"]`. Payload'da before/after yok.
Ruling: YONETIM, `ctx.hotelIds` otellerinin satırlarını ve `hotelId` null olup kullanıcısı bu otellere bağlı, rolü SISTEM olmayan satırları görür. Seed'de CR-DEN için YONETIM `V,R` (R-SYS zaten TAM). Mevcut demo DB'de müdür satırı `npm run db:seed` ile gelir (tablo silmez).
Task 9: review (bu oturum) APPROVED. 0 Critical / 0 Important. Spec ✅. Minor T12: (1) rozet son 20 içindeki okunmamış (mobil kancayla aynı); (2) tarih filtresi tarayıcı yerel saati; (3) filtre tuş vuruşu hemen ister; (4) ilk yükleme setTimeout(0); (5) CSV düğmesi R yoksa gizlenmez, hata bandı gösterir.
Task 9: complete (commit yok — oturum yasağı; dosyalar çalışma ağacında). Tarayıcı: 3001 dinlemiyordu, sunucu başlatılmadı. Sıradaki: T10.
Kontrolör (Fable) 18:25: çalışma ağacında npm run check yeşil (437). T7–T9 e2e doğrulama + commit Sonnet'e verildi.
T7–T9 committed (bcaaa49, 73c21c7, ef696f4); e2e 35/35 after auditLog test-only fix (exact label). /kat yer tutucu ef696f4'te. Task 10: dispatched (Sonnet).
Güvenlik taraması (73c21c7, onlineUsers.ts) MEDIUM: forceLogout/endIdle rol hiyerarşisi yok. Ruling: T5 ile aynı hiyerarşi — SISTEM dışı çağıran SISTEM/YONETIM oturumlarını (kendi hariç) kapatamaz; list() müdürlere SISTEM oturumlarını göstermez; endIdle where'e kind notIn. Fix round T10 bitince (test DB sırası).
Task 10: implementer DONE (d098a00; 451 tests, e2e 22/22). Sapmalar kabul: ayar.mr e2e kullanıcısı (R-FBM CR-SYS MR); cache per-request. Review (Sonnet) + T8 güvenlik fix round (Sonnet) dispatched.
Güvenlik taraması (d098a00 settingsAdmin.set) MEDIUM: yanlış pozitif — withAdminTx (crud.ts:43) hotelId undefined iken SISTEM dışı rolü YETKISIZ_DENEME audit ile reddeder; settingsAdmin.test.ts:161 bunu doğrular. Değişiklik yok.
Task 10: review APPROVED (Sonnet, d098a00). 0 Critical / 0 Important. Minor T12: (1) parseWrite assertCan'den önce (VALIDATION vs FORBIDDEN); (2) set, lib/settings setSetting'i sarmıyor (çift mantık); (3) testler SETTING_META'yı mutasyonla test ediyor, publish tx argümanı assert edilmiyor; (4) UI secret boşaltılamıyor, kaydedilen secret inputta kalıyor; (5) META.type ile zod tipi eşleşme testi yok. Task 10 CLOSED (T8 fix bekleniyor, sonra T11).
Task 8: fix round 1 DONE (e183229, 456 tests). Haiku re-review + Task 11 (Sonnet) dispatched.
Task 8: re-review (Haiku) NEEDS FIXES — 1,2,4 FIXED; 3 PARTIAL: list() sayaçları (online/warned/autoLogoutToday/total) SISTEM oturumlarını süzmüyor (sızıntı). Eksik testler: YONETIM yolunda audit, SISTEM çağıran forceLogout/endIdle pozitif, counts. Fix round 2 T11 bitince (test DB sırası).
Task 11: implementer DONE (8a40c4d; 483 tests, e2e 30/30). Not: realtime.resync'i tüketen yok → useLiveList'in resync'te yeniden çekmesi T12'ye. Review (Sonnet) + T8 fix round 2 (Sonnet) dispatched.
Task 11: review APPROVED (Sonnet, 8a40c4d). 0 Critical / 0 Important. Minor T12: (1) login closeForeignCookieSession try/catch yok (DB hatası geçerli girişi düşürür), audit eski kullanıcıya yazılıyor; (2) seed 214 sabiti; (3) sseStore ilk bağlantı başarısızsa fazladan bir resync; (4) appFrameUrl mevcut query'yi yeniden kodluyor; (5) realtime.resync tüketicisi yok (useLiveList refetch). Task 11 CLOSED.
Task 8: fix round 2 DONE (0ebaf41, 486 tests). Ruling: dar düzeltme; ayrı Haiku yeniden incelemesi yerine dal sonu Opus incelemesi kapsar. Task 8 CLOSED. Task 12: dispatched (Sonnet) — minör listesi task-12-minors.md.
Task 12: implementer DONE (0d010e0, b81b947; 497 tests, e2e 65/65). Bulunan gerçek hata: UserForm varsayılan otel/rol (düzeltildi). Atlanan minörler raporda. Concern: rol kopyasında defaultScreen taşınmıyor; seed otel adlarını sıfırlıyor (belgelendi). P1 tüm görevler tamam → dal sonu incelemesi (Opus) dispatched.
Branch review (Opus, e97dad6..b81b947): 0 Critical / 2 Important / Minor. Needs fix wave. Important: (1) session.changed SISTEM oturumlarını YONETIM'e yayınlıyor → roleKinds ["SISTEM"]; (2) members assign/remove/setActive/candidates YONETIM hiyerarşisini atlıyor. Ruling: fix wave = Important 1–2 + ucuz minörler (P2002-only hata eşleme users/members; sistem kapsamı audit hotelId null/scope SYSTEM; sweeper kapalı sayımı; login singleDevice=false stale cookie). P2 backlog: SSE kapsamı yetki değişince eskiyor (users.update rol/otel değişiminde session.closed yayınla); otel pasife alma kilidi (hotels.create P2'de); seed CR-ONL canApprove belgele; definitionChain test adı.
Final fix wave DONE (3a322e6; 507 tests, e2e 24/24). Haiku re-review dispatched.
Fix wave re-review (Haiku): 1,2,3,5,6 FIXED; 4 PARTIAL — roles.ts:120,262,302,325 hâlâ ctx.session.hotelId. Fix round 2 dispatched (Sonnet). Low: users.ts deny hotelId SISTEM hedefte (P2 backlog).
Fix round 2 DONE (ed81bec, 508 tests). P1 CLOSED pending final verification run (check + build + full e2e + migrate diff) and user merge decision.
