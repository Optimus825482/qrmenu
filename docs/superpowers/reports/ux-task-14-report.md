# UX Task 14 raporu: XP cilası ve doğrulama kalıntıları

Dal `ux/yenileme`, ajan `ux14` (DB `merit_test_ux14` / `merit_ux14_e2e`, port 3034, `.next-ux14`). Codex'in yarım bıraktığı çalışma ağacı denetlendi, eksikler tamamlandı.

## Codex işinin denetimi
Yerinde bırakıldı ve kullanıldı: `keyboard.ts` (hook), `appFolders.ts`, `windowStore` (`fitToViewport`, `recentApps`, `xpDensity`, `external` açılışı), `registry` (`registerCatalogApp`, `launchLabel`, `external`), `StartMenu`, `ContextMenu` (mnemonic), `CategoryFolderWindow`, `Toolbar` (`data-xp-command`), üç birim test. Düzeltilenler: `data-density` XP kabuğunda genel `[data-density]` belirteçleriyle çakışıyordu (`data-xp-density` yapıldı); Başlat aramasında klasörler sabitlenenlerde çıkıyordu; arama görünen etiket yerine katalog adıyla eşleşiyordu ("Kullanıcı Yönetimi" araması Ekip Yönetimi'ni açıyordu); `Window.tsx` hiç değişmemişti (menü çubuğu, kısayollar, F10 yoktu); tepsi simgeleri yoktu; `openHelp` her zaman Kurulum Rehberi'ni açıyordu (`data-has-guide` yoktu).

## Yapılanlar
- **Pencere/klavye:** Dosya (Yeni…, Dışa aktar, Kapat), Görünüm (Yenile F5, Yoğunluk Rahat/Sıkı), Yardım; altı çizili harfler, F10 ve tek Alt ile menü çubuğu, ok tuşları, Ctrl+Alt+Sol/Sağ pencere geçişi (`adjacentWindow`, `useShellShortcuts`), Ctrl+S (açık form diyaloğunu gönderir), Del, F2, Ctrl+F, F5 (`data-xp-command` düğmeleri). `--xp-row` 24/22 px.
- **Tepsi:** `TrayStatus.tsx` yazıcı (sunucudan ilk durum + `printer.*` olayları), DB (`/api/health`, 30 sn), bildirim zili `title`; tıklayınca balon. Tepsi düğmeleri 24 px altına düşmüyor.
- **iframe'siz minibar:** `external` kayıtlar yeni sekme; Hakkında iframe başlığı `launchLabel` ile (commandCenter spec'i kırılmıştı).
- **Kalıntılar:** depo panosu (tek `main`, h1 "Depo panosu", `can()` ile kart süzme, sayılar yalnız `depoDashboard`), `oda-kontrol-not` >= 44 px, Günün Özeti tarihi `dd.MM.yyyy` (`formatDayTr`), matrix `kat-qr`, `kat-gorevler`, `radar` (+ sr-only h1), `PENDING_TARGETS` boşaltıldı (radar üç hedef eklendi; rapor adımları gerçek `rapor-filtre/rapor-grup` hedeflerine; `sla-indir` için SLA raporuna CSV indir düğmesi; `yeni-talep` için `/kat/duzeltme-onay`a "Yeni ek talep" bağlantısı), `canliRadar:162` Esc yeniden doğrulandı (düzeltme gerekmedi).
- **T10:** `canUsePos` sunucuda QS-KAS'tan (baslat ve `(ops)` layout), `DeviceSetupPrompt` yalnız dokunmatik >= 600 px, `loadPreferredShell` yalnız /kasa ve /kds, `saveShellPrefs` birleştirir (`prefsStore.ts`, DB testi), `/api/manifest/garson` silindi.
- **T8:** `InstallPrompt` ilk girişte bir kez (`merit.u.installShown`), oda servisi açık talep rozeti, `LogoutButton` formu `role="none"`.
- **T6/T7:** `StaffOrderComposer` ham renkler token, `pos.css` rgb gölge token, KDS `localReady` SSE kaybında temizlenir.
- **Ek:** admin XP dokunma ihlalleri (tepsi/zil 22 px) giderildi, `KNOWN_TOUCH_VIOLATIONS` boşaldı; `RadarRoot` duvar denetleyicisi içerik anahtarlı (anlık görüntü gelince dönüş/duraklama sıfırlanıyordu); `canliRadarWall` fare hareketi iki konumlu; `kat-gorevler` axe kontrastı.
- **Spec güncellemeleri:** `findStartItem` (arama kutusuyla), 10 spec'te satır içi Başlat tıklamaları, "Menü Tasarım Merkezi", `landing` (İşlemlerim gezinmede), `noBrowserDialogs` (Aç tam eşleşme), `shell` (yeni Başlat yapısı), `posKiosk` (dokunmatik taklidi).

## Doğrulama
Bkz. son yanıt (sayılar orada). TDD notu: yeni e2e testleri uygulamadan sonra yazıldı (Codex ve ben önce uyguladık); kırmızı-önce gösterilmedi.

## Bırakılanlar / karar bekleyen
- `landing.spec.ts:78` (`/kat?filtre=dnd`): `KatDashboard` `void filter` ile süzgeci bilerek çizmiyor (T9/P4 tasarımı); ürün kararı gerek.
- `preferredShell` yazan arayüz yok (nereden seçileceği tasarım kararı); yalnız kayıt korunuyor.
- `mybarFlow.spec.ts:26` P4 T10 dosyası, bu görevin değil.
- `ilerleme-data.js` güncellenmedi (satır T14–T15 birleşik, T15 açık).
- `PushToggle` testi için sunucu VAPID anahtarıyla başlatıldı (`.env`'de yok).
