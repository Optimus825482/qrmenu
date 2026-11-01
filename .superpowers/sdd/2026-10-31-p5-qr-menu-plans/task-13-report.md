# Task 13 report — KDS mutfak ekranı

## Implemented

- Added `kds.board` with `QS-KDS` view authorization, hotel/outlet session scoping, the `kdsEnabled` conflict response, oldest approval first, and a price-free projection for NEW, PREP, and READY orders.
- Added `/kds` server page and touch-friendly client board. It shows elapsed seconds from approval with green/yellow/red thresholds, supports fullscreen, uses the shared outlet switcher and SSE connection, plays the new-order sound, and exposes only authorized state actions.
- Added unit coverage for unapproved/approved/prep/ready/served state transitions, disabled KDS, absence of price keys, and waiter view/write permissions.
- Added the full KDS e2e sequence through waiter service and guest status.

## Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Focused KDS unit test: 5/5 passed.
- Full unit suite serialized with `npx vitest run --no-file-parallelism --maxWorkers=1`: 71 files, 742 tests passed.
- Focused KDS e2e (`opsScreens.spec.ts --grep KDS`): 1/1 passed.
- `npm run build`: passed. It reports the same three existing dynamic filesystem tracing warnings in `src/lib/uploads.ts`.
- Initial `npm run check` used the default Vitest parallelism (71 workers) and failed from concurrent test DB truncation/seed races (deadlocks, FK/unique conflicts). Re-running lint/typecheck and the full suite serially passed; no implementation test failures remained.

## Commit

`feat(p5): KDS mutfak ekranı — Yeni/Hazırlanıyor/Hazır sütunları, süre renkleri, canlı`

## Review fixes (T13 follow-up)

- Keyed `KdsClient` by `outletId`, so same-route outlet switches remount the client state with the newly rendered board.
- Enforced `prepStartedAt` before transition to HAZIR; direct ONAYLANDI→HAZIR now returns CONFLICT. Added regression coverage.
- `startPrep` now writes `ORDER_PREP` audit within the transaction before publishing `order.prep`; the test asserts one audit entry and confirms repeated starts remain no-ops.
- RED evidence: both new orders regressions failed before implementation (direct HAZIR resolved; ORDER_PREP count was zero).
- Follow-up checks: focused orders/KDS tests 23/23; full serialized suite 71 files / 743 tests; lint/typecheck passed; KDS e2e 1/1; build passed with the existing three uploads tracing warnings.
