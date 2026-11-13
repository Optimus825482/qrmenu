# Merit OS — ekip denetimi, 13 Kasım 2026

**Durum: ekip teslimleri alındı; birleşik doğrulama sürüyor.** Bu belge nihai kabul veya güvenlik onayı değildir. Başlangıç kodu `08941fda`; yollar depo köküne göre verilir. Aşağıda sahiplerinin bildirdiği sonuçlar bağımsız çalıştırmadan ayrılır.

## Doğrulanmış gereksinim farkı

### YET-01 — P1: Oda servisi sorumlusu alt ekibin ekran yetkilerini yönetemiyor

**Beklenti:** Oda servisi sorumlusu kendi minibar/oda servisi personelini oluşturur ve bu personelin görüntüleme, oluşturma, düzenleme gibi ekran yetkilerini düzenler.

**Kod kanıtı:** `merit/src/modules/core/roleRanks.ts:26` sorumluya R-KAT/R-DEP/R-HKS/R-ODS rollerini yönetme hakkı tanımlar. Kullanıcı yönetimi `merit/src/modules/core/server/admin/users.ts:255` ve devamında rol ve otel kapsamını kontrol eder. Ancak yetki yazmalarının ortak kapısı `merit/src/modules/core/server/admin/permissions.ts:122` içindeki `requireSystemActor` çağrısıdır; `merit/src/modules/core/server/admin/roles.ts:134` SISTEM dışındaki aktörü reddeder. Rol düzenleme seçeneği de `roles.ts:194` ile yalnız SISTEM rolüne açılır. Oda servisi sorumlusu seed'de YONETIM türündedir (`merit/prisma/seed/roles.ts:49`).

**Tetikleme:** Oda servisi sorumlusu kendi otelindeki alt personel rolünün bir ekran bayrağını değiştirmeye çalışır. Sunucu rolün/kişinin ast olmasını dikkate almadan sistem-rolü kapısında reddeder. UI yolunun görünürlüğü ayrıca tarayıcıda doğrulanmalı.

**Etki:** Kullanıcı oluşturma ile erişim yetkisini devretme farklı düzeylerde kalır; kullanıcının tanımladığı sorumlu işlevi tamamlanmaz.

**Öneri:** Sistem kapısını genel olarak kaldırma. Yönetilebilir ast/ekip ve otel/outlet kapsamını doğrulayan, yöneticinin kendi hakkından fazlasını veremediği dar bir delegasyon modeli tanımla. Rolün tüm kullanıcılarını küresel etkileyen değişiklik yerine kapsamlı rol veya kullanıcı yetki devri gereksinimini netleştir. Yetki düşürme ve açık oturum etkisini test et.

**Doğrulama düzeyi:** Statik kaynak kanıtı. Mevcut testlerde yönetici yetki yazımının reddedilmesi özellikle bekleniyor (`merit/tests/unit/admin-roles.test.ts:295` ve devamı); testler bu oturumda çalıştırılmadı. Bu, yeni beklentiyle mevcut tasarım arasındaki farktır.

## Çapraz incelemeye adaylar

### YET-02 — Otel düzeyinde tüm ekran bayraklarını kapatmak, genel yetkilere geri dönüyor

`merit/src/modules/core/server/admin/permissions.ts:178` tüm bayraklar false olduğunda otel satırını siler. `merit/src/lib/rbac.ts` içindeki `pick` fonksiyonu otel satırı yoksa genel satıra döner. Genel yetki açıksa API'nin tümünü kapatma girdisi erişimi tamamen kapatmaz. Bu davranış `merit/tests/unit/admin-roles.test.ts:199` testinde bilinçli olarak bekleniyor. Güncel panel ekran yetkisini `hotelId:null` ile kaydediyor (`merit/src/shell/apps/definitions/panels/PermissionMatrixPanel.tsx:235`); otel bazlı kullanıcı arayüzünden yeniden üretildiği iddia edilmiyor. Açık ret ile miras alma ayrımının ürün beklentisi ve çağrı yolları birlikte incelenmeden kesin hata/önem verilmeyecek.

### YET-03 — Kullanıcı hiyerarşisi, atanmış amirden çok rol listesine dayanıyor

