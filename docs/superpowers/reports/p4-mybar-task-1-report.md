# P4 T1 source report

Commit: `c201ba3` — feat(p4): MyBar veri temeli, olaylar ve ortam ayarlarini ekle.

## Implemented

- `merit/prisma/schema.prisma`: request source language and hotel/business-date index; unique request/product items; transaction request FK (SetNull) and reverse relation; notification push timestamp; subscription failure count and user index; TextTranslation cache model.
- `merit/prisma/migrations/20261103121000_p4_mybar/migration.sql`: matching additive SQL, real quantity/status CHECK constraints, partial unseen/unpushed indexes, FK and unique indexes. Explicit BEGIN/COMMIT. Preflight rejects duplicate product items, invalid quantities and terminal requests missing timestamps without rewriting historical data. Existing nullable columns are null, failure count defaults to zero. No daily request uniqueness added.
- `merit/src/modules/mybar/constants.ts`: exact notification/ack roles, event role kinds, submit/note/quantity caps, explanation validation (trimmed length >=10 and >=3 words with length >1), client-safe event registry.
- `merit/src/modules/mybar/events.ts`: typed transactional publishMybar, scoped by hotel/room/role kinds; reexports registry. `realtime-events.ts` consumes client-safe registry to avoid importing server pg into browser bundles and replaces existing scan.room/mybar.created entries without duplicates.
- `merit/src/lib/env.ts`, `.env.example`: exported envSchema, optional paired VAPID keys and subject validation, explicit none/gtx translation default none, build bypass preserves translation default. Real .env never read or edited.
- `merit/src/lib/settings-defs.ts`: systemOnly guest.ipRateMultiplier integer 1..20, default 1, Misafir metadata.
- `merit/src/lib/rate-limit.ts`: original numeric callers remain synchronous; sync callbacks resolve once each hit/peek. Async callback overload supports existing asynchronous getSetting contract. scaledMax returns Promise<number>, reads system scope, falls back to base on unavailable/invalid setting. Callers using max: () => scaledMax(base) MUST await hit/peek. Parallel async resolutions increment the shared counter synchronously after resolving.

## Rulings and scope

- Existing StaffShell/prototype transport supersedes obsolete minibar UI prerequisites; no duplicate routes/slots added. QR, limiter, i18n, guest token/layout and pool dependency files were present.
- getSetting is asynchronous, while the older limiter API is synchronous. Async overloads preserve compatibility and allow the exact planned callback configuration without inventing a stale synchronous setting cache. P8 owns 30-second caching/invalidation and P5 caller integration.
- No tests/helpers/seed authored; Fable owns tests per user override. No test, lint, check, build, server, Prisma generation or DB commands executed. Only source and SQL static review performed. No claims of runtime validation.
- Existing setSetting does not enforce SETTING_META.systemOnly at the service layer. Notified controller; settings.ts lies outside this task ownership. Multiplier reads explicitly ignore hotel rows; metadata marks it system-only.

## Exact Fable TODO

1. Author task-1 foundation tests from brief: DB unique/CHECK failures, translation unique key, push timestamp/count defaults; env pairing/subject/default/provider; exact explanation examples; role permission matrix and two noncolliding QR fixtures.
2. Author tests/helpers/mybar.ts fixture API and P4 e2e seed fixtures when feature phase requires them; no helper source was added here.
3. Verify guest multiplier default/range/system-only scope, await scaledMax(30) with value 3 =>90 and rejected read =>30; sync callback reevaluated each hit/peek, async callback awaited and concurrent hits capped correctly; numeric limiter behavior unchanged.
4. In an authorized isolated DB, generate Prisma client, apply migration, confirm schema diff and inspect constraints/partial indexes; preflight against representative existing-row violations must abort atomically without loss.
5. Run targeted unit/integration checks and project check/build only under Fable authorization. No results are claimed here.

Report intentionally left ignored/untracked for controller archival; no force-add, merge or push.
