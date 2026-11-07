# Kabul izlenebilirliği

Spec §15'in 10 kabul kriteri ve her birinin kanıtı. Kaynak: `merit/tests/e2e/acceptance/ACCEPTANCE_MAP.ts`
(`merit/tests/unit/acceptance-map.test.ts` haritayı diske karşı denetler). Durum: **kanıtlı** = ayrılmış kabul
dosyası var ve yeşil; **kısmi** = mevcut e2e dosyaları kriteri kısmen kapsıyor, ayrılmış kabul dosyası sıradaki
görevde; **açık** = e2e kanıtı henüz yok.

| # | Kriter | Durum | Kabul dosyası (`merit/tests/e2e/acceptance/`) | Etiketli destek dosyaları (`merit/tests/e2e/`) | Birim kanıtı (`merit/tests/unit/`) | Zamanlı işler | Sahip |
|---|---|---|---|---|---|---|---|
| @kabul-1 | 3 otel seed'de, silinemez; otel bazlı modül kapatılabilir | kanıtlı | `k01-oteller.spec.ts` | `definitions.spec.ts` | `admin-hotels.test.ts`, `seed.test.ts` | — | T1 |
| @kabul-2 | Yetkisiz ekran/veri erişimi engellenir ve günlüğe yazılır; XP'de yetkisiz simge görünmez | kanıtlı | `k02-yetki.spec.ts` | `shell.spec.ts` | `rbac.test.ts` | — | T1 |
| @kabul-3 | Oturum: azami süre, uyarı, hareketsizlik, tek cihaz, zorla çıkış; online liste ≤ 2 sn | kanıtlı | `k03-oturum.spec.ts` | `onlineUsers.spec.ts` | `sessionSweeper.test.ts`, `sessions.test.ts` | `session.sweep` | T1 |
| @kabul-4 | Oda kontrolü: +N → havuz → rapor; setup sınırı; Sarfiyat Yok/DND; 120 dk hatırlatma; gün sonu EKSIK | kısmi | — (K04 sıradaki görev) | `minibarAcceptance.spec.ts` | `minibar-dnd.test.ts` | `dnd.recheck`, `dnd.endOfDay` | T2 |
| @kabul-5 | MyBar: günlük tek talep; ≤ 3 sn kat sorumlusunda; eksik kapatma açıklama ister; iptal yalnız depo/yönetim | kısmi | — (K05 sıradaki görev) | `mybarFlow.spec.ts`, `mybarGuest.spec.ts` | `mybar-guest-request.test.ts`, `mybar-fulfill.test.ts`, `mybar-requests.test.ts` | — | T2 |
| @kabul-6 | Doluluk: 3 dosya yüklenince görevler üretilir; öncelik planı doğru sıralar | kısmi | — (K06 sıradaki görev) | `minibarAcceptance.spec.ts` | `minibar-occupancy-upload.test.ts`, `minibar-occupancy-parse.test.ts` | `task.generate`, `occupancy.cleanup` | T2 |
| @kabul-7 | QR sipariş: onaysız sipariş KDS/yazıcıya gitmez; fiyat kapalıyken tutar yok; `orderingEnabled=false` | kısmi | — (K07 sıradaki görev) | `qrOrderAcceptance.spec.ts`, `qrOrder.spec.ts` | `guest-order.test.ts` | `order.escalation`, `print.sweep` | T3 |
| @kabul-8 | Oda servisi: teyit adımı ayara göre var/yok; durumlar misafir ekranında canlı | kısmi | — (K08 sıradaki görev) | `roomServiceChain.spec.ts`, `roomServiceOps.spec.ts`, `guestRoomService.spec.ts` | `room-sla.test.ts` | `rs.sla`, `order.escalation` | T3 |
| @kabul-9 | Göç: satır sayıları ve bakiyeler raporda sıfır fark; eski QR tokenları çalışır | açık | — (K09 sıradaki görev) | — | `migrate-core.test.ts`, `migrate-validate.test.ts`, `migrate-history.test.ts` | — | T3 |
| @kabul-10 | Misafir ekranları 5 dilde, AR RTL; XP kabuğu dar ekranda Android görünümüne düşer | kanıtlı | `k10-diller-mobil.spec.ts` | `guestMenu.spec.ts`, `guestRoomService.spec.ts`, `mobileShell.spec.ts` | `i18n.test.ts` | — | T1 |

## Kanıt notları

- **K01** — Otel panelinde silme denetimi yoktur; veritabanı oteli silmeyi reddeder (kullanıcı/oda/outlet kısıtları);
  sistem oteli pasife alınamaz (birim). Oda Servisi modülü ROYAL'da kapanınca o otelin misafir kartı kaybolur, diğer otellerin modülü açık kalır,
  Minibar modülü ROYAL'da kapanınca `depo.mr`'in depo ekranları 403 verir, PREMIUM/DIAMOND modülü açık kalır.
- **K02** — `mudur.mr` Başlat menüsünde sistem uygulamaları yok; `kat.mr` `/admin` → `/yetkisiz`; garson QR ZIP ucunda
  403 alır; her ret `YETKISIZ_DENEME` olarak yazılır ve yöneticinin Denetim Günlüğü penceresinde görünür.
- **K03** — Zaman gerçek saatle beklenmez: `session.sweep` kontrollü iş koşucusundan çalışır, `expires_at` /
  `last_seen_at` veritabanında kaydırılır. Azami süre rol bazlı doğrulanır (600 / 480 dk); online liste ve zorla çıkış
  ≤ 2 sn ölçülür.
- **K10** — Masa ve oda tokenı sayfaları `tr, en, de, ru, ar` için ileti dosyasındaki anahtarla doğrulanır; `ar` için
  `html[dir=rtl]` ve hesaplanmış `direction`; çevirisi olmayan ürün Türkçe temel adıyla görünür.

## Nasıl koşturulur

```bash
cd merit
# e2e veritabanı (adı _e2e ile biter) ve onu kullanan sunucu
export E2E_DATABASE_URL=postgresql://.../merit_e2e
DATABASE_URL=$E2E_DATABASE_URL npx next start -p 3000      # ya da playwright.config.ts'nin başlattığı dev sunucusu
E2E_BASE_URL=http://localhost:3000 npm run test:kabul       # = playwright test --grep @kabul
E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/acceptance   # yalnız ayrılmış kabul dosyaları
```

`npm run test:kabul` tüm `@kabul-N` etiketli testleri (ayrılmış kabul dosyaları + etiketli mevcut dosyalar) koşturur.

### Kontrollü iş koşucusu

Zamana bağlı kriterler gerçek saati beklemez; tek bir zamanlı işi benzetilmiş bir anda e2e veritabanına karşı koşturur:

```bash
npx tsx tests/e2e/helpers/run-jobs.ts --job=<ad> --now=<ISO an>
```

İş adları: `session.sweep`, `print.sweep`, `order.escalation`, `rs.sla`, `dnd.recheck`, `dnd.endOfDay`,
`task.generate`, `upload.warn.1000`, `upload.warn.1800`, `occupancy.cleanup`, `mail.daily-gorev`,
`mail.daily-sarfiyat`, `mail.process`. Çıktı tek satır JSON: `{"job","now","result"}`. Veritabanı `e2eDb.ts` ile aynı
korumadan geçer (`*_e2e` / `*_test`, localhost). Testlerden `helpers/runJob.ts` içindeki `runJob(ad, tarih)` ile çağrılır.
