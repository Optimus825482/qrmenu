# Radar task 6 fix round 1 report

Implementation commit: `c29df98` (ux/yenileme).

Changed source files (under merit/src/modules/radar/server):
- replay/limits.ts: maximum window compares requested wall-clock seconds, not elapsed UTC; keeps wall-clock and instant ordering and explicitly rejects starts after now.
- layers/sparkline.ts: all six source timestamp predicates end inclusively at now/asOf, including the partial current minute.
- layers/minibar.ts: historical GuestRecord and UploadTask queries require createdAt <= asOf; current query branches remain as before.
- replay/sources/staff.ts: idle fetch preserves all operation rows for paging; event mapping discards missing/ineligible sessions without shortening the raw page.
- replay/sources/stock.ts: movement window input is bounded by created_at <= range.lte, as explicitly requested.
- replay/sources/tables.ts: table.scanned accepts successful MISAFIR scans only.

Static inspection: reviewed source diffs, paging boundary algorithm, Prisma GuestRecord/UploadTask.createdAt and QrScanLog.kind declarations. No tests, lint, build, check, DB commands, migrations or servers were run. Tests not run by user request; Fable owns tests. No tests written.

Exact suggested Fable regression cases:
1. now=2026-11-03T10:00:00Z, day=2026-10-25 (Europe/Nicosia fall-back), default 00:00-24:00: accepted despite 25 elapsed UTC hours. Same day 00:00-25:00: rejected. Spring-forward 00:00-25:00 also rejected despite 24 elapsed UTC hours.
2. Retain invalid calendar day, tomorrow, retention boundary/outside, equal/reversed clocks, malformed/out-of-window cursor cases. Today from strictly after now must reject; from exactly now with later to remains accepted.
3. Snapshot asOf=12:34:30: events at 12:34:30 count, at 12:34:30.001 and 12:34:59 do not, for each sparkline source; still 60 buckets.
4. Historical minibar: guest arrival/departure encloses today but createdAt=asOf+1ms must not mark occupied; createdAt=asOf may. UploadTask created after asOf must not surface status/at; existing task updated after asOf retains EKSIK fallback. Current paths remain unaffected.
5. idle source page=2: first complete raw page contains only hidden SISTEM/missing-ref/missing-session rows, later pages contain visible sessions; later visible events must emit once. Also mix eligible/ineligible rows at the same millisecond across page boundaries and an instant larger than page.
6. Stock: assert inner window WHERE includes range.lte, including equality and excluding +1ms; same-millisecond movement ordering remains (created_at,id). Exercise the semantic risk below against snapshot reconstruction before accepting equivalence.
7. Same table/time with successful MISAFIR and staff-kind scans: only MISAFIR emits table.scanned; failed MISAFIR emits none; room scan behavior unchanged.

Unresolved risk requiring controller/Fable decision: requested stock bound excludes post-window movements from the SUM while the base remains current HotelStock.remainingQty. Therefore historical level may differ from snapshot(asOf), which still subtracts all post-asOf movements. For example current remaining=90, movement at 10:00=-5, movement after replay-to=-10: bounded replay emits 90 at 10:00 whereas full historical reconstruction emits 100. This patch follows the explicit reviewed request; no unapproved stock-base redesign was added.
