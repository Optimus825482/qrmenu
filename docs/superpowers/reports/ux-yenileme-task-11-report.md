# UX Görev 11 raporu — screenGuide, accessSummary, Erişimim

Ajan: ux11 (DB `merit_test_ux11` / `merit_ux11_e2e`, port 3031, `.next-ux11`).

## Yapılanlar
- `src/modules/core/screenGuide.ts`: 33 ekranın tamamı için rehber taslağı (amaç, 3–4 adım, sık hatalar, ekrana özel eylem cümleleri, ilgili ayarlar), 6 rutin, `GENERIC_ACTION_TEXT`, `guideFor`. Katalog 33 ekrandır (brief "34→33").
- `src/lib/rbac.ts`: `actionsByScreen(roleId, hotelId)`.
- `src/modules/core/server/accessSummary.ts`: `accessSummary`, `accessHash` (sha256 ilk 12 hex; ekran+eylem kümesinden). `landing.ts`'e saf `pickLanding` çıkarıldı (resolveLanding bunu kullanır).
- `src/lib/userPrefs.ts` (`readUserPrefs`, atomik `mergeUserPrefs`), `server/guidePrefs.ts` (şema, `FOR UPDATE` ile serileştirilmiş yazım, 7 gün budama, `welcomeMatches`), `server/guideActions.ts` (`acknowledgeWelcomeAction` — denetim `WELCOME_ACK`, `markGuideSeenAction`, `toggleChecklistAction`, `myAccessAction`), `server/guideState.ts`.
- Arayüz: `src/app/erisimim/{layout,page}.tsx`, `src/components/guide/{AccessSummaryView,WelcomeGate,GuideProvider,AccessWindow,WelcomeOpener}.tsx`; `/baslat` geçidi (iniş `/admin` değilse ve özet onaylanmadıysa `/erisimim?hos-geldin=1`); XP'de `core.erisimim` penceresi (`core/apps.ts`, CR-KOM) ve `ShellClient`/`admin/page.tsx` ile ilk açılışta otomatik açılış.
- `scripts/export-guides.ts` -> `docs/kabul/ux-rehber-metinleri.md` (Erkan onay tablosu üretildi).
- Testler: `tests/unit/{screen-guide,access-summary,guide-prefs}.test.ts` (20 test yeşil), `tests/e2e/guide.spec.ts` (4 test yeşil). `seed-e2e.ts`'e tüm kullanıcılar için `prefs.guide.welcomeSeenHash="*"` satırı.

## Sapmalar / dikkat
1. **Şema değişikliği yok**: kontrolör mesajı `welcomeSeenHash String?` sütunu istiyordu; brief ve plan (Global Constraints: `User.prefs` JSON) `prefs.guide.welcomeSeenHash` diyor. Brief izlendi; migration eklenmedi (başka ajanların kirli `schema.prisma` değişikliğiyle çakışma da önlendi).
2. `"*"` atlaması: e2e sunucusu `next start` (NODE_ENV=production) olduğundan yalnız `NODE_ENV!=="production"` kuralı çalışmazdı; kural: üretim dışı **veya** `DATABASE_URL` veritabanı adı `_e2e`/`_test` ile bitiyor. Birim testli.
3. `R-KAT` özetinde MB-* dışında seed gereği `CR-RAP` de var (rapor merkezi); testte buna göre yazıldı.
4. Rol yetkisi değişimi e2e'de arayüz yerine doğrudan SQL ile yapıldı (karma mantığı aynı).
5. `ProfileMenu` (Görev 8) ve `StartMenu` bağlantısı yapılmadı: ProfileMenu henüz yok; Erişimim XP'de Başlat menüsünde uygulama olarak (GENEL kategori) zaten görünür. `ROUTE_MATRIX`'e `erisimim` eklenmedi (`tests/e2e/matrix/**` UX T1'in) — kontrolör eklemeli. Tur hedefleri (`data-guide`) Görev 12'ye bırakıldı; `GuideProvider`/`useGuide` kancası hazır.
6. UX T3'ün `0d0cc5f` commit'i `ShellClient.tsx`'te `WelcomeOpener` içe aktarımını taşıyordu; bu commit `src/components/guide/**` dosyalarını da içerir, `next build` geçti.

## Doğrulama
- `tsc` temiz; eslint (dokunduğum dosyalar) temiz; `NEXT_DIST_DIR=.next-ux11 npx next build` geçti.
- e2e (kendi sunucum): guide 4/4, login 11/11 (bir koşuda `/cikis` sonrası `/admin` zaman aşımı 1 kez; tek başına yeniden koşunca geçti — flake), landing 17+ yeşil.
- Başkalarının hataları (düzeltilmedi): migration'sız DB'de `tests/unit/schema.test.ts` (`relation "legacy_id_map" does not exist`) ve `radar-normalize.test.ts:90`; geçici `tsc` hataları (`GarsonClient.tsx askReason`, `schema.test.ts legacyArchive/clientRequestId`) sonradan kayboldu.
