# Merit OS Teslim Kontrol Listesi

Tarih: 7 Kasım 2026. Dal: `ux/yenileme`. Yerel hazırlık ve sahada kabul birbirinden ayrı kaydedilir. GitHub'a push ve main birleştirmesi Erkan tarafından yapılır.

## 1. Kabul matrisi

| Kriter | Kanıt | Durum |
|---|---|---|
| K01 — Oteller/modüller | k01-oteller.spec.ts | T1 devrinde yeşil; son toplu koşu bekleniyor |
| K02 — Yetki/denetim | k02-yetki.spec.ts | T1 devrinde yeşil; son toplu koşu bekleniyor |
| K03 — Oturum | k03-oturum.spec.ts | T1 devrinde yeşil; son toplu koşu bekleniyor |
| K04 — Oda kontrolü/DND | k04-oda-kontrol.spec.ts | T2 hedefli 2/2 yeşil |
| K05 — MyBar | k05-mybar.spec.ts | T2 hedefli 3/3 yeşil |
| K06 — Doluluk/öncelik | k06-doluluk.spec.ts | T2 hedefli 1/1 yeşil |
| K07 — Masa siparişi | k07-qr-siparis.spec.ts | Son doğrulama sürüyor |
| K08 — Oda servisi | k08-oda-servisi.spec.ts | Son doğrulama sürüyor |
| K09 — Göç | k09-goc.spec.ts | Sentetik kaynak doğrulaması sürüyor; gerçek dump bekleniyor |
| K10 — Dil/mobil | k10-diller-mobil.spec.ts | T1 devrinde yeşil; son toplu koşu bekleniyor |
| Otel günü | x01-otel-gunu.spec.ts | Son doğrulama sürüyor |

Commit'ler ve son toplu sonuçlar [P8 kabul raporunda](kabul/2026-11-07-p8-kabul.md), ayrıntılı eşleme [izlenebilirlik belgesinde](kabul/izlenebilirlik.md) tutulur. Yük aracı sonuçları: [yük denemesi](yuk-denemesi.md). Yerel smoke, 300 misafir + 40 personel kapasitesinin sahada kabulü yerine geçmez.

## 2. Açık noktalar ve sahada doğrulananlar

| Kalem | Yerel kanıt / yapılacak iş | Saha sonucu, tarih, sorumlu |
|---|---|---|
| Canlı göç | [Göç kontrolü](kabul/goc-kontrol.md); gerçek dump, dry-run ve onay olmadan aktarım yapılmaz | Bekleniyor |
| Yazıcı | Marka/model, sabit IP ve cp857 tablo numarası; Türkçe test fişi | Bekleniyor |
| Not çevirisi | Google gtx sağlayıcısı resmi değildir; kapatılabilir | Otel kararı bekleniyor |
| Web Push | VAPID anahtarları, HTTPS ve gerçek telefon izin/teslim denemesi | Bekleniyor |
| E-posta | SMTP ayarı, test gönderimi ve 08:00/08:05 rapor alıcıları | Bekleniyor |
| Alan adı | DNS, güvenilir sertifika, APP_BASE_URL ve qr.baseUrl; ardından QR basımı | Bekleniyor |
| Outletler | 18 outletin kesin otel dağılımı panelden girilir | Bekleniyor |
| Ortak Wi-Fi | guest.ipRateMultiplier saha değeri, NAT ölçümü ve onayı | Bekleniyor |
| Eğitim | [Altı kılavuz ve üç oturum](kilavuz/README.md); gerçek kullanıcıya yetki kapsamı açıklanır | Bekleniyor |
| GitHub | main ve ux/yenileme push edildi, tag v1.0.0-rc1; GitHub Actions hesabı faturalandırma (billing lock) sebebiyle runner başlatamadı | https://github.com/Optimus825482/qrmenu/actions/runs/42389047505 (hesap kilidi açılınca otomatik/yeniden tetiklenecek) |

### GitHub yerel ön kontrol ve kullanıcı adımları

`.env` izlenmemeli; yalnız ilgili görev dosyaları commit'lenmelidir. Kullanıcının proforma/sunum değişiklikleri bu teslim commit'lerine alınmaz. Büyük dosya ve sır taraması sonuçları kabul raporunda kaydedilir. Ticari belgeler, prototipler ve deponun özel tutulması kararı Erkan'a aittir; bu hazırlık `.gitignore` veya mevcut ticari dosyaları değiştirmez.

7 Kasım yerel taraması dört eski belgede yerel yönetici parolasına birebir eşleşme buldu. Güncel belgelerden bu değer kaldırıldı. Git geçmişi yeniden yazılmadığından gönderimden önce ilgili yönetici parolası yenilenmelidir. `.env` ve gerçek kullanıcı parolaları bu çalışma sırasında değiştirilmedi. Gitleaks kurulu olmadığından yerel tarama bilinen ortam değerleri ve yaygın anahtar önekleriyle sınırlıdır; gönderim kapısında ayrıca tam bir sır taraması çalıştırılmalıdır.

