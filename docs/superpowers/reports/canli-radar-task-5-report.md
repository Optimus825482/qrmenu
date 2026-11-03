# Task 5 raporu: anlık görüntü, kapsam, uyarı türetme, genel bakış ve metrikler (RD-5)

Ajan `rd5`, dal `ux/yenileme`, DB `merit_test_rd5` / `merit_rd5_e2e`, `NEXT_DIST_DIR=.next-rd5`.

## Eklenen / değişen dosyalar (`merit/`)

Yeni:
- `src/lib/singleFlight.ts` (`singleFlight`, test için `resetSingleFlight`)
- `src/modules/radar/alerts.ts` (`deriveAlerts`, `groupAlerts`, `KIND_LABEL`)
- `src/modules/radar/server/{scope,config,snapshot,overview}.ts`
- `src/modules/radar/server/layers/{minibar,order,roomService,staff,system,sparkline}.ts`
- `src/modules/radar/server/actions/radar.ts` (`radarSnapshotAction`, `radarOverviewAction`)
- `src/modules/reporting/server/radar/metrics.ts` (17 metrik, P7 T10 imzası)
- `tests/helpers/radarFixtures.ts` (`makeRadarWorld`, `resetRadarData`)
- `tests/unit/{radar-snapshot,radar-alerts,single-flight}.test.ts`

Değişen:
- `src/modules/radar/types.ts`: `RadarConfig`, `RadarMetricKey`, P7 biçimli `RadarMetric`; anlık görüntüye `people?`, `config`, oda `scannedAt?`, sipariş `prep?/escalated?`, `queues.jobs`, `system.mailFailed`.
- `src/modules/radar/state.ts` (T7'nin dosyası, yalnız genişletildi): `RadarState.config`; `initialState` artık `s.people`, `queues.jobs` (id ile açık baskı işleri) ve `system.mailFailed` değerlerinden başlar; `toSnapshot` `config/people` taşır. İndirgeyicilere dokunulmadı.

## Kararlar

- `LAYER_GATES`: MINIBAR→MB-KAT, SIPARIS→QS-KUY, ODA_SERVISI→RO-TAL, PERSONEL→CR-ONL, SISTEM yok. `assertRadarScope` önce `assertCan("CR-RAD")` (FORBIDDEN + `YETKISIZ_DENEME`), sonra kapı ekranlarında `can(…,"V",hotelId)`.
- Enjekte `opts.now` ile çağrı `singleFlight`'i atlar (deterministik); canlı çağrı `rolId:otelId:katmanlar`, 2000 ms.
- Adlar yalnız SISTEM ve YONETIM oturumlarına tam ad olarak gider; diğer türlerde `people` yok, `name` "—", `waiterName` yok.
- İş günü: görev, kontrol, DND, MyBar (`businessDate = bugün`) `businessDate(now)` ile; MyBar sayaç ve metrikleri de bugünle sınırlı (gece yarısı sıfırlanır). Açık sipariş penceresi son 24 saat.
- Yükleme durumu: kayıt yok veya `BEKLIYOR` -> `EKSIK` (günlük görev satırı `BEKLIYOR` yaratıldığı için).
- Yazıcı: `lastStatus` SESSIZ -> SESSIZ; "OK" dışı -> HATA; `lastSeenAt` boş veya `radar.printerSilentSeconds`'tan eski -> SESSIZ (P7 `printersOffline` ile tutarlı).
- Oda servisi açık durumları `SLA_OPEN_STATUSES` (sla.ts) ile aynı; seviye yaştan (%80/%100) ve damgalı `slaWarnedAt/slaBreachedAt`'ten türer.
- Uyarı ciddiyetleri: RS WARN `warn`, diğerleri `crit` (P7 metrik ciddiyetleriyle hizalı). Boşta-personel (`idleMinutes`) için uyarı kuralı yok (spec listesinde yok); eşiklerde taşınır.
- Kat sorumlusu ilerlemesi: bugün oda kontrolü yapan her kullanıcı; `floorIds` dokunduğu katlar, `done/total` o katlardaki bugünkü görev kalemleri.
- `mailFailed`: `EmailLog`'da otel sütunu olmadığından son 24 saat tüm kompleks sayısı; metrik `CR-SYS` ekranına bağlı (yalnız SISTEM rolleri), anlık görüntüde yalnız SISTEM için sıfırdan büyük.
- `onlineStaff` metriği SISTEM rolü oturumlarını saymaz.
- Sparkline: 60 kova (boş kova `counts: {}`), yalnız görünür katmanların kaynakları sorgulanır (tek UNION sorgusu).

## Doğrulama

- Yeni testler: `radar-snapshot` 29, `radar-alerts` 13, `single-flight` 4 (hepsi yeşil).
- Performans (300 oda, 2 outlet x 20 masa, 200 sipariş): anlık görüntü 20 çağrıda p95 yaklaşık 40 ms (soğuk ilk çağrı 252 ms); genel bakış bütçe içinde. Test CI'da yalnız bilgi yazar.
- `npm run typecheck` yeşil; lint'te bu görevin dosyalarında uyarı yok.
- Tam sonuçlar ve başkalarının kırmızıları son mesajda.
