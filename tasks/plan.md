# Merit OS — 13 Kasım 2026 ekip denetimi

## Amaç ve kapsam

Erkan, Codex'in incelemeyi yönetmesini ve Claude Code/Fable ile raporları çapraz değerlendirmesini istedi. Üç otelde (Merit Royal, Royal Diamond, Royal Premium) QR menü, oda servisi, minibar/stok, menü tasarım stüdyosu ve kullanıcı/görev/rol/ekip yetkileri incelenecek. İlk tur incelemedir; uygulama değişikliği, canlı veri işlemi veya dağıtım içermez.

Başlangıç kodu: `08941fda`. Çalışma ağacında kullanıcıya ait `merit/AGENTS.md` değişikliği, menü görselleri ve menü çalışma klasörü var; korunacak. Önceki denetim: `docs/analiz/2026-11-10-tum-moduller-denetim.md`. Eski açık/kapalı etiketler güncel doğrulama yerine geçmez.

## Kullanıcının tanımladığı kabul modeli

- Müdür ve sistem sorumlusu en üst yetki düzeyindedir. Mevcut kodda birden çok yönetici rolü bulunduğu için her kodun bu tanıma uyduğu varsayılmaz.
- Oda servisi sorumlusu minibar ve oda servisi personelinin işlemlerini yapar, onay verir, kapsamındaki alt kullanıcıları oluşturur ve onların ekran/işlem yetkilerini yönetir.
- Outlet sorumlusu/süpervizör bir veya daha fazla atanmış outletin garsonlarını yönetir. Atanmamış otel ve outletlere erişim verilmez.
- Görüntüleme, oluşturma, düzenleme, onay ve raporlama ayrı denetlenir. Kodda D düzenleme, A onaydır; silme için ayrı bir D bayrağı olduğu varsayılmaz.
- İstemcide gizleme tek başına yeterli değildir: sunucu işlemleri, otel/outlet/ekip kapsamı ve açık oturum davranışı doğrulanır.

## İş dağılımı ve iletişim

Görevler ortak claudemem mesaj tahtasına ayrı hedeflerle gönderildi. Erkan ajanları kendi oturumlarında manuel tetikler; mesajın kaydı çalışmanın başladığını kanıtlamaz. Otomatik dinleyici bu işin kapsamı dışında.

| Hedef | İnceleme | Görev kaydı |
|---|---|---|
| Claude Code / Fable | Yetki hiyerarşisi, kullanıcı ve ekip yönetimi; Codex bulgularını çapraz inceleme | `69d035e0` |
| ZCode | QR sipariş, mutfak, oda servisi, teslim, SLA ve canlı olaylar | `7a981cce` |
| Particle / Free Pi | Minibar, MyBar, DND, stok, zimmet ve onay mutabakatı | `d491a299` |
| Antigravity / Gemini | Menü stüdyosu, yayınlama, misafir ve personel arayüzleri | `d705116b` |
| Codex | Koordinasyon, bağımsız yetki denetimi, rapor/radar, oturum ve işletim sınırları; bulgu birleştirme | Bu plan ve inceleme raporu |

Görevler ajanların kayıtlı kimliklerine yönlendirildi; gerçekten kullandıkları model raporda belirtilmeli. Dış ajan/model çalıştırıldığı varsayılmaz.

## Bağımlılıklar ve doğrulama

1. Her incelemeci güncel HEAD'i, yerel kuralları ve ilgili eski bulguları kontrol eder.
2. Bulgular P0/P1/P2/P3 önem, dosya:satır, tetikleme, iş etkisi ve önerilen düzeltmeyle gelir. Varsayım, kod kanıtı ve çalışan test birbirinden ayrılır.
3. Codex ve Claude Code/Fable önemli bulguları kaynak üzerinden bağımsız değerlendirir; yinelenen ve artık geçerli olmayan maddeler ayrılır.
4. Testler tek koordinatörden zamanlanır. Ortak/dev DB'yi sıfırlayan komut çalıştırılmaz; ajan DB, port ve build klasörleri ayrılır. 3000/3001/3010 korunur. Ortam sırları rapora yazılmaz.
5. Son rapor açıklar, kapandığı doğrulanan eski bulgular, kapsam eksikleri ve öncelikli düzeltme sırasını içerir. Rapor alınmayan modül tamamlandı sayılmaz.

## Riskler ve sınırlar

- Mesaj tahtası benzer içerikleri birleştirebiliyor. İlk gönderimde üç görevin birleşmesi ayrı kayıtlar oluşturulup ZCode kaydı temizlenerek düzeltildi; sonraki gönderimler hedef ve içerik açısından kontrol edilmeli.
- Mevcut yetki matrisi rol bazlıdır; kullanıcıya/ekibe özgü yetki devri ayrıca kanıtlanmalıdır. Sadece sistem korumasını kaldırmak güvenli bir çözüm değildir.
- Kalıcı sonuçlar ve kararlar ortak hafızaya kaydedilir; geçici ilerleme bu plan/görev listesi ve mesaj durumlarında tutulur.

Görev ve kontrol listesi: `tasks/todo.md`. Kanıt raporu: `docs/analiz/2026-11-13-ekip-denetimi.md`.
