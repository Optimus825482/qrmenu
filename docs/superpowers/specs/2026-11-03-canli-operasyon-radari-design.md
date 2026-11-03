# Canlı Operasyon Radarı — Tasarım Spesifikasyonu

**Sürüm:** 1.0 · **Tarih:** 3 Kasım 2026 · **Durum:** Kullanıcı incelemesi bekliyor
**İstek (Erkan, 03.11):** "sistem yöneticisi panelinde her operasyon için anlık olarak canlı, simülatif monitoring yapılabilmesi için bir modül"
**Dayanak:** `docs/superpowers/specs/2026-10-31-merit-platform-design.md` §5, §9, §10, §11, §15 · `docs/superpowers/plans/2026-10-31-p7-rapor-eposta.md` T10–T11 · `docs/superpowers/specs/2026-11-02-arayuz-ux-yenileme-design.md` §2.1, §2.3, §5.5, §5.6, §5.9
**Yöntem:** Kod okuması (`merit/src/lib/{realtime-events,realtime,sse}.ts`, `src/shell/sseStore.ts`, `src/shell/apps/CommandCenter.tsx`, `src/modules/core/server/{commandCenter,sessions,notifications,audit}.ts`, `src/modules/order/server/*`, `src/modules/minibar/server/*`, `prisma/schema.prisma`, `prisma/seed/roles.ts`, `src/modules/core/screens.ts`). Uygulama çalıştırılmadı; bulgular dosya:satır kanıtlıdır.

---

## 0. Özet

Canlı Radar, kompleksin (3 otel) o anki operasyonunu tek bir XP penceresinde ve tam ekran "duvar ekranı" modunda gösteren **salt okunur** bir izleme modülüdür. Minibar (kat/oda durumu, DND, MyBar, havuz stoku, kat sorumlusu ilerlemesi), QR sipariş (outlet masa haritası, kasa/KDS/yazıcı kuyrukları, garson çağrıları), oda servisi (SLA sayaçları), personel varlığı ve uyarılar katmanlar halinde çizilir. "Simülatif" = gerçek olayların animasyonlu akışı (olayda tek nabız, kayan son-30-dakika zaman şeridi, birkaç dakika geri sarma) ve saklanan verilerden **herhangi bir iş gününün 1×/10×/60× tekrar oynatılması** (eğitim/analiz). Sentetik veri üretmez (yalnız geliştirme/test aracı, §7 RD-12).

Kilit kararlar (bu belge):
1. **Yeni ekran kodu `CR-RAD` "Canlı Radar"** (CORE). `CR-KOM` Komuta Merkezi KPI + olay akışı penceresi olarak kalır; radar ayrı yetkilendirilebilir: `V` = canlı izleme, `R` = gün tekrarı. Seed: `AppScreen` 33 → 34 (§6.2).
2. **Mimari: anlık görüntü + istemci indirgeyici.** Sunucu `radarSnapshot(ctx, hotelId)` tek seferde durumu verir; tarayıcıdaki `radarStore` (zustand) mevcut `/api/sse` akışındaki olayları **aynı** indirgeyicilerle uygular. Canlı, geri sarma ve tekrar oynatma tek bir olay birliği (`RadarEvent`) ve tek indirgeyici kümesi kullanır (§3).
3. **Yeni olay deposu yok.** Tekrar oynatma var olan iş tablolarından (OrderEvent, QrScanLog, SessionEvent, RoomCheck, RoomDndCheck, MybarRequest, HotelStockMovement, PrintJob, WaiterCall, TaskStatusLog, OccupancyUpload, EmailLog, AuditLog) yeniden kurulur. Yalnız hiçbir tabloda zaman damgalı iz bırakmayan 4 sinyal için dar bir **`OperationEvent`** izdüşüm tablosu eklenir: yazıcı durum geçişi, masa ataması geçmişi, personel boşta geçişi, eksik yükleme uyarısı (§3.6).
4. **Yayın boşlukları: 22 madde** (§4). En kritikleri: minibar tarafı bugün yalnız yükü `{kind}` olan `minibar.changed` yayınlıyor ve bu tip (ve `mybar.created`) istemci kataloğunda kayıtlı olmadığı için hiçbir pencereye ulaşmıyor; `order.sla` ve `scan.room` katalogda var ama hiç yayınlanmıyor; MyBar "görüldü" ve "iptal" akışları hiç yok; görev kalemi değişimleri `TaskStatusLog`'a yazılmıyor.
5. **P7 T10–T11'in radar kısmını bu modül devralır** (kat ısı haritası, outlet panosu, `RADAR_EVENT_TYPES`). P7'de kalan: metrik kaydı `RADAR_METRICS` + `singleFlight` (sayaç kaynağı), Komuta Merkezi KPI çipleri, mobil İzleme toplamları, `mail.failed` olayı (§1.3).
6. **Gizlilik:** radar hiçbir rol için fiyat/tutar, misafir notu, IP/cihaz bilgisi taşımaz; misafir kimliği veritabanında zaten yok (`GuestRecord` yalnız kişi sayısı tutar). Personel adları yalnız SISTEM/YONETIM'e, SISTEM oturumları yalnız SISTEM'e gösterilir (mevcut kural `sessions.ts:31`).

---

## 1. Kapsam

### 1.1 Hedefler

| # | Hedef | Ölçüt |
|---|---|---|
| H1 | Tüm operasyonun anlık tek görünümü | Bir olay, kaynağında commit edildikten sonra ≤2 sn içinde ilgili hücrenin durumunu değiştirir (e2e) |
| H2 | Görsel "ne oluyor" duygusu | Her durum değişikliği 600 ms'lik tek nabızla işaretlenir, olay şeridine düşer, zaman şeridinde iz bırakır |
| H3 | Geri sarma | Son `radar.liveBufferMinutes` (30) dakika bellekte; şeritte sürükleyince o anın durumu ≤150 ms içinde çizilir |
| H4 | Gün tekrarı | Saklama süresindeki herhangi bir iş günü 1×/10×/60× oynatılır; tekrarın sonundaki durum o anın anlık görüntüsüyle aynıdır (metamorfik test) |
| H5 | Duvar ekranı | 1920×1080 tam ekranda görünümler arasında otomatik döner, ekran kararmaz, 3 m'den okunur |
| H6 | Kapsam güvenliği | YONETIM yalnız kendi otellerini ve yalnız modülü açık katmanları görür; dışı → `FORBIDDEN` + `YETKISIZ_DENEME` |

### 1.2 Hedef olmayanlar

| Konu | Karar |
|---|---|
| BI / raporlama | Değil. Ciro, tutar, dönemsel trend, dışa aktarma yok → Rapor Merkezi (P7). Radar en fazla bir iş günü bakar |
| KDS / kasa / garson ekranı yerine geçme | Değil. Radarda **hiçbir değiştiren eylem yok** (onay, ret, çağrı yanıtı, atama). Hücreye çift tık yalnız ilgili uygulamayı `openApp` ile açar (kullanıcının yetkisi varsa) |
| Mobil | Android kabukta yok (`mobile: "none"`); İzleme sekmesi P7'nin toplam listesini kullanır |
| Tahmin / ML / simülasyon motoru | Yok. "Simülatif" yalnız gerçek olayların animasyonu ve tekrarıdır |
| Misafir verisi | Yok (ad tutulmuyor; not, dil, IP gösterilmez) |
| Kamera / ses kaydı | Yok |

### 1.3 P7 T10–T11 ile ilişki (karar)

P7 kod olarak başlamadı (`src/modules/reporting` yok; `docs/DEVIR.md:19` "radar ısı haritası YOK"). Bu spec P7 planını şu şekilde böler:

| P7 öğesi (`2026-10-31-p7-rapor-eposta.md`) | Durum | Not |
|---|---|---|
| T10 `metrics.ts` `RADAR_METRICS` (20 metrik, ekran/modül bağlı, warn/crit) | **P7'de kalır** | Radar genel bakış kartlarının sayaçları ve eşikleri buradan okunur. P7'den önce RD-5 yapılırsa dosyayı o yaratır, P7 T10 genişletir |
| T10 `singleFlight.ts` | **P7'de kalır** (paylaşılır) | Radar anlık görüntüsü aynı yardımcıyı kullanır |
| T10 `floorHeat.ts` + `floorHeatAction` | **Radar devralır** | `src/modules/radar/server/layers/minibar.ts`; oda durumu tek değer değil bileşik (§3.2, §5.3). P7 T10'dan çıkarılır |
| T10 `RADAR_EVENT_TYPES` (`reporting/events.ts`) | **Radar devralır** | Tek kaynak `src/modules/radar/events.ts`; P7 `useRadar` buradan içe aktarır |
| T11 `RadarPanel`, `MetricTile` | **P7'de kalır, küçülür** | Komuta Merkezi'nde KPI çipleri + "Canlı Radar'ı aç" düğmesi. Mevcut `CommandCenter.tsx` içindeki `animate-ping`'li "Canlı Komuta Radarı" bloğu (UX §5.9'a aykırı) bunlarla değiştirilir |
| T11 `OutletBoard`, `FloorHeat` | **Radar devralır** | Radar "Masa" ve "Kat" görünümleri |
| T11 mobil İzleme genişletmesi | **P7'de kalır** | — |
| `mail.failed` olayı (P7 T9) | **P7'de kalır** | Radar dinler; P7 gecikirse RD-3 yayını ekler (§4 G20) |
| `getCommandCenterKpis().radar` (`commandCenter.ts:17–24`) | **P7'de kalır** | P7 T11 KPI çiplerine taşınır |

---

## 2. Bilgi mimarisi

### 2.1 Pencere

