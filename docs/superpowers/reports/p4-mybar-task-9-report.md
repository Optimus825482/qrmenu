# P4 Task 9 raporu: Web Push kanalı

Durum: tamamlandı. Dosya yolları plandaki (`src/lib/push.ts`, `src/modules/core/server/push*.ts`, `src/shell/push/*`) yerleşimidir; abonelik tablosu T1'de vardı, migration yok.

## Yapılanlar
- `src/lib/push.ts`: VAPID yalnız env'den (`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`), ikisi yoksa push kapalı; `sendPush` asla fırlatmaz (404/410 GONE, diğer FAILED), TTL 3600, urgency high, topic = tag, yük <= 1 KB.
- `pushSubscriptions.ts`: upsert (endpoint tekil, sahiplik devri), kullanıcı başına en çok 10 cihaz, yalnız kendi aboneliğini silme. SSRF koruması: https, userinfo/port yok, ana makine izinli listede (varsayılan FCM, Mozilla, Apple, Windows; `PUSH_ENDPOINT_ALLOWLIST` ile değiştirilir).
- `pushActions.ts` (server actions, `requireUser`), `pushDispatcher.ts` (`pushed_at` talebi ile tek seferlik, 8 eşzamanlı, 410 siler, 5 hata siler, `registerPushType`, `startPushDispatcher` idempotent), `instrumentation.ts` içinde ayrı try/catch ile başlatılır. `notify()`, `fanout.ts`, `requests.ts` değişmedi.
- `public/sw.js`: `push` (odaklı pencere varsa postMessage, yoksa showNotification; mybar etiketi requireInteraction), `notificationclick` (aynı origin, focus+navigate ya da openWindow). Önbellek kuralları aynı, VERSION "3" kaldı.
- `ProfileMenu.tsx`: tek `<PushToggle />` ("Bildirimler: Aç/Kapat"; desteklenmiyor/VAPID yok iken çizilmez).

## Test
- Birim: push-subscriptions (12), push-dispatcher (11), sw-push (9), push-hook (7): hepsi yeşil. eslint temiz, `tsc` kendi dosyalarımda temiz (başka ajanların eski `.next-*` tipleri ve `mybar-ack-policy.test.ts` hatası bana ait değil). `next build` (`.next-p4t9`) başarılı.
- e2e `pushSubscribe.spec.ts`: yeşil (tek başına ve birleşik koşuda geçti). Ortak Postgres bağlantı sınırı ("too many clients") yüzünden staffShell/pushSubscribe koşuları aralıklı düştü; düşmeler login/seed aşamasında, kod kaynaklı değil.

## Coolify ortam değişkenleri
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (birlikte; `npx web-push generate-vapid-keys`), `VAPID_SUBJECT` (`mailto:...`). Eksikse push kapalı, arayüz gizli.
- İsteğe bağlı: `PUSH_ENDPOINT_ALLOWLIST` (virgülle ayrılmış ana makineler).

## Manifest satırı
Gerekmez.

## T10 / diğer ajanlara devir
- `PushBanner` yazıldı ama bağlanmadı: `AckHostSlot` bu ağaçta yok (T5/T6). Kat kabuğunda "prompt" şeridi için bağlanabilir. Servis çalışanı odaklı pencereye `postMessage({type:"push"})` yollar; dinleyen yok (gerekirse T5 onay penceresi bağlar).
- Çıkışta (logout) aboneliği silme yok; paylaşılan cihazda yeni kullanıcı girişinde hook aboneliği otomatik devralır.
- Kontrol listesi: ilerleme satırı 3 ("Web Push kanalı") kontrolör tarafından kapatılacak.
