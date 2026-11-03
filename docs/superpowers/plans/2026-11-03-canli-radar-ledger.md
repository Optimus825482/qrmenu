# Canlı Radar defteri — dal ux/yenileme (03.11 02:02)
Ruling: T1 olay birliği şimdi (realtime-events.ts/order servisleri boş); T3 minibar servislerine bağlı → minibar T1–T5 sonrası; UI T8–T11 UX T1/T5 sonrası.
Task 1: dispatched (rd1, 3021).
Task 1: implementer DONE (8b99c64; radar-normalize 24, privacy, orders 23/23; RED kanıtı yok — not). Review (Sonnet) dispatched. eslint .next-* ignore (kontrolör).
Task 2: dispatched (rd2, 3022).
Task 1: review NEEDS FIXES — Important: byUserId misafir SSE akışına sızıyor → guestEventFilter'da soyulacak + test. Fix round 1 dispatched (rd1f). Minör: compareRadarEvents NaN; toRadarEvent null zarf; cast'lar; ad gizliliği T5/T11'de.
Task 1: fix round 1 DONE (3e1be71; sanitizeGuestEvent + sse.ts map seçeneği; 52 test). Ruling: dar düzeltme, dalga sonu Opus incelemesi kapsar. Task 1 CLOSED. (tsc hataları mb1'in yarım dosyaları.)
Task 7: dispatched (rd7, DB'siz saf istemci). 
Task 7: implementer DONE (df77d46; 27 test; scrub <150 ms/10k; radar/state.ts T7'de oluşturuldu → T5 bunu temel alır; prep bayrağı sapma yoklamasıyla). Review (Sonnet) dispatched.
Task 7: review NEEDS FIXES — Important: presence.tick status/idle sıfırlıyor (lastSeen-only olmalı); print/mail sayaçları 2 sn örtüşmede çift sayılıyor. Minörler: resync in-flight; false drift (queue); mybar.closed requestId; tablo açık-durum whitelist; trim yalnız flush'ta; perf best-of-3; test boşlukları. Fix round 1 dispatched (rd7f).
Task 2: implementer DONE (23df08f; radar-publish-order 13, radar-jobs 1; G20 devir: minibarJobs sendHotelMailOnce failed → publishMailFailed). İNCELENMEDİ → sonraki ajan Sonnet inceleme.
Task 7: fix round 1 DONE (63282d3; 80 radar testi). Ruling: dar düzeltme, dal sonu Opus kapsar. Task 7 CLOSED. Kalan sınır: snapshot iş kimlikleri taşımıyor → saat kayması çift sayımı drift düzeltir (T5 snapshot'a jobs[] eklemeli — not).
Task 2: review APPROVED (Sonnet). Minör: radar-jobs handler gövdesi test edilmiyor; hotel.isActive süzgeci; dakikalık tarama ölçeği. Task 2 CLOSED.
Task 4: implementer DONE (0552fe5; CR-RAD 34 ekran, yetki satırı 201; OperationEvent + 7 indeks; radar.* 8 ayar; purge 03:30; presenceSweep/printerSilenceSweep; G21 devir: minibarJobs checkOccupancyUploadAndAlert → announceMissingUpload (minibar T11). Deviation: tick 40 oturum. Review (Sonnet) dispatched. Task 5 (snapshot) ve Task 6 (replay) şimdi paralel başlatılabilir.
Task 5: dispatched (rd5, 3045) — state.ts T7'ninki temel; queues.jobs id'li.
Task 4: review APPROVED (Sonnet). Minör: announceMissingUpload throw edebilir → T11 çağrı yeri sarmalar (veya helper catch); dedup atomik değil; recordOperation payload allow-list (T6/T12). Task 4 CLOSED.
Task 5: implementer DONE (f6fbfee, 20 dosya; radar-snapshot 29, radar-alerts 13, single-flight 4; p95 ~40 ms). Kararlar: opts.now ile singleFlight atlanır; SISTEM/YONETIM dışı rollerde isim '—'; UploadTask yok/BEKLIYOR → EKSIK; mailFailed kompleks geneli 24 s; uyarılar crit (oda servisi WARN). İnceleme (Sonnet) BEKLİYOR — Fable kullanım sınırı 07:57; sonra T6 (replay).
Task 5: review APPROVED (Sonnet; minörler → T12 bütünleştirme: RS_WARN_RATIO paylaşımlı sabit, onlineStaff SISTEM dışlama tutarlılığı, printersOffline HATA, overview hafif yol). Task 5 CLOSED. T6 (rd6, 3046) dispatched.
Task 6: implementer DONE (0971845; radar-replay 30, diğer radar 85; build yeşil). Kararlar: pencere (from,to], to 24:00+ gece yarısı geçişi, cursor isteğinde snapshot yok, audit her istekte 10 dk dedup; bilinen boşluk: upload.missing dosya türü yok → 3 EKSIK. İnceleme ERTELENDİ (önce minibar).
Task 8: implementer DONE (382d6ae; radar-cells/source-rules 36; canliRadar e2e 4 geçti + 1 fixme (T3 bekliyor); build yeşil). Ek: AppProps.setTitle/windowStore.setTitle, radarHotels/radarHotelsAction, expectRadarAxeClean. Açık: çift menü çubuğu (kabuk + Radar menüsü) → T12 kabuk kancası. İnceleme ERTELENDİ (önce minibar).
