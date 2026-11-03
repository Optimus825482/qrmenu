# P4 Task 2 raporu - Çeviri sağlayıcı soyutlaması ve servisi

Durum: DONE. Şema/env/ayar değişikliği gerekmedi (T1 `c201ba3` `TextTranslation`, `TRANSLATE_PROVIDER`, `mybar.translateNotes` zaten getirmişti).

## Eklenenler (`merit/src/modules/mybar/server/`)
- `translate/provider.ts` (arayüz), `none.ts` (varsayılan, no-op), `gtx.ts` (canlıdaki uç nokta), `index.ts` (`getTranslationProvider`, `setTranslationProviderForTests`).
- `translateService.ts`: `translateNoteForStaff(hotelId, note, { timeoutMs? })`, `localizeTexts(texts, lang)`, `warmTranslations(texts, lang)`, `TRANSLATE_TIMEOUT_MS = 3500`.
- Test: `tests/unit/translate.test.ts` (12 test; ağ yok, sahte sağlayıcı/fetch).

## Davranış
- Not çevirisi hiçbir zaman fırlatmaz: sağlayıcı `none`, ayar kapalı, boş not, hata, 3.5 sn zaman aşımı -> `{ noteTr: null, srcLang: null }`; zaten Türkçe -> `{ null, srcLang }`. Not metni loglanmaz, önbelleğe yazılmaz.
- `localizeTexts`: `tr`/`none` için DB sorgusu yok; tek `findMany` (sha256 + dil); kaçıran metin Türkçe özgünüyle döner, arka planda `warmTranslations` önbelleği doldurur (en çok 4 eşzamanlı, 3.5 sn/metin, >600 karakter atlanır, upsert).

## Devir notları
- T3: oda kilidi dışında, kilitten ÖNCE `await translateNoteForStaff(hotelId, note)` çağır; `noteTr`/`note_src_lang` alanlarına yaz. Toplam bütçe 3.5 sn.
- T4: ürün/grup adı ve oda mesajı için `await localizeTexts([...adlar], locale)` -> `Map<trMetin, yerelMetin>`; ilk istekte Türkçe döner, sonrakilerde çevrilmiş olur. Locale tipi `@/lib/i18n/locales` (8 dil; `tr`/`none` kısa devre).
- Testte `setTranslationProviderForTests(fake)`; sonra `null` ile sıfırla.