`merit/src/modules/core/server/admin/users.ts:255` hedef kullanıcının rol ve otellerini denetler; burada `supervisorId` denetlenmez. `assertSupervisor` (`users.ts:314`) yalnız var olma ve kendine atamama kontrolü yapar. Aynı oteldeki birden fazla aynı rol grubunun birbirinden bağımsız ekipler olması bekleniyorsa bu sınır yetersiz olabilir. Kullanıcının outlet ataması beklentisiyle birlikte ekip üyeliği ve gerçek çağrı yolları üzerinden doğrulanacak; mevcut haliyle doğrulanmış yetki atlama diye sınıflandırılmaz.

## Takip

Görev sahipleri ve sınırlar `tasks/plan.md`, teslim ve doğrulama kapıları `tasks/todo.md` içindedir. Eski denetimdeki maddeler güncel koddan yeniden doğrulanmadan taşınmaz. Codex misafir masa olayı filtresini düzeltti; mevcut/dev DB verisini değiştirmedi. Testler ayrı veritabanlarında çalıştırılır.

## Çapraz değerlendirme sonuçları

### MIN-01 — Ortak personelin bütün hesabını değiştirme sınırı: düzeltme uygulandı

Fable'ın bulgusu: yalnız tek ortak oteli olan yönetici, başka otelde de çalışan minibar personelinin şifresini sıfırlayabiliyor veya bütün hesabını pasife alabiliyordu. `merit/src/modules/minibar/server/minibarUsers.ts` içindeki yeni `assertWholeAccountInScope` sıfırlama ve etkinlik değişikliklerinde hedefin bütün otellerini kapsama şartı getirir. Sistem aktörü muaf kalır. Profil/otel düzenlemesinde kapsam dışı otelleri koruyan mevcut davranış değişmedi.

Kullanıcı düzeltmeyi Fable'a açıkça onayladı. Sahibi Fable; değişen dosyalar `minibarUsers.ts` ve `merit/tests/unit/minibar-users.test.ts`. Codex kaynak ve regresyon testi diff'ini okudu. Fable önce kırmızı, sonra 8/8 hedefli test; TypeScript ve iki dosyada ESLint temiz sonucu bildirdi. Bu komutlar Codex tarafından yeniden çalıştırılmadı. Değişiklik commit/push edilmedi; tam kabul veya üretime dağıtım yapılmış sayılmaz.

### MIN-02 — Fazla fiziksel iadeye ek stok hareketi önerisi reddedildi

Particle'ın ilk önerisi `wholeReturn=true` yolunda tam miktarlı IADE yanında fazlalık kadar DUZELTME hareketi eklemekti. Codex buna itiraz etti. Fable bağımsız kaynak incelemesinde `merit/src/modules/radar/server/replay/sources/stock.ts` ve `merit/src/modules/radar/server/layers/minibar.ts` okuyucularının kalan miktarı işaretli hareket toplamından geri hesapladığını gösterdi.

Mevcut doğru örnek: başlangıç 10, kullanım -4, fiziksel iade +7 → kalan 13; hareket neti +3. Ek +3 DUZELTME bakiye değişmeden hareket toplamını artırıp geçmiş radar seviyelerini yanlış üretirdi. Mevcut tasarımda `totalQty-usedQty=remainingQty` ve başlangıç+işaretli hareketler=kalan miktar korunuyor.

Particle, `merit/tests/unit/minibar-whole-return.test.ts` dosyasında gerçek servis ve kendisine ait `merit_test_particle1` veritabanıyla 7/7 hedefli test bildirdi. Codex dosyayı okuyup gerçek `pool.restoreStock` ve defter/bakiye karşılaştırmalarını doğruladı; test komutu Codex tarafından yeniden çalıştırılmadı. Particle ek hareket önerisini geri çekti; `pool.ts` değiştirilmedi. Denetim kaydı zenginleştirmesi stok hesabından ayrı bir iyileştirmedir.

### MIN-03 — Süreli doğrudan düzeltme penceresi bilinçli davranış

