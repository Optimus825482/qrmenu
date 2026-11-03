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
