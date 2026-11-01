# Google Stitch UI/UX Design System Specification
**Project:** Merit Royal Entegre Dijital Otel Ekosistemi (Master Admin, Minibar Takip, QR Menü & Sipariş, QR Oda Servisi)  
**Standard:** Google Stitch AI-Native Design Canvas (`DESIGN.md`)  
**Design Direction:** Modern Enterprise Light Theme (Açık Tema, Yüksek Kontrast, UX Odaklı)  
**Version:** 1.0.0 • 2026-10-30

---

## 1. Tasarım Vizyonu & UX İlkeleri (Vibe & Principles)

* **Enterprise Light Aesthetics:** Kurumsal, ferah, gözü yormayan açık renk paleti. Karmaşık ve karanlık arayüzler yerine Linear, Vercel ve Stripe dashboardlarının sadeliği ve okunabilirliği esas alınmıştır.
* **Sıfır Sürtünme (Zero Friction):** Misafir tarafında hiçbir form doldurma, üyelik veya uygulama indirme zorunluluğu yoktur. QR kod okutulduğunda 0.8 saniyede PWA olarak açılır.
* **Proaktif Personel Deneyimi:** Garsonlar müşteri el kaldırmadan önce masanın menüyü açtığından haberdar olur (akıllı saat titreşimi).
* **Çift Kademeli Güvenlik:** Siparişler asla doğrudan mutfağa gitmez; garsonun mobil/saat onayı olmadan mutfak yazıcısından fiş çıkmaz.
* **Dinamik Fiyat Modu:** Ana Yönetici Modülü (Super Admin) üzerinden tek tıkla tüm menülerde, belirli outletlerde veya oda servisinde fiyatlar gizlenebilir (All-Inclusive prestij modu) ya da görünür hale getirilebilir (A La Carte / Satış modu).

---

## 2. Renk Paleti ve Tasarım Belirteçleri (Design Tokens)

### Ana Renkler (Core Light Palette)
| Token Adı | HEX / Değer | Kullanım Amacı |
| :--- | :--- | :--- |
| `--bg-canvas` | `#f8fafc` | Genel sayfa arka planı (Slate-50) |
| `--bg-surface` | `#ffffff` | Kartlar, tablolar, modallar, form yüzeyleri |
| `--bg-subtle` | `#f1f5f9` | İkincil alanlar, tablo başlıkları, pasif butonlar |
| `--border-light`| `#e2e8f0` | Kart kenarlıkları, tablo çizgileri |
| `--border-focus`| `#94a3b8` | Aktif input ve odak kenarlıkları |
| `--text-primary`| `#0f172a` | Ana başlıklar, fiyatlar, kritik metinler (Slate-900) |
| `--text-secondary`| `#475569` | Açıklamalar, etiketler, tablo hücreleri (Slate-600) |
| `--text-muted` | `#94a3b8` | Tarihler, pasif sayaçlar, ipucu metinleri |

### Kurumsal & Marka Vurgu Renkleri (Brand & Accent)
| Token Adı | HEX / Değer | Kullanım Amacı |
| :--- | :--- | :--- |
| `--brand-navy` | `#0f172a` | Birincil kurumsal butonlar, sol navigasyon paneli |
| `--brand-blue` | `#2563eb` | Aktif sekme, linkler, birincil aksiyonlar |
| `--royal-gold` | `#947833` | Merit lüks rozetleri, VIP oda/cabana göstergeleri |
| `--royal-gold-bg`| `rgba(148, 120, 51, 0.08)` | VIP ve Gold üye seçim arka planları |

### Durum ve Bildirim Renkleri (Semantic States)
| Durum | Arka Plan | Metin / İkon | Kullanım Alanı |
| :--- | :--- | :--- | :--- |
| **Başarılı (Success)** | `#dcfce7` (Green-100) | `#15803d` (Green-700) | Sipariş onaylandı, Minibar dolumu tamamlandı |
| **Beklemede (Warning)**| `#fef3c7` (Amber-100) | `#b45309` (Amber-700) | Garson onayı bekleyen sipariş, Garson çağrısı |
| **Kritik / İptal (Danger)**| `#fee2e2` (Red-100) | `#b91c1c` (Red-700) | Reddedilen talep, Stokta tükendi |
| **Bilgi (Info)** | `#e0f2fe` (Sky-100) | `#0369a1` (Sky-700) | Menü inceleniyor, Wi-Fi doğrulandı |

---

## 3. Tipografi Hiyerarşisi (Typography Hierarchy)

