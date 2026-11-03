# Task 2 review (7244d05)
Task quality: Needs fixes (one Important: landing not validated against the route's guard screen; seeded roles are fine).
Important: landing.ts:40-51 picks by visibleScreens(code) but /kat?filtre=*, MB-TUK (/kat) route is guarded by MB-KAT (kat/(home)/layout.tsx), /admin by CR-KOM (admin/page.tsx). A fallback or custom matrix with MB-TUK/MB-PERS/MB-DND but no MB-KAT (or CR-* without CR-KOM) lands on /yetkisiz, whose "Ana ekrana dön" returns to /baslat (click loop). Tests only assert hasPage, not route-guard viewability.
Minor: reportAccess.ts writes no audit row (only notification); accepts screens the caller can already view; no dedupe when zero recipients; KatDashboard keeps emoji (Task 5 scope).
Verified OK: ekran param only matched against SCREENS, never used as redirect target; next= is encodeURIComponent'd; migration only UPDATEs; recipients usersEntitledTo(session hotel, R-SYS/R-OTM); advisory lock + refId user:screen:day dedupe; kat links computed server-side via visibleScreens; garson hides calls when no QM-CAG (no permission widening); seed-e2e uses the shared test password, mustChangePassword default false.

## Fix round 1
- `screenPaths.ts`: `ROUTE_GUARDS` + `guardScreenOf()` (tek kaynak: /kat -> MB-KAT, /admin -> CR-KOM, /oda-servisi/teyit|teslim -> RO-TAL; diğerleri kendi ekranı). `landing.ts` `pickLanding` adayları yalnız koruyucu ekranı da görünür olanlarla sınırlar; son çare `/secim`.
- `actions/reportAccess.ts`: yalnız kullanıcının göremediği ekran kabul (aksi VALIDATION "Bu ekranı zaten görüntüleyebilirsiniz"); bildirimle aynı tx'te `YETKI_TALEP` denetim kaydı (`{ screen }`); günlük tekilleştirme korundu.
- Testler: `landing.test.ts` (+4: MB-PERS var/MB-KAT yok -> /kat'a inmez, CR-RAP -> /admin'e inmez, guard haritası), yeni `reportAccess.test.ts` (2). landing.spec.ts 19/19 yeşil (port 3012, merit_ux2_e2e).
- Doğrulama: hedef vitest 19/19; lint 0 hata, typecheck temiz, build temiz; tam vitest 1135/1142 — 7 hata `tests/unit/schema.test.ts` (minibar tamamlama şeması, PrismaClientKnownRequestError; başkasının migrasyonu/ DB'si, bu işle ilgisiz).
- Not: `pickLanding` (başka ajanın accessSummary.ts'i kullanıyor) de artık koruyucuyu denetler.
