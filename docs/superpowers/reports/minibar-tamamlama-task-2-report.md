### Spec Compliance
- Catalog writes: all product group/product/setup/item writes use `withAdminTx` with no hotelId (crud.ts:35-63), which requires the screen permission plus SISTEM and audits YETKISIZ_DENEME. This is equivalent to `assertCatalogWriter`. Tested with R-OTM FORBIDDEN (minibar-catalog.test.ts:106, 246).
- Assignments: `roomTypeSetups.apply` (roomTypeSetups.ts:73) uses `MB-TAN` `D` scoped to the hotel. The room type is locked with `WHERE id AND hotel_id ... FOR UPDATE` (:75), so a foreign room type gives NOT_FOUND. Tests: own hotel OK, other hotel FORBIDDEN, foreign room type NOT_FOUND (test:366).
- Empty-setup guard: VALIDATION with "İçeriği boş setup atanamaz: {ad}" (:99). Setups are locked FOR SHARE (:89), and setup writers take `lockSetup` FOR UPDATE. Deactivate, delete and last-item removal therefore cannot race an assignment. The guard checks only newly added setups.
- Name uniqueness: `nameKey` folds Turkish lowercase and ı to i (catalogCommon.ts:19). `pg_advisory_xact_lock` is taken before the check (:34). A concurrent-create test exists for groups only (test:75). The setup path uses the same helper.
- `checklist.ts` is pure and matches the spec: inside setups are repeated `max(cabinetCount,1)` times, outside ones appear once, inside first, sorted by name with the "tr" collation. Tests cover the required cases. `preview` is compared against `buildChecklist` (test:400).
- `publishDefinition` and `audit` run inside the tx, with the specified action and entity names. The audit list recognises both old and new names (test:421).
- `setupGuide`: `urun-setup` has `required: minibar` and `done` = active product, filled active setup and an assignment (setupGuide.ts:168-174). Tests cover 10 required steps, 10 percent, 100 percent, MINIBAR off, and the empty-setup and no-assignment cases.
- Seed rule is exact. Setup items are added only for `createdSetups` (legacyDefinitions.ts:115). Assignments are added only for created setups, or when the hotel had no room types (:129, :172). `seed-legacy.test.ts:21` proves a deleted item and a deleted assignment are not re-added. :42 proves a deleted setup is recreated with its items and assignments.
- `loadLegacyDefinitions` uses `__dirname` (:47) and is tested with chdir. The extract script logs `error.message` only and honors the data-URI media type for the logo.
- Tests assert DB rows and CONFLICT/VALIDATION paths. There is no prisma or rbac mock; only `realtime.publish` is mocked.

### Issues
**Critical**
- None.

**Important**
- None.

**Minor**
- Price nulling is inconsistent across GET routes. Products return `null` for non-price roles (products/route.ts:32). Setups and setup-items convert null to `0` (setups/route.ts:23, setup-items/route.ts:14). For R-DEP the same field is `null` in one route and `0` in the other. It is not a leak, but it contradicts "prices null for non-price roles". Keep null, or document the legacy-window 0.
- `PUT product-groups` with only `description` sends `name ?? ""`, so it fails with "Grup adı gerekli" (product-groups/route.ts:36). Setups merge the existing values; groups do not.
- `setups.addItem` reads `product.isActive` without a lock (setups.ts:297), and `products.setActive` takes no product lock. A concurrent add and deactivate can leave an active setup holding an inactive product. This is a narrow race.
- `setupGuide` counts any `roomTypeSetup` row, not one tied to an active filled setup (setupGuide.ts:171). Only direct DB edits can reach this, since the service blocks it.
- The advisory-lock name test covers groups only. There is no concurrent setup-name test, and none for non-SISTEM product writes.
- Logo extension for a raw base64 string with no prefix defaults to png. Re-extraction can leave a stale file with the old extension.

### Assessment
**Task quality:** Approved — every Important-calibration item (SISTEM-only catalog writes, hotel-scoped assignment, race-safe name uniqueness, seed not re-adding deleted rows) is implemented and test-proven; only minor consistency nits remain.

## Fix round 1
- Logo çıkarımı: `scripts/extract-logo-file.ts` (`decodeLogo` yeniden kullanıldı); SVG reddedilir, uzantı bayt imzasından (png/jpg/webp), aynı otel kodunun farklı uzantılı eski dosyası silinir. Test: `tests/unit/extract-logo-file.test.ts`.
- Fiyat tutarlılığı: setups ve setup-items GET fiyatı fiyat görmeyen rollerde `null` (0 değil); R-DEP testi üç rota için (`minibar-auth.test.ts`).
- `PUT product-groups`: kayıtlı değerler birleştirilir (yalnız description ile ad korunur); test eklendi.
- `setups.addItem`: ürün satırı `FOR SHARE`, pasif ürün reddedilir; `products.setActive/update(isActive:false)` `FOR UPDATE` alır, aktif setup'ta ise CONFLICT (reddet). Yarış testi eklendi.
- Doğrulama: hedef testler 41/41, `npm run check` kırmızı: yalnız başka ajanların dosyaları (uxRatchet, migrate-*, cashier, kds, room-order, sse-* vb.); benim dosyalarım yeşil.
