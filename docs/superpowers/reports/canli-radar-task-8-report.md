# Radar Task 8 raporu: XP penceresi (çerçeve, Genel Bakış, Kat, Masa)

Ajan `rd8`, dal `ux/yenileme`. DB: `merit_test_rd8`, `merit_rd8_e2e`; port 3048; `NEXT_DIST_DIR=.next-rd8`.

## Yapılanlar

- `core.radar` kaydı (`CR-RAD`, 1280x760, min 1024x640, mobil yok), `XpIcon` `radar`, `Icon` setine `radar`, `play`, `pause`, `rewind` (Lucide kaynaklı, `paths.ts` başlığında lisans notu var).
- `labels.ts` (saf): `orderStatusLabel`, `roomCellModel`, `tableCardModel`, `metricLayer`, `sparkTotals`, `sparkPoints`, `LAYER_LABELS`, `UPLOAD_LABELS`.
- `ui/`: `RadarWindow` (shell kaydı, kapsamdaki otelleri `radarHotelsAction` ile öğrenir), `RadarRoot` (mod, store, dört durum, klavye), `Toolbar`, `MenuBar`, `useRadar` (+ `usePulse`, `useNow`, `useOverview`, `RadarStoreContext`), `radar.css`, `views/{Overview,Floor,Tables}.tsx`.
- Dört durum: iskelet (300 ms'den önce çizilmez), hata + "Tekrar dene", çevrimdışı şerit, boş durumlar ("Bu otelde QR Sipariş kapalı.", "Doluluk yüklenmedi").
- Açılış görünümü: birden çok otelde "Tüm kompleks" + Genel Bakış; tek otelde Kat (Minibar varsa), yoksa Masa, yoksa Genel Bakış.
- Klavye: 1/2/3 görünüm, Alt+1…5 katman, F5 yenile, F1 yardım, Kat ızgarasında ok/Home/End/Enter/Esc.
- Kat görünümü yalnız `RadarState` tüketir; nabız `store.pulses` -> `pulseOnce` (600 ms, `usePulse`).

## Brief dışı küçük eklemeler (kontrolör bilsin)

1. `src/shell/registry.ts` + `windowStore.ts` + `components/Window.tsx`: isteğe bağlı `AppProps.setTitle` ve `windowStore.setTitle(id, title)`. Başlık "Canlı Radar · <Otel adı>" / "Tüm kompleks" bu yolla verilir (`needsHotel:false` olduğundan shell başlığı otelsiz kalıyordu). Yalnız ekleme, mevcut davranış değişmedi.
2. `server/scope.ts` `radarHotels(ctx)` + `server/actions/radar.ts` `radarHotelsAction`: pencere açılışında tüm genel bakış sayaçlarını hesaplatmadan kapsamdaki otelleri öğrenmek için (T5 dosyalarına yalnız ekleme).
3. `tests/e2e/radarUi.ts › expectRadarAxeClean`: UX matris yardımcısı `expectNoSeriousAxe` yalnız matris projelerinde çalışır (`knownFor` proje adından `VIEWPORTS` arar; `chromium`da `"chromium" is not a matrix project` hatası verir). Bu yüzden radar spec'i `@axe-core/playwright`'i doğrudan kullanır (aynı etiketler, serious/critical). `expectNoHorizontalScroll` matris dosyasından olduğu gibi kullanıldı.
4. `openRadar` Başlat menüsünden açar: masaüstünde varsayılan kısayol yok (`useShellPersistence` yalnız komuta + 5 klasör). Masaüstü simgesi istenirse `primaryDesktopApps` + `shortcutVersion` göçü ux8 alanıdır.

## Doğrulama

Bkz. en alttaki sayılar (birim: radar-cells + radar-source-rules; e2e: `canliRadar.spec.ts` 4 geçti, 1 fixme; `npm run check`; `next build`).

## Kontrolöre: matris ve ratchet satırları (ux8)

- `tests/e2e/matrix/*` ve `uxRatchet.json` düzenlenmedi. Radar bir rota değil XP penceresidir; `/radar` rotası hâlâ `/admin`e yönlendirir (T11 tam ekran duvar ekranını bağlayınca matrise `/radar?duvar=1` eklenir).
- `KNOWN_AXE_VIOLATIONS` / `KNOWN_TOUCH_VIOLATIONS` için satır gerekmez: pencere admin masaüstünde axe serious/critical 0 (Genel Bakış, Kat, Masa; 1366x768 ve 1920x1080).
- Dokunma hedefi: XP kademesinde tüm düğmeler `--tap-xp` (24 px) alt sınırında; oda hücresi 46x34.

## Bilinen noktalar / karar bekleyen

- **Çift menü çubuğu:** shell her pencereye genel "Dosya / Görünüm / Yardım" çubuğu çiziyor (Kapat / Yenile / Hakkında). Brief gereği radarın kendi `MenuBar`ı (Yenile, görünüm, katman, kısayollar) onun altında ayrıca duruyor; adı "Radar menüsü". Öneri: shell'e uygulama menüsü ekleme noktası (örn. `AppProps.menus` ya da `AppDefinition.window.menubar:false`) ayrı bir görevde.
- Oda kontrolü e2e'si `test.fixme` (radar Task 3 yayınları, `roomcheck.done` yükü, henüz birleşmedi); T3 sonrası `test`e çevrilip `[role=gridcell][aria-label*="kontrol edildi"]` aranır.
- Paylaşılan Postgres `max_connections=100` doygun (ux2/ux3/ux4/ux5/ux7/ux8/ux11/uxint/mb10/rd6 aynı anda). e2e koşularında "too many clients already" nedeniyle giriş/pencere açılışı birkaç kez başarısız oldu; yeniden denemeyle geçti. Kod hatası değil.

## T9 / T10 / T11 için devir

- **T9** (Kuyruklar, Oda Servisi, Personel, uyarı/olay şeridi, lejant, ayrıntı balonu, `gridNav.ts`): `Toolbar.ViewKey`'e yeni görünümleri ekle (`"kuyruk" | "odaServisi" | "personel"`), `VIEW_LABELS`, `RadarRoot` içindeki `VIEW_SLOTS`/`views` türetimi ve `fallback` zinciri, `Overview`'in `LAYER_VIEW` eşlemesi (ODA_SERVISI -> odaServisi, PERSONEL -> personel). Kat ızgarasındaki ok-tuşu gezinmesi `views/Floor.tsx` içinde yerel; `gridNav.ts` gelince oraya taşınmalı. Oda ayrıntısı şimdilik Kat yan sütununda satır içi panel (`RoomDetail`); `DetailBubble` gelince değişir. Uyarı şeridi yok: Genel Bakış kartları en yüksek 2 uyarıyı gösteriyor.
- **T10** (Oynat menüsü, zaman şeridi, geri sarma/tekrar): `MenuBar` `menus: MenuDef[]` alır; `RadarRoot` içinde "Oynat" menüsünü dizinin Görünüm ile Yardım arasına ekle. Araç çubuğundaki bağlantı metni `Toolbar.modeText` ile verilir ("Geçmiş hh:mm:ss", "Tekrar 60x"). `state.mode`/`state.view` store'dan geliyor, görünümler `state.view` (scrub'da geçmiş durum) tükettiği için geri sarmada otomatik değişir; nabız yalnız `mode==="live"`.
- **T11** (`/radar` duvar modu): `RadarRoot mode="wall"` zaten `DensityRoot pos` + `data-radar-density="wall"` verir ve `MenuBar`ı çizmez; `radar.css` duvar ölçekleri (`--rd-cell-w/h`, `--rd-card-w/h`, `--rd-counter`) tanımlı. Dönüş, uyarıda duraklama, 60 sn girdi duraklaması, ses ve üst/alt bantlar yok. `RadarRoot`un `chrome` (setTitle/setStatus) prop'u isteğe bağlıdır.

## Sayılar

- Birim: `radar-cells` + `radar-source-rules` 36/36 yeşil (tek koşuda, tests/unit).
- `npm run lint`: 0 hata (17 uyarı, hepsi başkalarının dosyalarında). `npm run typecheck`: temiz. `NEXT_DIST_DIR=.next-rd8 npx next build`: yeşil.
- e2e `canliRadar.spec.ts --project=chromium`: 4 geçti, 1 fixme (oda kontrolü).
- Tam vitest (`--maxWorkers=2`): 101 dosya geçti, 56 dosya başarısız (146 test). Tümü DB'ye dokunan testlerdir ve nedeni "Too many database connections opened: sorry, too many clients already" (paylaşılan Postgres 100 bağlantıda doygun) ile başkalarının yarım işleri (migrate-*, minibar-*); aynı koşuda DB'siz testler ve benim iki dosyam yeşil. Tam `npm run check` bu ortamda 15 dakikada tamamlanmadı. Kontrolör sakin bir anda `npm run check`i yeniden koşmalı.
