# UX Görev 12 raporu — tur motoru, "?" yardım, F1

Ajan: ux12 (DB `merit_test_ux12` / `merit_ux12_e2e`, port 3022, `.next-ux12`). Rehber metinleri `docs/kabul/ux-rehber-metinleri.md` onayı bekliyor (Erkan); metinler olduğu gibi kullanıldı.

## Yapılanlar
- `src/components/guide/tourModel.ts` (saf mantık): `resolveSteps` (yetkiye göre `requires` süzgeci + DOM'da hedefi olmayan adımı atlama; hiç adım yoksa `[]` -> tur açılmaz, "görüldü" yazılmaz), `shouldAutoStart` (hoş geldin onaylı, sürüm görülmemiş, `?tur=0` değil), `placeCard`, `tourKey`, yerel "görüldü" aynası (`merit.u.guide.seen.<kod>`; çıkışta T8 `clearUserLocalState` siler).
- `CoachMarks.tsx`: %50 karartı + hedef çevresi açık (`box-shadow` kesiti), `role=dialog aria-label="Ekran turu"`, sayaç "2/4", Geri / İleri(Bitir) / Turu kapat, Esc, ok tuşları, odak hapsi ve odak geri dönüşü (`useDialogFocus`), kaydırma/yeniden boyutlanma ile konum, hedef kalkarsa adım atlanır, animasyon yok. Düğme yüksekliği yoğunluk jetonundan (XP 24 / personel 56 / POS 64).
- `useScreenTour.ts`: `start()`, `active`, otomatik başlama (hedefler oturana kadar yoklar, açık modal varken beklemez), tamamlama/kapatma `markGuideSeenAction` + yerel ayna, tek seferde tek tur.
- `HelpSheet.tsx`: amaç, "Burada yapabileceklerin" (yalnız kullanıcının eylemleri), yetkili adımlar, sık hatalar, "Ayarlar" (güncel değerlerle cümle), "Turu tekrar oynat", "Yazdır" (`window.print`, `@media print` yalnız sayfa). XP'de yan panel, personel/POS'ta alt sayfa. İçerik her açılışta sunucudan (`helpActions.ts` -> `helpData.ts`) alınır; ayar değişince metin yenilenir.
- `settingSentences.ts`: `SETTING_SENTENCES` (dnd.minChecks/recheckMinutes, mybar.dailyLimit, stock.defaultCriticalLevel, occupancy.fileRetentionDays, order.callAlertSeconds/approvalEscalationMinutes, price.display/currency, rs.slaMinutes); bilinmeyen anahtar/uygunsuz değer cümlesiz geçer.
- `ScreenGuideHost.tsx`: tur + yardım barındırıcısı; `merit:guide` olayını dinler (`guideEvents.ts`), sayfa düzeyinde F1; ekran kodunu URL'den bulur (`screenForLocation.ts`; `/kat/dnd` -> MB-DND, `?filtre=` ekranları). Veri `loadGuideClientAction` ile gelir (layout'a dokunmamak için `GuideProvider` yerine sunucu eylemi; sağlayıcı doluysa o kullanılır).
- Bağlantılar: `StaffTopBar` (host), `ProfileMenu` ("Yardım" girdisi), `PosStatusBar` ("?" 44 px + host), `Window.tsx` (Yardım menüsü: "Bu pencerede neler yapabilirim? (F1)", "Turu başlat", "Erişimim", "Hakkında"; F1 `preventDefault`; pencere kapsamlı host), `Desktop.tsx` (CR-KOM hostu + `masaustu`), `Taskbar`/`CommandCenter` (`baslat-menusu`, `gosterge`).
- `data-guide` öznitelikleri: 33 ekranın hedeflerinin büyük kısmı (liste için `git diff`); `DataGrid` öznitelik iletmediği için bazı hedefler çevre kapsayıcıdadır; satır düzeyindeki hedefler ilk satıra üçlü ifadeyle bağlıdır. `Toolbar` için isteğe bağlı `newGuide` prop'u eklendi (Yeni düğmesi `yeni-kullanici`).
- `screenGuide.ts`: MB-ZIM'e `requires:["O"]` ile "Havuza giriş" adımı (brief'teki R-KAT/R-DEP ayrımı katalogda yoktu); başka ajanın T13 işi commit'iyle birlikte `50c4542`'ye girmiş. `ux-rehber-metinleri.md` yeniden üretildi (bu adım onay bekliyor).
- Testler: `tests/unit/{coach-marks,setting-sentences}.test.tsx` (14 test), `screen-guide.test.ts` hedef taraması (data-guide / üçlü ifade / `newGuide` okur; bekleyen hedef listesi nedenleriyle; listedeki hedef belirirse test uyarır), `tests/e2e/guide.spec.ts` "ekran turu ve yardım" bölümü (8 test); `seed-e2e.ts` her kullanıcının tüm turlarını "görüldü" yazar (diğer spec'ler overlay görmez); `forgetWelcome` artık yalnız `welcomeSeenHash`'i siler.

## Doğrulama
- Birim: coach-marks + setting-sentences + screen-guide + routines + access-summary: 41/41.
- `tsc`: benim dosyalarımda temiz (kalan hatalar başka ajanın `tests/unit/mybar-guest-request.test.ts` dosyasında). eslint (dokunduğum 59 dosya) temiz. `NEXT_DIST_DIR=.next-ux12 npx next build` geçti.
- e2e (chromium, 3022): guide.spec 8 yeni + 8 mevcut, shell.spec, staffShell.spec: 40 geçti, 1 kaldı: `staffShell.spec.ts:153` ("Depo panosu" başlığı). Bu benim değişikliğimden değil: `/depo` sayfası h1'i "Merit Royal — Depo Yönetim Paneli", "Depo panosu" yalnız üst çubuk yazısı (T13 ile gelen sapma); test güncellenmeli ya da başlık eklenmeli.
- axe: tur kartı ve yardım sayfası (`serious/critical` 0). Yardım gövdesi kaydırılabilir olduğundan `tabindex=0 role=region` verildi (`scrollable-region-focusable`).

## Kontrolöre
1. **Radar (rd13) `data-guide` hedefleri** (`src/modules/radar/ui/**`, dokunmadım): `radar-genel` (Genel görünüm sekmesi/düğmesi), `radar-zaman` (zaman/oynatma kontrolü), `radar-duvar` (Duvar modu düğmesi). Eklenince `tests/unit/screen-guide.test.ts` içindeki `PENDING_TARGETS`'tan üçü silinmeli (test, listede kalan ama kaynakta bulunan hedefi uyarır). `/radar` sayfası `ScreenGuideHost` içermiyor (sayfa `src/app/radar/page.tsx`; ekleme: `<ScreenGuideHost code="CR-RAD" density="xp" f1 />`, rd13 onayıyla).
2. **Hedefi olmayan ekranlar/adımlar** (`PENDING_TARGETS`): QM-RAP ve QS-RAP'ın penceresi yok (raporlar Rapor Merkezi'nde) -> `rapor-donemi`, `rapor-tablo`, `outlet-filtre`; RO-SLA `sla-indir` (dışa aktarma düğmesi yok); MB-TAL `yeni-talep` (talep formu `/kat/talep` rotasında). Rehber metinleri ile arayüz uyumsuzdur: Erkan onayında ya metin düzeltilmeli ya da ekran kataloğu gözden geçirilmeli. Tur bu adımları sessizce atlar.
3. **Matris/ratchet satırı önerileri** (ux10): (a) `?` / Yardım düğmeleri her POS rotasında >= 44 px (`PosStatusBar` `button[aria-label="Yardım"]`); (b) rehber açıkken axe: rotalarda `merit:guide` ile `tour` isteği gönderip `[data-testid="coach-marks"]` ve `[data-testid="help-sheet"]` üzerinde serious/critical 0 (yardım açılışı için profil menüsü "Yardım"/POS "?"); (c) `uxRatchet.json`: yeni hardcoded renk yok (guide.css yalnız jeton; tek ham değer `rgba(0,0,0,.5)` karartı ve gölge).
4. Yeni e2e'lerin varsayımı: seed tüm turları görüldü yazar; tur gerektiren spec'ler `forgetTour` ile kayıt siler.

## T14 / T15 için
- Hedef eklemek: kaynakta `data-guide="ad"` (ya da `data-guide={koşul ? "ad" : undefined}`); `screen-guide.test.ts` her adım hedefini tarar.
- Yeni ekranın rehberi eklenince `Window.tsx` (XP) ve `ScreenGuideHost` (personel/POS) otomatik kullanır; ek kablolama yok. `?tur=0` otomatik turu kapatır (e2e/tanıtım).
- Yeni bir kabuk/yerleşim yaratırsanız `ScreenGuideHost` bağlayıp "Yardım" girişini `requestGuide("help")` ile çağırın.
- Gözlem: XP penceresinde `autoStart` yalnız etkin ve küçültülmemiş pencerede; CR-KOM'a bağlı pencereler kendi turunu açmaz (masaüstü hostu açar).
