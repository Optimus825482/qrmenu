# Task 13 raporu — Göç: kullanıcılar, e-posta, ek talepler, bildirimler; MyBar, işlemler, oda kontrolleri, havuz ve hareketleri

Durum: DONE (commit `8b25eb1`, dal `ux/yenileme`).

## Yapılanlar
- `steps/users.ts` (`runUsers`: kullanıcılar, UserHotel, depo bağları, EmailSetting, EmailLog, StockRequest, Notification) ve `steps/history.ts` (`runHistory`: MyBar, işlemler, oda kontrolleri, havuz satırları, havuz hareketleri, zimmet arşivi); `steps/shared.ts` ortak okuma yardımcıları (definitions.ts bunları kullanacak şekilde sadeleşti).
- `mapping.ts`: `roleCodeFor`, `stockRequestStatusFor`, `emailStatusFor`, `passwordKindFor`, `dolumStatusFor`, `checkTypeFor`, `matchMybar`, `txTypeFor`, `movementFor` (işaretli).
- `legacy.ts`: naif `timestamp` değerleri Nicosia duvar saati olarak gerçek ana çevrilir (canlı veride doğrulandı: naif 19:25 = 20:25+03); `date` kolonları düz `yyyy-MM-dd` dizesi.
- `index.ts`: `users` ve `history` adımları kayıtlı; hedef bağlantı havuzu 3 ile sınırlı (paylaşılan sunucuda bağlantı tükenmesini azaltmak için).
- Fixture (`legacy-dump.sql`) ve `tests/helpers/legacyTarget.ts`; `migrate-definitions.test.ts` artık `--only definitions` kullanır (varsayılan çalıştırma yeni adımları da koşturuyor).

## Bağlayıcı farklar (uygulandı)
Havuz `total = used + remaining` (negatif 0 + `HAVUZ_NEGATIF`, tutarsız `HAVUZ_TUTARSIZ`), açılış `GOC +total`, işaretli `movementFor` (`iade` → `DUZELTME +n`, not `Legacy iade: …`), `legacyExtra/isComplimentary`, `clientRequestId null`, `idempotencyKey legacy-{id}`, Nicosia `businessDate` (22:30Z → 10-31 testli), hash olduğu gibi (rapor yalnız öneke göre sayı + kullanıcı adı), `admin.legacy`, `superadmin` pasif, SMTP parolası taşınmaz, bildirim 30 gün + alıcı açılımı (yalnız taşınan aktif kullanıcılara), zimmet `LegacyArchive`. Her havuz satırı için Σ hareket ile bakiye farkı `HAVUZ_HAREKET_FARKI` uyarısı + bilgi doğrulaması; `total − used = remaining` doğrulaması hata verirse fail.
Ek adlandırmalar: MyBar bilinmeyen durum `MYBAR_DURUM_BILINMIYOR`, işlem fiyatı `ISLEM_FIYAT_GECERSIZ` (tanımlar adımındaki aynı kodlu uyarılarla karışmasın diye).

## Testler
- `migrate-users` 26/26, `migrate-history` 39/39, `migrate-definitions` + `migrate-core` 48/48 (ayrı koşularda yeşil). TDD: önce fixture + testler, sonra uygulama.
- `npm run lint` ve `tsc --noEmit` temiz.
- Tam `npm run check` (merit_test_mb13): son iki koşuda yalnız ortak PostgreSQL sunucusunun `max_connections` (100) sınırının diğer ajanların e2e sunucularınca doldurulmasından ("sorry, too many clients already", her koşuda farklı testler) ve başka ajanların dosyalarından (uxRatchet, auditLog, minibar-auth, minibar-tasks, radar-*) gelen hatalar vardı; migrate-* dosyalarındaki tek gerçek hata (definitions testinin yeni adımları da koşturması) düzeltildi. Temiz bir tam koşu sunucu yoğunluğu nedeniyle elde edilemedi; kontrolör sunucu sakinken `migrate-*` dosyalarını tekrar koşturmalı.

## Kuru çalıştırma (gerçek `minibar` legacy DB, taze `merit_mb13_goc`, seed sonrası) — sonuç: temiz, ~6 dk
| Varlık | Legacy | Aktarılan | Taşınmadı |
|---|---:|---:|---:|
| user | 17 | 17 | 0 |
| userHotel | 6 | 6 | 0 |
| supervisor | 11 | 11 | 0 |
| emailSetting | 1 | 1 | 0 |
| emailLog | 2179 | 2179 | 0 |
| stockRequest / Item | 2 / 3 | 2 / 3 | 0 |
| notification | 101635 | 5979 (12114 alıcı satırı) | 95656 (95655 ESKI, 1 ALICI_YOK) |
| mybarRequest / Item | 21 / 5 | 21 / 5 | 0 |
| minibarTx / Item | 242835 / 227947 | aynı | 0 |
| roomCheck | 253721 | 253721 | 0 |
| hotelStock | 177 | 177 | 0 |
| hotelStockMovement | 227422 (177+ açılış dahil) | 227422 | 0 |
| legacyArchive | 13 | 13 | 0 |

Tüm satırlarda Fark 0. Doğrulamalar: `total − used = remaining` 177 satır 0 bozuk; kalan = Σ hareket 177 satırın 69'unda fark var (`HAVUZ_HAREKET_FARKI` 69; legacy hareket geçmişi tutarsız, bilgi). Diğer uyarılar: `SIFRE_SIFIRLANMALI` 17 (tüm legacy kullanıcılar scrypt; şifre biçimleri: pbkdf2 0, bcrypt 0, scrypt 17), `SUPERADMIN_PASIF` 2, `SMTP_SIFRESI_YENIDEN_GIRILMELI` 1, `ADIM_YOK` (tasks, T14). `HAVUZ_NEGATIF/TUTARSIZ/YETIM` ve `KULLANICI_YOK_AKTOR` canlı veride yok.

## Notlar
- Canlı veride tüm kullanıcılar scrypt: P0 yalnız pbkdf2/bcrypt doğruladığı için gerçek göçten sonra herkesin şifresi sıfırlanmalı.
- `resolveActor` (T12) en eski aktif R-SYS'i seçer; göçten sonra yeniden çalıştırmada taşınmış sistem yöneticisi seçilebilir. Gerçek çalıştırmada `--actor` verin.
- Havuzda hedefte zaten olan otel/ürün satırı `HAVUZ_VAR` ile atlanır (hareketleri `HAREKET_YETIM`).
- Rapor/log gizli veri içermez (testli: hash, SMTP parolası, e-posta, bağlantı dizesi yok).