Erkan hazır olduğunda özel GitHub deposunu/remote'u belirler ve `ux/yenileme` dalını gönderir. `main` birleştirmesi ayrıca Erkan'ın kararıdır. Ardından `gh run list --limit 5`, ilgili `gh run watch` ve kayıtlı workflow listesiyle gerçek koşu doğrulanır. Beklenen işler: check, e2e, gateway, load-tools; advisory audit sonucu ayrıca incelenir. Atlanmış iş yeşil kanıt sayılmaz. `workflow_dispatch` ile CI elle de başlatılabilir; load-smoke yalnız elle tetiklenir. Dal korumasında check/e2e zorunlu denetim olarak önerilir.

### Linux / CI kırılma tablosu

| Risk | Denetim / çözüm |
|---|---|
| Dosya adı harf farkı | Linux'ta import yolu dosyayla aynı olmalı; TypeScript kontrolü |
| Üretilmiş Prisma istemcisi | npm ci sonrası prisma generate; generated dizini git dışıdır |
| Kilit dosyası | npm ci; uygulama, gateway ve load araçlarının ayrı lockfile'ları |
| Saat dilimi | Postgres TZ/PGTZ Europe/Istanbul; uygulama iş günü Europe/Nicosia |
| Şema kayması | migrate deploy sonrası migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code |
| Üretim sunucusu | build → next start → /api/health ok:true → Playwright; dev sunucusu kullanılmaz |
| E2E izolasyonu | E2E_DATABASE_URL yalnız yerel merit_e2e; development URL'den farklı |
| Tarayıcı bağımlılıkları | playwright install --with-deps chromium |
| Satır sonu/yollar | LF; subprocess yolları path.join, shell betikleri Linux sözdizimi |
| Sırlar | CI yalnız açıkça sahte CI değerleri kullanır; gerçek .env yüklenmez |

nginx/shellcheck ve gerçek Linux servis başlangıcı yerel Windows testleriyle kanıtlanmaz; kurulum sunucusunda [kurulum adımları](kurulum.md) tamamlanır.

## 3. Kapsam dışı (spec §1.2)

Donanım; PMS/folio/ödeme/muhasebe entegrasyonu; a la carte restoranlar; ana depo tedarik/FIFO; ML anomali; executive dashboard; geofence/Wi-Fi doğrulama/cihaz kara listesi; native saat uygulaması; MFA'nın devreye alınması; oda kontrolünde ekstra/sıfırla/setup dışı ürün; zaman ayarlı oda servisi ve butler/yastık gibi ek IRD özellikleri v1 kapsamı dışındadır.

## 4. Operasyon

| İş | Kabul kaydı |
|---|---|
| Günlük DB ve yüklenen dosya yedeği | Tarih/sorumlu: bekleniyor |
| Ayrı DB'ye geri yükleme tatbikatı ve satır sayısı karşılaştırması | Tarih/sonuç: bekleniyor |
| /api/health izleme ve hata bildirimi | Sorumlu/kanal: bekleniyor |
| Etiketli güncelleme, migrate deploy, sağlık ve geri dönüş | Son tatbikat: bekleniyor |
| İlk yönetici parolası ve uygulama anahtarlarının rotasyonu | Tarih/sorumlu: bekleniyor |
| SMTP/VAPID ve fiziksel yazıcı testi | Tarih/sonuç: bekleniyor |

Ayrıntılı yedek, geri dönüş, bulut/on-prem ve print gateway prosedürleri [kurulum belgesindedir](kurulum.md). Gerçek sırlar bu tabloya yazılmaz.

## 5. Kabul imzası ve eğitim katılımı

| Otel | Tarih | Ad/görev | İmza | Çekince |
|---|---|---|---|---|
| Merit Royal | | | | |
| Merit Royal Diamond | | | | |
| Merit Royal Premium | | | | |

| Eğitim oturumu | Tarih | Eğitmen | Katılımcı | Alıştırma sonucu |
|---|---|---|---|---|
| Yönetici/IT | | | | |
| Saha | | | | |
| Minibar | | | | |

## 6. Son kontrol

[DEVIR §6](DEVIR.md) Pazartesi Fable incelemesiyle birlikte uygulanır: defter/Ruling kararları, `npm run check`, Chromium ve altı görünüm matrisi, üretim build, boş migrate diff, spec §15 kapsamı, güvenlik bulguları ve ilerleme verisinin gerçek durumu. P6/P7/P8 dal incelemesi ile gerçek GitHub koşusu ayrıca kaydedilir. Eksik saha kalemleri imzada açıkça belirtilir; test raporuna geçilmiş gibi yazılmaz.