| Konu | Karar |
|---|---|
| Uygulama kaydı | `id: "core.radar"`, `title: "Canlı Radar"`, `icon: "radar"`, `moduleKey: "CORE"`, `screenCode: "CR-RAD"`, `category: "GENEL"`, `needsHotel: false` (otel seçimi pencere içinde), `window: { w: 1280, h: 760, minW: 1024, minH: 640 }`, `kind: "component"`, `mobile: "none"` (`src/modules/core/apps.ts`'te `core.komuta`'nın yanına) |
| Açılış | 1366×768'de büyütülmüş açılır (UX §2.1). Kapsamda tek otel varsa doğrudan o otelin Kat görünümü; birden çoksa Genel Bakış |
| Başlık | "Canlı Radar · <Otel adı>" veya "Canlı Radar · Tüm kompleks" |
| Menü çubuğu | **Dosya** (Duvar ekranı modu Ctrl+Alt+F, Yeni sekmede duvar ekranı, Kapat) · **Görünüm** (Genel Bakış 1, Kat 2, Masa 3, Kuyruklar 4, Oda Servisi 5, Personel 6; Katmanlar ▸; Açıklama göster; Yoğunluk) · **Oynat** (Canlı End, 10 sn geri ←, 1 dk geri Shift+←, Gün tekrarı…, Hız ▸ 1×/10×/60×) · **Yardım** (F1) |
| Araç çubuğu (28 px) | Otel seçici (Tüm kompleks + kapsamdaki oteller) · katman düğmeleri (`aria-pressed`): Minibar / QR Sipariş / Oda Servisi / Personel / Sistem · görünüm sekmeleri · sağda mod/bağlantı metni (Canlı / Bağlanıyor / Çevrimdışı / Geçmiş 14:12:30 / Tekrar 2 Kas 60×) |
| Durum çubuğu | "Otel: … · Kullanıcı: … · Son olay 14:32:05 · Arabellek 30 dk / 1.284 olay" |
| Katman görünürlüğü | Bir katman ancak (a) otelde modül açık (`HotelModule`), (b) rol modülü kapsıyor, (c) katmanın kapı ekranında `V` varsa listelenir; yoksa düğme hiç çizilmez (§6.2 `LAYER_GATES`) |

### 2.2 Görünümler

