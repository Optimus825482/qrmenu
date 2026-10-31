// Merit OS proje ilerleme verisi — ilerleme.html bu dosyayı okur.
// status: "done" | "active" | "pending". Yüzde, faz ağırlıkları (weight, toplam 100) üzerinden hesaplanır.
window.ILERLEME = {
  updatedAt: "31.10.2026 14:22",
  headline: "P1 uygulaması başladı (dal p1/cekirdek); P5 planı paralel oturumda yazılıyor.",
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
        { title: "P1 uygulama planı (12 görev)", status: "done", doneAt: "31.10 14:25" }
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
        { title: "T1 Ortak yönetim bileşenleri: XP veri tablosu, form penceresi, CRUD action deseni", status: "active" },
        { title: "T2 Otel, kat ve oda tipi pencereleri", status: "pending" },
        { title: "T3 Oda penceresi (toplu oda ekleme, oda tipi atama, misafir mesajı)", status: "pending" },
        { title: "T4 Outlet ve masa pencereleri; otel bazlı modül aç/kapa", status: "pending" },
        { title: "T5 Kullanıcı penceresi ve outlet ekip ataması", status: "pending" },
        { title: "T6 Rol penceresi ve yetki matrisi (V/O/D/A/R, otel bazlı)", status: "pending" },
        { title: "T7 Kurulum rehberi (bağımlılık zinciri, tamamlanma yüzdesi)", status: "pending" },
        { title: "T8 Online kullanıcı takibi (canlı liste, zorla çıkış)", status: "pending" },
        { title: "T9 Bildirim merkezi ve denetim günlüğü pencereleri", status: "pending" },
        { title: "T10 Sistem ayarları penceresi (Denetim Masası → Sistem)", status: "pending" },
        { title: "T11 P0'dan devreden düzeltmeler (testler, resync, bildirim rolü, iframe teması)", status: "pending" },
        { title: "T12 Kabul: tanım zinciri e2e'leri, belgeler", status: "pending" }
      ]
    },
    {
      code: "P2", title: "Minibar tanımları ve veri göçü", weight: 10,
      summary: "Ürün grubu/ürün/setup/atama, oda QR üretimi, zimmet havuzu, canlı veritabanından tam göç",
      tasks: [
        { title: "Ürün grubu, ürün, setup ve otel bazlı oda tipi–setup atama pencereleri", status: "pending" },
        { title: "Oda QR üretimi (HMAC token), SVG/PNG/ZIP indirme, yazdırma şablonu", status: "pending" },
        { title: "Otel zimmet havuzu: giriş, iade, düzeltme, kritik seviye", status: "pending" },
        { title: "Göç scripti: minibar_legacy → yeni şema (tanımlar + işlem geçmişi), doğrulama raporu", status: "pending" }
      ]
    },
    {
      code: "P3", title: "Minibar operasyonu", weight: 16,
      summary: "Kat sorumlusu ve depo ekranları, oda kontrolü, DND, doluluk Excel, günlük görevler",
      tasks: [
        { title: "Kat sorumlusu PWA: kat planı, kat doluluk, QR okuyucu", status: "pending" },
        { title: "Oda kontrolü: +N ikame, Sarfiyat Yok, DND (2 kontrol, 120 dk hatırlatma, gün sonu)", status: "pending" },
        { title: "Stoklarım, kritik stoklar, depodan ek talep; işlemlerim", status: "pending" },
        { title: "Depo ekranları: havuz, talepler, doluluk Excel yükleme (inhouse/arrivals/departures)", status: "pending" },
        { title: "Günlük görevler ve öncelik planı; DND/yükleme uyarı işleri", status: "pending" }
      ]
    },
    {
      code: "P4", title: "MyBar ve bildirimler", weight: 8,
      summary: "5 dilli misafir oda sayfası, günde 1 talep (ayarlanabilir), karşılama/kapatma/iptal, Web Push",
      tasks: [
        { title: "Misafir oda sayfası (TR/EN/DE/RU/AR, RTL) ve MyBar talebi", status: "pending" },
        { title: "Kat sorumlusu zorunlu onay penceresi, karşılama, kapatma, iptal ekranları", status: "pending" },
        { title: "Web Push kanalı", status: "pending" }
      ]
    },
    {
      code: "P5", title: "QR Menü ve QR Sipariş", weight: 17,
      summary: "Menü ağacı, tema, masa QR, fiyat göster/gizle, sipariş → onay → KDS + yazıcı",
      tasks: [
        { title: "Menü ağacı, çeviri, tema ve masa QR pencereleri", status: "pending" },
        { title: "Fiyat göster/gizle ve sipariş aç/kapa anahtarları", status: "pending" },
        { title: "Misafir menü, sepet, sipariş durumu, garson çağırma", status: "pending" },
        { title: "Garson, kasa ve KDS ekranları; masa ataması", status: "pending" },
        { title: "Print gateway (ESC/POS) ve Yazıcılar penceresi", status: "pending" }
      ]
    },
    {
      code: "P6", title: "Oda servisi", weight: 6,
      summary: "Oda servisi menüsü, misafir akışı, mutfak ekranı, telefon teyidi, SLA",
      tasks: [
        { title: "Oda servisi menüsü ve misafir akışı", status: "pending" },
        { title: "Oda servisi mutfak ekranı, teyit adımı, teslim takibi", status: "pending" }
      ]
    },
    {
      code: "P7", title: "Raporlar, e-posta ve izleme", weight: 8,
      summary: "Rapor merkezi (Excel/PDF), SMTP ve zamanlanmış e-postalar, canlı radar",
      tasks: [
        { title: "Rapor merkezi: tüketim, zimmet, görev, DND, MyBar, sipariş, oturum raporları", status: "pending" },
        { title: "SMTP ayarı ve 08:00/08:05 günlük e-postalar, eksik yükleme uyarıları", status: "pending" },
        { title: "Komuta Merkezi canlı radar ve KPI genişletmeleri", status: "pending" }
      ]
    },
    {
      code: "P8", title: "Kabul, eğitim ve kurulum", weight: 6,
      summary: "Uçtan uca paket, yük denemesi, kılavuzlar, bulut/on-prem kurulum",
      tasks: [
        { title: "Uçtan uca kabul paketi ve yük denemesi (300 misafir + 40 personel)", status: "pending" },
        { title: "Kullanım kılavuzları ve eğitim verisi", status: "pending" },
        { title: "Kurulum (bulut/on-prem), CI'ın GitHub'da doğrulanması", status: "pending" }
      ]
    }
  ],
  log: [
    { at: "31.10 03:07", text: "Proje başladı: şartname ve mevcut tasarımların analizi." },
    { at: "31.10 04:30", text: "Spec ve P0 planı onaylandı; uygulama başladı." },
    { at: "31.10 08:04", text: "P0'ın 14 görevi tamamlandı; final dal incelemesi başladı." },
    { at: "31.10 13:36", text: "Final düzeltme dalgası (1 Kritik + 10 Önemli) tamamlandı ve doğrulandı." },
    { at: "31.10 14:00", text: "Denetim Masası ve PWA 'uygulama olarak yükle' eklendi." },
    { at: "31.10 14:05", text: "P0 main'e birleştirildi (44 commit, 274 birim + 36 e2e test)." },
    { at: "31.10 14:15", text: "İlerleme sayfası oluşturuldu." },
    { at: "31.10 14:25", text: "P1 planı yazıldı (docs/superpowers/plans/2026-10-31-p1-cekirdek.md)." },
    { at: "31.10 14:22", text: "P1 uygulaması subagent-driven başladı; P5 planı paralel oturumda." }
  ]
};
