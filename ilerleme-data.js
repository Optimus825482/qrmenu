// Merit OS / F&B Command Center proje ilerleme verisi — ilerleme.html bu dosyayı okur.
// status: "done" | "active" | "pending". Yüzde, faz ağırlıkları (weight, toplam 100) üzerinden hesaplanır.
window.ILERLEME = {
  updatedAt: "03.11.2026 16:35",
  headline: "Minibar P2/P3 tamamlandı ve doğrulandı. P4 MyBar veri temeli (T1) ve talep yaşam döngüsü servisi (T5) tamamlandı; Canlı Radar T1–T11 (/radar duvar ekranı modu, wakeLock, ses kapısı ve otomatik dönüş dahil) kapandı. Sıradaki: Radar T12 (bütünleştirme ve yük kanıtı) ve UX T9–T15.",
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
        { title: "Ürün grubu, ürün, setup ve otel bazlı oda tipi–setup atama pencereleri (fiyatsız All-Inclusive)", status: "done", doneAt: "03.11 14:54", note: "14 görevlik minibar tamamlama planı uygulandı ve incelendi. Katalog/havuz/QR servisleri hazır; son check/build/e2e bekleniyor. UI cilası UX planında." },
        { title: "Oda QR üretimi (HMAC token), SVG/PNG/ZIP indirme, yazdırma şablonu", status: "done", doneAt: "03.11 14:54", note: "QR indirme token yenilemez; üretim, toplu modlar, baskı ve yetki testleri incelendi. Son dalga doğrulaması bekleniyor." },
        { title: "Otel zimmet havuzu: giriş, iade, düzeltme, kritik seviye (araba transfersiz doğrudan havuz)", status: "done", doneAt: "03.11 14:54", note: "Tek sahipli havuz, işaretli hareket ve kritik stok çekirdeği incelendi. Son dalga doğrulaması bekleniyor." },
        { title: "Göç scripti: minibar_legacy → yeni şema (tanımlar + işlem geçmişi), doğrulama raporu", status: "done", doneAt: "03.11 14:54", note: "Tanımlar, işlem geçmişi, doluluk/görev/DND/günlük göçü uygulandı. Kapanış e34a0ee: eşlenmiş hedef doğrulaması; 171/171 göç testi ve bağımsız inceleme geçti. Gerçek aktarım yapılmadı." }
      ]
    },
    {
      code: "P3", title: "Minibar operasyonu", weight: 16,
      summary: "Kat sorumlusu ve depo ekranları, oda kontrolü, DND, doluluk Excel, günlük görevler",
      tasks: [
        { title: "Kat sorumlusu PWA (/kat): kat planı, kat doluluk, kamera QR okuyucu", status: "done", doneAt: "03.11 14:54", note: "Kat planı ve QR okuyucu servisleri incelendi; ekran tasarımı UX T9 kapsamında. Minibar son doğrulaması sürüyor." },
        { title: "Oda kontrolü: +N ikame, Sarfiyat Yok, DND (2 kontrol, 120 dk hatırlatma, gün sonu)", status: "done", doneAt: "03.11 14:54", note: "Kapanış 1dd4bc7: gecikmiş 23:59 işi yeni günü kapatmaz; geç doluluk görevleri mevcut kontrol/DND sonucunu devralır. 96/96 hedefli test ve bütünleşik inceleme geçti." },
        { title: "Stoklarım, kritik stoklar, depodan ek talep; işlemlerim", status: "done", doneAt: "03.11 14:54", note: "Stok ve ek talep yaşam döngüsü/havuz işlemleri uygulandı ve incelendi; son dalga doğrulaması bekleniyor. UI cilası UX planında." },
        { title: "Depo ekranları: havuz, talepler, doluluk Excel yükleme (inhouse/arrivals/departures)", status: "done", doneAt: "03.11 14:54", note: "Doluluk Excel, yükleme görevleri ve depo servisleri incelendi. Görünüm matrisindeki bilinen dokunma hedefleri UX kapsamında; son doğrulama sürüyor." },
        { title: "Günlük görevler ve akıllı tavsiye iş planı; 10:00 doluluk ve 09:00 günlük rapor e-posta işleri", status: "done", doneAt: "03.11 14:54", note: "Altı pg-boss kuyruğu, görev uzlaştırma ve rapor veri sözleşmesi incelendi. Bağımsız legacy rapor karşılaştırması P7/kabul kapsamındadır; tam check/build/e2e sürüyor." }
      ]
    },
    {
      code: "P4", title: "MyBar ve bildirimler", weight: 8,
      summary: "5 dilli misafir oda sayfası, günde 1 talep (ayarlanabilir), karşılama/kapatma/iptal, Web Push",
      tasks: [
        { title: "Misafir oda sayfası (TR/EN/DE/RU/AR, RTL) ve MyBar talebi (/q/[token])", status: "active", note: "T1 veri temeli (migration 20261103121000_p4_mybar, mybar.* olayları, ayarlar, hız sınırları — c201ba3) doğrulandı; misafir akışı ve i18n/çeviri görevleri sırada" },
        { title: "Kat sorumlusu zorunlu onay penceresi, karşılama, kapatma, iptal ekranları", status: "active", note: "T5 talep yaşam döngüsü servisi (gördüm, kapatma, iptal, liste, KPI — d2757e9, 11/11 test yeşil) tamamlandı; personel UI pencereleri sırada" },
        { title: "Web Push kanalı", status: "active", note: "T9 Web Push ve bildirim zili genişletmesi sırada" }
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
      code: "UX", title: "Arayüz / UX yenilemesi", weight: 10,
      summary: "Belirteçler ve görünüm matrisi, tek onay/snackbar, emoji→ikon, POS masa haritası, KDS, personel kabuğu, kabuk seçimi/PWA, yetki rehberi, XP cilası",
      tasks: [
        { title: "T1 Belirteçler, dokunma kademeleri, görünüm matrisi, axe", status: "done", doneAt: "03.11 05:54", note: "fce492b (inceleme onaylı)" },
        { title: "T2 İniş/katalog düzeltmesi, /baslat, yetkisiz ekran sayfası", status: "done", doneAt: "03.11 02:58", note: "7244d05 + ded9ca7 (inceleme onaylı)" },
        { title: "T3–T4 Tek onay, snackbar, tarayıcı diyaloglarının kaldırılması", status: "done", doneAt: "03.11 05:55", note: "0d0cc5f + b5f8022 (incelemeler onaylı)" },
        { title: "T5 Emoji → SVG ikon, animasyon, para birimi", status: "done", doneAt: "03.11 06:52", note: "72c35cf — 437 emoji → 0, 32 sürekli animasyon kaldırıldı, formatPrice; inceleme sürüyor" },
        { title: "T6 POS kabuğu ve kasa masa haritası", status: "done", doneAt: "03.11 10:55", note: "c441101 + 1927871 (inceleme onaylı): tam ekran/wake-lock/ses kapısı, 44 px durum şeridi, masa haritası ve yan panel" },
        { title: "T7 KDS yenilemesi ve sesler", status: "done", doneAt: "03.11 12:10", note: "41ad912 (inceleme onaylı): üç sütun, 64 px bump, Hazır geri alma (6 sn), ses ipuçları" },
        { title: "T8 Personel kabuğu (StaffShell) ve depo ana sayfası", status: "done", doneAt: "03.11 14:00", note: "4d82da4 (inceleme onaylı): tek alt gezinme/ray, gezinme modeli, profil menüsü, oturum şeridi, /depo panosu" },
        { title: "T9 Kat sorumlusu akışları (MyBar anlık, +N, QR)", status: "pending" },
        { title: "T10 Kabuk seçimi, PWA manifestleri, kiosk", status: "pending" },
        { title: "T11 screenGuide, accessSummary, Erişimim", status: "done", doneAt: "03.11 05:55", note: "b5f8022 (inceleme onaylı); rehber metinleri docs/kabul/ux-rehber-metinleri.md onayınızı bekliyor" },
        { title: "T12 Tur motoru ve ? yardım", status: "pending" },
        { title: "T13 Günlük kontrol listeleri ve Kullanıcıya göster", status: "pending" },
        { title: "T14–T15 XP cilası, görünüm matrisi kapanışı, belgeler", status: "pending" }
      ]
    },
    {
      code: "RADAR", title: "Canlı Operasyon Radarı", weight: 6,
      summary: "Olay birliği ve yayın boşlukları, CR-RAD, anlık görüntü, gün tekrarı, XP penceresi ve görünümler, zaman şeridi, duvar ekranı",
      tasks: [
        { title: "T1–T4 Olay birliği, yayın boşlukları, migration/CR-RAD/OperationEvent", status: "done", doneAt: "03.11 16:00", note: "T1 (3e1be71), T2 (23df08f), T4 (0552fe5) ve T3 minibar/MyBar yayın boşlukları (G2–G10, G12, G15, G16; radar-publish-minibar + 9 paket 175/175 yeşil) tamamlandı" },
        { title: "T5 Anlık görüntü, kapsam, uyarılar", status: "done", doneAt: "03.11 10:54", note: "f6fbfee (inceleme onaylı): katman kapıları, PII süzgeci, 17 metrik, p95 ~40 ms" },
        { title: "T6 Gün tekrarı (NDJSON) ve denetim", status: "done", doneAt: "03.11 15:40", note: "0971845 + c29df98 + e8fcb0d (DST penceresi, geçmiş süzgeçleri, idle sayfalama, üst sınır sonrası stok yeniden bazlama; 32/32 replay testi ve yeniden inceleme APPROVED)" },
        { title: "T7 İstemci deposu ve indirgeyiciler", status: "done", doneAt: "03.11 03:21", note: "df77d46 + 63282d3" },
        { title: "T8–T9 XP penceresi ve altı görünüm", status: "done", doneAt: "03.11 16:15", note: "T8 (382d6ae + 50e5ffa) ve T9 (Kuyruklar, Oda Servisi, Personel, uyarı/olay şeridi, lejant, klavye 1–6/Alt+1..5, ayrıntı balonu; 45/45 birim testi yeşil) tamamlandı" },
        { title: "T10–T12 Zaman şeridi, duvar ekranı, bütünleştirme", status: "active", note: "T10 (zaman şeridi + gün tekrarı) ve T11 (/radar duvar ekranı, wakeLock, dönüş, ses kapısı; 6/6 test) tamamlandı; T12 bütünleştirme sırada" }
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
    { at: "03.11 16:35", text: "Radar T11 (/radar duvar ekranı rotası, tam ekran ve wakeLock, görünüm dönüş denetleyicisi, kritik uyarıda 60 sn duraklama ve ses kapısı) tamamlandı ve doğrulandı (radar-wall 6/6 + radar-source-rules 11/11 yeşil, tsc/eslint temiz). Sıradaki: Radar T12." },
    { at: "03.11 16:29", text: "Radar T10 (zaman şeridi, 30 dk geri sarma, NDJSON akış istemcisi ve 1x/10x/60x gün tekrarı oynatıcısı) tamamlandı ve doğrulandı (38/38 radar birim testi yeşil, tsc/eslint temiz). Sıradaki: Radar T11 (/radar duvar ekranı) ve T12." },
    { at: "03.11 16:15", text: "Radar T9 (Kuyruklar, Oda Servisi, Personel görünümleri, uyarı/olay şeritleri, lejant, klavye kısayolları ve ayrıntı balonu) tamamlandı ve doğrulandı (45/45 birim testi yeşil, tsc/eslint temiz). Sıradaki: Radar T10 (zaman şeridi ve gün tekrarı oynatıcısı), T11 (/radar duvar ekranı), T12." },
    { at: "03.11 16:02", text: "Antigravity devamı: Radar T8 düzeltme turu (50e5ffa) ve T6 stok yeniden bazlama düzeltmesi (e8fcb0d) doğrulandı ve kapatıldı (215/215 radar birim testi, next build yeşil). P4 T5 MyBar talep yaşam döngüsü servisi (d2757e9, 11/11 test) ve Radar T3 minibar/MyBar yayın boşlukları (radar-publish-minibar + 9 test paketi 175/175 yeşil, canliRadar e2e 5. test açıldı) tamamlandı. Sıradaki: Radar T9–T12 ve UX T9–T15." },
    { at: "03.11 15:35", text: "Codex devamı (test koşmadan, statik incelemeyle): minibar kapanış düzeltmeleri e34a0ee ve 1dd4bc7, radar T6 düzeltme turu c29df98, P4 MyBar veri temeli c201ba3 (migration, olaylar, ayarlar), radar T8 düzeltme turu commit'siz. Codex sınırı doldu; Antigravity devam ediyor. DEVIR §1a Antigravity için ilk altı adımla yeniden yazıldı; Fable sıfırlanınca test/doğrulama." },
    { at: "03.11 14:58", text: "Dalga doğrulaması tamamlandı ve yeşil: npm run check (lint 0 hata, tsc temiz, 1781/1781 birim), next build, migration farkı yok, chromium e2e 153 geçti (1 kasıtlı atlama: radar T3), altı görünüm matrisi iki küçük düzeltmeyle temiz (7fbfaf0 KDS klavye odağı, 9d6d8b6 dokunma hedefleri), ratchet 2/2. Minibar P2/P3 görevleri tamamlandı olarak işaretlendi." },
    { at: "03.11 14:51", text: "Codex devamı: dört minibar kapanış bulgusu e34a0ee ve 1dd4bc7 ile düzeltildi. Göç 171/171, operasyon 96/96 hedefli test geçti; bağımsız göç yeniden incelemesi ve bütünleşik minibar incelemesi onayladı. İzole DB/3061 üzerinde tam doğrulama başladı; radar henüz açılmadı." },
    { at: "03.11 06:55", text: "UX T5 (emoji→ikon) uygulandı (72c35cf); minibar T2 katalog onaylandı; UX T6 POS kabuğu ve dalga-1 e2e bütünleştirme başladı." },
    { at: "03.11 06:45", text: "Radar T4 (CR-RAD, OperationEvent, ayarlar) uygulandı (0552fe5); T5 anlık görüntü başladı; minibar T13 göç başladı." },
    { at: "03.11 06:35", text: "Minibar T1 ve T3 (pool.ts) incelemeleri onaylandı; T12 göç iskeleti uygulandı (bad0b42). Çalışan: minibar T2/T4, radar T4, UX T5." },
    { at: "03.11 05:55", text: "UX T1 ve radar T2 incelemeleri onaylandı; minibar T2–T4, radar T4 ve UX T5 paralel başladı; dev DB migration'ları uygulandı." },
    { at: "03.11 04:25", text: "UX T1 belirteçler/görünüm matrisi (198/198) ve T4/T11 uygulandı; minibar T1 ve radar T2/T7 bitti. Tüm ajanlar kapandı; inceleme ve bütünleştirme sonraki oturumda." },
    { at: "03.11 03:20", text: "Minibar T1 temel (6042bab) ve radar T7 istemci deposu (df77d46) uygulandı; UX T2 kapandı. Fable sınırı — devir notu güncellendi." },
    { at: "03.11 02:55", text: "UX T3 snackbar/tek onay uygulandı (0d0cc5f, 50 dosya); minibar T6/T9 ve radar T1 kapandı; 02:45 ağ kesintisi sonrası 5 ajan sürdürüldü." },
    { at: "03.11 02:36", text: "Minibar T9 doluluk Excel uygulandı (45680ab); T1 temel (migration, SCREEN_LIMITS, olaylar) başladı." },
    { at: "03.11 02:33", text: "Minibar T6 oda QR (fd68ecc) ve Radar T1 olay birliği (8b99c64) uygulandı; incelemeler ve Radar T2 (SLA taraması) başladı." },
    { at: "03.11 02:22", text: "UX T2 (rol bazlı iniş /baslat, katalog, yetkisiz ekran sayfası) uygulandı (7244d05); T11 Erişimim başladı." },
    { at: "03.11 02:03", text: "Minibar T7 incelemesi onaylandı; Canlı Radar T1 (olay birliği) başladı." },
    { at: "03.11 02:00", text: "Minibar T7 (stok görünümleri, ek talep yaşam döngüsü) uygulandı (c6f7f5d); inceleme ve T6 (oda QR) başladı." },
    { at: "03.11 14:15", text: "Minibar planının 14 görevinin tamamı uygulandı ve incelendi (son: T11 dff58ad, T14 düzeltmesi 924e3c4); tek ajanla tam doğrulama (check, build, e2e, matris) sürüyor. UX T8 StaffShell (4d82da4) ve T7 KDS incelemeleri onaylandı. Radar T6/T8 incelemelerinde çıkan bulgular düzeltme turuna alındı. DEVIR §1a devir için yeniden yazıldı." },
    { at: "03.11 13:40", text: "Minibar T8 görev üretimi incelendi ve kapandı; göç T13 düzeltmesi ve T14 (doluluk/görev/DND/günlük göçü, doğrulama raporu) uygulandı — canlı yedekle 8 dk kuru koşu temiz. Radar T6 gün tekrarı ve T8 XP penceresi uygulandı (incelemeler minibar sonrası). DEVIR §1a devir için güncellendi; Fable 5 saatlik sınır." },
    { at: "03.11 12:10", text: "Erkan kararı: önce minibar bitirilecek, sonra radar ve UX sırayla. Minibar T5 ve T10 incelendi ve kapandı; T13 göç uygulandı (8b25eb1, düzeltme turu T14 ile); T8 görev üretimi ve T14 göç kapanışı sürüyor, ardından T11. UX T7 KDS uygulandı (41ad912)." },
    { at: "03.11 10:55", text: "UX T6 POS kabuğu ve radar T5 anlık görüntü incelemeleri onaylandı; minibar T5 oda kontrolü servisi uygulandı (inceleme sürüyor). Başlatılan: UX T7 KDS, UX T8 StaffShell, radar T6 gün tekrarı, minibar T10 kat planı/QR. Dalga-1 e2e bütünleştirme (1014aaa): 5 sürüklenme düzeltildi, tam yeşil koşu dalga sonunda tek ajanla tekrarlanacak." },
    { at: "03.11 07:10", text: "Minibar T4 (görev kalemi çekirdeği + DND servisi) incelemesi onaylandı ve kapandı; T5 oda kontrolü servisi başladı. T2 düzeltme turu, T13 göç, radar T5, UX T6 ve e2e bütünleştirme paralel sürüyor." },
    { at: "03.11 01:48", text: "Canlı yedekten gerçek otel tanımları (3 otel, 18 kat, 558 oda, 69 ürün, 10 setup) referans seed'e eklendi ve incelemesi onaylandı (dd2995f)." },
    { at: "03.11 01:30", text: "Minibar tamamlama planı (14) ve Canlı Operasyon Radarı spec+planı (12) yazıldı. Ajan başına DB/port ile paralel uygulama başladı." },
    { at: "03.11 01:08", text: "UX yenileme planı yazıldı ve T1 başladı; S1–S6 kararları onaylandı; canlı operasyon radarı modülü istendi (spec yazılıyor)." },
    { at: "02.11 23:12", text: "Düzeltme dalgaları tamamlandı (7777f8d, 5ec4064, 11259de, 915b466): npm run check yeşil (913 test), build yeşil; e2e 71/94. GitHub'a push edildi." },
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
