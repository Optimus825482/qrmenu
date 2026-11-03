### Spec Compliance
- Icon API: `merit/src/components/icons/Icon.tsx:15-40` typed `name` (from `paths.ts`), `currentColor`, `aria-hidden` by default, `role="img"`+`aria-label`+`<title>` when `title` given. `size` is an untyped number (default 24; 20 not enforced). Minor.
- Allergen icons (`paths.ts:121-139`) and the e2e check (`guestMenu.spec.ts`: `svg[aria-hidden]` + text label + no `title=`) are meaningful.
- No icon-only `<button><Icon/></button>` without a name found (scripted scan); NotificationBell has `aria-label` (`NotificationBell.tsx:61`).
- Motion: `.pulse-once` 600 ms, `1` iteration, `prefers-reduced-motion` -> none (`globals.css`). `pulseOnce` is only triggered via `usePulseOnIncrease` (value increase, not on mount: `prev===null` skipped) in KasaClient only (queue/calls badges). No `animate-bounce|ping|pulse` or `infinite` left in src (grep).
- `formatPrice` (`src/lib/formatPrice.ts`): Intl.NumberFormat, 2 decimals, string/NaN -> 0, invalid currency -> "12,00 XXX", never throws. Matches `money.test.ts`. (Brief said `src/lib/money.ts`; plan file tree says `money.ts` but code uses `formatPrice.ts`; tests name matches. Minor deviation.)
- Currency: kasa/garson pages pass `resolveCurrency(hotelId)` (`kasa/page.tsx:31`, `garson/page.tsx:29`); guest uses `state.currency`/`order.currency`; room-service windows use `o.currency`. `kasaCurrency.spec.ts` flips EUR -> TRY and asserts both symbol present and other absent: good.
- Ratchet: `uxRatchet.test.ts` `compare` fails on both growth and shrink; JSON keyed per file. No owner names (brief says Task 15 target 0, documented in header comment). smallText regex includes 12px (broader than brief's 9-11); acceptable, stricter.
- Emoji rule regex covers 1F000-1FAFF, 2300-23FF, 2600-27BF, 2B00-2BFF, FE0F, 200D (with `u` flag so supplementary planes are fine). Keycap U+20E3 not covered. Minor.

### Issues
**Critical:** none.

**Important**
- `merit/src/shell/theme.css:2802` the "➜" replacement was botched: `content: "\x11" + "92"` (raw control byte 0x11 followed by `92`, a broken `\2192` escape). The XP workflow-step connector now renders garbage/"92". It slips past the emoji test (ASCII/control). Fix: `content: "\2192";` (or an inline SVG/border arrow). Add a guard against control chars in css.

**Minor**
- `RoomServiceOrdersWindow.tsx:106`, `RoomServiceReportsWindow.tsx:148` use `orders[0]?.currency ?? "EUR"` for totals: hard-coded EUR fallback and totals across orders with mixed frozen currencies would be summed under the first order's currency (only relevant if a hotel changes currency mid-history). Prefer showing the hotel currency prop or grouping.
- `Icon` `size` not constrained to 20/24 tiers (docs mention 16/20/24/32+).
- Keycap `⃣` not in emoji regex.
- File name `formatPrice.ts` differs from planned `money.ts`.

### Assessment
**Task quality:** Needs fixes — the icon/currency/ratchet/motion work is solid, but the corrupted `content` in `theme.css:2802` is a visible regression that must be fixed before approval.
