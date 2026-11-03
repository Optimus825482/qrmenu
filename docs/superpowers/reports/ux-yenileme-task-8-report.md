# Görev 8 raporu: Personel kabuğu (StaffShell), gezinme modeli, depo ana sayfası (P-UX-5)

Ajan: `ux8` · dal `ux/yenileme` · DB: `merit_test_ux8`, `merit_ux8_e2e` · port 3018 · dist `.next-ux8`

(Sonuç sayıları ve commit karması aşağıda "Doğrulama" bölümünde doldurulur.)

## Yapılan

- `src/components/staff/navModel.ts`: `buildNav(roleCode, visible, { canCreate?, pathname? })`. R-KAT: Bugün · Katlar · QR Okut (ortada, `emphasis:"qr"`) · İşlemlerim · Daha; garson rolleri: Kuyruk · Masalarım · Çağrılar · Daha (+ FAB "Yeni adisyon", yalnız `QS-KUY` görünür ve `canCreate`); oda servisi: Talepler · Teyit · Teslim · Daha; R-DEP/R-HKS: Havuz · Talepler · Raporlar · Daha. Her öğe hem sayfa koruma ekranıyla (`screen`) hem `screenForPath(href)` sahibiyle `visible` içinde olmak zorunda. Rolü sabit olmayan kullanıcılar (R-FBM) `pathname` ile aile seçer (`/oda-servisi` -> oda servisi, `/garson` -> garson). `primary` 2-5 öğe (Daha dahil); tek öğe varsa Daha eklenir, hiç ekran yoksa boş model.
- Bileşenler: `StaffShell`, `StaffTopBar` (56 px), `StaffNav` (tek `<nav aria-label="Ana gezinme">`, 80 px; `layout="rail"` ve >= 1024 px'te 80 px sol ray; "Daha" alt sayfası), `ProfileMenu` (Outlet/otel değiştir, Şifre değiştir, Çıkış; avatar -> Çıkış 2 dokunuş; `extraItems` ile T11/T12 girişi), `ConnectionBadge` (renk + kenar biçimi + ikon + metin), `SessionBanner`, `InstallPrompt`, `StaffBell`, `useOnline` (+ `guardMutations`, `installOfflineGuard`), `clearUserLocalState`, `loadStaffShellProps` ve `requireStaffLayout` (`loadShellProps.ts`), `staff.css` (yalnız `globals.css` belirteçleri).
- `Segmented` (`src/components/ui/Segmented.tsx`): `role="tablist"`/`tab`, ok tuşları, 48 px.
- Bağlama: `kat/layout.tsx`, yeni `depo/layout.tsx`, `(ops)/layout.tsx` ortak `loadStaffShellProps`'u kullanır; `OpsShell.tsx` yalnız yola göre PosShell/StaffShell seçen sarmalayıcı (props'a `staff` eklendi). XP penceresi içine gömülen sayfalar (`?font=&theme=`, ör. `/depo/tanimlar`) kabuksuz çizilir.
- `GET /api/session/status` -> `{ expiresAt, now }` (no-store, 401 oturumsuz). `SessionBanner` 60 sn'de bir, yalnız görünürken yoklar; sunucu saati farkı düzeltilir.
- `/depo` ana sayfası: Kritik stok (MB-ZIM), Bekleyen talepler (MB-TAL: düzeltme + ek talep), Doluluk yükleme (MB-DOL, bugünkü durum), Raporlar (MB-RAP); yetkisiz kart çizilmez. `depo/stok` "Geri" -> `/depo`; sayfa belirteçlere ve `Segmented` sekmelere çevrildi, mutasyon düğmeleri `mutates`.
- `Button`'a `mutates` prop'u (`data-mutates`); garson/oda servisi/depo yazma düğmeleri işaretli. Çevrimdışıyken `[data-mutates]` `aria-disabled` + tıklama/submit yutulur; üstte "Bağlantı yok — işlemler gönderilemez" + "Son güncelleme HH:mm".
- `LogoutButton` istemci bileşeni oldu: gönderimden önce `clearUserLocalState()` (`merit.u.*` + `sessionStorage`; `merit.device` kalır); `label`/`menuitem` seçenekleri.
- Garson: sekmeler `Segmented`; "Yeni adisyon" FAB'ı `?yeni=1` ile masa seçtirir; oda servisi: sayfa içi ikinci sekme çubuğu kaldırıldı (alt gezinme + Daha > Geçmiş); `CallsClient` `Button`'a çevrildi. 9-12 px metin ve ham palet 0.
- Test/ratchet: `nav-model.test.ts` (rol başına 50 rastgele küme dahil), `online.test.ts`, `staffShell.spec.ts` (8 test); `uxRatchet.json`'dan `GarsonClient`, `OdaServisiClient`, `depo/stok` girdileri silindi; `knownViolations.ts`'den `depo-stok`, `garson`, `garson-cagrilar`, `oda-servisi` çıkarıldı; matrise `depo-pano` ve `garson-masalar` eklendi.

