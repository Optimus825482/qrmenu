# Task 7 raporu - Istemci deposu (RD-7)

Durum: DONE (kapsam notlari asagida).

Dosyalar: `merit/src/modules/radar/state.ts` (YENI: RadarState, initialState, toSnapshot, comparableState, firstDiffPath),
`merit/src/modules/radar/ui/radarStore.ts`, `ui/reducers/{index,order,minibar,roomService,staff,system,util}.ts`,
testler `tests/unit/radar-{reducers,store}.test.ts`, `radar-replay-metamorphic.test.ts`, yardimcilar `tests/helpers/radar{StateFixtures,StoreHarness}.ts`.

Testler: 27 yesil (11 indirgeyici, 14 depo, 2 metamorfik). Performans: 10k olay besle, 30 dk icinde `scrubTo` < 150 ms (en iyi 3 deneme).
`next build` (NEXT_DIST_DIR=.next-rd7) yesil; tsc ve eslint temiz.
`npm run check` (merit_test_rd1): 11 dosya / 32 test kirmizi, hicbiri radar-store/reducers/metamorfik degil; gorulen: schema.test.ts
`relation "legacy_id_map" does not exist` (merit_test_rd1 sema/migrate durumu veya baska ajanin migration'i).

Notlar / T5-T6 icin:
- T5'te `state.ts` bekleniyordu (initialState/comparableState); T1'de yoktu, bu gorevde olusturuldu - T5 cakisirsa bunu temel alsin.
- `RadarState` = snapshot katmanlari + `jobs`, `mailFailed`, `people`, `needsRefresh`; siparis kaydinda ek `prep`/`escalated`; oturumda `idle`.
  KDS YENI/HAZIRLANIYOR ayrimi icin snapshot'taki ONAYLANDI siparisler `prep` bayragi tasimali (yoksa sapma yoklamasi duzeltir).
- Eklenen istege bagli bagimliliklar: `fetchOverview`, `deriveAlerts` (varsayilan: snapshot system.alerts), `bufferMinutes` (varsayilan 30).
- Store durumuna eklendi: `overview`, `flush()` (gorunur olunca UI cagirabilir). Eylemler state icindedir (`getState().scrubTo(...)`).
- Metamorfik test DB'siz, saf: "asOf anlik goruntusu + sonraki olaylar = canli". T6'nin NDJSON `replayLines` surumu T6 inince eklenecek.
- Bilinmeyen print isi gecis (KUYRUKTA disi) -> `needsRefresh print:<outlet>`; yeni stok girisi `stock:<id>` (urun adi telde yok).

## Fix round 1

- presence.tick (`userId === ""`): yalniz `lastSeenAt`; status/idle dokunulmaz; bilinmeyen oturum -> degisiklik yok, needsRefresh yok.
- Sayac cift sayimi: `jobs` (id -> durum) ve yeni `mailIds` (olay id kumesi; `mailFailed` turetilir). `generatedAt`'ten ONCEKI print.job olaylari (ortusme penceresi) snapshot sayaclarina zaten dahil sayilir: yalniz `jobs` iddiasini gunceller, sayac degistirmez; sonrakiler jobs[id] eski durumuna gore delta uygular. Ayni olayin tekrar oynatilmasi idempotent.
- Kucukler: `mybar.closed` yalniz requestId eslesince (veya state'te id yoksa) temizler; masa siparisi beyaz liste GONDERILDI|ONAYLANDI|HAZIR, oda servisi TEYIT_BEKLIYOR|ONAYLANDI|HAZIR|YOLDA; sapma yoklamasi once `flush()` eder (gizli sekmede kuyruk bossa karsilastirir, degilse sonraki tura birakir); `trim` her `tick()`'te de calisir; "ayni id iki kez" testi live state'i tek-olay referansiyla toEqual; no-op `reverse().sort(()=>0)` yerine tohumlu (mulberry32) Fisher-Yates; performans testi 5 denemenin medyani.
- Bilinen sinir: ortusme penceresinde `generatedAt`'ten SONRA damgali ama snapshot'a girmis bir KUYRUKTA olayi (saat kaymasi) yine cift sayilir; id'ler snapshot'ta tasinmadigi icin ayirt edilemez (drift yoklamasi duzeltir).
- Testler: radar-*.test.ts 7 dosya / 80 test yesil; tsc ve eslint temiz.