“Ayarı yazan kod yok, pencere açılamaz” iddiası yanlış çıktı. `merit/prisma/migrations/20261112120000_mty_tanim_ve_onaysiz_duzeltme/migration.sql:15` ayarı migration çalıştığında bir ay süreyle ekler. Fable mevcut yerel DB'de, Particle kendi yeni test DB'sinde satırı doğruladığını bildirdi. Yalnız `src/` araması migration yazıcısını kaçırmıştı. R-OSS'un minibar ve oda servisini birlikte yönetmesi kullanıcı beklentisidir; rol listesi bu gerekçeyle daraltılmadı.

### MIN-04 — İkame ve revizyon kayıtları: doğrulanmış bakiye hatası yok

`consumed=added` oda kontrolündeki fiziksel ikameyi temsil edebilir. Aynı belge kimliğine bağlı birden fazla imzalı revizyon hareketi de geçerli bir geçmiş tutma yöntemidir. Particle bu iki maddeyi veri hatası yerine P3 anlaşılabilirlik önerilerine indirdi. Muhasebe veya alan anlamı değişikliği yapılmadı.

### ORT-01 — Yerel DB'de üç migration bekliyor; üretim durumu bilinmiyor

Codex workspace bağlantısıyla `BEGIN READ ONLY` içinde yalnız SELECT çalıştırdı; `transaction_read_only=on` doğrulandı. Bağlantı localhost, 21 rol ve üç otel mevcut; R-OSS yerelde yok. Sırsız anlık görüntü: `cikti/2026-11-13-role-snapshot.json`.

Fable bağımsız yerel DB incelemesinde R-OSS/R-FBY rollerini ekleyen kademe migration'ı dahil son üç migration'ın uygulanmadığını bildirdi. Kullanıcı da henüz uygulanmadığını teyit etti. Bu, YET-01'deki kaynak kodu kısıtını ortadan kaldırmaz; yerelde rolün hiç bulunmaması ayrı ortam farkıdır. Codex veya Fable mevcut yerel DB'ye migration/seed uygulamadı. Üretim aynı kabul edilmez.

### Kapsam kararı — Geçici şifre davranışı

Kullanıcı mevcut geçici şifre davranışının bu işte değiştirilmemesini açıkça istedi; Fable'a iletildi. Rastgele şifre veya süre sonu akışı eklenmeyecek. Sır değeri bu raporda tekrarlanmaz.

## Tarayıcı doğrulaması

Gemini ayrı `merit_antigravity_e2e` DB, 3033 portu ve `.next-antigravity-audit` klasörüyle Arapça önizlemenin ana belge yönünü değiştirdiğini doğruladı. `GuestFrame.tsx` dil/yön ve ilgili tarayıcı bağlarını iframe'in kendi belgesine bağlar. Üç Chromium testi ve build geçtiğini bildirdi. `/garson` outlet değişimi tam sayfa gezinme kullandığından ilk eski liste iddiası doğrulanmadı; o akış değiştirilmedi. Kayıtlı tasarımla kaydedilmemiş taslağın farklı görünmesi tek başına hata sayılmaz.

## Son teslim ve birleşik kontrol

- Codex: `guestEventFilter.ts` masa siparişinde otel/outlet/masa eşleşmesini zorunlu tutar; eksik kimlik reddedilir. Önce kırmızı, düzeltmeden sonra misafir ve MyBar olay testleri 15/15 geçti. Bağımsız ZCode ve Particle kaynak incelemeleri sorun bildirmedi.
- Fable: `GarsonClient.tsx` başarısız eylem sonucunu kullanıcıya bildirir; beş hedefli test geçtiğini bildirdi. `ThemeManager.tsx` yalnız outlet atama düğmesini mevcut `assignTargets` kapsamıyla hizalar; genel tema yönetimi sistem rolünde kalır. Tema/migration matrisleri 23/23; tarihi migration/seed/rol izinleri değiştirilmedi.
- ZCode: masa çağrısı için kişisel bilgi içermeyen push tipi; aktif işlem kapsamındaki oda servisi personeline SLA alıcılığı; dar SSE `kind` kapısı ve kapsam bandı yenilemesi. Dokuz dosya, hedefli 60/60 bildirdi. İlk uzun Codex sürecinde üç yeni SLA ve bir kapsam testi başarısızken, kaynak değişmeden yeni ZCode sürecinde 40/40 geçti. Eski dönüşüm önbelleği olasılığı son Codex tekrarında ayrıca değerlendirilecek.
- Particle: yalnız demo snapshot'ına bilinen oda servisi siparişlerini ekleyerek dört radar demo hatasını giderdi. Eşik/test değiştirmeden 25/25 bildirdi; stok üretim koduna dokunmadı.
- Gemini: küçük yazılar, kayıtlı uyarı ikonu, güncel rehber adı ve `data-guide` bağı ile önceki kontrast kararına uygun token beklentisini düzeltti. Beş dosyada 36/36 test bildirdi; kurallar/ratchet yükseltilmedi.