| # | Görünüm | Katman | İçerik | Etkileşim |
|---|---|---|---|---|
| V1 | **Genel Bakış** | hepsi | Kapsamdaki her otel için kart: kod + ad, katman başına 2–4 canlı sayaç (P7 `RADAR_METRICS` değeri + ciddiyet metni "Normal/Dikkat/Kritik" + simge), son 60 dk olay/dk **sparkline** (1 dk kova), en yüksek ciddiyetli 2 uyarı | Karta tıklama → o otelin Kat görünümü; sayaca tıklama → ilgili görünüm |
| V2 | **Kat** | Minibar | Katlar satır, odalar hücre ızgarası (§5.3 glifleri): görev durumu (zemin), doluluk (kenar), DND/MyBar (köşe işareti), bugün kontrol edildi (onay işareti). Sağda **kat sorumlusu ilerlemesi**: kişi başına tamamlanan/toplam kalem çubuğu, son işlem yeri ve saati; altında **havuz stoku** (kritik ve kritiğe %20 yakın ürünler) ve **doluluk yüklemeleri** (3 dosya: durum) | Odakta/ipucunda açıklama ("204 · Dolu · DND 1/2 · MyBar 12 dk"); Enter/çift tık → ayrıntı balonu; "Uygulamada aç" (yetki varsa) |
| V3 | **Masa** | QR Sipariş | Outlet seçici (otelin `QR_ORDER` outletleri); tüm alanlar alt alta başlıklı ızgaralar; masa kartı UX §5.6 anlamlarıyla: durum, garson adı (yoksa "Atanmadı"), açık sipariş rozeti, çağrı rozeti + saniye sayacı, son QR okutma ("Misafir masada", 15 dk) | Kart → yan ayrıntı paneli (siparişler: no, durum, süre; çağrı; garson); değiştiren düğme yok |
| V4 | **Kuyruklar** | QR Sipariş + Sistem | Outlet başına satır: Kasa bekleyen (adet + en eski yaş), KDS 3 sütun sayacı (Yeni / Hazırlanıyor / Hazır + en eski yaş), Yazıcı kuyruğu (KUYRUKTA / BASILIYOR / HATA), yazıcı sağlığı (Hazır / Sessiz / Hata + son ping) | Satır → o outletin Masa görünümü |
| V5 | **Oda Servisi** | Oda Servisi | Durum şeritleri (Teyit bekliyor → Onaylandı → Hazır → Yolda → Teslim): kart = oda no + sipariş no + SLA çubuğu (statik dolum, 10 sn'de bir güncellenir) + metin "18/30 dk"; %80 Dikkat, %100 Kritik | Kart → ayrıntı |
| V6 | **Personel** | Personel | Online oturumlar rol türüne göre gruplu (Yönetim / Outlet / Mutfak / Minibar); satır: ad (duvar modunda §8 S4), rol, outlet/kat, giriş saati, son etkinlik, durum (Etkin / Boşta ≥ `radar.idleMinutes` / Süre doluyor = UYARI). Outlet başına çevrimiçi garson/kasa sayısı, kat başına sorumlu | — |
| — | **Uyarı şeridi** (her görünümde, ana alanın üstünde, en fazla 5 + "n daha") | hepsi | Ciddiyet sırası Kritik > Dikkat, sonra yaş; aynı türden tekrarlar sayılı birleşir ("Yazıcı hatası ×3"). Türler §3.4 `RadarAlert` | Tıklama → ilgili görünüm + varlığa odak |
| — | **Olay şeridi** (sağ sütun 300 px; duvar modunda alt bant) | hepsi | En yeni üstte, en fazla 100 satır: saat · katman simgesi · cümle ("Havuz Bar · M12 · #45 onaylandı · Ayşe K.") | Satır → varlığa odak + zaman imleci o ana |
| — | **Zaman şeridi** (alt, 64 px) | hepsi | Son 30 dk ekseni; katman başına olay işaretleri (kısa dikey çizgi, katman simgesi şekliyle ayrışır), 1 dk'lık yoğunluk histogramı, oynatma başı, bağlantı kesintisi bantları (taralı "Kesinti 14:02–14:03"), "Canlı" düğmesi | Sürükle = geri sar; tekrar modunda gün ekseni (00:00–24:00), oynat/duraklat, hız |

### 2.3 Modlar

| Mod | Veri | Giriş / çıkış | Görsel işaret |
|---|---|---|---|
| **Canlı** | anlık görüntü + SSE | varsayılan; End | "Canlı" (yeşil nokta + metin) |
| **Geçmiş (geri sarma)** | bellekteki arabellek | zaman şeridinde sürükle, ← / Shift+← | Üstte `--warn` şerit "Geçmiş görünüm · 14:12:30 · Canlıya dön (End)"; yeni olaylar arabelleğe girmeye devam eder, ekrana yansımaz; "+12 yeni olay" sayacı |
| **Tekrar** | `GET /api/radar/replay` | Oynat → Gün tekrarı… (tarih, başlangıç saati); Esc ile çıkış | `--info` şerit "Tekrar · 2 Kas 2026 · 09:41:10 · 60×"; SSE olayları tekrar süresince yok sayılır, çıkışta anlık görüntü yeniden alınır |
| **Duvar ekranı** | canlı | Ctrl+Alt+F veya `/radar?duvar=1` | Tam ekran, otomatik dönüş (§5.5) |

### 2.4 Duvar ekranı rotası

| Konu | Karar |
|---|---|
| Rota | `/radar` (XP masaüstü yüklenmez; aynı `RadarRoot` bileşeni `mode="wall"`). Yetki `CR-RAD V`; yoksa UX P-UX-2 "Bu ekran sana atanmadı" sayfası |
| Açılış | Büyük "Tam ekran başlat" düğmesi (`requestFullscreen` kullanıcı hareketi ister) → `navigator.wakeLock.request("screen")`, `visibilitychange`'de yeniden alınır (UX §2.3 kiosk deseni) |
| Parametreler | `?otel=MR&gorunumler=genel,kat,masa&sure=20&outlet=<id>` — ayarı geçersiz kılar, yer imi olarak saklanabilir |
| İşaretçi | 5 sn hareketsizlikte gizlenir |

---

## 3. Veri modeli

### 3.1 Mevcut olay kataloğu (`src/lib/realtime-events.ts`, tamamı)

Zarf: `MeritEvent = { type; hotelId?; outletId?; roomId?; userIds?; roleKinds?; payload?; payloadTruncated?; at }`. Kapsam kuralı `matchesScope` (`realtime.ts:64`): `userIds` varsa kullanıcı listede olmalı, yoksa `hotelId` (varsa) kapsamda olmalı; `outletId` varsa oturumun outleti veya SISTEM/YONETIM; `roleKinds` varsa rol türü listede. Yük 7500 baytı aşarsa düşürülür (`payloadTruncated`, `realtime.ts:86`). `SSE_EVENT_TYPES` 33 ad içerir.

| # | Tip | Yayınlayan (dosya:satır) | Yük | Kapsam | Radar katmanı |
|---|---|---|---|---|---|
| 1 | `notification.created` | `core/server/notifications.ts:64` | `{type,title,body,refType,refId}` | `userIds` (+hotelId) | — (kişisel) |
| 2 | `settings.changed` | `lib/settings.ts:144`, `admin/settingsAdmin.ts:162,194`, `admin/hotelModules.ts:72` | `{key}` | otel / sistem | Sistem: `radar.*`, `module.*` veya eşik anahtarıysa anlık görüntü yenilenir |
| 3 | `session.closed` | `sessions.ts:231` | `{sessionId}` | `userIds` | — (kontrol çerçevesi) |
| 4 | `definition.changed` | `admin/crud.ts:116` | `{entity,id,op,...extra}` | otel, çoğunlukla `roleKinds` SISTEM/YONETIM | Oda/kat/masa/alan/outlet/yazıcı değişirse anlık görüntü yenilenir |
| 5 | `session.changed` | `sessions.ts:45` | `{sessionId,userId,fullName,status,hotelId,roleCode,loginAt,expiresAt,outletId?}` | otel; sistem oturumu `roleKinds:["SISTEM"]`, diğerleri `SESSION_WATCHERS` | Personel |
| 6 | `audit.created` | `core/server/audit.ts:38` | `{id,action,entity,entityId,hotelId}` | `roleKinds:["SISTEM"]` | — |
| 7 | `realtime.resync` | istemci sentetik (`shell/sseStore.ts:174`) | — | — | Yeniden eşitleme (§3.5) |
| 8 | `reconnect` | sunucu kontrol çerçevesi (`lib/sse.ts:84`) | `{}` | — | — |
| 9 | `menu.availability` | `menu/server/menuTree.ts:385` | `{nodeId,available}` | otel+outlet | — |
| 10 | `menu.changed` | `menuTree.ts:139`, `themes.ts`, `translations.ts`, `menuImages.ts`, `callOptions.ts` | `{nodeId?,op,...}` | otel+outlet | — |
| 11 | `price.display` | `lib/settings.ts:147`, `admin/outlets.ts:240`, `outletSwitches.ts:96` | — | otel(+outlet) | — |
| 12 | `ordering.changed` | `admin/outlets.ts:244`, `outletSwitches.ts:67` | `{enabled}` | otel+outlet | Sipariş: outlet "Sipariş kapalı" etiketi |
| 13 | `order.created` | MASA `order/server/guestOrder.ts:220`; ODA `roomService/roomOrder.ts:231` | MASA `{orderId,orderNo,tableId,tableLabel,status,assignedWaiterId}`; ODA `{orderId,orderNo,roomId,roomNumber,status}` | otel+outlet | Sipariş / Oda Servisi |
| 14 | `order.confirmed` | `orders.ts:372` (telefon teyidi) | `payload()` = `{orderId,orderNo,status,tableId,roomId,assignedWaiterId}` (`orders.ts:211`) | otel+outlet | Oda Servisi |
| 15 | `order.approved` | `orders.ts:297` (geçiş), `:382`; `staffOrders.ts:157` (garson siparişi; `order.created` yayınlanmaz, yükte `tableLabel, source:"GARSON"`) | `payload()` | otel+outlet | Sipariş / Oda Servisi |
| 16 | `order.rejected` | `orders.ts:297` | `payload()` + `rejectReason` | otel+outlet | Sipariş (sebep metni gösterilmez) |
| 17 | `order.prep` | `orders.ts:429` (KDS hazırlığa başla) | `payload()` | otel+outlet | Sipariş (KDS) |
| 18 | `order.ready` | `orders.ts:297` | `payload()` | otel+outlet | Sipariş / Oda Servisi |
| 19 | `order.onway` | `orders.ts:297` | `payload()` | otel+outlet | Oda Servisi |
| 20 | `order.delivered` | `orders.ts:297` | `payload()` | otel+outlet | Oda Servisi |
| 21 | `order.served` | `orders.ts:297` | `payload()` | otel+outlet | Sipariş |
| 22 | `order.cancelled` | `orders.ts:297`, `roomOrder.ts:357` | `payload()` (+sebep) | otel+outlet | Sipariş / Oda Servisi |
| 23 | `order.escalated` | `order/server/escalation.ts:77` (dakikalık iş) | `{orderId,orderNo,status}` | otel+outlet | Uyarı |
| 24 | `order.sla` | **hiç yayınlanmıyor**; `Order.slaWarnedAt/slaBreachedAt` da hiç yazılmıyor (yalnız okunuyor: `centralReports.ts:185`) | — | — | → G13 |
| 25 | `call.created` | `waiterCalls.ts:118` | `{callId,tableId,tableLabel,type,createdAt}` | otel+outlet | Sipariş |
| 26 | `call.resolved` | `waiterCalls.ts:161` | `{callId,tableId,tableLabel,status}` | otel+outlet | Sipariş |
| 27 | `assignment.changed` | `tableAssignments.ts:49` | `{tableId,userId}` | otel+outlet | Sipariş (garson adı) |
| 28 | `print.queued` | `printJobs.ts:115` (fiş), `:151` (mutfak), `:198` (test; outlet yok) | `{jobId,orderId,printerId,kind?}` | otel(+outlet) | Kuyruk |
| 29 | `print.printed` | `printJobs.ts:315` | `{jobId,orderId,printerId}` | **yalnız otel** (outlet yok) | Kuyruk → G17 |
| 30 | `print.failed` | `printJobs.ts:73,141` (YAZICI_YOK, outletli), `:331` (BASILAMADI, outletsiz) | `{orderId,reason,kind?}` / `{jobId,orderId,printerId,reason,error}` | otel(+outlet) | Uyarı |
| 31 | `printer.status` | `order/server/printers.ts:80` (yalnız gateway ping'inde durum değişince) | `{printerId,ok}` | otel | Sistem → G18 |
| 32 | `scan.table` | `menu/server/guestToken.ts:83` (tx dışı, hata yutulur) | `{tableId,tableLabel}` | otel+outlet | Sipariş ("Misafir masada") |
| 33 | `scan.room` | **hiç yayınlanmıyor** (QrScanLog yazılıyor) | — | — | → G19 |
| — | `minibar.changed` | `minibar/server/minibarCommon.ts:126` (`notifyChange`) — kind: `room.mmd`, `room.dnd`, `mybar.confirm`, `room.check`, `check.delete`, `check.update`, `correction.request`, `correction.resolve` | `{kind}` (+`roomId` zarfta) | otel | **Katalogda kayıtlı değil** → istemciye ulaşmıyor → G1–G6 |
| — | `mybar.created` | `minibar/server/mybarService.ts:322` | `{requestId,roomNumber}` (+`roomId`) | otel | **Katalogda kayıtlı değil** → G1 |

Tespitler:
- İstemci yalnız adı `SSE_EVENT_TYPES` veya abonenin `types` listesinde olan adlı çerçeveleri dinler (`sseStore.ts:120,202`); `minibar.changed` ve `mybar.created` bugün hiçbir pencereye ulaşmıyor.
- Spec §9.1'deki `mybar.seen|completed|cancelled`, `stock.critical`, `dnd.*`, `task.*` adları kodda yok.
- Sipariş olaylarında işlemi yapan kullanıcı, `kind` ve masa etiketi/oda numarası çoğu geçişte yok; radar her olayda yeniden sorgulamamalı → G11.
- `session.warn`, `print.noPrinter`, `order.*` aynı zamanda `Notification.type` değerleridir (bildirim), olay değil.

### 3.2 Sunucu: anlık görüntü

| Konu | Karar |
|---|---|
| Konum | `src/modules/radar/server/{snapshot,overview,scope}.ts`, katman başına `layers/{minibar,order,roomService,staff,system}.ts`; eylemler `server/actions/radar.ts` (`safeAction`) |
| İmza | `radarSnapshot(ctx: Ctx, hotelId: string, opts?: { at?: Date }): Promise<RadarSnapshot>` — `at` verilirse o anın durumu (tekrar başlangıcı, §3.6). `radarOverview(ctx): Promise<RadarOverview>` (kapsamdaki tüm oteller) |
| Kapsam | `assertCan(ctx, "CR-RAD", "V", hotelId)`; katmanlar `LAYER_GATES` ile süzülür (§6.2). Sonuç `singleFlight` (anahtar `rolId + hotelId + katmanlar`, ttl 2000 ms) |
| Saat | İş günü `businessDate()` / `businessDateStart()` (`lib/time.ts`, Europe/Nicosia) |

```ts
type RadarSnapshot = {
  generatedAt: string;            // ISO; istemcinin olay kesim noktası
  hotelId: string; businessDate: string;
  layers: {
    minibar?: {
      floors: { floorId: string; number: number; name: string;
        rooms: { roomId: string; number: string;
          occupied: boolean;                                   // bugün IN_HOUSE/ARRIVAL GuestRecord
          task: { itemId: string; type: TaskType; status: TaskStatus; priority: number } | null;
          checkedToday: { type: RoomCheckType; at: string; userId: string } | null;
          dnd: { count: number; minChecks: number; status: DndStatus; lastAt: string } | null;
          mybar: { requestId: string; since: string; seen: boolean } | null;
        }[] }[];
      supervisors: { userId: string; name: string; floorIds: string[]; done: number; total: number;
        lastRoomId?: string; lastAt?: string }[];
      stock: { productId: string; name: string; remaining: number; critical: number }[]; // remaining ≤ critical×1.2
      uploads: { kind: string; status: UploadStatus | "EKSIK"; at?: string }[];
    };
    order?: { outlets: { outletId: string; name: string; type: OutletType; orderingEnabled: boolean;
        areas: { areaId: string; name: string;
          tables: { tableId: string; label: string; waiterId?: string; waiterName?: string;
            orders: { orderId: string; orderNo: number; status: OrderStatus; since: string }[];
            call: { callId: string; type: CallType; since: string } | null;
            scannedAt?: string }[] }[];
        queues: { kasa: { count: number; oldest?: string };
                  kds: Record<"YENI" | "HAZIRLANIYOR" | "HAZIR", { count: number; oldest?: string }>;
                  print: Record<"KUYRUKTA" | "BASILIYOR" | "HATA", number> };
        printers: { printerId: string; name: string; state: "HAZIR" | "SESSIZ" | "HATA"; lastSeenAt?: string }[] }[] };
    roomService?: { slaMinutes: number;
      orders: { orderId: string; orderNo: number; roomNumber: string; status: OrderStatus; createdAt: string;
        level: "OK" | "WARN" | "BREACH" }[] };
    staff?: { sessions: { sessionId: string; userId: string; name: string; roleCode: string; roleKind: RoleKind;
        outletId?: string; status: SessionStatus; loginAt: string; lastSeenAt: string; lastPlace?: string }[] };
    system: { alerts: RadarAlert[] };
  };
  sparkline: { bucketStart: string; counts: Partial<Record<RadarLayer, number>> }[]; // son 60 dk, 1 dk kova
};

type RadarOverview = { generatedAt: string; hotels: { hotelId: string; code: string; name: string;
  metrics: RadarMetric[] /* P7 RADAR_METRICS */; sparkline: RadarSnapshot["sparkline"]; topAlerts: RadarAlert[] }[] };
```

Sorgu planı (otel başına, `Promise.all`, her biri tek geçiş):

| Katman | Sorgular |
|---|---|
| Minibar | aktif odalar + katlar · bugünkü `GuestRecord` · bugünkü `DailyTaskItem` (görev tarihi) · bugünkü son `RoomCheck` (`DISTINCT ON (room_id)`) · bugünkü `RoomDnd` · `MybarRequest` BEKLEMEDE · `HotelStock` (remaining ≤ critical×1.2) · bugünkü `UploadTask` · kat sorumlusu ilerlemesi (`RoomCheck.userId` × `DailyTaskItem`) |
| Sipariş | outletler + alanlar + aktif masalar · aktif `TableAssignment` · açık MASA `Order` · `WaiterCall` ACIK · bugünkü `PrintJob` `groupBy(status)` · aktif `Printer` · son 15 dk `QrScanLog` (masa) |
| Oda servisi | açık ODA_SERVISI `Order` + `rs.slaMinutes` |
| Personel | `UserSession` ONLINE/UYARI + son yer (son `RoomCheck` odası/katı, oturumun outleti) |
| Sparkline | `date_bin('1 minute', …)` son 60 dk: `OrderEvent.at`, `RoomCheck.startedAt`, `RoomDndCheck.at`, `MybarRequest.createdAt`, `WaiterCall.createdAt`, `SessionEvent.createdAt` |

### 3.3 Olay birliği (`src/modules/radar/events.ts`, istemci-güvenli)

Canlı (`toRadarEvent(MeritEvent)`) ve tekrar (DB kaynakları) aynı biçime normalize edilir; indirgeyici yalnız `RadarEvent` görür.

```ts
type RadarLayer = "MINIBAR" | "SIPARIS" | "ODA_SERVISI" | "PERSONEL" | "SISTEM";
type RadarEventBase = {
  id: string;        // canlı: `${type}:${refId}:${at}`; tekrar: `${kaynakTablo}:${satırId}:${alt}` — idempotens anahtarı
  at: string; hotelId: string; layer: RadarLayer; outletId?: string; roomId?: string; byUserId?: string };
type RadarEvent = RadarEventBase & (
  | { type: "order.status"; orderId: string; orderNo: number; kind: OrderKind; to: OrderStatus; from?: OrderStatus;
      tableId?: string; roomId?: string; waiterId?: string }
  | { type: "order.escalated"; orderId: string; orderNo: number }
  | { type: "order.sla"; orderId: string; orderNo: number; level: "WARN" | "BREACH" }
  | { type: "call.opened"; callId: string; tableId: string; callType: CallType }
  | { type: "call.closed"; callId: string; tableId: string }
  | { type: "table.scanned"; tableId: string }
  | { type: "table.assigned"; tableId: string; waiterId: string | null }
  | { type: "print.job"; jobId?: string; printerId?: string; orderId?: string; status: PrintJobStatus;
      reason?: "YAZICI_YOK" | "BASILAMADI" }
  | { type: "printer.health"; printerId: string; state: "HAZIR" | "SESSIZ" | "HATA" }
  | { type: "room.checked"; roomId: string; checkType: RoomCheckType; taskStatus?: TaskStatus }
  | { type: "room.check.changed"; roomId: string; op: "SIL" | "DUZELT" }
  | { type: "room.scanned"; roomId: string }
  | { type: "dnd.marked"; roomId: string; count: number; minChecks: number; status: DndStatus }
  | { type: "dnd.missed"; roomIds: string[] }
  | { type: "mybar.opened"; requestId: string; roomId: string }
  | { type: "mybar.seen"; requestId: string; roomId: string }
  | { type: "mybar.closed"; requestId: string; roomId: string; outcome: "TAMAM" | "EKSIK" | "IPTAL" }
  | { type: "task.updated"; taskItemId: string; roomId: string; to: TaskStatus }
  | { type: "task.generated"; date: string; itemCount: number }
  | { type: "stock.level"; productId: string; remaining: number; critical: number }
  | { type: "upload.status"; kind: string; status: UploadStatus | "EKSIK" }
  | { type: "presence"; sessionId: string; userId: string; status: SessionStatus | "BOSTA"; outletId?: string; place?: string }
  | { type: "mail.failed"; kind: string }
);
export const RADAR_EVENT_TYPES: readonly string[]; // abone olunan MeritEvent adları (§4 sonu)
```

Sıralama kuralı (canlı arabellek ve tekrar akışı aynı): `(at ASC, SOURCE_RANK ASC, id ASC)`. `SOURCE_RANK`: varlık yaratan olaylar 0 (`order.status` to=GONDERILDI/TEYIT_BEKLIYOR, `call.opened`, `mybar.opened`, `task.generated`), geçişler 1, uyarılar 2 (`order.escalated`, `order.sla`, `printer.health`, `mail.failed`). Aynı milisaniyedeki yaratma + onay doğru çizilir; `order.created` yayınlamayan garson siparişinde (`staffOrders.ts:157`) bilinmeyen siparişe gelen `order.status` yaratma olarak indirgenir.

### 3.4 İstemci deposu (`src/modules/radar/ui/radarStore.ts`, zustand/vanilla — `sseStore.ts` ile aynı desen)

| Konu | Karar |
|---|---|
| Durum | `{ mode: "live" \| "scrub" \| "replay"; base: RadarSnapshot; buffer: RadarEvent[] (halka, ≤ radar.liveBufferMinutes dk ve ≤ 5.000 olay); checkpoints: Map<dakika, RadarState>; cursor: number; view: RadarState; pulses: Map<entityKey, bitişMs>; gaps: { from: string; to: string }[]; alerts: RadarAlert[] }` |
| İndirgeyici | `reduce(state: RadarState, e: RadarEvent): RadarState` — saf; olay tipi başına bir fonksiyon (`reducers/{order,minibar,roomService,staff,system}.ts`). Bilinmeyen yapısal varlık (anlık görüntüden sonra eklenen masa/oda) → `needsRefresh` → 1 sn debounce ile anlık görüntü |
| İdempotens | `seen: Set<id>` (arabellekle aynı ömür); aynı `id` ikinci kez uygulanmaz. `at < base.generatedAt − 2 sn` olan canlı olay yok sayılır (anlık görüntü zaten içerir) |
| Toplama | Gelen olaylar kuyruğa yazılır; `requestAnimationFrame` ile en fazla 4 kez/sn tek seferde indirgenir. Bir boşaltmada >20 olay → nabız yok, yalnız durum/sayaç (fırtına koruması) |
| Geri sarma | Her tam dakikada checkpoint (yapısal paylaşımlı kopya). İmleç t'ye gidince: t'den önceki en yakın checkpoint + aradaki olaylar (≤1 dk) indirgenir |
| Nabız | Durum değiştiren her olay `pulses.set(entityKey, now + 600)`; aynı varlıkta 2 sn içinde ikinci nabız yok |
| Uyarılar | `deriveAlerts(state, now)` — 1 sn'lik saat tıkıyla (yalnız metin/süre güncellenir): `order.escalated`; `order.sla` WARN/BREACH; çağrı > `order.callAlertSeconds`; `print.job` HATA; `printer.health` SESSIZ/HATA; `stock.level` ≤ critical; `upload.status` EKSIK; MyBar > `radar.mybarStaleMinutes`; `dnd.missed`; `mail.failed` (yalnız SISTEM) |
| Abonelik | `sseClient().subscribe(handler, RADAR_EVENT_TYPES)` — **yeni EventSource açılmaz**, sekmenin paylaşılan bağlantısı. Otel süzgeci istemcide (`e.hotelId === seçili`); "Tüm kompleks"te yalnız genel bakış sayaçları (olay sayımı + 1 sn debounce ile `radarOverview`) güncellenir |

```ts
type RadarAlert = {
  key: string; severity: "warn" | "crit";
  kind: "SIPARIS_ONAY" | "RS_SLA" | "CAGRI" | "YAZICI_IS" | "YAZICI" | "STOK" | "YUKLEME" | "MYBAR" | "DND_EKSIK" | "EPOSTA";
  hotelId: string;
  ref: { outletId?: string; tableId?: string; roomId?: string; orderId?: string; printerId?: string; productId?: string };
  text: string; since: string; count: number };
```

### 3.5 SSE kapsamı ve yeniden bağlanma

| Konu | Karar |
|---|---|
| Uç | Mevcut `GET /api/sse` (ayrı radar ucu yok; sekme başına tek bağlantı korunur) |
| Kim alır | SISTEM ve YONETIM oturumları `outletId`'li olayları zaten alır (`matchesScope`); YONETIM `hotelIds` dışı olayı almaz. Yeni radar-ağırlıklı olaylar (`presence.tick`, `stock.changed`, `task.updated`, `room.checked`, `dnd.marked` …) `roleKinds` ile sınırlanır (§4) — personel cihazlarına gereksiz yayılmaz |
| Abone tipleri | `RADAR_EVENT_TYPES` (§4 sonu, 42 ad) |
| `realtime.resync` | (1) `gaps`'e `{from: son olay at, to: now}` eklenir (şeritte taralı bant), (2) anlık görüntü yeniden alınır, (3) canlı durum yeni `base` + sonrası olaylardan kurulur; eski olaylar yalnız geri sarma için arabellekte kalır |
| Yük kesildiyse | `payloadTruncated` → o varlık için `needsRefresh` |
| Sapma yoklaması | Canlı modda 60 sn'de bir sessiz anlık görüntü; fark varsa görünüm düzeltilir ve konsola `[radar] drift <tip>` yazılır (kaçan yayın tespiti; e2e'de 0 beklenir) |
| Sekme gizli | `document.hidden` iken boşaltma ertelenir, olaylar kuyrukta birikir; görünür olunca tek boşaltma, nabız yok |

### 3.6 Tekrar oynatma

**Kaynak tabloları (yeni olay deposu yok):**

| Olay | Kaynak | Alanlar | Eksik / karar |
|---|---|---|---|
| `order.status` | `OrderEvent` ⋈ `Order` | `at, from, to, userId`; `kind, outletId, tableId, roomId, orderNo, assignedWaiterId` | Tam. İndeks yok → `order_events(at)` eklenir |
| `order.escalated` | `Order.escalatedAt` | — | Tam |
| `order.sla` | `Order.slaWarnedAt / slaBreachedAt` | — | Sütunlar var, **hiç yazılmıyor** → G13 yazar |
| `call.opened/closed` | `WaiterCall.createdAt / resolvedAt` | `tableId, type, status` | YANITLANDI→KAPANDI ara adımı kaybolur (kabul) |
| `table.scanned` | `QrScanLog` (`tableId`, `ok=true`, `kind=MISAFIR`) | `createdAt` | Tam |
| `room.scanned` | `QrScanLog` (`roomId`, `ok=true`) | `createdAt` | Tam (yazılıyor, yayınlanmıyor) |
| `table.assigned` | `TableAssignment.createdAt/updatedAt + isActive` | — | Kısmi → `OperationEvent` |
| `print.job` | `PrintJob.createdAt / printedAt / updatedAt (HATA)` | `status, printerId, orderId` | Ara denemeler kaybolur (kabul) |
| `printer.health` | — (`Printer.lastStatus` yalnız son durum) | — | → `OperationEvent` |
| `room.checked` | `RoomCheck` (`startedAt, endedAt, type, userId`) ⋈ `Room` | — | Tam |
| `room.check.changed` | `AuditLog` (minibar işlemi silme/düzeltme kayıtları) | — | Tam |
| `dnd.marked` | `RoomDndCheck` (`at, no, userId`) ⋈ `RoomDnd` | — | Tam |
| `dnd.missed` | `RoomDnd.status = EKSIK`, `updatedAt` | — | Tam |
| `mybar.*` | `MybarRequest.createdAt / seenAt / completedAt / cancelledAt, closedWithMissing` | — | `seenAt`/`cancelledAt` akışları yok (G7, G8) |
| `task.updated` | `TaskStatusLog` | `from, to, userId, createdAt` | Oda kontrolü/MMD/DND bu tabloya **yazmıyor** (yalnız gün sonu `minibarJobs.ts:464`) → G9 yazar; o zamana kadar `DailyTaskItem.checkedAt` yedeği |
| `task.generated` | `DailyTask.createdAt` + kalem sayısı | — | Tam |
| `stock.level` | `HotelStockMovement` (`createdAt, qty, type`) | — | t anındaki seviye = bugünkü `remainingQty` − Σ(t sonrası hareketler, işaretli). Tam |
| `upload.status` | `OccupancyUpload`, `UploadTask` | — | Eksik uyarısının anı → `OperationEvent` |
| `presence` | `SessionEvent` (LOGIN, WARN, çıkış nedenleri) + `UserSession.loginAt/logoutAt` | — | "Boşta" geçişi yok → `OperationEvent` |
| `mail.failed` | `EmailLog.status = HATA`, `updatedAt` | — | Tam |

**`OperationEvent` (yeni, dar izdüşüm):**

```prisma
model OperationEvent {
  id       String   @id @default(cuid())
  hotelId  String   @map("hotel_id")
  outletId String?  @map("outlet_id")
  type     String   // printer.health | table.assigned | presence.idle | upload.missing
  refId    String?  @map("ref_id")
  data     Json     @default("{}")
  at       DateTime @default(now()) @db.Timestamptz(3)

  @@index([hotelId, at])
  @@map("operation_events")
}
```

| Konu | Karar |
|---|---|
| Gerekçe | Bu dört sinyal hiçbir iş tablosunda zaman damgalı iz bırakmıyor |
| Yazım | Yayınla aynı transaction'da: `recordOperation(tx, { hotelId, type, refId, data })` + `publish(…, tx)` |
| Hacim | Tahmini ≤ 2.000 satır/gün/kompleks |
| Saklama | `radar.replayRetentionDays` (90); her gece 03:30 pg-boss süpürme işi |
| Reddedilen alternatif | Her `publish()`'u tabloya yazan genel olay deposu: çift yazım, iş tablolarıyla ayrışma riski, tx dışı yayınlar (`guestToken.ts:83`), 8 KB sınırında yükü düşen olaylar, tüm modüllere dokunan değişiklik |

**API:** `GET /api/radar/replay?hotelId=<id>&day=YYYY-MM-DD&from=HH:mm&to=HH:mm`

| Konu | Karar |
|---|---|
| Yetki | `CR-RAD R` + otel kapsamı; değilse 403 + `YETKISIZ_DENEME` |
| Sınırlar | `day` ≤ bugün ve ≥ bugün − `radar.replayRetentionDays`; `from < to`; pencere ≤ 24 sa; saatler Europe/Nicosia; istek başına ≤ 50.000 olay (aşılırsa son satır `{kind:"more", nextFrom}`) |
| Biçim | `application/x-ndjson` akış. 1. satır `{kind:"snapshot", at, state: RadarSnapshot}` — `radarSnapshot(ctx, hotelId, { at: from })`, aynı katman sorguları zaman yüklemiyle (ör. siparişin t'deki durumu `DISTINCT ON (order_id) … WHERE at <= t ORDER BY order_id, at DESC`); sonraki satırlar `{kind:"event", e: RadarEvent}` §3.3 sırasıyla; son satır `{kind:"end", count}` |
| Birleştirme | `replay/sources/*.ts`: her kaynak `AsyncIterable<RadarEvent>` (anahtar kümesi sayfalama, 2.000'lik sayfa, `(at, id)` imleci); `replay/merge.ts` k-yollu birleştirme (öncelik kuyruğu, §3.3 sıralaması) |
| Oynatıcı | İstemci akışı tamponlar; sanal saat `speed` (1/10/60) ile ilerler; ≥10×'te nabız yok, yalnız renk geçişi |
| Denetim | `AuditLog(action: "RADAR_REPLAY", entity: "Radar", after: { hotelId, day, from, to })`; aynı kullanıcı + otel + gün için 10 dk içinde tek kayıt |
| Gizlilik | §3.7 aynen; kaynak sorguları yasak sütunları hiç seçmez |

### 3.7 Gizlilik

| Veri | Radar | Kaynak |
|---|---|---|
| Fiyat, tutar (`subtotal`, `unitPrice`, `purchasePrice`, `salePrice`) | **Hiç taşınmaz** (SISTEM dahil) — radar BI değil; `canSeePrices` (`minibar/server/apiAuthHelper.ts:98`) dalına gerek kalmaz | Order, OrderItem, MinibarTransactionItem |
| Misafir notu, MyBar notu/çevirisi, çağrı notu, `guestMessage`, ret/iptal sebebi metni | Taşınmaz | Order, MybarRequest, WaiterCall, Room |
| IP, user-agent, cihaz etiketi | Taşınmaz | QrScanLog, UserSession |
| Misafir kimliği | Yok (DB'de ad yok; `GuestRecord` yalnız `guestCount`) | — |
| Personel adı | SISTEM/YONETIM pencerede tam ad; duvar modunda §8 S4 | User.fullName |
| SISTEM rolü oturumları | Yalnız SISTEM görür (`sessions.ts:31` kuralı korunur) | — |
| Doğrulama | Anlık görüntü ve tekrar JSON'unda yasak anahtar taraması (`note`, `noteTr`, `price`, `subtotal`, `unitPrice`, `ip`, `userAgent`, `guestMessage`, `rejectReason`, `closeNote`, `cancelNote`) = 0 | test |

### 3.8 Performans bütçeleri

| Ölçü | Bütçe | Yöntem |
|---|---|---|
| `radarSnapshot` (tek otel, 600 oda, 20 outlet, 400 masa) | p95 ≤ 300 ms | paralel sorgular, `singleFlight` 2 sn, yeni indeksler (§6.2) |
| `radarOverview` (3 otel) | p95 ≤ 300 ms | P7 `RADAR_METRICS` `groupBy` tek geçiş |
| Olay hızı | tipik ≤ 1 olay/sn/masa; kompleks tepe ~10 olay/sn | istemcide 4 boşaltma/sn |
| İstemci boşaltma | ≤ 8 ms (100 olay) | saf indirgeyici, yapısal paylaşım |
| Geri sarma | ≤ 150 ms | dakikalık checkpoint |
| Tekrar ilk çizim | ≤ 1,5 sn (bir otel-günü ~15.000 olay) | NDJSON akış, sayfalı kaynaklar |
| Yük senaryosu | 300 misafir + 40 personel + 5 radar izleyicisi | SSE süzgeci olay × bağlantı (≈345) önemsiz; yeni olaylarda `roleKinds` ile yayılım kısılır; `presence.tick` otel başına 1/dk (≤ 4 KB, 8 KB sınırı altında) |
| Bellek | arabellek ≤ 5.000 olay (~2 MB), checkpoint ≤ 30 | halka tampon |

---

## 4. Yayın boşlukları (görevler)

Her yeni olay **iş transaction'ı içinde** `publish(…, tx)` ile yayınlanır (rollback → olay yok). Yükler kimlikler + sayılardır; serbest metin yok. "Rol" sütunu `roleKinds`'tır ("—" = mevcut kapsam değişmez).

| # | Operasyon | Bugün | Eklenecek olay · yük | Yer (dosya:satır) | Rol |
|---|---|---|---|---|---|
| G1 | Katalog kaydı | `minibar.changed`, `mybar.created` yayınlanıyor, dinlenmiyor | `RADAR_EVENT_TYPES`'a eklenir; `mybar.created` P-UX-6 için `SSE_EVENT_TYPES`'a da (yeni yayın yok) | yeni `src/modules/radar/events.ts`, `lib/realtime-events.ts:24` | — |
| G2 | Oda kontrolü (+N / Sarfiyat Yok) | `minibar.changed{kind:"room.check"/"room.mmd"}` | `room.checked` `{roomId, roomNumber, floorId, checkType, addedQty, taskItemId?, taskStatus?, byUserId}` | `minibar/server/roomCheckService.ts:148`, `minibarService.ts:490` | SISTEM, YONETIM, MINIBAR |
| G3 | Bugünkü kontrolü silme/düzeltme | `minibar.changed{kind:"check.delete"/"check.update"}` | `room.check.changed` `{roomId, transactionId, op:"SIL"\|"DUZELT", byUserId}` | `roomCheckService.ts:239,387` | SISTEM, YONETIM, MINIBAR |
| G4 | DND işareti | `minibar.changed{kind:"room.dnd"}` | `dnd.marked` `{roomId, roomNumber, floorId, count, minChecks, status, byUserId}` (count = minChecks → `TAMAMLANDI`) | `minibarService.ts:572` (`submitRoomDnd`) | SISTEM, YONETIM, MINIBAR |
| G5 | DND gün sonu EKSIK | yayın yok | `dnd.missed` `{date, roomIds[] (≤300, fazlası truncated → refresh)}` | `minibarJobs.ts:451–473` (`runDndDayEndRollover`) | SISTEM, YONETIM, MINIBAR |
| G6 | MyBar karşılama | `minibar.changed{kind:"mybar.confirm"}` | `mybar.completed` `{requestId, roomId, roomNumber, closedWithMissing, waitSec, byUserId}` | `minibarService.ts:819` (`confirmMybarRequest`) | SISTEM, YONETIM, MINIBAR |
| G7 | MyBar görüldü | **akış yok** (`seenAt` hiç yazılmıyor) | `mybar.seen` `{requestId, roomId, byUserId}` | P4 / P-UX-6 "Gördüm" eylemi (yeni servis fonksiyonu `markMybarSeen`) | SISTEM, YONETIM, MINIBAR |
| G8 | MyBar iptal | **akış yok** (`cancelledAt` hiç yazılmıyor) | `mybar.cancelled` `{requestId, roomId, byUserId}` | P4 iptal eylemi (depo/yönetim, spec §6.6) | SISTEM, YONETIM, MINIBAR |
| G9 | Görev kalemi durum değişimi | yayın yok; `TaskStatusLog` yalnız gün sonunda | `task.updated` `{items:[{taskItemId, roomId, from, to}] (≤100), byUserId}` + değişen kalem başına **`TaskStatusLog`** satırı | `roomCheckService.ts:143`, `minibarService.ts:477,552`, `minibarJobs.ts:460` (`updateMany` → önce etkilenen kalemler okunur) | SISTEM, YONETIM, MINIBAR |
| G10 | Görev üretimi | yayın yok (yalnız bildirim `minibarJobs.ts:381`) | `task.generated` `{date, types[], itemCount}` | `minibarJobs.ts:354–422`, `occupancyUploadService.ts:362–446` | SISTEM, YONETIM, MINIBAR |
| G11 | Sipariş yükü zenginleştirme | `payload()` = `{orderId, orderNo, status, tableId, roomId, assignedWaiterId}` | + `kind`, `from`, `tableLabel?`, `roomNumber?`, `byUserId` (fiyat yok) — yeni olay değil | `order/server/orders.ts:211` (`payload`), `:297,372,382,429`; `guestOrder.ts:220`; `roomOrder.ts:231,357`; `escalation.ts:77`; `staffOrders.ts:157` | — |
| G12 | Doluluk yüklemesi | yayın yok | `occupancy.uploaded` `{uploadId, kind, status, okRows, errorRows}` | `occupancyUploadService.ts:461` | SISTEM, YONETIM, MINIBAR |
| G13 | Oda servisi SLA | `order.sla` katalogda ama hiç yayınlanmıyor; `slaWarnedAt/slaBreachedAt` hiç yazılmıyor | Yeni dakikalık süpürme `rsSlaSweep`: `rs.slaMinutes`'in %80'inde WARN, %100'ünde BREACH; koşullu `updateMany` (bir kez) + `order.sla` `{orderId, orderNo, roomId, level, ageMin}` | yeni `order/server/roomService/sla.ts`; zamanlama `lib/jobs.ts:78` yanına | — (otel+outlet) |
| G14 | Masa ataması geçmişi | `assignment.changed` var, geçmiş kısmi | Yayın aynı; + `OperationEvent(table.assigned)` | `tableAssignments.ts:49` | — |
| G15 | Havuz stok hareketi | yayın yok | `stock.changed` `{items:[{productId, remaining, critical, delta, type}]}` (tx başına tek olay, ≤50 kalem) | `minibar/server/poolStock.ts:70–111` (`deductFromPool`, `returnToPool`), `depoService.ts:153–161` | SISTEM, YONETIM, MINIBAR |
| G16 | Stok kritik eşiği | spec §9.1'de, kodda yok | `stock.critical` `{productId, remaining, critical}` — yalnız eşik **aşağı** geçildiğinde (önce > critical, sonra ≤ critical) | G15 ile aynı yerler | SISTEM, YONETIM, MINIBAR |
| G17 | Baskı sonucu outleti | `print.printed` ve `print.failed(BASILAMADI)` outletsiz | Zarfa `outletId` (yazıcının `outletId`'si) eklenir | `printJobs.ts:315,331`; `:198` (test, outletsiz kalır) | — |
| G18 | Yazıcı sessizliği | gateway susunca hiçbir olay yok (`printers.ts:80` yalnız ping gelince) | `print.sweep` işinde aktif ve `lastSeenAt` > `radar.printerSilentSeconds` olan yazıcı için **bir kez** `printer.status` `{printerId, ok:false, reason:"SESSIZ"}`; geri gelişte `ok:true`; her geçiş `OperationEvent(printer.health)` | `printJobs.ts:364` (`sweepStale`) yanına; `printers.ts:80` geçişine `recordOperation` | — (otel) |
| G19 | Oda QR okutma | `scan.room` katalogda, hiç yayınlanmıyor | `scan.room` `{roomId, roomNumber, floorId}` (tx dışı, `scan.table` gibi try/catch) | `menu/server/guestToken.ts` oda dalı (≈ satır 90 sonrası) | SISTEM, YONETIM, MINIBAR |
| G20 | E-posta hatası | yayın yok (P7 T9 planlı) | `mail.failed` `{kind, hotelId}` | `minibarJobs.ts:120–128` (`sendHotelMailOnce` HATA dalı) / P7 posta hattı | SISTEM |
| G21 | Eksik yükleme uyarısı | e-posta var, olay yok | `occupancy.missing` `{date, missingKinds[], slot:"10:00"\|"18:00"}` + `OperationEvent(upload.missing)` | `minibarJobs.ts:161` (`checkOccupancyUploadAndAlert`) | SISTEM, YONETIM, MINIBAR |
| G22 | Personel son etkinlik / boşta | `lastSeenAt` dokunuşları yayınlanmıyor (doğru: çok sık) | Oturum süpürmesinde otel başına `presence.tick` `{sessions:[{sessionId, lastSeenAt}]}` 1/dk; `radar.idleMinutes` eşiği geçişinde `OperationEvent(presence.idle)` | `core/server/sessionSweeper.ts:42` (`sweepSessions`) | SISTEM, YONETIM |

Bilinçli olarak eklenmeyenler: baskı KUYRUKTA→BASILIYOR (≈3 sn geçici; kuyruk sayacı yeterli), çağrı süresi aşımı (istemci saatiyle türetilir), `menu.*` (radar kapsamı dışı), depo ek talepleri (MB-TAL servisi henüz yok; yazıldığında `stockreq.created|approved|delivered|rejected` aynı kalıpla eklenir), `minibar.changed{correction.*}` (radar dinlemez; geriye uyum için yayın sürer).

Sonrasında `RADAR_EVENT_TYPES` (42 ad): `order.created, order.confirmed, order.approved, order.rejected, order.prep, order.ready, order.onway, order.delivered, order.served, order.cancelled, order.escalated, order.sla, call.created, call.resolved, assignment.changed, print.queued, print.printed, print.failed, printer.status, scan.table, scan.room, session.changed, ordering.changed, settings.changed, definition.changed, realtime.resync, mybar.created, mybar.seen, mybar.completed, mybar.cancelled, room.checked, room.check.changed, dnd.marked, dnd.missed, task.updated, task.generated, stock.changed, stock.critical, occupancy.uploaded, occupancy.missing, presence.tick, mail.failed`.

---

## 5. Arayüz

### 5.1 XP kuralları

| Konu | Karar |
|---|---|
| Kabuk | UX §2.1: menü çubuğu, durum çubuğu, Tahoma 11–12 px (`fontScale`), hedef ≥ 24 px, F1 yardım, F5 anlık görüntüyü yenile |
| İkon | `XpIcon` setine `radar` (pencere) ve katman ikonları (`minibar`, `siparis`, `odaServisi`, `personel`, `sistem`); **emoji/dingbat yok** (UX §5.8) |
| Dört durum | UX §5.5: iskelet (≤3 satır, <300 ms gösterilmez); boş ("Bu otelde QR Sipariş kapalı."); hata (neden + "Tekrar dene"); çevrimdışı (şerit + son olay saati) |
| Belirteç | Durum renkleri yalnız UX §5.6 belirteçlerinden (`--muted, --accent, --warn, --info, --success, --danger`); ham Tailwind rengi yok |

### 5.2 Renk anlamı (UX §5.6 ile tutarlı)

| Anlam | Belirteç | Biçim (renk tek taşıyıcı değil) |
|---|---|---|
| Nötr / boş / görev yok | `--muted` | ince gri kenar |
| Misafir masada / oda QR okutuldu (son 15 dk) | `--accent` | kesik kenar |
| Onay bekliyor, görev bekliyor, SLA Dikkat, stok kritiğe yakın, MyBar bekliyor | `--warn` | kalın kenar + metin |
| Hazırlanıyor / yolda / görev devam / DND | `--info` | açık zemin + metin |
| Hazır, tamamlandı, kontrol edildi | `--success` | çift kenar (hazır) / onay işareti (tamam) |
| Çağrı, kritik uyarı, SLA ihlali, yazıcı hata/sessiz, stok kritik, DND EKSIK | `--danger` | rozet + metin; çağrıda 60 sn sonrası kalın kenar, yanıp sönme yok |
| Geçmiş / tekrar modu | `--warn` / `--info` şerit | metinli üst şerit |

Kontrast: metin ≥ 4.5:1, kenar/ikon ≥ 3:1 (WCAG 1.4.3 / 1.4.11). Katmanlar olay şeridinde renkle değil **simge şekliyle** ayrılır.

### 5.3 Oda hücresi (V2)

| Öğe | Gösterim |
|---|---|
| Zemin | görev durumu: yok (`--muted`) / BEKLIYOR (`--warn` açık) / DEVAM, DND_BEKLIYOR (`--info` açık) / TAMAMLANDI (`--success` açık) / EKSIK (`--danger` açık) |
| Kenar | dolu = düz, boş = kesik |
| Sağ üst | "D1/2" DND; "M12" MyBar (dakika) — ikisi birden olabilir |
| Sol alt | onay işareti = bugün kontrol edildi (ipucu: tür + saat + kişi) |
| Metin | oda numarası (11 px XP, 16 px kalın duvar) |
| Erişilebilirlik | hücre `role="gridcell"` + `aria-label="204: Dolu, görev bekliyor, DND 1/2, MyBar 12 dk"`; ızgara `role="grid"`, ok tuşlarıyla gezinme |

### 5.4 Hareket kuralları (UX §5.9)

| Kural | Karar |
|---|---|
| Nabız | Durum değişiminde tek 600 ms'lik halka (`outline` + opaklık sönümü); aynı varlıkta 2 sn'de en fazla bir |
| "Akış" | Kuyruk sayaçları 200 ms sayı geçişi; olay şeridi satırı 150 ms kayarak girer; kartlar ızgarada yer değiştirmez |
| Sürekli hareket | **Yasak** (ping/bounce/döngülü pulse, dönen ikon, kayan yazı). Saniye sayaçları yalnız metin günceller. **Tek istisna:** §5.8 animasyon katmanı (`ui/motion/**` + `motion.css`); orada da sürekli olan yalnız açık çağrı halkasıdır |
| `prefers-reduced-motion` | Nabız ve geçişler 0 ms; durum değişimi yalnız renk/metinle |
| Fırtına / hızlı tekrar | Bir boşaltmada >20 olay veya tekrar ≥10× → nabız yok |
| Ses | Yalnız `radar.soundOnEscalation=true` ve ses kilidi açıksa; Kritik uyarı ilk oluştuğunda; `public/sounds/error.mp3` (UX §2.3); 30 sn'de en fazla 1 |

### 5.5 Duvar ekranı

| Konu | Karar |
|---|---|
| Ölçek | Kök `data-density="wall"`: gövde 16 px, sayaç 32–40 px, oda hücresi 40×40, masa kartı 140×110 |
| Dönüş | `radar.wallViews` sırasıyla, her biri `radar.wallRotateSeconds` (20); sağ üstte metin "2/5 · Kat · 14 sn" (ilerleme animasyonu yok) |
| Kritik uyarıda | Dönüş 60 sn durur, ilgili görünüm açılır, varlık vurgulanır; sonra kaldığı yerden sürer |
| Etkileşim | Klavye/fare girdisinde dönüş 60 sn duraklar ("Dönüş duraklatıldı") |
| 1920×1080 | üst 64 px (otel adı, saat, bağlantı, dönüş metni) · uyarı şeridi 56 px · ana alan · alt 120 px (son 6 olay yatay + 48 px zaman şeridi) · sağ sütun yok |
| 1366×768 (pencere) | araç çubuğu 28 · uyarı 32 · ana alan (≈1066×560) · sağ olay şeridi 300 px · alt zaman şeridi 64 · durum çubuğu 22; yatay kaydırma yok |
| Okunurluk | 3 m'den sayaç ve oda numarası okunur (≥ 32 px / 16 px kalın) |

### 5.6 Klavye

| Tuş | Eylem |
|---|---|
| 1–6 | Görünüm seç |
| Alt+1…5 | Katman aç/kapa |
| ← / → | 10 sn geri/ileri (geçmiş ve tekrar); Shift ile 1 dk |
| End | Canlıya dön |
| Space | Tekrarda oynat/duraklat |
| + / − | Tekrar hızı 1× ↔ 10× ↔ 60× |
| Ctrl+Alt+F | Duvar ekranı (Esc tarayıcı tam ekranından çıkar) |
| Ok tuşları / Enter / Esc | Izgarada gezinme / ayrıntı balonu / kapat |
| F1 / F5 | Yardım / anlık görüntüyü yenile |

### 5.7 Açıklama (lejant)

Görünüm → "Açıklama göster": görünüm başına glif/renk/metin tablosu. İlk 3 açılışta varsayılan açık, sonra `User.prefs.radar.legend`. Duvar modunda alt köşede küçük kalıcı lejant.

### 5.8 Animasyonlu gösterim (T13; "simülatif" = animasyonlu sahne)

Erkan'ın "simülatif" ile kastettiği, operasyonun hareketli gösterimidir: siparişin masadan mutfağa, hazırdan masaya akışı, personelin ve oda kontrollerinin kat planında ilerleyişi, çağrıların halkası. Bu, radarın üstüne **isteğe bağlı, varsayılan açık** bir katmandır (`MotionLayer`); veri kaynağı yine mağaza olaylarıdır, bu yüzden canlı akışta, Gün tekrarında ve `scripts/radar-sim.ts --scene` yükünde aynı şekilde çalışır. Hücreler ve şeritler aynı bilgiyi metin olarak taşır; katman süstür (`aria-hidden`).

**Eşleme (olay → hareket):**

| Olay | Hareket (`kind`) | Çapa (`data-anchor`) | Süre |
|---|---|---|---|
| `order.status` → ONAYLANDI + hazırlanıyor | `order.flow` nokta, eğri yol | `table:<id>` → `queue:<outlet>:HAZIRLANIYOR` | 1800 ms |
| `order.status` → ONAYLANDI (onay) | `order.flow` | `table:<id>` → `queue:<outlet>:YENI` | 1800 ms |
| `order.status` → GONDERILDI / TEYIT_BEKLIYOR | `order.flow` | `table:<id>` → `queue:<outlet>:kasa` | 1800 ms |
| `order.status` → HAZIR | `order.ready` tepsi | `queue:<outlet>:HAZIR` → `table:<id>` | 1500 ms |
| `order.status` → SERVIS_EDILDI / TESLIM_EDILDI | `order.served` onay halkası | `table:<id>` | 600 ms |
| `call.opened` | `call.ring` halka | `table:<id>` | çağrı kapanana kadar, 1,2 sn periyot |
| `room.checked` | `room.check` süpürme + `staff.move` | `room:<id>`; `staff:<kullanıcı>` → `room:<id>` | 900 / 1200 ms |
| `dnd.marked` | `dnd.mark` süpürme + `staff.move` | `room:<id>`; `staff:<kullanıcı>` → `room:<id>` | 900 / 1200 ms |
| `mybar.opened` | `mybar.request` rozet uçuşu | `room:<id>` → `staff:<kat sorumlusu>` | 1400 ms |
| `presence` (yer değişti) | `staff.move` | `outlet:<önceki>` → `outlet:<yeni>` | 1200 ms |
| `print.job` (KUYRUKTA/BASILIYOR) | `print.job` çizgi | `queue:<outlet>:HAZIRLANIYOR` → `queue:<outlet>:print` | 500 ms |
| `stock.level` (kritik ve altı) | `stock.critical` titreşim | `stock:<ürün>` | 400 ms |

Oda servisi siparişleri aynı türleri yerinde (`order:<id>` kartı) gösterir. Çapa görünümde çizilmiyorsa o uç atlanır: iki uç da yoksa hareket yoktur, tek uç varsa hareket orada yerinde oynar. Masa görünümünde mutfak aşamalarının hepsi outlet seçici satırındaki tek `queue:<outlet>:kds` çapasına düşer.

**Sınırlar ve bütçe:**
- Aynı anda en çok **120** sprite; aynı tür ve çapadaki olaylar tek sprite + `+N` rozetine birleşir, 120'ye sığmayan gruplar köşedeki toplam `+N` rozetine gider. Tek bir boşaltmada 400'den fazla olay (sarma/yeniden yükleme) hareket üretmez.
- Yalnız `transform` ve `opacity` hareket eder; düzen okuması yalnız olay anında yapılır (çapa dikdörtgenleri), animasyon sırasında değil. Tek `requestAnimationFrame` döngüsü yalnız ekranda sprite varken ve sekme görünürken çalışır; Sekme gizliyken gelen olaylar hareket üretmez.
- Sürekli olan tek hareket açık çağrının halkasıdır (`motion.css`, tek `infinite`); çağrı kapanınca öğe DOM'dan kalkar. Kaynak kuralları testi bu istisnayı `ui/motion/**` ile sınırlar ve `motion.css` içinde yalnız `transform`/`opacity` keyframes kabul eder.
- Gün tekrarı hız çarpanı (1x/10x/60x) süreleri böler; 60x'te yalnız "ışıltı" türleri kalır (`order.ready`, `call.ring`, `stock.critical`, en az 300 ms).
- Hedef: 1920×1080 duvar ekranında 60 fps; `radar-motion-perf.test.ts` 120 sprite × 1000 adımı ≤ 50 ms ölçer, e2e 10 sn kare süresi ortalamasını ≤ 20 ms doğrular.

**Anahtar:** Araç çubuğunda `Animasyon` düğmesi (`aria-pressed`); tercih `localStorage` `merit.u.radar.motion` (`1`/`0`), duvar ekranında `?motion=0|1` sorgusu bu tercihi o sayfa için geçersiz kılar. `prefers-reduced-motion: reduce` her zaman kazanır: katman kapalı, düğme kilitli; kapalıyken DOM'a hiç motion düğümü basılmaz. Geçmişe sarma (scrub) sırasında ve "Tüm kompleks" görünümünde katman yoktur. Hiçbir sprite fiyat, misafir adı veya not taşımaz (yalnız kimlik, tür, ton, süre).

---

## 6. Ayarlar, yetki, denetim, testler

### 6.1 Ayar anahtarları (`lib/settings-defs.ts`)

| Anahtar | Şema | Varsayılan | Düzey | Açıklama |
|---|---|---|---|---|
| `radar.liveBufferMinutes` | int 5–120 | 30 | sistem | Bellekteki geri sarma penceresi |
| `radar.replayRetentionDays` | int 7–365 | 90 | sistem | Tekrar edilebilir en eski gün; `OperationEvent` süpürmesi |
| `radar.wallRotateSeconds` | int 5–300 | 20 | otel | Duvar modunda görünüm süresi |
| `radar.wallViews` | enum dizisi `genel\|kat\|masa\|kuyruk\|odaServisi\|personel` | `["genel","kat","masa","kuyruk"]` | otel | Dönüş sırası |
| `radar.soundOnEscalation` | flag | false | otel | Kritik uyarıda ses |
| `radar.idleMinutes` | int 1–60 | 10 | otel | Personel "Boşta" eşiği (`session.idleMinutes`=45'ten ayrı) |
| `radar.mybarStaleMinutes` | int 5–240 | 30 | otel | MyBar uyarı eşiği (P7 `mybarStale` sabiti buna bağlanır) |
| `radar.printerSilentSeconds` | int 30–900 | 120 | sistem | Yazıcı "Sessiz" eşiği (P7 `printersOffline` ve G18) |

Yeniden kullanılan: `order.approvalEscalationMinutes`, `order.callAlertSeconds`, `rs.slaMinutes`, `dnd.minChecks`, `stock.defaultCriticalLevel`. Değişiklik → mevcut `settings.changed` → radar anlık görüntüyü yeniler.

### 6.2 Yetki (karar: yeni ekran `CR-RAD`)

| Konu | Karar |
|---|---|
| Neden yeni kod | `CR-KOM` KPI penceresidir; radar duvar ekranı hesabına ayrı verilebilmeli, tekrar (`R`) ayrı denetlenmeli; P7 metrik yetkileri `CR-KOM`'da kalır |
| Katalog | `screens.ts` CORE: `["CORE", "CR-RAD", "Canlı Radar", "/radar"]`, `CR-KOM`'dan hemen sonra (sonraki `sortOrder`'lar kayar) |
| Varsayılan matris | `prisma/seed/roles.ts` `CORE_MANAGEMENT`'e (`:52`) `CR-RAD` eklenir → SISTEM (R-SYS, R-ITT) ve YONETIM (R-OTM, R-FBM) `V,R`; diğer 13 rol satırsız |
| `LAYER_GATES` | Minibar: `MINIBAR` + `MB-KAT V` · QR Sipariş: `QR_ORDER` + `QS-KUY V` · Oda Servisi: `ROOM_SERVICE` + `RO-TAL V` · Personel: `CR-ONL V` · Sistem: her zaman (e-posta hatası yalnız SISTEM). Ör. R-OTM (rolünde `ROOM_SERVICE` yok) Oda Servisi katmanını görmez |
| Otel | YONETIM yalnız `ctx.hotelIds`; otel seçicide yalnız onlar; API'de dışı otel → `FORBIDDEN` + `YETKISIZ_DENEME` (`assertCan`) |
| Migration `NNNN_canli_radar` | `AppScreen` satırı; mevcut veritabanları için `RoleScreenPermission` (SISTEM/YONETIM rolleri × 3 otel, V,R); `operation_events` tablosu; indeksler `order_events(at)`, `qr_scan_logs(created_at)`, `waiter_calls(outlet_id, created_at)`, `session_events(created_at)`, `room_dnd_checks(at)`, `room_checks(check_date)`, `task_status_logs(created_at)` |
| Test etkisi | `tests/unit/seed.test.ts:40` "33 ekran" → 34; UX P-UX-10 `screenGuide.ts`'e CR-RAD kaydı |

### 6.3 Denetim

| Olay | Kayıt |
|---|---|
| Canlı izleme, görünüm/katman değişimi, duvar modu | **Yok** |
| Gün tekrarı | `RADAR_REPLAY` (§3.6), 10 dk tekilleştirme |
| Yetkisiz istek (otel/ekran/katman) | `YETKISIZ_DENEME` (mevcut `assertCan`) |

### 6.4 Testler

| Tür | Dosya | Kapsam |
|---|---|---|
| Birim | `tests/unit/radar-reducers.test.ts` | Her `RadarEvent` tipi → beklenen durum; aynı `id` iki kez = tek etki; aynı `at`'te yaratma + onay sırası (`SOURCE_RANK`); bilinmeyen siparişe `order.status` = yaratma; bilinmeyen masa → `needsRefresh` |
| Birim | `radar-normalize.test.ts` | Her `RADAR_EVENT_TYPES` adı için `toRadarEvent` örneği; `payloadTruncated` → refresh; yasak anahtarlar düşer |
| Birim | `radar-store.test.ts` (sahte saat) | 4 boşaltma/sn; >20 olayda nabız yok; checkpoint ile geri sarma = baştan indirgeme (eşitlik); `realtime.resync` → gap bandı + yeni base; 30 dk / 5.000 sınırı; reduced-motion bayrağı |
| Birim | `radar-alerts.test.ts` | Eşikler: çağrı `order.callAlertSeconds`, MyBar `radar.mybarStaleMinutes`, SLA %80/%100, stok eşik geçişi, yazıcı sessiz |
| Birim | `radar-wall.test.ts` | Dönüş sırası/süresi; kritik uyarıda 60 sn duraklama; etkileşimde duraklama |
| Entegrasyon (DB) | `radar-snapshot.test.ts` | R-SYS / R-OTM(MR) / R-FBM ctx: MR görüntüsü MRP verisi içermez; `radarSnapshot(ctx, MRP)` R-OTM(MR) için FORBIDDEN + audit; modül kapalı otelde katman yok; `MB-KAT V` kapatılmış özel rolde Minibar yok; yasak anahtar taraması 0; 600 oda / 400 masa fikstüründe p95 ≤ 300 ms (CI'da bilgi amaçlı, yerelde zorunlu) |
| Entegrasyon | `radar-publish.test.ts` | G2–G22 her biri: işlem → doğru yükle tek olay; rollback → olay yok; `roleKinds` doğru; G9 `TaskStatusLog` satırı; G13 iki süpürmede tek olay; G16 yalnız aşağı geçişte; G18 sessizlik tek olay + geri dönüş |
| Entegrasyon | `radar-sse-scope.test.ts` | `matchesScope`: YONETIM MR oturumu MRP `room.checked` almaz; OUTLET oturumu `presence.tick` / `stock.changed` almaz; MINIBAR `stock.critical` alır; SISTEM oturumu `session.changed` yalnız SISTEM'e |
| Entegrasyon | `radar-replay.test.ts` | Sentetik gün (sipariş, çağrı, oda kontrolü, DND, MyBar, stok, yazıcı, oturum) → akış sırası `(at, rank, id)`; sayfa sınırında kayıp/çift yok; **metamorfik:** `reduce(snapshot(at=from), replay(from→now))` ≡ `radarSnapshot(now)`; 50.000 sınırında `more`; saklama dışı gün 400; `RADAR_REPLAY` tekilleştirme |
| e2e (Playwright) | `tests/e2e/radar.spec.ts` | (1) admin → Canlı Radar → Masa: misafir siparişi oluşturulunca masa kartı **≤ 2 sn** içinde "Onay bekliyor", kasa onaylayınca "Hazırlanıyor"; (2) oda kontrolü yapılınca oda hücresi onay işareti alır; (3) zaman şeridinde 1 dk geri → önceki durum, End → canlı; (4) gün tekrarı 60× → son durum anlık görüntüyle aynı |
| e2e | `radar-wall.spec.ts` | `/radar?duvar=1&sure=5` (saat taklidi) → 3 görünüm sırayla; `navigator.wakeLock` taklidi çağrılır; 1920×1080 ve 1366×768'de yatay kaydırma yok |
| e2e | `radar-scope.spec.ts` | `mudur.mr` otel seçicide yalnız MR; `/api/radar/replay?hotelId=<MRP>` → 403; `kat.mr` `/radar` → "Bu ekran sana atanmadı"; reduced-motion emülasyonunda nabız sınıfı uygulanmaz |

---

## 7. Uygulama planı (özet)

Kod alanı: `merit/src/modules/radar/{events.ts, apps.ts, server/{snapshot,overview,scope}.ts, server/layers/*, server/replay/{sources/*,merge,stateAt}.ts, server/actions/radar.ts, ui/{RadarRoot,radarStore,reducers/*,views/*,Timeline,Ticker,AlertStrip,Legend}.tsx}`, `src/app/api/radar/replay/route.ts`, `src/app/radar/page.tsx`. Her görev TDD, kendi dalında; mevcut e2e korunur.

| Kod | Görev | Efor | Bağımlılık | Kabul |
|---|---|---|---|---|
| RD-1 | Olay birliği: `radar/events.ts` (`RadarEvent`, `RADAR_EVENT_TYPES`, `toRadarEvent`, `SOURCE_RANK`), sipariş yükü zenginleştirme (G11), katalog kaydı (G1) | S–M | — | normalize birim testleri; mevcut sipariş e2e'leri değişmeden geçer |
| RD-2 | Minibar yayın boşlukları G2–G6, G9, G10, G12, G15, G16, G19, G21 (+ `TaskStatusLog` yazımı) | M | RD-1; G21 için RD-4 | `radar-publish.test.ts` minibar bölümü; spec §6.3–6.5 birim testleri değişmez |
| RD-3 | Sipariş/sistem boşlukları G13 (`rsSlaSweep`), G14, G17, G18, G20, G22 | M | RD-1, RD-4; G20 için P7 T9 eşgüdümü | `radar-publish.test.ts` sipariş/sistem bölümü; `order.sla` ilk kez yayınlanır |
| RD-4 | Migration + seed: `CR-RAD`, izinler, `OperationEvent`, indeksler, `radar.*` ayarları, `recordOperation` + 03:30 süpürme işi | S | — | `prisma migrate diff` boş; seed testi 34 ekran; ayar şemaları |
| RD-5 | Anlık görüntü: `radarSnapshot`, `radarOverview`, `LAYER_GATES`, sparkline; P7 `RADAR_METRICS` / `singleFlight` kullanımı (yoksa oluşturur, P7 T10 genişletir) | L | RD-4; P7 T10 (yumuşak) | `radar-snapshot.test.ts` (kapsam, gizlilik, ≤300 ms) |
| RD-6 | Tekrar: kaynak yineleyiciler, `stateAt`, k-yollu birleştirme, NDJSON rota, sınırlar, `RADAR_REPLAY` audit | L | RD-1, RD-4, RD-5 | `radar-replay.test.ts` (sıra, sayfalama, metamorfik eşitlik) |
| RD-7 | `radarStore`: indirgeyiciler, halka arabellek, checkpoint, nabız, uyarı türetme, SSE aboneliği, resync/gap, sapma yoklaması | M | RD-1 | `radar-reducers` / `radar-store` / `radar-alerts` birim testleri |
| RD-8 | XP penceresi + V1 Genel Bakış, V2 Kat, V3 Masa; araç çubuğu, katman düğmeleri, menüler, `core.radar` kaydı, `radar` ikonu | L | RD-5, RD-7; UX P-UX-3 (ikon), P-UX-4 (belirteçler) | e2e (1)(2); 1366×768'de taşma yok |
| RD-9 | V4 Kuyruklar, V5 Oda Servisi, V6 Personel; uyarı şeridi, olay şeridi, lejant, klavye, ayrıntı balonu, `openApp` köprüsü | M | RD-8 | ızgara klavyesi birim testi; e2e kuyruk sayacı |
| RD-10 | Zaman şeridi (geri sarma, gap bantları, histogram) + tekrar oynatıcı (tarih, 1×/10×/60×, oynat/duraklat) | M | RD-6, RD-7, RD-8 | e2e (3)(4) |
| RD-11 | Duvar ekranı: `/radar` rotası, tam ekran + wakeLock, `data-density="wall"`, dönüş, kritikte duraklama, işaretçi gizleme, ses kapısı | M | RD-8, RD-9; UX P-UX-9 kiosk deseni (yumuşak) | `radar-wall.spec.ts` |
| RD-12 | Bütünleştirme: Komuta Merkezi'nde "Canlı Radar'ı aç" + `animate-ping` bloğunun P7 KPI çipleriyle değişimi; P7 planı T10/T11 metninin §1.3'e göre düzeltilmesi; `scripts/radar-sim.ts` (yalnız geliştirme/test sahte olay üretici; `NODE_ENV=production`'da çalışmaz); `radar-scope.spec.ts`; yük denemesi (300+40+5); `docs/DEVIR.md` ve `ilerleme-data.js` kaydı | M | hepsi | tüm radar e2e'leri + mevcut `commandCenter.spec.ts` geçer |

Önerilen sıra: **Dalga A** RD-1, RD-4 (paralel) → **Dalga B** RD-2, RD-3, RD-5, RD-7 (paralel) → **Dalga C** RD-6, RD-8 → **Dalga D** RD-9, RD-10, RD-11 → **Dalga E** RD-12. Toplam: 3×L (RD-5, RD-6, RD-8), 7×M, 1×S (RD-4), 1×S–M (RD-1).

---

## 8. Erkan'a sorular

| # | Karar | Seçenekler | Varsayılan (cevap gelmezse) |
|---|---|---|---|
| S1 | Duvar ekranı hesabı | (a) Mevcut bir yönetici kullanıcıyla açılır (`session.maxOnlineMinutes`=480 sonunda yeniden giriş) (b) Yeni salt-okunur rol "R-DUV Duvar Ekranı" (yalnız `CR-RAD V`, uzun oturum, tek cihaz; seed 17 → 18 rol) | (a); R-DUV gerekirse RD-12 sonrası ayrı görev |
| S2 | Tekrar saklama süresi | 30 / 90 / 365 gün | 90 gün (`radar.replayRetentionDays`) |
| S3 | Kritik uyarıda ses | (a) Kapalı (b) Yalnız duvar ekranında açık (c) Her yerde açık | (b): `radar.soundOnEscalation=false`, duvar modu kendi düğmesiyle açar |
| S4 | Duvar ekranında personel adı | (a) Tam ad (b) Ad + soyadın baş harfi (c) Yalnız rol | (b) "Ayşe K."; XP penceresinde tam ad |
