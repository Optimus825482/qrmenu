# Task 13 raporu: Animasyonlu gösterim katmanı (RD-13)

Durum: DONE. Dal `ux/yenileme`. Ajan `rd13` (DB `merit_test_rd13` / `merit_rd13_e2e`, port 3053, `.next-rd13`).

## Yapılanlar

- `src/modules/radar/ui/motion/`:
  - `motionModel.ts`: saf model. `deriveMotion` (eşleme tablosu), `coalesce` (aynı tür+çapa birleşir, `+N`, en çok 120), `prune` (biteni ve kapanan çağrı halkasını atar), `openCallIds`, `ringsFor` (açılışta açık çağrılara halka tohumu), `prepare`/`step` (kare başına x, y, ölçek, opaklık; ayırma yapmadan `Float64Array`'e yazar).
  - `paths.ts`: `anchorCenter`, `curvedPath`, `measureAnchors`, `useAnchorRects`. Çapa yoksa kaba çapaya düşer (`queue:<o>:<aşama>` -> `queue:<o>:kds` -> `outlet:<o>`).
  - `useMotionClock.ts`: tek rAF döngüsü; yalnız abone ve etkinlik varken ve sekme görünürken çalışır, `visibilitychange` ile durur.
  - `useMotionPreference.ts`: reduced-motion > `?motion=` > `localStorage merit.u.radar.motion` > varsayılan açık. `useSyncExternalStore` ile; sunucu render'ında kapalı.
  - `sprites.tsx` (`OrderDot, Tray, Ring, Sweep, StaffDot, Badge, Dash, Shake`), `MotionLayer.tsx` (`<svg class="rd-motion" aria-hidden>`; sprite'lar yalnız `style.transform/opacity`, kare döngüsü React'i yeniden çizdirmez), `motion.css` (tek `infinite`: çağrı halkası; reduced-motion'da `display:none`).
- `RadarRoot.tsx`: katman montajı (`visibleEvents`, `snap`, tekrar hızı; "Tüm kompleks" ve geçmiş sarma sırasında kapalı), `useMotionPreference`. `Toolbar.tsx`: "Animasyon" `aria-pressed` düğmesi (reduced-motion'da kilitli).
- Görünümlere yalnız `data-anchor`: `table:`, `room:`, `staff:`, `stock:`, `order:` (oda servisi kartı), `outlet:`, `queue:<outlet>:{kasa,YENI,HAZIRLANIYOR,HAZIR,print,kds}`.
- `scripts/radar-sim.ts`: `--scene` kipi (masa yaşam döngüsü, çağrı aç/kapat, oda kontrolü, MyBar). Yük için kullanıldı.
- Spec: `docs/superpowers/specs/2026-11-03-canli-operasyon-radari-design.md` yeni **§5.8** "Animasyonlu gösterim" (§5.6 Klavye ve §5.7 Açıklama zaten dolu olduğundan numara kaydırılmadı); §5.4 "Sürekli hareket" satırına istisna notu.

## Testler (RED -> GREEN)

- `radar-motion-model.test.ts` (17) ve `radar-motion-perf.test.ts` (2): önce modül yok, FAIL; sonra GREEN. Perf: 120 öğe x 1000 `step()` bütçe 50 ms içinde.
- `radar-source-rules.test.ts`: `animation|@keyframes|infinite` yasağı `ui/motion/**` dışında korunur; `motion.css` yalnız `transform`/`opacity` keyframes, tek `infinite`, reduced-motion kuralı.
- Birim: `radar-*` 27 dosya, 275 test PASS. `tsc --noEmit`, eslint (radar, testler, sim) temiz. `NEXT_DIST_DIR=.next-rd13 next build` temiz.
- E2E `radarMotion.spec.ts` 5/5, `canliRadar.spec.ts` 7/7 (chromium).

## Kare süresi (1920x1080 duvar, `radar-sim --scene --rate 20`, 10 sn)

601 kare, ortalama **16,67 ms** (vsync 60 fps), p95 16,8 ms, en kötü 16,8 ms, aynı anda en çok 21 sprite (sınır 120). Uyarı: ölçüm tek makinede, başka ajanlar çalışırken yapıldı.

## Diğer düzeltmeler (kendi alanımda, testi geçirmek için)

- `Timeline.tsx`: "-10 sn / +10 sn" görünür metni, `aria-label` ile uyuşmuyordu (axe `label-content-name-mismatch`); görünür metin "10 saniye geri/ileri" yapıldı.
- `RadarRoot.tsx` kökü `tabIndex={-1}` (+ `.rd-root:focus {outline:none}`): "Sona atla" düğmesi devre dışı kalınca odak kaybolup Esc/End kısayolları ulaşamıyordu.
- `canliRadar.spec.ts`: `getByText("Doluluk yüklenmedi", { exact: true })` (uyarı şeridi çipiyle çakışıyordu) ve ayrıntı paneli düğme listesi `["Kapat", "Uygulamada aç"]` (T11'den kalan eski beklenti).

## Sapmalar ve devir notları

- `useMotionClock(speed, enabled)` yerine `useMotionClock(enabled)`: süreler zaten türetme anında hızla bölündüğü için saatin hızı yok. `useAnchorRects` ResizeObserver yerine olay anında ölçer (ölçüm yalnız hareket başlarken).
- `WallShell.tsx` değişmedi: `?motion=` `useMotionPreference` içinde okunur; düğme duvar modunda da görünen Toolbar'dadır.
- Kontrolör, matris/ratchet: yeni birim dosyalarının listeye eklenmesi gerekirse `tests/unit/radar-motion-model.test.ts`, `tests/unit/radar-motion-perf.test.ts`, `tests/e2e/radarMotion.spec.ts`. Başka matris satırı gerekmiyor.
- Diğer ajanlar (ux13 rehber turu) çalışma ağacında değişiklik yaparken e2e'nin bir koşusunda `guide-tour-layer` tıklamayı engelledi; seed tur-görüldü işaretini aldıktan sonra yeniden koşuda geçti. `tsconfig.json` `next build` ile değişiyor, commit'e alınmadı.
- Sunucu durduruldu, DB'ler bırakıldı.