İlk Codex `npm run check`: lint 0 hata/43 uyarı, tip kontrolü başarılı; 300 test dosyasından 288 geçti, 12 başarısız. Test toplamı 3171 geçti, 17 başarısız, 13 mevcut atlama; süre 2749,51 sn. Çalışma sırasında düzeltilen kaynaklar nedeniyle ilk sonuç son sabit sürümü temsil etmez. Demo testindeki DB adı reddi için koruma gevşetilmedi: yalnız Codex'e ait test DB adı eğitim kuralına uygun `merit_test_codex1794532126793` yapıldı. Sabit sürümde 20 hedefli dosya filtresi yeni süreçte çalışıyor; lint/tip kontrolü ayrı süreçte tekrarlanıyor. Son sonuç ve güncel birleşik build henüz yok. Commit/push/deploy yapılmadı. Yukarıdaki YET-01/02/03 gereksinim farkları bu düzeltmelerle kapanmış sayılmaz.

Antigravity adına GLM ve Gemini imzalı farklı raporlar aynı kayıt altında birleşti. Geniş GLM statik raporundaki ek maddeler (şeffaf hero, görsel referansları, token/SSE vb.) henüz Codex tarafından tek tek doğrulanmadı; kabul edilmiş hata listesi değildir.

### Son yeni süreç sonucu

Codex'in sabit kaynaklarla çalıştırdığı 20 hedefli dosya **206/206 geçti** (216,79 sn). İlk tam koşudaki başarısız 12 dosyanın tamamı bu tekrara dahildir; yeni personel/garson/tema/kapsama ve misafir regresyonları da dahildir. SLA/kapsama hataları yeni süreçte tekrarlanmadı; ZCode'un kaynak değiştirmeden 40/40 tekrarını destekler. Demo testi eğitim adıyla yeniden adlandırılan yalnız Codex test DB'sinde geçti; uygulamanın DB adı güvenlik kontrolü değiştirilmedi. Güncel lint 0 hata/43 mevcut uyarı; typecheck geçti. Üretim build derleme ve TypeScript aşamalarını geçti, son sayfa verisi aşamasının sonucu bekleniyor.

Bu sonuç yeni bir 300 dosyalık tam yeşil koşu olarak sunulmaz: ilk tam tarama ve ardından başarısız/değişen alanların yeni süreçte başarılı tekrarıdır. YET-01 yetki devri ve YET-02/03 kapsam tasarımı bu test sonucuyla tamamlanmış sayılmaz.

### Kapanış

Güncel birleşik `npm run build` **exit 0** ile tamamlandı; 21 statik sayfa üretildi. Dört Turbopack dinamik dosya erişimi/izleme uyarısı var; hata değildir. 43 lint uyarısı ve bu build uyarıları giderilmiş sayılmıyor. Kaynak/test/rapor değişiklikleri çalışma ağacında; kullanıcı commit/push işini Fable'a doğrudan verdi. Codex commit/push veya deploy başlatmadı. Kullanıcının mevcut `AGENTS.md`, menü görselleri ve yeni menü belgeleri bu denetimin dosyalarından ayrılmalı; toplu `git add .` ile varsayılan olarak sahiplenilmemeli. Üretim/dev DB'ye migration uygulanmadı; kullanıcı dağıtımdan sonra manuel test yapacak. Bu belgenin açık gereksinim farkları ayrıca izlenmeli.