* **Font Ailesi:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif`
* **H1 - Sayfa & Otel Başlığı:** `24px / 1.3 / SemiBold (600) / Tracking -0.02em`
* **H2 - Modül & Panel Başlığı:** `18px / 1.35 / SemiBold (600)`
* **H3 - Kart & Bölüm Başlığı:** `15px / 1.4 / Medium (500)`
* **Body / Gövde Metni:** `13.5px / 1.5 / Regular (400)`
* **Small / Meta / Rozet:** `11px - 12px / 1.4 / Medium (500)`
* **Monospace / Kod & Oda No:** `"SF Mono", "Fira Code", monospace (12px)`

---

## 4. Temel Bileşen Kütüphanesi (Component Specifications)

### A. Fiyat Göster / Gizle Toggle & Switchboard Konsolu (Price Visibility Switchboard)
* **Tasarım:** Merkezi Switchboard Konsolu ile 3 ana çalışma modu:
  1. *Tam All-Inclusive (Fiyatlar %100 Gizli):* Misafir menülerde hiçbir para birimi görmez; yerine "Her Şey Dahil İkram" rozeti gösterilir.
  2. *Açık Fiyat Listesi (Tüm Fiyatlar Görünür):* USD / EUR para birimiyle klasik A la Carte satış modu.
  3. *Hibrit Mod (Yalnızca Ekstra Ürünlerde Fiyat):* Standart konsept dahilindekiler "İkram", özel puro, şarap ve havyar gibi kalemler fiyatlı gösterilir.
* **Mekan (Outlet) Bazlı İstisna Yetkisi:** Genel sistem gizli olsa dahi, Puro Bar veya Özel Mahzen gibi noktalar için mekan bazlı fiyat açma imkanı.
* **Canlı Dağıtım:** SSE (Server-Sent Events) ile 0.2 saniyede 529 oda ve 18 outlete anında push edilir.

### B. Master Admin Alt Sekme Mimarisi (Sub-Navigation Architecture)
* **Konsolide Dashboard:** 3 otelin (Diamond, Royal, Premium) canlı doluluk, aktif QR oturumları, KDS ortalama hazırlık ve minibar tamamlama kartları.
* **529 Oda & Kat Matrisi:** Otel çipleri, anlık arama (`#402`, misafir adı, paket tipi), VVIP rozetleri ve misafir QR oturum telemetrisi.
* **18 Outlet & KDS Ağ Durumu:** ESC/POS termal ağ yazıcılarının (TCP:9100) canlı IP/ping durumları ve doğrudan test fişi basımı.
* **Personel & Akıllı Saat Eşleştirme:** Apple Watch Series 9, Samsung Galaxy Watch ve Garson PWA cihazlarının canlı telemetrisi ve haptik titreşim testi.
* **Güvenlik & Denetim Logları:** Değiştirilen fiyat modları, onaylanan siparişler ve minibar seçimlerinin saniye saniye audit trail kaydı.

### C. Minibar Tanımlamalar Konsolu & Saha Zimmet Mimarisi
* **Hiyerarşik Kurulum Akışı:**
  1. *Varsayılan 3 Otel Standardı:* Merit Royal Diamond (273), Merit Royal (125), Merit Royal Premium (131).
  2. *Kat Tanımlama:* Otele bağlı kat ve kanat/blok tanımları.
  3. *Oda Tipi Tanımlama:* King Suite, Royal Penthouse, Deluxe Marina, Family Garden vb.
  4. *Ürün Grubu Tanımlama:* Soft Drinks, Biralar, Şarap & Şampanya, Minyatür İçkiler, Çikolata & Atıştırmalık.
  5. *Ürün Tanımlama:* Stok kodu, barkod, birim fiyat, kritik depo stok seviyesi.
  6. *Konsept Reçetesi Tanımlama:* Her oda tipine özel standart bulunması gereken minibar ürün miktarları.
  7. *Oda Tanımlama & QR Üretimi:* Seçilen oda tipi ve konseptine göre odaya özel şifrelenmiş benzersiz çift yönlü QR kod üretimi.
  8. *Zimmet & Sorumlular:* Depo sorumlusundan kat sorumlusu arabasına zimmet çıkışı (`#ZMT` transfer kodu).

### D. Saha İkamesi, DND ve Canlı Radar Monitörü
* **Zimmetten İkame:** Kat sorumlusu kapıdaki QR'ı okuttuğunda eksilen ürünleri kat arabası zimmetinden düşerek odaya ikame eder; işlem saat, personel, oda, kat ve otel kaydıyla loglanır.
* **DND / Misafir Uyuyor Alarmı:** Kapıda DND varsa ara kayıt oluşturulur; sistem arka planda 45 dakikalık otomatik hatırlatıcı kurarak kat görevlisine zamanı geldiğinde bildirim düşürür.
* **Canlı Animasyonlu Radar Monitörü:** Kat görevlisi odadaki QR'ı okuttuğu anda, yönetici ekranındaki kat planında ilgili oda animasyonlu nabız (`radar-pulse`) ile parlar; personelin o an nerede olduğu anlık izlenir.

