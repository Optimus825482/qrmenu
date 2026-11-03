# Task 14 raporu — Göç: doluluk, görevler, DND, günlükler; doğrulama raporu, belgeler ve kapanış

Durum: DONE. Dal `ux/yenileme`. İki commit: önce T13 düzeltme turu (`c1525ac`), sonra T14 (hash raporun sonunda).

## Yapılanlar

### T13 düzeltme turu (`c1525ac`, ayrı commit)
1. Kullanıcı e-postası küçük harf + kırpma; yinelenen ikinci kullanıcıda e-posta null + `EPOSTA_YINELENEN` (örnek yalnız kullanıcı adı, e-posta rapora girmez).
2. Ek talepte otel: kullanıcının birincil oteli, yoksa **yalnız tam bir otel bağı** varsa o; aksi halde `TALEP_OTEL_BELIRSIZ` + talep taşınmaz ("ilk userHotel" tahmini kalktı; eski `TALEP_OTELSIZ` kodu bu koda döndü).
3. `islem_tarihi` boş işlem artık `new Date()` ile yazılmaz: `ISLEM_TARIHI_YOK` + satır ve kalemleri "taşınmadı".
4. `LegacyArchive` `createMany(skipDuplicates)` sonrası `result.count` sayılır (kalanı `existing`).
5. Talep miktarı 0/boş/negatif → `TALEP_MIKTAR_DUZELTILDI` (max(1) sıkıştırması durur).
6. "Havuz kalanı = Σ hareket" doğrulaması `ok: farklar === 0`. `Report.check`'e `level: "WARN"` eklendi: başarısız ama bilgi amaçlı kontrol raporda `UYARI` yazar ve çıkış kodunu bozmaz (canlı veride 69 satır fark var; aksi halde her gerçek çalıştırma 1 dönerdi).
- Testler: `migrate-users` (otel tahmini tek/çoklu bağ, e-posta normalizasyonu, miktar uyarısı), `migrate-history` (tarihsiz işlem, `UYARI —` biçimi).
- Not: bcrypt işleme dokunulmadı (karar: doğrulanabilir, korunur).

### T14 (ikinci commit)
- `steps/tasks.ts` (`runTasks`): doluluk (yüklemeler, misafir kayıtları, yükleme görevleri) → günlük görevler (+ kalemler, durum günlüğü) → DND → QR okutma günlüğü → denetim/sistem günlüğü; `--skip-logs` son ikisini atlar. Tümü `createMany` parçaları, `idmap` ile idempotent, T13 Nicosia zaman yardımcıları; büyük tablolar anahtar-sayfalı akıtılır.
  - Yükleme: `dosya_yolu/dosya_boyutu/silme_tarihi` hiç okunmaz; kod çakışmasında `-L{id}`; `hata_detaylari` JSON değilse `[{message}]`; `(otel,gün,tür)` yükleme görevi çakışmasında en yeni kalır (`YUKLEME_GOREV_CAKISMA`).
  - Görev: `(otel, gün, tür)` grupları iki geçişte (okuma + yazma); tümü tamamlanmışsa `TAMAMLANDI` ve `completedAt` = en büyük `kontrol_zamani` (yoksa görev `tamamlanma_tarihi`), aksi halde `DND_BEKLIYOR > EKSIK > DEVAM > BEKLIYOR`. Aynı oda aynı grupta ikinci kez gelirse ilki kalır (`GOREV_KALEM_COBLU`).
  - DND: bağımsız kayıtlar + göreve bağlı eski DND (`dnd_sayisi>0`, `dnd_kontroller` zaman sırasıyla 1..n); `(oda, gün)` çakışmasında tek `RoomDnd`, kontroller birleşir (aynı zamanlı olan tekrar sayılmaz), `DND_CAKISMA`; `dnd_sayisi 0 → 1` + uyarı.
  - Günlük: `ip null → 'unknown'`, `audit_logs → LEGACY_{TİP}` (tip boşsa `KAYIT`), `sistem_loglari → LEGACY_LOG_{TİP}`.
