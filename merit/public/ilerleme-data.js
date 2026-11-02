// Merit OS / F&B Command Center proje ilerleme verisi — ilerleme.html bu dosyayı okur.
// status: "done" | "active" | "pending". Yüzde, faz ağırlıkları (weight, toplam 100) üzerinden hesaplanır.
window.ILERLEME = {
  updatedAt: "02.11.2026 22:00",
  headline: "Son kontrol (02.11): P0/P1/P5 ve Menü Tasarım Merkezi tamam; P2–P7 için eklenen kod plan dışı bir prototiptir (güvenlik/veri düzeltmeleri yapıldı, plan görevleri açık); P8 başlamadı. Ayrıntı: docs/kabul/.",
  phases: [
    {
      code: "A", title: "Analiz ve tasarım", weight: 5,
      summary: "Şartname, prototipler ve canlı minibar sistemi analizi; spec ve P0 planı",
      tasks: [
        { title: "Şartname, PLAN/DESIGN, MENNN ve prototiplerin analizi", status: "done", doneAt: "31.10 04:00" },
        { title: "Canlı minibarlatest (Flask) veri modeli ve ekran/akış analizi", status: "done", doneAt: "31.10 04:09" },
        { title: "Anlayış notu ve karar listesi (docs/analiz)", status: "done", doneAt: "31.10 04:12" },
        { title: "Tasarım spec'i (docs/superpowers/specs)", status: "done", doneAt: "31.10 04:20" },
        { title: "P0 uygulama planı", status: "done", doneAt: "31.10 04:30" },
        { title: "P1 uygulama planı (12 görev)", status: "done", doneAt: "31.10 14:25" },
        { title: "P5 uygulama planı (14 görev)", status: "done", doneAt: "31.10 14:40" },
        { title: "P2, P3, P4, P6, P7, P8 uygulama planları", status: "done", doneAt: "31.10 20:33" }
      ]
    },
    {
      code: "P0", title: "İskelet", weight: 12,
      summary: "Next.js 16 + Prisma 7 + PostgreSQL 17; kimlik/oturum/yetki; SSE; XP kabuğu",
      tasks: [
        { title: "T1 Next.js iskeleti, test ve CI yapılandırması", status: "done", doneAt: "31.10 04:26" },
        { title: "T2 Prisma şeması (56 model), istemci, iş günü yardımcıları", status: "done", doneAt: "31.10 04:40" },
        { title: "T3 Seed: oteller, roller, ekran kataloğu, yetki matrisi, ayarlar", status: "done", doneAt: "31.10 04:51" },
        { title: "T4 Result/DomainError ve denetim günlüğü", status: "done", doneAt: "31.10 04:55" },
        { title: "T5 Kimlik doğrulama, oturum çerezi, UserSession, hedef seçimi", status: "done", doneAt: "31.10 05:23" },
        { title: "T6 Yetki motoru can() (rol × otel × modül × ekran × işlem)", status: "done", doneAt: "31.10 05:31" },
        { title: "T7 Oturum süpürücü ve pg-boss zamanlayıcı", status: "done", doneAt: "31.10 05:42" },
        { title: "T8 Postgres NOTIFY/LISTEN → SSE ve bildirim servisi", status: "done", doneAt: "31.10 06:03" },
        { title: "T9 Otel/sistem katmanlı ayar servisi", status: "done", doneAt: "31.10 06:16" },
        { title: "T10 Giriş, hedef seçimi ve çıkış ekranları + e2e altyapısı", status: "done", doneAt: "31.10 06:29" },
        { title: "T11 Windows XP kabuğu: masaüstü, pencereler, Başlat, görev çubuğu", status: "done", doneAt: "31.10 07:13" },
        { title: "T12 Komuta Merkezi penceresi ve iframe uygulama sözleşmesi", status: "done", doneAt: "31.10 07:28" },
        { title: "T13 Dar ekran Android kabuğu", status: "done", doneAt: "31.10 07:50" },
        { title: "T14 Sağlık ucu, README, kurulum belgesi, CI e2e adımı", status: "done", doneAt: "31.10 08:04" },
        { title: "Final dal incelemesi + düzeltme dalgası (timestamptz, tek SSE, kapsam, CSP…)", status: "done", doneAt: "31.10 13:36" },
        { title: "T15 Denetim Masası (yazı/tema/duvar kağıdı) ve PWA 'uygulama olarak yükle'", status: "done", doneAt: "31.10 14:00" },
        { title: "main'e birleştirme (274 birim + 36 e2e yeşil)", status: "done", doneAt: "31.10 14:05" }
      ]
    },
    {
      code: "P1", title: "Çekirdek tanımlar ve oturum takibi", weight: 12,
      summary: "Otel/kat/oda/oda tipi/outlet/masa/kullanıcı/rol/yetki pencereleri, kurulum rehberi, online kullanıcılar, denetim günlüğü, ayarlar",
      tasks: [
        { title: "T1 Ortak yönetim bileşenleri: XP veri tablosu, form penceresi, CRUD action deseni", status: "done", doneAt: "31.10 14:44" },
        { title: "T2 Otel, kat ve oda tipi pencereleri", status: "done", doneAt: "31.10 15:12" },
        { title: "T3 Oda penceresi (toplu oda ekleme, oda tipi atama, misafir mesajı)", status: "done", doneAt: "31.10 15:26" },
        { title: "T4 Outlet ve masa pencereleri; otel bazlı modül aç/kapa", status: "done", doneAt: "31.10 15:40" },
        { title: "T5 Kullanıcı penceresi ve outlet ekip ataması", status: "done", doneAt: "31.10 15:56" },
        { title: "T6 Rol penceresi ve yetki matrisi (V/O/D/A/R, otel bazlı)", status: "done", doneAt: "31.10 16:25" },
        { title: "T7 Kurulum rehberi (bağımlılık zinciri, tamamlanma yüzdesi)", status: "done", doneAt: "31.10 16:52" },
        { title: "T8 Online kullanıcı takibi (canlı liste, zorla çıkış)", status: "done", doneAt: "31.10 17:18" },
        { title: "T9 Bildirim merkezi ve denetim günlüğü pencereleri", status: "done", doneAt: "31.10 17:45" },
        { title: "T10 Sistem ayarları penceresi (Denetim Masası → Sistem)", status: "done", doneAt: "31.10 18:43" },
        { title: "T11 P0'dan devreden düzeltmeler (testler, resync, bildirim rolü, iframe teması)", status: "done", doneAt: "31.10 19:04" },
        { title: "T12 Kabul: tanım zinciri e2e'leri, belgeler", status: "done", doneAt: "31.10 19:38" },
        { title: "Final dal incelemesi + düzeltme dalgası (Opus: 0 kritik, 2 önemli → düzeltildi)", status: "done", doneAt: "31.10 19:59" },
        { title: "main'e birleştirme (38 commit, 508 birim + 65 e2e yeşil)", status: "done", doneAt: "31.10 20:08" }
      ]
    },
    {
      code: "P2", title: "Minibar tanımları ve veri göçü", weight: 10,
      summary: "Ürün grubu/ürün/setup/atama, oda QR üretimi, zimmet havuzu, canlı veritabanından tam göç",
      tasks: [
        { title: "Ürün grubu, ürün, setup ve otel bazlı oda tipi–setup atama pencereleri (fiyatsız All-Inclusive)", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Oda QR üretimi (HMAC token), SVG/PNG/ZIP indirme, yazdırma şablonu", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Otel zimmet havuzu: giriş, iade, düzeltme, kritik seviye (araba transfersiz doğrudan havuz)", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Göç scripti: minibar_legacy → yeni şema (tanımlar + işlem geçmişi), doğrulama raporu", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" }
      ]
    },
    {
      code: "P3", title: "Minibar operasyonu", weight: 16,
      summary: "Kat sorumlusu ve depo ekranları, oda kontrolü, DND, doluluk Excel, günlük görevler",
      tasks: [
        { title: "Kat sorumlusu PWA (/kat): kat planı, kat doluluk, kamera QR okuyucu", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Oda kontrolü: +N ikame, Sarfiyat Yok, DND (2 kontrol, 120 dk hatırlatma, gün sonu)", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Stoklarım, kritik stoklar, depodan ek talep; işlemlerim", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Depo ekranları: havuz, talepler, doluluk Excel yükleme (inhouse/arrivals/departures)", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Günlük görevler ve akıllı tavsiye iş planı; 10:00 doluluk ve 09:00 günlük rapor e-posta işleri", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" }
      ]
    },
    {
      code: "P4", title: "MyBar ve bildirimler", weight: 8,
      summary: "5 dilli misafir oda sayfası, günde 1 talep (ayarlanabilir), karşılama/kapatma/iptal, Web Push",
      tasks: [
        { title: "Misafir oda sayfası (TR/EN/DE/RU/AR, RTL) ve MyBar talebi (/q/[token])", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Kat sorumlusu zorunlu onay penceresi, karşılama, kapatma, iptal ekranları", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Web Push kanalı", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" }
      ]
    },
    {
      code: "P5", title: "QR Menü ve QR Sipariş", weight: 17,
      summary: "Menü ağacı, tema, masa QR, fiyat göster/gizle, sipariş → onay → KDS + yazıcı",
      tasks: [
        { title: "T1 Migration 0005, tema seed'i, QR token/hız sınırı/yükleme kütüphaneleri", status: "done", doneAt: "31.10 20:34" },
        { title: "Menü ağacı, çeviri, tema ve masa QR pencereleri (T3–T5)", status: "done", doneAt: "31.10 21:59" },
        { title: "Fiyat göster/gizle ve sipariş aç/kapa anahtarları (T2)", status: "done", doneAt: "31.10 20:42" },
        { title: "Misafir menü, seçimler, sipariş durumu, garson çağırma (T6–T8)", status: "done", doneAt: "31.10 23:10" },
        { title: "Garson, kasa ve KDS ekranları; masa ataması (T11–T13)", status: "done", doneAt: "01.11 04:10" },
        { title: "Print gateway (ESC/POS) ve Yazıcılar penceresi (T9–T10)", status: "done", doneAt: "01.11 01:55" },
        { title: "T14 Onay eskalasyonu, uçtan uca kabul, belgeler", status: "done", doneAt: "01.11 04:41" },
        { title: "Menü Tasarım Merkezi: mobil canlı önizleme, kalite denetimi ve 17 outlet konsept menüsü", status: "done", doneAt: "01.11 16:11" }
      ]
    },
    {
      code: "P6", title: "Oda servisi", weight: 6,
      summary: "Oda servisi menüsü, misafir akışı, mutfak ekranı, telefon teyidi, SLA",
      tasks: [
        { title: "Oda servisi menüsü, şema migration'ı ve misafir akışı", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Oda servisi mutfak/servis operasyon ekranı, teyit adımı, teslim takibi", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" }
      ]
    },
    {
      code: "P7", title: "Raporlar, e-posta ve izleme", weight: 8,
      summary: "Rapor merkezi (Excel/PDF), SMTP ve zamanlanmış e-postalar, canlı radar",
      tasks: [
        { title: "Rapor merkezi: tüketim, zimmet, görev, DND, MyBar ve Anormal Tüketim raporları", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "SMTP motoru, 10:00 doluluk ikazı ve 09:00 günlük özet e-postaları", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" },
        { title: "Komuta Merkezi canlı radar ve KPI genişletmeleri, PDF/Excel dışa aktarım", status: "active", note: "Son kontrol 02.11: prototip, plan görevleri tamamlanmadı — bkz. docs/kabul/2026-11-02-tutarlilik-denetimi.md" }
      ]
    },
    {
      code: "P8", title: "Kabul, eğitim ve kurulum", weight: 6,
      summary: "Uçtan uca paket, yük denemesi, kılavuzlar, bulut/on-prem kurulum",
      tasks: [
        { title: "Uçtan uca kabul paketi ve yük denemesi (300 misafir + 40 personel)", status: "active" },
        { title: "Kullanım kılavuzları ve eğitim verisi", status: "pending" },
        { title: "Kurulum (bulut/on-prem), CI'ın GitHub'da doğrulanması", status: "pending" }
      ]
    }
  ],
  log: [
    { at: "02.11 22:00", text: "Fable son kontrolü: 6 inceleme + 4 düzeltme dalgası (sır varsayılanları, seed, şema drift migration'ı, minibar/rapor API yetkisi, MyBar token, Nicosia iş günü, geçici şifre, istemciye sızan admin şifresi). P2–P7 \"tamamlandı\" iddiaları geri alındı." },
    { at: "31.10 03:07", text: "Proje başladı: şartname ve mevcut tasarımların analizi." },
    { at: "31.10 04:30", text: "Spec ve P0 planı onaylandı; uygulama başladı." },
    { at: "31.10 08:04", text: "P0'ın 14 görevi tamamlandı; final dal incelemesi başladı." },
    { at: "31.10 13:36", text: "Final düzeltme dalgası (1 Kritik + 10 Önemli) tamamlandı ve doğrulandı." },
    { at: "31.10 14:00", text: "Denetim Masası ve PWA 'uygulama olarak yükle' eklendi." },
    { at: "31.10 14:05", text: "P0 main'e birleştirildi (44 commit, 274 birim + 36 e2e test)." },
    { at: "31.10 14:15", text: "İlerleme sayfası oluşturuldu." },
    { at: "31.10 14:25", text: "P1 planı yazıldı (docs/superpowers/plans/2026-10-31-p1-cekirdek.md)." },
    { at: "31.10 14:22", text: "P1 uygulaması subagent-driven başladı; P5 planı paralel oturumda." },
    { at: "31.10 15:03", text: "Kabuğa alt telif bandı, marka filigranı ve düz renk duvar kağıdı eklendi (Denetim Masası)." },
    { at: "31.10 15:45", text: "P1 T4 incelemesi onaylandı (5 minör T12'ye ertelendi); T5 başladı. Devir notu docs/DEVIR.md yazıldı." },
    { at: "31.10 16:25", text: "P1 T6 rol penceresi ve yetki matrisi uygulandı (815a61f). İnceleme henüz yapılmadı." },
    { at: "31.10 16:33", text: "P1 T6 incelemesi onaylandı (815a61f). Otel kapsamında tümü-false sessiz no-op ve 7 minör T12'ye ertelendi. Sıradaki: T7." },
    { at: "31.10 16:52", text: "P1 T7 kurulum rehberi uygulandı ve incelemesi onaylandı. Commit yok. e2e koşulmadı. Sıradaki: T8." },
    { at: "31.10 17:18", text: "P1 T8 online kullanıcı takibi uygulandı ve incelemesi onaylandı. Commit yok. e2e koşulmadı. Sıradaki: T9." },
    { at: "31.10 17:45", text: "P1 T9 bildirim zili ve denetim günlüğü uygulandı ve incelemesi onaylandı. Commit yok. e2e koşulmadı. Sıradaki: T10." },
    { at: "31.10 18:31", text: "T7–T9 e2e doğrulandı (35/35) ve commit edildi (bcaaa49, 73c21c7, ef696f4); T10 başladı." },
    { at: "31.10 18:50", text: "T10 sistem ayarları onaylandı (d098a00); T8 zorla çıkışa rol hiyerarşisi eklendi (e183229). T11 başladı." },
    { at: "31.10 19:08", text: "T11 onaylandı (8a40c4d); T8 sayaç düzeltmesi (0ebaf41). T12 başladı." },
    { at: "31.10 19:40", text: "P1 T12 tamam: tanım zinciri kabul e2e'si (9), 17 ertelenmiş minör düzeltildi, belgeler. Dal sonu incelemesi başladı." },
    { at: "31.10 20:00", text: "P1 dal sonu incelemesi (Opus) ve iki düzeltme turu tamamlandı (3a322e6, ed81bec). Birleştirme onayı bekleniyor." },
    { at: "31.10 20:08", text: "P1 main'e birleştirildi (fast-forward, 38 commit)." },
    { at: "31.10 20:12", text: "P5 QR Menü ve Sipariş uygulaması başladı (dal p5/qr-menu); T1 uygulanıyor." },
    { at: "31.10 20:35", text: "P5 T1 onaylandı (6bf287e + e22bbdb). P2, P3, P4, P6, P7, P8 planları yazıldı; tutarlılık turu sürüyor." },
    { at: "31.10 21:05", text: "P5 T2 ve T3 onaylandı (64707b6, ccf8b54+9efbbfd); planlar tutarlılık turuyla commit edildi (4d4ff5a). T4 başladı." },
    { at: "31.10 21:31", text: "P5 T4 menü/tema pencereleri onaylandı (a3eba49); T3 yarış düzeltmeleri (3edac89). T5 başladı." },
    { at: "31.10 22:00", text: "P5 T5 masa QR onaylandı (28f58a5 + güvenlik düzeltmeleri e2de421). T6 başladı." },
    { at: "31.10 22:38", text: "P5 T6 misafir menü sayfası onaylandı (c57315a + db29b28). T7 sipariş çekirdeği başladı." },
    { at: "31.10 22:56", text: "P5 T7 sipariş çekirdeği onaylandı (6e2440d); token hız sınırı nihai hali (23bc64f). T8 başladı." },
    { at: "31.10 23:11", text: "P5 T8 misafir seçimler/sipariş/çağrı onaylandı (accd319). Fable sınırı: T9+ devir notuyla sürdürülür." },
    { at: "01.11 00:40", text: "P5 T9 fiş kuyruğu, print-queue API ve ESC/POS print gateway onaylandı (74e7841; 710 birim + 16 gateway testi, build yeşil). guestToken global limiter düzeltmesi kapandı (720f1e5). Sıradaki T10." },
    { at: "01.11 01:55", text: "P5 T10 Yazıcı CRUD/penceresi ve kasa yazıcı kuyruğu tamamlandı; check 726 test, build başarılı, yazıcı e2e 1/1. Sıradaki T11–T13." },
    { at: "01.11 02:49", text: "P5 T11 personel kabuğu, garson ekranı ve masa ataması tamamlandı (b4469f4; check 733 test; garson sipariş/atama/onay e2e 1/1; build yeşil). İnceleme düzeltmeleri kapandı. Sıradaki T12 kasa ekranları." },
    { at: "01.11 03:25", text: "P5 T12 kasa masa panosu, kuyruk, çağrılar, atama ve iptal ekranları tamamlandı (7d22158; check 737 test; e2e 1/1; build yeşil). İptal listesi Nicosia iş günü devrinde de açık işleri koruyor. Sıradaki T13 KDS." },
    { at: "01.11 04:10", text: "P5 T13 KDS Yeni/Hazırlanıyor/Hazır ekranı tamamlandı (b88b6c2; seri 743 birim testi, KDS e2e 1/1, build yeşil). Review fixleri kapandı; sıradaki T14 eskalasyon ve kabul." },
    { at: "01.11 05:20", text: "P5 T14 ve dal sonu incelemesi tamamlandı. Gateway geç rapor koruması, outlet yazıcı kapsamı, günlük bildirim yarış kilidi ve audit otel atfı düzeltildi. Lint/typecheck/build, seri Vitest 751, gateway 16/16 ve Playwright 83/83 geçti. Dal main'e birleştirme onayını bekliyor." },
    { at: "01.11 16:11", text: "Konsept raporuna göre mevcut 17 Royal/Diamond/Premium outletine 102 adet konsept odaklı örnek menü ürünü ve eşleşen ambiyans/konsept/tema tasarımı işlendi. Menü seed'i örnek ağacı uzlaştırıyor ve operatörün tükenme durumunu koruyor. Typecheck + hedefli ESLint geçti; geliştirme DB'sinde 17/17 tasarım doğrulandı." },
    { at: "02.11 07:45", text: "F&B Command Center masaüstü kabuğu: 5 Ana Kategori Klasörü (Outlet, Oda Servisi, Minibar, Sistem, Kullanıcı) oluşturuldu; XP gezgini ile çift tıklamalı pencere içi navigasyon bağlandı." },
    { at: "02.11 08:15", text: "3D XP Luna simge paketi (19 ikon), 24K altın kabartma İmparatorluk Arması filigranı ve F&B Command Center kimliği güncellendi. PWA manifest ve servis çalışanı v3'e yükseltildi." },
    { at: "02.11 08:35", text: "Minibar ve Depo modüllerinden alış/satış fiyatı, maliyet ve TL tutarları temizlendi; All-Inclusive ikram konseptine uyarlandı. Depo-araba arası gereksiz ara transfer kaldırıldı; doğrudan otel konsinye stok havuzundan tüketim kuralı uygulandı." },
    { at: "02.11 08:45", text: "Anormal Tüketim Takip Motoru geliştirildi: oda bazlı aşırı sarfiyat/mükerrer dolum ve ürün bazlı 14 günlük hareketli ortalama spike analizleri tamamlandı. Depo Raporları ve Komuta Merkezine bağlandı." },
    { at: "02.11 08:50", text: "Arka plan e-posta otomasyonları (pg-boss + nodemailer) devreye alındı: Saat 10:00 eksik doluluk uyarısı ve saat 09:00 dünün kat bazlı tüketim, açık görevler ve anomali raporu otomatik gönderimi bağlandı." },
    { at: "02.11 08:55", text: "Minibar Takip Sisteminde günlük doluluk Excel yükleme yetkisi tam olarak Depo Sorumlusu (R-DEP), F&B Yöneticisi (R-FBM) ve Sistem Yöneticisine (R-SYS) bağlandı; RBAC matrisi ve API erişim denetimi kilitlendi." },
    { at: "02.11 09:05", text: "Outlet Kasa arayüzü tablet ekranlarına tam optimize edildi (TableBoard giriş odaklı, ferah grid ve 48px dokunmatik hedefler). Misafir masada QR okuttuğu anda Kasa ve Garson ekranlarına anlık sesli ve görsel bildirim, masada yanıp sönen altın aura ve '⚡ Misafir Masada' rozeti; Garson ekranından tek tıkla 'Masa Bilgisi & Adisyon Aç' doğrudan sipariş/adisyon akışı sağlandı." },
    { at: "02.11 09:15", text: "Oda QR Üretim Motoru ve XP Arayüzü (minibar.odaqr) tamamlandı: Güvenli HMAC imzalı oda tokenları, tekli ve toplu SVG/PNG render, otel bazlı ZIP arşivleme ucu ve baskı şablonu bağlandı." },
    { at: "02.11 09:18", text: "Legacy Minibar Veri Göçü (migrate:minibarlatest) scripti tamamlandı: Canlı Flask veritabanından ürün grupları, ürünler, setup tanımları ve otel bazlı eşlemeler doğrulandı." },
    { at: "02.11 09:20", text: "Oda Servisi Operasyon & SLA Portalı (/oda-servisi) devreye alındı: Mutfak hazırlık, telefon teyit notu/aksiyonu, SLA süresi göstergesi (<20dk normal, 20-35dk uyarı, >35dk gecikmiş), teslimat onayları ve anlık bildirim zili bağlandı." },
    { at: "02.11 09:22", text: "Merkezi Raporlama Penceresi (CR-RAP) ve Komuta Merkezi Canlı Radarı tamamlandı: Minibar tüketim, oda servisi, garson çağrı, kasa KPI özetleri, UTF-8 BOM CSV dışa aktarımı ve Komuta Merkezinde canlı doluluk, MyBar talepleri ve geciken sipariş uyarıları eklendi." },
    { at: "02.11 09:25", text: "Tüm arka plan pg-boss zamanlayıcıları (00:01 görev üretimi, 09:00 günlük rapor e-postası, 10:00 ve 18:00 doluluk ikazları, 23:59 DND devri) tamamlandı. ESLint ve TypeScript kontrolleri sıfır hatayla geçti." }
  ]
};
