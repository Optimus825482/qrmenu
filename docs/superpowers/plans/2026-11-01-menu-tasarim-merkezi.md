# Menü Tasarım Merkezi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut Menü Tasarım Merkezi'ni araştırmadaki 2025-26 "şık menü" tarifine göre genişletmek (tipografi, yoğunluk, karşılama, küratörlü fotoğraf, kalite kontrolü) ve outlet'e özel, 5 dilli garson çağrı seçeneklerini aynı merkeze eklemek.

**Architecture:** Tasarım ayarları `OutletMenuDesign.options` JSON'una eklenir (şema değişikliği yok); çağrı seçenekleri tek yeni tabloya (`OutletCallOption`) yazılır ve `guestState` ile misafire taşınır. Kalite kontrolü saf bir fonksiyondur (`quality.ts`), stüdyoda canlı, sunucuda yalnız engel düzeyi (kontrast) yeniden doğrulanır. Misafir çağrı düğmesi bir alt sayfa (bottom sheet) açar; çağrının notu seçilen Türkçe etiketin anlık görüntüsüdür.

**Tech Stack:** Next.js (App Router, bu sürüm eski bilgiden farklı), React, Prisma + PostgreSQL, zod, next-intl, Vitest (birim), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-01-menu-tasarim-merkezi-design.md`

## Global Constraints

- Çalışma dalı `p5/qr-menu`, kök `D:\PROJECTS\qrmenu`, uygulama `merit/`. Komutlar `merit/` içinde çalışır.
- `merit/AGENTS.md`: bu Next.js sürümünde API'ler değişmiştir; route handler, server action veya layout'a dokunmadan önce `node_modules/next/dist/docs/` altındaki ilgili kılavuzu oku.
- UI'da **"sepet" sözcüğü ve alışveriş dili yok**; "Seçimler" kullanılır.
- Misafir metinleri 5 dilde (`tr`, `en`, `de`, `ru`, `ar`) `src/lib/i18n/messages/*.json` içine eklenir; yönetim arayüzü Türkçedir.
- Dokunma hedefleri (düğme, etiket, kategori sekmesi, çağrı seçeneği) en az **44×44 px**, bu bir seçenek değildir.
- Yeni web fontu yüklenmez; tipografi çiftleri sistem fontlarıdır. Arapçada gövde yazısı her zaman mevcut Noto Sans Arabic yığınıdır.
- Kontrast eşikleri: gövde yazısı/zemin ≥ 4.5:1 (< 3 **engel**), vurgu/zemin ≥ 3:1, vurgu üstü yazı/vurgu ≥ 4.5:1 (< 3 **engel**). Yayını yalnızca engel durdurur.
- Çağrı seçeneği: outlet başına en çok **8 aktif**; etiket ≤ 60 karakter (HTML ve kontrol karakterleri temizlenir); "Sadece çağır" tabloda tutulmaz, istemcide sabit ve en sonda.
- Yetki: mevcut **QM-TEM** (okuma "V", yazma "D"); hotel manager için `saveOutletDesign`'daki gibi `QM-MEN` "D" yedeği ve `assertOutletScope`.
- Migrasyon yalnızca ekler; mevcut tablo/sütunlara dokunulmaz; mevcut `prisma/migrations` altındaki diğer (takipsiz) klasörlere dokunulmaz.
- **Commit kuralı:** çalışma ağacında bu işten bağımsız, commit edilmemiş değişiklikler var. Her commit'te yalnızca bu görevin dosyalarını **adıyla** `git add` et (`-A`/`.` yok). Commit mesajı Türkçe, `feat(p5): …` biçiminde ve `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` ile biter.
- Her görev sonunda `npm run check` (lint + typecheck + birim) yeşil olmalı. Test DB: `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy` (README).

## Review Focus

Spec'in ima ettiği ama görev testlerinin doğal olarak yakalamayacağı durumlar (her satırın testi sahibi göreve eklendi):

1. Admin bir outletin tüm çağrı seçeneklerini silerse veya pasife alırsa misafir alt sayfasında yalnız "Sadece çağır" kalır ve çağrı yine çalışır (T6, T7).
2. Başka outletin, pasif veya silinmiş bir `optionId` ile gelen istek reddedilir ve çağrı kaydı oluşmaz; istemci `type` dayatsa bile seçeneğin tipi geçerlidir (T6).
3. Etiket HTML içerir (`<img onerror>`), Arapçada çevirisi yoktur: metin olarak render edilir, Türkçeye düşer (T4, T7).
4. Önceden kaydedilmiş (boş olmayan) `options` JSON'u yeni anahtarlar olmadan gelir veya bozuk değer taşır: görünüm değişmez, hata fırlamaz (T1).
5. `heroImageUrl` dış bir adres veya başka outletin görseli olur: sunucu reddeder; `hero = PHOTO` ama görsel yoksa karşılama başlık gibi çizilir (T1, T3).
6. Misafir "Gönder"e art arda dokunur (çift tık): tek istek gider (T7).

## Ön koşul — Task 0: Temiz başlangıç

Bu işin dokunacağı dosyalarda (`themes.ts`, `guestState.ts`, `guest.css`, `GuestFrame.tsx`, i18n dosyaları, `outlets.ts` …) commit edilmemiş önceki değişiklikler var; görev commit'leri bunları da süpürürdü.

- [ ] **Step 1:** `git status --short | wc -l` ve `npm run check` çalıştır; sonucu deftere yaz (taban çizgisi: kaç test geçiyor).
- [ ] **Step 2:** Kullanıcıdan onay al: mevcut değişiklikler tek bir `chore(p5): …` commit'i olarak kaydedilsin (veya kullanıcı kendi commit'ler). Onay olmadan T1'e **başlama**; çalışma ağacını `git stash`/`reset` ile değiştirme.

---

### Task 1: Tasarım seçenekleri modeli

**Files:**
- Modify: `merit/src/modules/menu/design.ts`
- Modify: `merit/src/modules/menu/server/themes.ts` (`designSchema`, `saveOutletDesign`)
- Test: `merit/tests/unit/design.test.ts`, `merit/tests/unit/themes.test.ts`

**Interfaces:**
- Produces (design.ts): `TYPOGRAPHIES`, `DENSITIES`, `HERO_STYLES` (her biri `{ id, label }[]`); tipler `TypographyId = "SYSTEM"|"CLASSIC"|"EDITORIAL"|"MODERN"|"HUMANIST"|"COASTAL"`, `DensityId = "AIRY"|"BALANCED"|"COMPACT"`, `HeroStyle = "NONE"|"TITLE"|"PHOTO"`; `DesignOptions` şu alanları kazanır: `typography: TypographyId`, `density: DensityId`, `hero: HeroStyle`, `heroImageUrl: string`, `curatedPhotos: boolean`, `showSearch: boolean`, `showFilters: boolean`. `NEUTRAL_NEW_OPTIONS` = `{ typography:"SYSTEM", density:"BALANCED", hero:"TITLE", heroImageUrl:"", curatedPhotos:false, showSearch:true, showFilters:true }`.
- Produces (themes.ts): `saveOutletDesign` yeni alanları zod ile doğrular; `heroImageUrl` doluysa outletin aktif bir ürününün `imageUrl`'ine eşit olmalıdır.

- [ ] **Step 1: Failing tests (design.test.ts)** — şu `it` bloklarını ekle:
  - `"boş seçenekli kayıt şablonun yeni alanlarını kullanır"`: `designFromStored({ template: "GOURMET", options: {} }).options` → `toMatchObject({ typography: "EDITORIAL", density: "AIRY" })`.
  - `"kayıtlı eski seçenekte eksik yeni anahtarlar nötr varsayılana düşer"`: `designFromStored({ template: "GRANDE", options: { cardStyle: "LIST", showPrices: false } }).options` → `toMatchObject(NEUTRAL_NEW_OPTIONS)` ve `showPrices === false`.
  - `"bozuk yeni değerler nötre düşer"`: `options: { cardStyle:"LIST", typography:"COMIC", density:7, hero:"X", heroImageUrl:42, curatedPhotos:"yes" }` → hepsi `NEUTRAL_NEW_OPTIONS` değerinde.
  - `"heroImageUrl yalnız /uploads/ ile başlıyorsa korunur"`: `"/uploads/menu/a.webp"` korunur; `"https://evil.example/x.png"` → `""`; 301 karakter → `""`.
- [ ] **Step 2:** `npx vitest run tests/unit/design.test.ts` — FAIL.
- [ ] **Step 3: `design.ts`:** yukarıdaki sabitleri/tipleri ekle; `options()` yardımcısı yeni alanları taşısın; şablon ön ayarları: GRANDE→`CLASSIC`, VELVET→`CLASSIC`, GOURMET→`EDITORIAL`+`AIRY`, NOIR_LOUNGE→`EDITORIAL`, CHEF_TABLE→`MODERN`+`AIRY`, POOL_CLUB→`MODERN`+`COMPACT`, AQUA_GOLD→`MODERN`, COASTAL ve TROPIC→`COASTAL`, CAFE_ATELIER ve PATISSERIE→`HUMANIST`; ROYAL dahil kalanlar nötr (`SYSTEM`/`BALANCED`/`TITLE`). `normalizeOptions` kuralı: `options` boş obje → şablon ön ayarı (bugünkü davranış); boş değilse yeni anahtarlar eksik/bozuksa **şablondan değil `NEUTRAL_NEW_OPTIONS`'tan** gelir; `heroImageUrl` kırpılır, `/uploads/` öneki ve ≤ 300 karakter şartı aranır.
- [ ] **Step 4:** design testleri PASS.
- [ ] **Step 5: Failing tests (themes.test.ts)**, dosyadaki mevcut `saveOutletDesign`/fixture düzenini izleyerek: `"yeni tasarım alanları kaydedilir ve geri okunur"`; `"başka outletin görseli heroImageUrl olarak VALIDATION ile reddedilir"` (başka outlette `imageUrl:"/uploads/menu/x.webp"` düğümü var); `"dış adres heroImageUrl reddedilir"`; `"hero PHOTO ve boş heroImageUrl kaydedilir"`.
- [ ] **Step 6: `themes.ts`:** `designSchema.options`'a yeni alanlar (enum'lar `TYPOGRAPHIES`/`DENSITIES`/`HERO_STYLES`'ten türetilir, `heroImageUrl: z.string().max(300)`); transaction içinde `heroImageUrl !== ""` ise `tx.menuNode.findFirst({ where: { outletId, imageUrl: heroImageUrl, isActive: true }, select: { id: true } })` yoksa `DomainError("VALIDATION", "Karşılama fotoğrafı bu outletin ürünlerinden biri olmalı")`.
- [ ] **Step 7:** `npm run check` PASS. Commit: `feat(p5): menü tasarım seçenekleri — tipografi, yoğunluk, karşılama, küratörlü fotoğraf` (dosyalar adıyla).

### Task 2: Kontrast, kalite kontrolü ve renk paketleri

**Files:**
- Create: `merit/src/modules/menu/contrast.ts`, `merit/src/modules/menu/quality.ts`
- Modify: `merit/src/modules/menu/ui/guest/GuestFrame.tsx` (`readableText` `contrast.ts`'ten gelir; dışa aktarım korunur), `merit/prisma/seed/menuThemes.ts`, `merit/src/modules/menu/server/themes.ts` (`saveOutletDesign`)
- Test: `merit/tests/unit/quality.test.ts` (yeni), `merit/tests/unit/themes.test.ts`

**Interfaces:**
- Produces (contrast.ts): `contrastRatio(foreground: string, background: string): number` (WCAG göreli parlaklık, `#rgb`/`#rrggbb`), `readableText(bg: string): string` (mevcut davranışın aynısı).
- Produces (quality.ts): `type QualityLevel = "block" | "warn" | "info"`; `type QualityFinding = { id: "text-contrast"|"accent-contrast"|"button-contrast"|"photo-density"|"translations"|"allergens"|"long-detail"; level: QualityLevel; message: string }`; `type QualityItem = { detail: string | null; imageUrl: string | null; allergens: string[]; tags: string[]; translationLangs: string[] }`; `evaluateQuality(input: { design: OutletDesign; theme: GuestTheme; items: QualityItem[] }): QualityFinding[]`; `blockingFindings(design: OutletDesign, theme: GuestTheme): QualityFinding[]` (yalnız `level === "block"`).

- [ ] **Step 1: Failing tests (quality.test.ts):**
  - `contrastRatio("#000000","#ffffff")` ≈ 21; `contrastRatio("#777777","#ffffff")` < 4.5.
  - `"her yerleşik tema eşikleri geçer"`: `MENU_THEMES` (seed) üzerinde `blockingFindings` boş ve `evaluateQuality` içinde `text-contrast`/`button-contrast` bulgusu yok (Krem ve Koyu Lüks dahil).
  - `"gri üstüne gri engeldir"`: `theme.bg="#808080"`, `accent="#858585"`, `textOnAccent="#888888"` → `blockingFindings` en az bir `block`.
  - `"4.5 ile 3 arası uyarıdır, engel değil"`.
  - `"fotoğraf yoğunluğu"`: 4+ görselli ürün ve `curatedPhotos:false` → `photo-density` `info`; `curatedPhotos:true` → yok.
  - `"çeviri eksikliği"`: 10 üründen 3'ünde `ar` yok → `translations` `warn`, mesaj "Arapça" içerir; 1'inde yoksa bulgu yok (eşik %20).
  - `"alerjen"`: `showAllergens:true` ve boş alerjenli ürün → `warn`; `showAllergens:false` → yok. `"uzun açıklama"`: > 140 karakter → `info`.
- [ ] **Step 2:** testler FAIL.
- [ ] **Step 3:** `contrast.ts` ve `quality.ts`'i yaz (saf, sunucu/istemci ortak; `"use client"` dosyalarından içe aktarma yapma). Mesajlar Türkçe, her bulgu ne yapılacağını söyler.
- [ ] **Step 4: seed:** `menuThemes.ts`'e `Krem` (`bg:#faf6ee accent:#8a5a2b soft:#f1e9da textOnAccent:#ffffff`) ve `Koyu Lüks` (`bg:#16181d accent:#c8855a soft:#23262d textOnAccent:#16181d`) ekle; renkleri Step 1 testi geçecek şekilde ayarla, geçmezse koyulaştır/açıklaştır. Mevcut temalara dokunma.
- [ ] **Step 5: sunucu doğrulaması:** `saveOutletDesign` içinde, seçilen temayı okuduktan sonra `blockingFindings(design, theme)` doluysa `DomainError("VALIDATION", <ilk bulgunun mesajı>)`. Test (`themes.test.ts`): `"okunamaz kontrastlı tema ile yayın reddedilir"`.
- [ ] **Step 6:** `npm run check` PASS. Commit: `feat(p5): menü kalite kontrolü, kontrast doğrulaması ve Krem / Koyu Lüks temaları`.

### Task 3: Misafir sunumu (tipografi, yoğunluk, karşılama, küratörlü fotoğraf)

**Files:**
- Create: `merit/src/modules/menu/ui/guest/menuPresentation.ts`
- Modify: `merit/src/modules/menu/ui/guest/GuestFrame.tsx`, `merit/src/modules/menu/ui/guest/MenuView.tsx`, `merit/src/app/(guest)/guest.css`
- Test: `merit/tests/unit/menu-presentation.test.ts` (yeni)

**Interfaces:**
- Consumes: T1 `DesignOptions` yeni alanları.
- Produces: `curatedPhotoIds(categories: GuestCategory[], max = 3): Set<string>` — `SEFIN_SECIMI` etiketli, görseli olan ürünlerin kategori sırasına göre ilk `max` kimliği. `GuestFrame` ek `data-typography`, `data-density`, `data-hero`, `data-curated` öznitelikleri yazar.

- [ ] **Step 1: Failing tests:** `"yalnız şefin seçimi ve görseli olanlar, en çok 3"` (5 uygun ürün → 3, sıra korunur); `"görseli olmayan şef seçimi sayılmaz"`; `"etiketsiz ürün sayılmaz"`; `"kategori yoksa boş küme"`.
- [ ] **Step 2:** FAIL → `menuPresentation.ts` yaz → PASS.
- [ ] **Step 3: `MenuView.tsx`:** karşılama bloğu `hero` değerine göre: `NONE` render etmez; `TITLE` bugünkü blok; `PHOTO` ve `heroImageUrl` doluysa görselli bant (`<img alt="">`, `loading="eager"`), görsel yoksa `TITLE`. `curatedPhotos` açıkken ürün görselleri yalnız `curatedPhotoIds` içindekilerde büyük, diğerleri yazı satırı. Arama kutusu `showSearch`, etiket süzgeçleri `showFilters` kapalıysa render edilmez.
- [ ] **Step 4: `GuestFrame.tsx`** yeni `data-*` özniteliklerini yazar. **`guest.css`:** `[data-typography]` değerleri için font yığınları (`CLASSIC` Georgia/serif başlık + sistem sans gövde; `EDITORIAL` Didot, "Bodoni 72", Georgia; `MODERN` "Segoe UI", Inter, system-ui geniş harf aralığı başlık; `HUMANIST` "Trebuchet MS", Optima, sans; `COASTAL` "Palatino Linotype", Palatino, serif; `SYSTEM` mevcut), `[data-density]` için boşluk ölçeği (`AIRY` 1.35×, `BALANCED` 1×, `COMPACT` .8×) ve satır aralığı ≥ 1.5, `.g-button`, `.g-tabs button`, etiket süzgeçleri ve çağrı seçenekleri için `min-height: 44px; min-width: 44px`. `[lang="ar"]` kuralı gövde yığınını Noto Sans Arabic'e sabitler.
- [ ] **Step 5:** `npm run check` PASS. Commit: `feat(p5): misafir menüsü — tipografi, yoğunluk, karşılama ve küratörlü fotoğraf`.

### Task 4: Çağrı seçeneği veri modeli ve servisi

**Files:**
- Modify: `merit/prisma/schema.prisma` (model + `Outlet.callOptions OutletCallOption[]`)
- Create: yeni migrasyon klasörü (zaman damgalı, `outlet_call_options`), `merit/src/modules/menu/callOptions.ts` (saf), `merit/src/modules/menu/server/callOptions.ts`, `merit/src/modules/menu/server/actions/callOptions.ts`
- Test: `merit/tests/unit/call-options.test.ts` (yeni)

**Interfaces:**
- Schema: `model OutletCallOption { id cuid; outletId (→ Outlet, Cascade); label VarChar(60); translations Json @default("{}"); callType CallType; sortOrder Int @default(0); isActive Boolean @default(true); createdAt; updatedAt; @@index([outletId, sortOrder]); @@map("outlet_call_options") }`.
- Produces (callOptions.ts, saf): `CALL_LANGS = ["en","de","ru","ar"] as const`; `type GuestCallOption = { id: string; label: string; translations: Partial<Record<(typeof CALL_LANGS)[number], string>>; callType: "GARSON"|"HESAP"|"DIGER" }`; `callOptionLabel(option: Pick<GuestCallOption,"label"|"translations">, locale: string): string` (çeviri varsa o, yoksa `label`; `tr` her zaman `label`).
- Produces (server/callOptions.ts): `type CallOptionRow = GuestCallOption & { sortOrder: number; isActive: boolean }`; `MAX_ACTIVE_OPTIONS = 8`; `list(ctx: Ctx, outletId: string): Promise<CallOptionRow[]>`; `save(ctx: Ctx, outletId: string, raw: { id?: string; label: string; translations?: Record<string,string>; callType: string; isActive?: boolean }): Promise<CallOptionRow>`; `reorder(ctx: Ctx, outletId: string, orderedIds: string[]): Promise<void>`; `remove(ctx: Ctx, id: string): Promise<void>`; `listActive(outletId: string): Promise<GuestCallOption[]>` (oturumsuz, `isActive` ve `sortOrder`); `resolveActive(db, outletId: string, optionId: string): Promise<{ label: string; callType: "GARSON"|"HESAP"|"DIGER" }>` (bulunamazsa/pasif/başka outlet → `DomainError("NOT_FOUND", "Çağrı seçeneği bulunamadı")`; `db` bir `PrismaClient | Prisma.TransactionClient`).
- Produces (actions): `listCallOptionsAction`, `saveCallOptionAction`, `reorderCallOptionsAction`, `removeCallOptionAction` (`safeAction` + zod, `themes` eylemleri deseni).

- [ ] **Step 1: Failing tests (call-options.test.ts, `waiter-calls.test.ts` fixture deseniyle `resetReferenceData`/`orderSetup`):**
  - `"kaydet: etiket HTML'den temizlenir ve çeviriler 60 karakterle sınırlanır"` (`"<b>Peçete</b>"` → `"Peçete"`); `"callType geçersizse VALIDATION"`.
  - `"9. aktif seçenek CONFLICT"`; pasif olanlar sınırı saymaz.
  - `"yetkisiz kullanıcı (QM-TEM yok) FORBIDDEN"` ve `"başka oteldeki outlet NOT_FOUND"`; hotel manager `QM-MEN` "D" ile kaydeder.
  - `"reorder: sıra id listesine göre yazılır, listede olmayan id VALIDATION"`.
  - `"remove: denetim kaydı yazılır ve menu.changed (op callOptions) yayınlanır"`.
  - `"resolveActive: başka outletin, pasif ve olmayan seçenek NOT_FOUND"`.
  - `callOptionLabel`: `("ar", çeviri yok)` → Türkçe etiket; `("en", çeviri var)` → çeviri; `("tr", …)` → etiket.
- [ ] **Step 2:** `schema.prisma`'yı güncelle; migrasyonu P5 defterindeki (T1) yöntemle üret (`prisma migrate diff` ile SQL, `migrate deploy`), `npx prisma generate`. Migrasyon SQL'inin sonuna **tek seferlik doldurma** ekle: `outlets` tablosundaki her outlet için T5 tablosundaki dört satırı (label, translations JSON, callType, sortOrder 0..3) `INSERT … SELECT` ile ekler (`id` için `gen_random_uuid()::text`); satırlar T5 `DEFAULT_CALL_OPTIONS` ile birebir aynı olmalıdır. Test DB'ye `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy`. Testler hâlâ FAIL.
- [ ] **Step 3:** `callOptions.ts` (saf) ve `server/callOptions.ts`'i yaz; yazma yolları `saveOutletDesign` ile aynı yetki/kapsam desenini (`can QM-TEM D` → yoksa `QM-MEN`, `assertOutletScope`, `withAdminTx`, `audit` eylemleri `OUTLET_CALL_OPTION_SAVE|REORDER|REMOVE`) ve `publish({ type:"menu.changed", …, payload:{ op:"callOptions" } })` kullanır. Etiket temizleme `waiterCalls` içindeki `note` dönüşümüyle aynı (HTML etiketi + kontrol karakteri); `sortOrder` yeni kayıtta mevcut en büyük + 1. Sınır kontrolü transaction içinde outlet satırı üzerinde `FOR UPDATE` ile yapılır (eşzamanlı 9. kayıt yarışı).
- [ ] **Step 4:** eylem dosyasını yaz; testler PASS; `npm run check` PASS. Commit: `feat(p5): outlet garson çağrı seçenekleri — şema, migrasyon, servis ve eylemler`.

### Task 5: Varsayılan seçenekler (yeni ve mevcut outletler)

**Files:**
- Create: `merit/src/modules/menu/server/callOptionDefaults.ts`
- Modify: `merit/src/modules/core/server/admin/outlets.ts` (`create`), `merit/prisma/seed.ts` (`seedOutlets`)
- Test: `merit/tests/unit/call-options.test.ts`, `merit/tests/unit/admin-outlets.test.ts`

**Interfaces:**
- Produces: `DEFAULT_CALL_OPTIONS` (sıralı, aşağıdaki tablo) ve `ensureDefaultCallOptions(db: PrismaClient | Prisma.TransactionClient, outletId: string): Promise<void>` — outletin **hiç** seçeneği yoksa ekler, varsa dokunmaz (idempotent). Yalnızca **yeni oluşan** outletlerde çağrılır (`outlets.ts` `create`, `seed.ts` içinde outlet'i yeni oluşturduğu dal); yönetici bir outletin seçeneklerini bilerek boşaltırsa hiçbir yol onları geri getirmez. **Mevcut outletler** T4'teki migrasyonun tek seferlik doldurmasıyla (aynı dört satır) kapsanır.

| tr (label) | callType | en | de | ru | ar |
|---|---|---|---|---|---|
| Peçete istiyorum | GARSON | Napkins, please | Servietten bitte | Салфетки, пожалуйста | مناديل من فضلك |
| Sipariş vereceğim | GARSON | I'd like to order | Ich möchte bestellen | Я хочу сделать заказ | أرغب في الطلب |
| Su istiyorum | GARSON | Water, please | Wasser, bitte | Воды, пожалуйста | ماء من فضلك |
| Hesap | HESAP | The bill, please | Die Rechnung, bitte | Счёт, пожалуйста | الحساب من فضلك |

- [ ] **Step 1: Failing tests:** `"ensureDefaultCallOptions dört seçeneği doğru sırayla ve çevirileriyle ekler"`; `"ikinci çağrı yinelemez"`; `"seçeneği olan outlete dokunmaz"`; `admin-outlets.test.ts`: `"outlet oluşturulunca varsayılan çağrı seçenekleri vardır"`.
- [ ] **Step 2:** FAIL → modülü yaz; `outlets.ts` `create` transaction'ında `tx.outlet.create` sonrası çağır; `seed.ts` `seedOutlets` içinde yalnız `existing` bulunmayıp outlet yeni oluşturulduğunda çağır. Ek test (`call-options.test.ts`): `"DEFAULT_CALL_OPTIONS migrasyon doldurmasıyla aynı etiketleri taşır"` — migrasyon SQL dosyasını okuyup dört Türkçe etiketin (`Peçete istiyorum`, `Sipariş vereceğim`, `Su istiyorum`, `Hesap`) metinde geçtiğini doğrular.
- [ ] **Step 3:** PASS; `npm run check`. Commit: `feat(p5): yeni ve mevcut outletlere varsayılan garson çağrı seçenekleri`.

### Task 6: Çağrı uç noktası ve misafir durumu

**Files:**
- Modify: `merit/src/modules/order/server/waiterCalls.ts`, `merit/src/app/api/q/[token]/call/route.ts`, `merit/src/modules/menu/server/guestState.ts`, `merit/src/modules/menu/ui/previewMenu.ts` (örnek durum)
- Test: `merit/tests/unit/waiter-calls.test.ts`, `merit/tests/unit/guest-menu.test.ts`

**Interfaces:**
- Consumes: T4 `resolveActive`, `listActive`, `GuestCallOption`.
- Produces: `GuestCallInput` içinde `type` isteğe bağlı, `optionId?: string` eklenir; ikisi de yoksa VALIDATION. `GuestState.callOptions: GuestCallOption[]`.

- [ ] **Step 1: Failing tests (waiter-calls.test.ts):**
  - `"optionId seçeneğin tipini ve etiketini nota işler"`: seçenek `{label:"Peçete istiyorum", callType:"GARSON"}`; `createFromGuest({ token, optionId, ip })` (type yok) → satır `{ type:"GARSON", note:"Peçete istiyorum" }`; bildirim başlığı/gövdesi notu içerir.
  - `"istemcinin type'ı seçeneği ezmez"`: `type:"DIGER"` + HESAP seçeneği → satır `HESAP`.
  - `"başka outletin / pasif / olmayan optionId NOT_FOUND ve kayıt açılmaz"` (`waiterCall.count() === 0`).
  - `"farklı seçenekler yan yana açılır, aynı seçenek aynı kaydı döner"`.
  - Mevcut `"aynı masada ikinci GARSON çağrısı aynı kaydı döner"` (notsuz) geçmeye devam eder; yeni: `"aynı tipte farklı notlu çağrı ayrı kayıttır"`.
  - `"dakikada 3 sınırı optionId ile de geçerli"`.
- [ ] **Step 2:** FAIL → `waiterCalls.ts`: `inputSchema.type` `optional`, `optionId: z.string().min(1).max(64).optional()`, `.refine(v => v.type || v.optionId)`. Transaction içinde `optionId` varsa `resolveActive(tx, state.outletId, optionId)` ile `type`/`note` belirlenir (istemci `note`'u yok sayılır); tekrar araması `where` koşuluna `note: <not|null>` eklenir. `route.ts` `optionId` string ise iletir (`type` yoksa `undefined`).
- [ ] **Step 3: `guestState.ts`:** `callOptions: await listActive(outlet.id)` (`GuestState` tipi ve `previewMenu.ts` örnek durumu: `DEFAULT_CALL_OPTIONS`'tan türetilmiş sahte `id`'lerle). Test (guest-menu.test.ts): `"guestState aktif çağrı seçeneklerini sırayla verir, pasifleri vermez"`; `"hiç seçenek yoksa boş dizi"`.
- [ ] **Step 4:** PASS; `npm run check`. Commit: `feat(p5): garson çağrısı optionId desteği ve guestState.callOptions`.

### Task 7: Misafir çağrı alt sayfası ve i18n

**Files:**
- Create: `merit/src/modules/menu/ui/guest/CallSheet.tsx`
- Modify: `merit/src/modules/menu/ui/guest/CallWaiterButton.tsx`, `merit/src/modules/menu/ui/guest/GuestFooter.tsx`, `merit/src/app/(guest)/q/[token]/layout.tsx`, `merit/src/app/(guest)/guest.css`, `merit/src/lib/i18n/messages/{tr,en,de,ru,ar}.json`
- Test: `merit/tests/e2e/guestMenu.spec.ts` (çağrı alt sayfası senaryoları; T10'da çalıştırılır), `merit/tests/unit/call-options.test.ts` (i18n anahtar eşliği)

**Interfaces:**
- Consumes: T4 `callOptionLabel`, T6 `GuestState.callOptions`.
- Produces: `CallWaiterButton({ token, locale, options, preview? }: { token: string; locale: Locale; options: GuestCallOption[]; preview?: boolean })`; `GuestFooter` yeni prop `callOptions: GuestCallOption[]`. i18n anahtarları `guest.call.title`, `guest.call.justCall`, `guest.call.close`.

| anahtar | tr | en | de | ru | ar |
|---|---|---|---|---|---|
| `guest.call.title` | Size nasıl yardımcı olalım? | How can we help? | Wie können wir helfen? | Чем можем помочь? | كيف يمكننا مساعدتك؟ |
| `guest.call.justCall` | Sadece çağır | Just call | Nur rufen | Просто позвать | استدعاء فقط |

- [ ] **Step 1: Failing test (i18n eşliği):** `"guest.call anahtarları 5 dilde de var"` — beş JSON'u okuyup `call.title`, `call.justCall` varlığını ve boş olmadığını doğrular.
- [ ] **Step 2:** FAIL → anahtarları ekle (tablo değerleri birebir) → PASS.
- [ ] **Step 3: `CallSheet.tsx` / `CallWaiterButton.tsx`:** düğme alt sayfayı açar (`role="dialog"`, `aria-modal`, `aria-labelledby` başlığa, açılınca ilk seçeneğe odak, `Esc` ve dış alan kapatır, odak düğmeye döner, odak sayfa içinde döner). Seçenekler `callOptionLabel(option, locale)` ile listelenir (metin olarak render edilir, HTML basılmaz); en altta sabit "Sadece çağır" (`type: "GARSON"`, `optionId` yok). Dokunma: `busy` iken ikinci tıklama yok sayılır, istek `POST /api/q/{token}/call` gövdesi `{ optionId }`; sonuç mesajı mevcut 3 sn'lik `call.sent` / `tooMany` / `callFailed`. `preview` true ise istek atılmaz, yalnızca sayfa kapanır ve "iletildi" gösterilmez. RTL'de düzen aynalanır (mantıksal CSS: `inset-inline`, `padding-inline`). Hiç seçenek yoksa yalnız "Sadece çağır" görünür.
- [ ] **Step 4:** `GuestFooter` ve `layout.tsx` `callOptions={state.callOptions}` iletir; `guest.css` alt sayfa stili (44 px satırlar, tema değişkenleri, `prefers-reduced-motion` için animasyon kapalı).
- [ ] **Step 5: e2e senaryoları (guestMenu.spec.ts):** `"çağrı alt sayfası seçenekleri ve Sadece çağır'ı gösterir"`; `"Peçete istiyorum çağrı notunu yazar (waiter_calls.note)"`; `"çift dokunuşta tek çağrı gider"`; `"seçeneksiz outletde yalnız Sadece çağır"` (Review Focus 1, 3, 6). Çalıştırma T10'da.
- [ ] **Step 6:** `npm run check` PASS. Commit: `feat(p5): misafir garson çağrı alt sayfası ve 5 dilli metinler`.

### Task 8: Stüdyo — sekmeler, genişletilmiş denetçi, kalite paneli

**Files:**
- Create: `merit/src/modules/menu/ui/QualityPanel.tsx`
- Modify: `merit/src/modules/menu/ui/MenuDesignStudio.tsx`, `merit/src/modules/menu/ui/ThemeManager.tsx` (sekme taşıması), stüdyo CSS'i (`xp-menu-studio`/`xp-design-*` kuralının bulunduğu dosya; `grep -rn "xp-menu-studio" src`)
- Test: `merit/tests/e2e/menuAdmin.spec.ts` veya yeni `menuDesignCenter.spec.ts` (T10'da çalışır)

**Interfaces:**
- Consumes: T1 seçenekler/sabitler, T2 `evaluateQuality`, `blockingFindings`, T3 sunum.
- Produces: `QualityPanel({ findings }: { findings: QualityFinding[] })`; stüdyo `rail: "tasarim" | "renk" | "cagri"`.

- [ ] **Step 1:** Üst sekmeler **Tasarım · Renkler · Garson çağrısı** (`role="tablist"`); "Garson çağrısı" bu görevde yalnız yer tutucu değil, T9'a kadar gizli (`hidden`) tutulur — T9 görünür yapar. "Renkler" sekmesi mevcut kütüphane/atama bölümünü taşır (davranış aynı).
- [ ] **Step 2: "Elle düzenle":** tipografi çifti (6 kart önizlemeli), yoğunluk (3 düğme), karşılama stili (3 düğme), küratörlü fotoğraf anahtarı, arama ve süzgeç anahtarları; mevcut anahtarlar korunur. Karşılama = Fotoğraf iken `heroImageUrl` seçici: `nodes` içinden `imageUrl` dolu benzersiz ürünler (`<select>`, etiket = ürün adı; hiç yoksa "Önce bir ürüne fotoğraf ekleyin" notu).
- [ ] **Step 3: Kalite paneli:** `evaluateQuality({ design, theme: selectedTheme, items })` — `items` `MenuTreeNode[]`'den `kind === "OGE"` ve `isActive` olanlar: `{ detail, imageUrl, allergens, tags, translationLangs: translations.map(t => t.lang) }`. `QualityPanel` bulguları düzeye göre sıralar; düzey **metinle** gösterilir ("ENGEL", "UYARI", "BİLGİ"), yalnız renkle değil; bulgu yoksa "Sorun bulunmadı". "Yayına al" `blockingFindings(design, selectedTheme).length > 0` iken devre dışı ve nedenini `aria-describedby` ile bağlar.
- [ ] **Step 4:** `npm run check` PASS. Tarayıcıda (preview) stüdyonun açıldığını, sekmelerin ve panelin çalıştığını doğrula (T10'daki tam doğrulamadan önce hızlı kontrol). Commit: `feat(p5): menü tasarım merkezi — sekmeler, genişletilmiş denetçi ve kalite paneli`.

### Task 9: Stüdyo — Garson çağrısı sekmesi

**Files:**
- Create: `merit/src/modules/menu/ui/CallOptionsPanel.tsx`
- Modify: `merit/src/modules/menu/ui/MenuDesignStudio.tsx`, `merit/src/modules/menu/ui/previewMenu.ts`
- Test: `merit/tests/e2e/menuDesignCenter.spec.ts`

**Interfaces:**
- Consumes: T4 eylemleri (`listCallOptionsAction`, `saveCallOptionAction`, `reorderCallOptionsAction`, `removeCallOptionAction`), `CallOptionRow`, `CALL_LANGS`.
- Produces: `CallOptionsPanel({ outletId, onChanged }: { outletId: string; onChanged(options: CallOptionRow[]): void })`.

- [ ] **Step 1:** Sekmeyi görünür yap. Panel seçili outlet için seçenekleri listeler (etiket, çağrı tipi, aktif anahtarı, eksik dil rozeti "Eksik: Almanca, Rusça"), sürükle-sırala (klavye için yukarı/aşağı düğmeleri de), ekle/düzenle (`FormDialog` + `Field`: Türkçe etiket zorunlu, 4 dil isteğe bağlı, tip seçici Garson/Hesap/Diğer), sil (`confirm`). En altta salt okunur sabit satır "Sadece çağır (her zaman en sonda)". 8 aktif sınırı dolunca "Ekle" nedeniyle devre dışı. Yetkisiz kullanıcı (yazma yok) salt okunur görür.
- [ ] **Step 2:** `onChanged` stüdyo önizlemesindeki `state.callOptions`'ı günceller; önizleme çağrı düğmesine `preview` verir (gönderim yok). `useSse` ile `menu.changed` (`op: "callOptions"`) gelince liste yenilenir.
- [ ] **Step 3: e2e (menuDesignCenter.spec.ts):** `"seçenek ekle, sırala, pasifle ve önizlemede gör"`; `"eksik dil rozeti"`; `"9. aktif seçenek eklenemez"`. Çalıştırma T10'da.
- [ ] **Step 4:** `npm run check` PASS. Commit: `feat(p5): menü tasarım merkezi — garson çağrı seçenekleri sekmesi`.

### Task 10: Uçtan uca doğrulama, tarayıcı kontrolü ve belgeler

**Files:**
- Modify: `merit/tests/e2e/menuDesignCenter.spec.ts` (tamamla), `ilerleme-data.js`, `docs/DEVIR.md`, `merit/README.md` (seed notu)
- Create: `docs/superpowers/plans/2026-11-01-menu-tasarim-merkezi-ledger.md`

- [ ] **Step 1: e2e tamamlama:** `"okunamaz kontrastlı tema ile Yayına al devre dışı"` (stüdyoda Gri/Gri tema seç); `"yayın sonrası misafir menüsü yeni tipografi ve karşılama özniteliklerini taşır"` (`data-typography`, `data-hero`); `"kasa çağrı ekranı seçilen ifadeyi gösterir"` (misafir "Peçete istiyorum" → kasa çağrı listesinde not).
- [ ] **Step 2:** `npm run check` + `npx playwright test` (README: dev DB'ye karşı; dev sunucu 3000) — tümü yeşil; mevcut 751 birim / 83 e2e sayıları düşmemeli, sonuç deftere yazılır.
- [ ] **Step 3: Tarayıcı doğrulaması (preview_start):** stüdyoda krem ve koyu palet, 6 tipografi, hero Fotoğraf/Başlık/Yok, küratörlü mod; misafir menüsü mobil genişlikte (375) ve `?lang=ar` RTL'de çağrı alt sayfası; dokunma hedefleri ≥ 44 px (`getBoundingClientRect`); konsol hatası yok. Ekran görüntüleri deftere eklenir.
- [ ] **Step 4: Belgeler:** `ilerleme-data.js` (yeni görev satırları `done`, `updatedAt`, başlık); `DEVIR.md`'ye "Menü Tasarım Merkezi" bölümü (nerede, nasıl genişletilir, seed davranışı); defter dosyası.
- [ ] **Step 5:** Commit: `chore(p5): menü tasarım merkezi uçtan uca testler ve belgeler`.

---

## Self-Review (yazar)

- **Spec kapsamı:** §3 → T1, T3, T8; §3.1 → T2; §4 → T2, T8; §5.1 → T4, T5; §5.2 → T4, T6; §5.3 → T6, T7; §6 → T8, T9; §7 → T1, T2, T4, T6; §8 → her görevin testi + T10; §9 fazları T1–T10'a eşlendi. Boşluk yok.
- **Tip tutarlılığı:** `GuestCallOption`, `CallOptionRow`, `callOptionLabel`, `resolveActive`, `listActive`, `QualityFinding`, `DesignOptions` yeni alanları görevler arasında aynı adlarla kullanılıyor. Spec §5.2'de "listForGuest(outletId, locale)" geçen yer burada `listActive` + istemcide `callOptionLabel` olarak uygulanır (etiket çözümü istemcide; stüdyo önizlemesi aynı veriyi kullanır) — spec bu doğrultuda güncellendi.
- **Orantı:** Görevler imza, değer ve test adlarını sabitler; gövdeler uygulayıcıya bırakılmıştır.