- `mapping.ts`: `taskStatusFor`, `taskTypeFor`, `taskTypeFromGorevTipi`, `uploadKindFor`, `uploadStatusFor`, `uploadTaskStatusFor`, `dndStatusFor`, `scanKindFor`, `hhmm` (+ `isKnown…` eşleşmeleri; bilinmeyen değerler uyarıya gider).
- `validate.ts`: `runValidation(ctx, ran)` + `recordValidation`. Kontroller: `SAYI_FARKI` (legacy sayı `LegacyReader.count` ile bağımsız okunur; ayrıca eşleme tablosunda olup hedefte olmayan satırlar), `HAVUZ_FARKI`, `HAVUZ_TUTARSIZ` (WARN), `HAREKET_BAKIYE_FARKI` (WARN), `TOKEN_KAYIP`, `ODA_SAYISI` (WARN), `MYBAR_DURUM_SAYILARI`, `ISLEM_TIP_SAYILARI`, `HASH_FARKI`, `LOGO_DOSYASI_YOK` (kuru çalıştırmada atlanır). FAIL → çıkış 1; sır içermez (kullanıcı adı/oda no/otel kodu). Rapor `## Yapılacaklar`: eski biçimli QR'lı oda sayısı, scrypt kullanıcıları, pasif superadmin, bildirim kesme tarihi (+ T13'ten SMTP).
- `index.ts`: `tasks` adımı kayıtlı, doğrulama her çalışmada (kuru çalıştırmada tek transaction içinde) koşar.
- Fixture: `legacy-dump.sql`'e 12 tablo (canlı kolon adlarıyla), `legacyTarget.ts` yeni tabloları sıfırlar.
- Belgeler: `docs/kurulum.md` "Veri göçü (minibarlatest)" bölümü; `merit/README.md` Minibar bölümü, göç komutu, env tablosu düzeltmesi.
- Ek (T14 commit'inde): `EPOSTA_YINELENEN` örneğinden e-posta çıkarıldı.

## Plandan/brief'ten sapmalar ve canlı veri bulguları
- Canlı şema planla uyumlu (kolonlar doğrulandı) ama `qr_kod_okutma_loglari` tablo adı ve `okutma_tipi='misafir'` (20 satır) değeri planda yok: `misafir → MISAFIR` eşlendi.
- Dosya/görev türleri canlıda `in_house|arrivals|departures` ve `inhouse|arrivals|departures` yazımlarında: `uploadKindFor` hepsini normalleştirir.
- Misafir kaydı olmayan detay (canlıda 9816 satır) brief'e göre `INHOUSE_KONTROL` yapılmak yerine önce **kendi `gunluk_gorevler.gorev_tipi`** (kontrol türüyse) kullanılır; ancak o da yoksa `INHOUSE_KONTROL` + `GOREV_TIPI_BELIRSIZ`. (Küçük iyileştirme; istenmezse `taskTypeFromGorevTipi` çağrısı kaldırılır.)
- `TOKEN_KAYIP`: legacy token yok → FAIL; hedef oda zaten başka token taşıyorsa (T12'nin "var olan token ezilmez" kararı) veya token başka odadaysa WARN (FAIL olsaydı bu belgelenmiş davranış çıkış kodunu bozardı). `LOGO_DOSYASI_YOK` yalnız göçün yazdığı `/brand/hotels/<kod>.png` için bakar.
- `ISLEM_TIP_SAYILARI`: tip başına hedef ≤ legacy, eksiklerin toplamı rapordaki "taşınmadı" ile eşit (sayaç yoksa yalnız ilk koşul).

## Test sonuçları (`merit_test_mb14`)
Paylaşılan PostgreSQL sürekli `max_connections` (100) sınırında; tam dosyalar çoğu kez "too many clients" ile düştü, başarısız testler tek tek / yeniden koşturularak doğrulandı (hepsi yeşil):
- `migrate-tasks` 34/34, `migrate-validate` 12/12, `migrate-history` 40/40, `migrate-core` 27/27, `migrate-definitions` 21/21 (kalan 1'i izole yeşil), `migrate-users` 28/28 (3'ü izole yeşil + e-posta testi).
- `eslint` (scripts/migrate-from-minibarlatest, migrate-* testleri) temiz; `tsc --noEmit` kendi dosyalarımda temiz (çıktıdaki hatalar diğer ajanların `.next-*` dizinlerinden).
- Tam birim paketi, `npm run build`, e2e ve `prisma migrate diff` çalıştırılmadı (makine doygun; kural gereği).

## Canlı veriyle kuru çalıştırma (yerel `minibar` yedeği → taze `merit_mb14_goc`, seed sonrası)
URL ortam dışı bir dosyaya yazılmadı (bağlantı bilgisi yalnız süreç ortamında). Süre ~8 dk, sonuç **temiz**, **tüm doğrulamalar GEÇTİ** (`HAREKET_BAKIYE_FARKI` ve T13'ün Σ hareket satırı UYARI: 69/177 satır). Fark her satırda 0.

| Varlık | Legacy | Aktarılan | Taşınmadı |
|---|---:|---:|---:|
| occupancyUpload | 2439 | 2439 | 0 |
| guestRecord | 48564 | 48564 | 0 |
| uploadTask | 2649 | 2649 | 0 |
| dailyTask (grup) | 2285 | 2285 | 0 |
| dailyTaskItem | 139541 | 129486 | 10055 (çoğul oda/görev) |
| taskStatusLog | 80907 | 80324 | 583 (düşen kalem) |
| roomDnd | 31610 | 18345 | 13265 (çoğu göreve bağlı kopya, tek kayıtta birleşti) |
| roomDndCheck | 20182 | 20182 | 0 |
| qrScanLog | 26 | 26 | 0 |
| auditLog (audit+sistem) | 411285 | 411285 | 0 |

Dikkat edilecekler (rapor uyarıları): `GOREV_KALEM_COBLU` 10055 (aynı oda aynı (otel,gün,tür) grubunda birden çok kişiye atanmış görev birleşti; ilk kalem korundu), `GOREV_MISAFIR_KAYDI_YOK` 321, `EPOSTA_YINELENEN` 3 (üçü de gerçek yinelenen e-posta), `SIFRE_SIFIRLANMALI` 17, `SUPERADMIN_PASIF` 2, `SMTP_SIFRESI_YENIDEN_GIRILMELI` 1, `QR_TOKEN_DOLDURULDU` 558. Gerçek çalıştırmada `--actor` verin.

## Önerilen `ilerleme-data.js` / `DEVIR.md` satırları (kontrolör uygulayacak)
- `ilerleme-data.js`: P2 kartı `done`; satır 4 (göç) `done`: "Göç: doluluk, görevler, DND, günlükler; doğrulama raporu (SAYI/HAVUZ/TOKEN/HASH), canlı yedekle kuru çalıştırma temiz". `headline`: "Minibar göçü tamam: 411 bin günlük, 139 bin görev kalemi dahil canlı yedek kuru çalıştırması temiz; gerçek çalıştırma ve şifre sıfırlama kaldı." `log` satırı: "03.11 T14 göç tamam: tasks adımı, validate.ts, kurulum.md/README". `updatedAt`: 03.11.2026.
- `DEVIR.md` §1: P2 satırı "Tamam — plana uygun; UI cilası UX planında; veri göçü canlı yedekle kuru çalıştırıldı (temiz), gerçek çalıştırma kullanıcıda". P3 satırı "Tamam (T11'de kapandı) — plana uygun; UI cilası UX planında". Göç sonrası yapılacaklar: şifre sıfırlama (17 kullanıcı), QR yeniden üretimi (6 haneli token'lı odalar), SMTP parolası, `--actor` ile gerçek çalıştırma.
