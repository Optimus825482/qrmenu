# Task 7 review (c6f7f5d)

### Spec Compliance
- Route auth: all 11 routes go through `handle()` (requireUser). Service-level `assertCan("MB-TAL"|"MB-ZIM", ...)`. Writes on an existing request use `req.hotelId` loaded from the entity (`approveRequest`/`rejectRequest`/`deliverRequest`/`cancelRequest` via `loadRequest`). Create/list/suggest/stock use `ctx.session.hotelId`. No hotelId in query or body.
- State machine: `lockRequest` (FOR UPDATE on stock_requests) then status check. approve and reject only from BEKLEMEDE, deliver only from ONAYLANDI, cancel owner BEKLEMEDE / depo BEKLEMEDE|ONAYLANDI. CONFLICT messages are Turkish and match the brief ("Sadece bekleyen talepler onaylanabilir. Mevcut durum: X", "Talep zaten teslim edildi", "Onaylı olmayan talep teslim edilemez").
- Delivery: request row locked first, then `addToPoolTx` (insert-on-conflict, `lockStocks` in product order). total and remaining increment together; one GIRIS per delivered line, with refType StockRequest and refId. Concurrent double delivery is serialised by the request lock. The test is real (Promise.all, separate transactions) and asserts ["CONFLICT","OK"], remaining 50 and exactly 1 movement.
- Code sequence: per-day (global, matches `code @unique`) `pg_advisory_xact_lock(hashtext('stockreq:'||day))`, then max+1 in the same transaction. The 10-concurrent test is real and asserts 0001..0010.
- Suggest formula `ceil(critical*factor - remaining)`; NORMAL excluded; ACIL first; factor from setting. Tests: 65 and 90.
- No price in responses (stockViews selects no price; tests assert /price/i absent). Audit actions CREATE/APPROVE/REJECT/DELIVER/CANCEL are written in tx; notify and publish take tx.
- KAT: approve, reject and deliver are FORBIDDEN (assertDepo needs A and D). Non-owner KAT cancel gives NOT_FOUND. KAT list is own requests only.
- Pages: `requireScreen` layouts, `data-testid`, Turkish, no emoji, no "sepet".

### Issues
Critical: none.
Important: none.
Minor:
1. Cross-hotel negative scope for request writes is untested. Code is right (assertCan with req.hotelId), but there is no test where a depo bound only to ROYAL approves or delivers a DIAMOND request (expects FORBIDDEN), or where a KAT from another hotel cancels (expects NOT_FOUND). `listRequests` covers only the session hotel. Add one test.
2. Delivery test asserts remaining and total but not `usedQty` unchanged or the movement-sum invariant. `clientRequestId` dedupe is tested sequentially only, not with a concurrent Promise.all pair (the lock makes it correct).
3. `cancelRequest` stores the cancel reason in `rejectReason`. Owner cancel gives no audit "by" difference beyond `after.by`. Acceptable.
4. `isDepoOperator` requires A and D, so any YONETIM role without both degrades to "own requests only" in `listRequests` and kat-style `productHistory`. Verify the R-OTM/R-SYS matrix against the intended YONETIM view.
5. `productHistory` (depo) sums `used` from KULLANIM/MYBAR only and ignores IADE restores. This overstates usage slightly.
6. `setCriticalLevel` upsert on a missing row can lose a concurrent-create race with a unique violation (500). It is rare.
7. Dedupe lookup scans the audit JSON path with no index. It is bounded by the user and action filters.
8. Event publishing is asserted by type only (`toContain`), not by hotel or payload.

### Assessment
**Task quality:** Approved — scope, state machine, single-GIRIS delivery under locks and race-safe codes are correct and tested against real DB rows; only test-coverage gaps remain.