## Sapmalar ve kararlar

1. `NotificationBell` yerine `StaffBell`: XP bileşeni `theme.css` değişkenlerine ve 22 px düğmeye bağlı (personel sayfalarında `theme.css` yüklü değil, 44 px hedef sağlanamıyor). Aynı veri kancası (`useNotifications`) ve aynı SSE olayı kullanılıyor; görünüm belirteçli bir alt sayfa.
2. "Şifre değiştir": kendi şifresini değiştirme sayfası/aksiyonu yok (`/sifre-degistir` yalnız zorunlu değişim çerezi için). Menü girişi bilgi veren bir `ConfirmSheet` açar ("yöneticinden yeni geçici şifre iste"). Gerçek akış ayrı bir iş.
3. `tests/e2e/opsUi.ts` (ux7'nin spec'inin yardımcısı) tek satır: `serveOrder` artık `getByRole("tab", { name: "Masalarım" })` tıklar (garson sekmeleri `tablist` oldu, etiket "Outlet Masaları" -> "Masalarım").
4. Üst çubuktaki ekran adı `<h1>` değil (sayfaların kendi `<h1>`i var, çift başlık olmasın).
5. `Daha` alt sayfası bağlantıları düz `<a>`: tam sayfa gezinme, kabuk (özellikle `(ops)` içinde rolün ailesi değişince) yeni bağlamla kurulur.
6. Bağlam (otel/outlet) değiştirince `window.location.assign(next)`: layout RSC önbelleği eskimesin.

## Devir notları

- T9/T10 (kat sayfaları): `/kat/**` artık `StaffShell` içinde; sayfalar kendi üst çubuğunu/gezinmesini çizmemeli (varsa kaldırılır). Sayfa başlığı kabuktan gelir (`titleFor`: nav etiketi, yoksa `screenForPath().name`). Kat sayfalarında yazma düğmelerine `Button mutates` ya da `data-mutates` ekleyin. Sabit alt eylem çubuğu gerekiyorsa gezinmenin üstüne (`bottom: calc(80px + ...)`) oturtun; FAB örneği `.staff-fab`. T10: `resolveShell`/manifest bağlanırken `metadata.manifest` ayrı; bu görev dokunmadı. Personel manifesti `/api/manifest/garson`'da kaldı.
- T11/T12 (Erişimim, Yardım): `StaffShellProps.profileExtras?: ProfileExtra[]` (`{ id, label, icon, href? | onSelect? }`). `loadStaffShellProps` bu alanı doldurmaz; ilgili layout/yükleyici ekler. `erisimim/layout.tsx` henüz `StaffShell` kullanmıyor (görev "ileride" diyor); `loadStaffShellProps(ctx, "/erisimim")` hazır (başlık için `FALLBACK_TITLES`'ta "Erişimim" var).
- Gözlem (T2/T10): oturum içi hedef (otel) değişince `selectTargetAction` mevcut sayfayı yeni çerezle yeniden çizdirir; mevcut sayfa yeni otelde yetkisizse (ör. `/depo/stok` ve `MB-ZIM` yok) kısa süre `/yetkisiz` görünür, sonra `/baslat` düzgün iniş yapar. Kullanıcıyı şaşırtmaması için `ProfileMenu` geçiş sırasında bekleme durumu gösterebilir (yapılmadı).
- Kat sayfaları `uxRatchet.json`: `kat/oda-kontrol` (109 < 117) ve `kat/qr` (18 < 22) sayaçları başka ajanların çalışmasıyla küçüldü; kayıtları ilgili ajan düşürmeli (bu görevde dokunulmadı).

## Doğrulama

(Aşağıda doldurulur.)
