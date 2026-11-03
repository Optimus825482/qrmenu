### Spec Compliance
Diff = review-45680ab.diff (line refs are diff lines). Accepted deviations (migration here, reconciler deferred to T8, late/concurrent tests deferred, no RED evidence) not counted.
- Auth: handle() -> requireUser (apiAuthHelper); commitOccupancy/previewOccupancy -> assertCan(MB-DOL,'O', form hotelId ?? session hotel) (diff ~1660, ~1755); can() fails when hotel is outside ctx scope. Fail-closed. deleteUpload: D on session hotel, lookup scoped to ctx.hotelIds (NOT_FOUND otherwise), D re-check on target hotel (~1990).
- .xlsx/PK magic + <=10 MB before ExcelJS load: parseWorkbook (~1230); body guard in _form.ts (content-length + file.size). Name `.xlsx` check in both services. OK.
- Parser: exact (normalised) headers for standard and P4001 (R.No+Adl at row 8, data row 10), Excel Date UTC components / serial / text formats -> yyyy-MM-dd, year rollover, kind detection order (header -> date analysis -> kindHint). Bad rows go to `errors` with row numbers (not skipped). OK.
- Preview: no writes (no upload row, file, audit). OK.
- Commit: one $transaction (create upload YUKLENDI->ISLENIYOR, upsert records by overlap rule, UploadTask upsert, audit, publish in tx), advisory lock occ:{hotel}:{day}; file saved before tx under `occupancy/{hotelId}/{code}.xlsx` through resolveInside (traversal-safe) and removed if tx fails. OK.
- Delete: tx reverts pending items/empty tasks, nulls completed items' guestRecordId, deletes records, UploadTask -> BEKLIYOR/uploadId null, SILINDI, audit+publish in tx, file removed after commit. OK.
- cleanupOldFiles with per-hotel setting (default 4, key exists). OK.
- Migration: kind is a String column, so the rewrite UPDATEs are safe and idempotent; ADD VALUE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS idempotent; value not used in same tx. OK.
- occupancy.missing only from runUploadWarnings (refId idempotent, no email). occupancy.uploaded only in commit/delete. OK.
- UI: accept=".xlsx", preview step, Turkish, no emoji found.
- Tests: assert DB rows (GuestRecord/UploadTask/Notification counts) per test list.

### Issues
Critical: none.
Important: none.
Minor:
1. upload/route.ts (~190): when `kind` is absent the route calls parseWorkbook BEFORE commitOccupancy's assertCan, so any logged-in user without MB-DOL 'O' triggers a full parse (and gets a VALIDATION message ahead of FORBIDDEN); the doc comment "checked in the service before the file is read" is wrong. Not fail-open (commit still denies), but move auth first or let commitOccupancy accept an optional kind.
2. deleteUpload (~1985-2030): `status === SILINDI` check is outside the tx/lock; two concurrent deletes both pass and double-audit. Re-read status after the advisory lock.
3. Overlap upsert re-points an older record's `uploadId` to the newest upload, so deleting the newest upload deletes records first created by an earlier upload (that earlier upload stays TAMAMLANDI with no rows). Matches the brief's "uploadId update" wording; just be aware (T8/UI wording).
4. parser: no row-count / decompressed-size cap (xlsx zip bomb under 10 MB); P4001 report line without a 4-digit year silently falls back to `today` for year inference with no warning (~1300).
5. UI "Görevleri yeniden üret" posts to /api/minibar/tasks/regenerate, which does not exist yet (T8); and setDailyTaskReconciler is wired nowhere, so tasksGenerated is always false until T8 (accepted deferral).
6. cleanupOldFiles: one failing removeUpload aborts the loop for the remaining files (resolveInside can throw on a corrupt storedPath); wrap per item.

### Assessment
**Task quality:** Approved — security, transactionality, parsing, migration and retention requirements are met with only minor hardening items left.

## Fix round 1
1. Yetki parse'dan önce: `commitOccupancy` artık opsiyonel `kind` kabul eder; `assertCan(MB-DOL,'O')` sonrası kind yoksa dosyadan algılanır. Route yalnız `commitOccupancy` çağırır (parse yok); yanlış yorum düzeltildi. Test: yetkisiz + bozuk dosya = FORBIDDEN, yetkili = VALIDATION; kind'sız yükleme algılanan türü kullanır.
2. `parseWorkbook`: en çok 5000 satır / 64 sütun, aşılırsa VALIDATION "Dosya beklenenden büyük"; `load` girdisi 10 MB ile sınırlı. Testler: satır, sütun, sınır içi.
3. `deleteUpload`: advisory kilit sonrası tx içinde status yeniden okunur; eşzamanlı çift silme = 1 OK + 1 CONFLICT (Promise.all testi, tek audit kaydı).
4. `cleanupOldFiles`: dosya başına try/catch, `{ removed, failed }` döner; test (silinemeyen dosya + sağlam dosya).
Doğrulama: occupancy testleri 40/40 yeşil; `npm run check` lint 0 hata, typecheck hataları yalnız başkalarının dosyalarında (minibar-constants, minibar-stock-status, schema.test legacyIdMap/clientRequestId).
