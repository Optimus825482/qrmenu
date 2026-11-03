# Görev 13 raporu: Günlük kontrol listeleri ve "Kullanıcıya göster"

Ajan: ux13 (DB `merit_test_ux13` / `merit_ux13_e2e`, port 3023, `.next-ux13`).

## Yapılanlar
- `src/modules/core/server/routines.ts`: `getRoutines(ctx, now)`, `evaluateAuto(kind, ctx, now)` (altı otomatik tür), `RoutineItemStatus` (+ isteğe bağlı `kind`). Gün anahtarı `businessDate()` (Europe/Nicosia); elle işaretler `prefs.guide.checklist[bugün]`, gün değişince okunmaz. Madde, `visibleScreens` içinde olmayan ekrana (ya da rota sahibi/koruyucu ekrana) bağlıysa atılır. `hours` içindeki rutin `expanded`.
- `src/modules/core/routineEvents.ts` (istemci güvenli): `ROUTINE_REFRESH_EVENTS`, `ROUTINE_POLL_MS`. Gerçek olay adı `mybar.seen` (özetteki `mybar.acknowledged` değil). `realtime-events.ts` değişmedi: eksik olay tipi yoktu.
- `src/modules/core/server/routineActions.ts`: `getRoutinesAction` (kartın yenilemesi).
- `src/components/guide/RoutineCard.tsx`: katlanabilir `<details>`, "3/6" ilerleme, otomatik maddeler salt okunur ("otomatik"), elle maddeler iyimser `toggleChecklistAction`, SSE + 60 sn yenileme, hedefler 44 px, SVG `Icon`.
- Yerleşim: kat Bugün (`/kat/tavsiye-is-plani`), `/depo` (sunucudan başlangıç verisi), `/kasa` Masalar sekmesi (`KasaClient`), `/kds` (`KdsClient`), `/garson` Kuyruk sekmesi (`GarsonClient`). `garson/page.tsx` ux10 tarafından değiştirildiği için dokunulmadı; kart istemci bileşeninde.
- `src/modules/core/server/actions/accessPreview.ts`: `previewAccessAction` ve `previewRoleAccessAction` (`assertCan CR-KUL V`, hedef kullanıcı o otelde değilse `NOT_FOUND`, dönen yalnız `{summary, nav}`, tek transaction'da `YETKI_ONIZLEME` denetimi, oturum/çerez değişmez).
- `src/shell/apps/AccessPreviewDialog.tsx` (XP diyalog + paylaşılan `AccessPreviewView`), `UsersPanel` ("Kullanıcıya göster": sağ tık menüsü + araç çubuğu), `PermissionMatrixPanel` ("Açılış ve yetkiler" / "Bu rol ne görür?" sekmeleri; otel seçici `userOptionsAction`).
- Testler: `tests/unit/routines.test.ts` (6 otomatik tür true/false, gün değişimi 00:01 Nicosia, yetkisiz madde, R-KAS iki rutin ve saat, rastgele ekran alt kümesi özelliği), `tests/unit/access-preview.test.ts` (derin eşitlik, UserSession değişmez, tek denetim satırı, sır taraması, R-KAT FORBIDDEN, başka otel NOT_FOUND, rol önizlemesi), `tests/e2e/guide.spec.ts` (4 yeni senaryo).

## Doğrulama
- vitest (hedefli): 2 dosya, 16 test geçti.
- `tsc --noEmit`: benim dosyalarımda hata yok (kalan hatalar başka ajanın `radar-motion-*` testlerinden).
- eslint: dokunulan tüm dosyalarda temiz.
- `NEXT_DIST_DIR=.next-ux13 npx next build`: başarılı.
- `guide.spec.ts` (+ aynı desenle eşleşen `setupGuide.spec.ts`): 10/10 geçti; `opsScreens.spec.ts` (kasa/KDS regresyon): 3/3 geçti.

## Kontrolöre (ux10 dosyaları: ben dokunmadım)
- Matris/çıpa: yeni rota yok; `ROUTE_MATRIX` değişikliği gerekmez.
- `uxRatchet.json`: yeni dosyalarda bilinen ihlal yok (token, SVG `Icon`, emoji yok). Çıpa taraması `src/components/guide/RoutineCard.tsx` ve `src/shell/apps/AccessPreviewDialog.tsx` için ek satır istiyorsa: sıfır ihlal ile eklenebilir.
- POS kabuğu: KDS ve Kasa'da kart sayfa akışının üstüne girer (KDS'te başlığın altında, Kasa'da KPI satırının altında); ux10 ekran yüksekliği/kiosk düzeninde gerekirse `[data-testid="routine-cards"]` kapsayıcısını gizleyebilir veya katlı bırakabilir (`details` varsayılan: saat dışı kapalı).

## Notlar
- `tasksDone`: bugün görev kalemi varsa ve bekleyen (BEKLIYOR/DEVAM) yoksa true; görev hiç yoksa false.
- `printerOk`: outlet varsayılan yazıcısı (outlet yoksa otelin tüm aktif yazıcıları) `lastStatus==="OK"` ve son sinyal ≤ 90 sn (kasa panosuyla aynı kural).
- `mybarAllSeen`: `BEKLEMEDE` ve `seenAt` boş talep sayısı 0 (mevcut `unseen` sayacıyla aynı).