### E. Misafir "MYBAR" Kişiselleştirme (Çok Dilli, Günde 1x)
* **Otomatik Dil Tespiti:** Misafirin tarayıcı diline göre arayüz anında 🇬🇧 English, 🇹🇷 Türkçe, 🇩🇪 Deutsch, 🇷🇺 Русский, 🇸🇦 العربية, 🇫🇷 Français veya 🇮🇹 Italiano olarak açılır (varsayılan İngilizce).
* **Damak Zevkine Göre Değişim:** Odaya tanımlı konseptten tüketmeyeceği ürünleri çıkarıp (+0), tüketeceği ürünleri artırabilir (+2).
* **Günde 1 Kez Kuralı:** Veritabanı seviyesinde `@@unique([roomId, requestDate])` kısıtıyla korunur.
* **Anlık Bildirim Fırlatma:** Talep verildiği an kat görevlisine, depoya ve yönetici paneline anlık Web Push/SSE bildirimi iletilir; kat görevlisi odaya girdiğinde tek tıkla zimmetinden karşılar.

### F. QR Menü Hiyerarşisi, Ambiyans Teması & 2 Kademeli Sipariş
* **Çok Kademeli Ağaç:** Otel $\rightarrow$ Outlet $\rightarrow$ Kategori $\rightarrow$ Alt Kategori $\rightarrow$ Alt-Alt Kategori $\rightarrow$ Menü Grupları.
* **Mekan Ambiyans Temaları:** Gold Lüks, Sahil Turkuazı, Gece Mavisi, Rustik Pub renk paletleri.
* **2 Kademeli Sipariş Doğrulama:** Misafirin masadan verdiği sipariş asla doğrudan mutfağa gitmez; önce masaya bakan garsonun el terminaline / Apple Watch'una düşer, ön onay verildikten sonra mutfak KDS ve 80mm yazıcıya aktarılır. Ödeme/kasa entegrasyonu yoktur.

### G. Mutfak KDS & Adisyon Fişi Görünümü
* **Ekran:** Renk kodlu hazırlık süreleri (0-5 dk yeşil, 5-10 dk sarı, 10+ dk kırmızı).
* **Fiziksel Termal Fiş:** 80mm ESC/POS formatında fiyatsız veya fiyatlı adisyon çıktısı.

---

## 5. Ekran Haritası ve Kullanıcı Yolculukları (Screen Flow Map)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    MERKEZİ YÖNETİCİ & TANIMLAMALAR PANELİ (MASTER ADMIN)                │
│  [3 Varsayılan Otel] ➔ [Kat/Oda Tipi] ➔ [Ürün Grubu/Ürün] ➔ [Konsept Reçetesi] ➔ [Oda] │
│                                    [FİYAT GÖSTER / GİZLE SWITCHBOARD]                   │
└────────────────┬───────────────────────┬──────────────────────┬─────────────────────────┘
                 │                       │                      │
                 ▼                       ▼                      ▼
      ┌──────────────────────┐ ┌────────────────────┐ ┌─────────────────────┐
      │  MİNİBAR VE DEPO     │ │    QR MENÜ &       │ │   QR ODA SERVİSİ    │
      │  ZİMMET YÖNETİMİ     │ │    MASADAN SİPARİŞ │ │   (IN-ROOM DINING)  │
      └──────────┬───────────┘ └──────────┬─────────┘ └──────────┬──────────┘
                 │                        │                      │
                 ├────────────────────────┼──────────────────────┤
                 ▼                        ▼                      ▼
      ┌──────────────────────┐ ┌────────────────────┐ ┌─────────────────────┐
      │ Kat Personeli Formu  │ │ Misafir Mobil PWA  │ │ Odaya Kilitli Menü  │
      │ - Zimmetten İkame    │ │ - Ambiyans Teması  │ │ - Telefon Teyidi    │
      │ - DND Hatırlatıcı    │ │ - Kategori Ağacı   │ │ - Butler Servisi    │
      │ - MYBAR Karşılama    │ │ - 0-Ödeme / İkram  │ │                     │
      └──────────┬───────────┘ └──────────┬─────────┘ └──────────┬──────────┘
                 │                        │                      │
                 ├────────────────────────┼──────────────────────┘
                 ▼                        ▼
      ┌──────────────────────┐ ┌────────────────────┐
      │ Canlı Radar Monitörü │ │ Garson PWA & Saat  │ ──► [ Mutfak KDS & Termal Yazıcı ]
      │ - Anlık HK Konumu    │ │ Ön Onay Süzgeci    │     (Yalnızca Onaydan Sonra Basılır)
      │ - DSS Raporlama      │ └────────────────────┘
      └──────────────────────┘
```
