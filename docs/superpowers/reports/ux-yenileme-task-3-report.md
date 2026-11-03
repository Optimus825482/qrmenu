### Spec Compliance

- notify API/store (`merit/src/shell/notify.ts`): success 4000 ms / undo 6000 ms + "Geri al" (l.99-103), max 3 newest-first with FIFO eviction and timer cleanup in `push` (l.82-92), pause/resume with remaining time (l.60-73), `onAction` guarded by `used` flag and failure -> `notify.error("Geri alınamadı: ...")` (l.103-113), `dismiss` clears timer (l.145-152), error: XP -> `alertDialog`, snackbar -> `durationMs:null`, retry only if given (l.123-137). Matches brief; `notify.test.ts` covers each point (fake timers, `getTimerCount()===0`).
- A11y: Snackbar item `role=status aria-live=polite` / error `role=alert` (`components/ui/Snackbar.tsx:33-35`), balloon `role=status aria-live=polite` (`TrayBalloon.tsx:15-16`), nothing steals focus, tray status text `aria-hidden`. Reduced motion: `snackbar.css:55-57` kills both animations. Buttons use `var(--tap-std)`. No emoji (only "x" U+00D7 close glyph in balloon).
- ConfirmDialog (`ConfirmDialog.tsx:20-26,50,64-65`; `confirm.ts:46-57`): `data-confirm` ok/cancel, danger -> default focus + Enter-on-dialog = cancel, `cancelLabel` "Vazgeç"; non-danger keeps Evet/Hayır. `confirmSimpleActions` false in `settings-defs.ts:55` and `confirm.ts:35`.
- No success modal remains: `grep alertDialog(` at 0d0cc5f leaves only Desktop.tsx:117,132, Window.tsx:121,248 (info/limit boxes), notify.ts:126 (XP error). All 27 call sites converted; every `notify.success` I checked (MenuManager, NodeForm, TranslationsTab, PrintersWindow, HotelPanel, SystemPanel, HotelModules, Tables/Users/Members/..., ImageStudio/ImageField, OutletSwitchBar) sits after the `result.ok` check or in the `ok` branch. No success-on-failure path found.
- Hosts mounted once: `TrayBalloonHost` only in the XP branch of `ShellClient.tsx:150-153`; `SnackbarHost` only in `MobileShell.tsx:161`; the two branches are exclusive. Surface switched by `useEffect` on mode.
- `uxSourceRules.test.ts` asserts: (1) no `title: "İşlem tamamlandı"|"Kayıt silindi"`, (2) every brace-balanced `confirm({...danger: true...})` has `confirmLabel:`, (3) no browser `confirm/prompt/alert(` calls. It does not assert anything about `alertDialog(` on success paths (brief only required the first two).
- e2e helpers: `acknowledge` now waits for `role=status` limited to `.xp-balloon, .ui-snackbar` (optionally with text) and asserts `getByRole("dialog")` count 0; legacy titles tolerated via regex; `answer` uses `data-confirm`; new `dismissError` for error boxes; `definitions.spec.ts:403-405` assertions added as required. Meaningful.

### Issues

**Critical**
- none

**Important**
1. Commit is not self-contained / contains another task's code. `ShellClient.tsx` in 0d0cc5f imports `@/components/guide/WelcomeOpener` and adds `welcomeNeeded/welcomeHotelId` props (diff l.9-12, 39-46, 148-150), but `src/components/guide/**` is untracked (`git ls-tree 0d0cc5f` has no such file; `git status` shows `?? merit/src/components/guide/`). A clean checkout of this commit fails to compile. Either drop the Welcome lines from this commit or commit the guide files with their own task. (Task 12 content leaking into Task 3.)

**Minor**
2. `MenuManager.tsx` (create flow, ~l.126): translation failure after a successful create is demoted from a blocking box to `notify.info(...)` (4 s auto-dismiss). The failure text can be missed and the guest menu stays untranslated; use `notify.error(msg, { title })` like the other failure paths (NodeForm keeps a persistent inline message, MenuManager does not).
3. `SystemPanel.tsx` Gemini/DeepL test success now shows only `res.data.message` (model, latency, sample translation dropped) in a 4 s balloon; the diagnostic details were the point of that test. Also redundant template literal `` `${res.data.message}` ``.
4. `FormDialog.successMessage` is wired but no caller passes it (`git grep successMessage` = definition only), so every form save says "“<dialog title>” kaydedildi." rather than the specific sentences the brief asks for ("Outlet kaydedildi").
5. Escape dismiss works only when focus is inside the toast (`Snackbar.tsx:41-46`, `TrayBalloon.tsx:20`); because focus is (correctly) not moved, a keyboard user has no quick way to dismiss. The balloon handler also lacks `stopPropagation`, unlike the snackbar. Consider a global Esc-dismiss of the newest toast when no dialog is open.
6. Both hosts return `null` when empty, so the `role=status` region is created together with its text; some screen readers do not announce a live region inserted already filled. A persistent empty region wrapper is more reliable.
7. Touch: `onMouseEnter` pause fires on tap and `mouseleave` only after tapping elsewhere, so a tapped snackbar can stay paused (`Snackbar.tsx:37-38`). Error snackbar with `retry` is not dismissed after "Tekrar dene".
8. `MobileShell` branch of `ShellClient` never mounts `ConfirmDialog` (pre-existing); with `mobileDefinitions` on, danger `confirm()` would never render. Out of scope here but now more visible since errors go to the snackbar there.
9. `uxSourceRules` rule 1 is title-literal based (case/variable variants such as the old "İşlem Tamamlandı" in ImageField would slip through); `acknowledge` checks role `dialog` only, so a lingering `alertdialog` error box is not caught.

### Assessment

**Task quality:** Needs fixes — notify/confirm/snackbar behaviour, call-site conversion and tests are sound with no success-on-failure or missing-confirm regressions, but the commit drags in an uncommitted `WelcomeOpener` dependency (breaks a clean build) and a partial-failure translation message was downgraded to a 4 s notice.
