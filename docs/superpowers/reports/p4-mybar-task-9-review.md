### Spec Compliance
Matches Task 9 within the accepted deviations: paths, dispatch hooked in instrumentation.ts, PushBanner unwired, no unsubscribe on logout.
- Subscription actions are all behind `requireUser()` (pushActions.ts:15,22,26). Endpoint is bound to `ctx.user.id` (pushSubscriptions.ts:68). Unsubscribe is scoped to `{endpoint, userId}` (:90).
- `endpoint` is `@unique` (schema.prisma:690) with upsert. Cap is 10 per user (:75-87).
- SSRF allowlist (pushSubscriptions.ts:31-43): `new URL` normalizes case and punycode, and rejects userinfo and port. A trailing dot is stripped, and IPv6 hosts (`[::1]`) never match. Suffix match is `endsWith("."+base)`. Walk-through of the listed bypasses: `fcm.googleapis.com.evil.com` fails the suffix match, `evil.com#@fcm...` parses to host evil.com, `evil.com/fcm...` is rejected. Tests at push-subscriptions.test.ts cover these. `PUSH_ENDPOINT_ALLOWLIST` is in env.ts and .env.example. web-push uses https.request and does not follow redirects, so an allowlisted host cannot be bounced to an internal address.
- VAPID comes only from env (push.ts:27-34). It returns null with no throw at import, and `web-push` is configured lazily (:70). The private key is never logged and never sent to the client; the public key endpoint sits behind `requireUser`.
- Dispatcher: fire-and-forget via `void ... .catch` (pushDispatcher.ts:96). Concurrency is 8. 404/410 delete the subscription, other errors increment `failCount` and delete at 5. Logs carry only `err.message` and counts, never the endpoint. The `pushed_at` claim gives exactly-once delivery across processes, and recipients are filtered by `e.userIds` plus the claim. The `globalThis` guard makes `startPushDispatcher` idempotent across HMR. TTL 3600, urgency high, and topic are set (push.ts:76-81).
- Payload is `{title, body, url, tag}`, with url and tag built from refId only. No price or guest-identity fields. No emoji, Turkish copy.
- sw.js: `push` shows a notification unless a focused window is open. `notificationclick` runs the target through `safeTarget` (same-origin only, otherwise `/`), so there is no open redirect; the fallback in `openWindow` is also guarded. The fetch handler is unchanged: only GETs, with static, icons, fonts, brand and public menu images cached. No `/api` or authenticated responses are cached.
- `PushToggle` renders null for `unsupported`, `unavailable` and `null`, so it is hidden when VAPID is missing.
- Tests mock web-push via `setPushSenderForTests`, so they are deterministic.

### Issues
**Critical:** none.

**Important:** none.

**Minor**
1. Key validation is length-only: `keys.p256dh` and `keys.auth` have `min(1).max(200/100)` and no base64url charset or length check (pushSubscriptions.ts:51). Garbage keys are accepted, fail in web-push, and are self-cleaned after 5 failures. This is harmless to security and it matches the plan, but it is weaker than the review focus. Suggested fix: `regex(/^[A-Za-z0-9_-]+$/)`, p256dh length about 87, auth length about 22.
2. Takeover through upsert (pushSubscriptions.ts:64-72) is intended for shared devices, and the endpoint URL acts as an unguessable capability, so knowing it is the precondition for a takeover. The `update` also replaces `p256dh` and `auth` with the caller's values. A holder of a leaked endpoint could therefore redirect that device's pushes to garbage (the device cannot decrypt with the attacker's keys). Worse, `usePushSubscription` re-subscribes the current user on every mount when the device is already subscribed (usePushSubscription.ts:88-91). This is a silent takeover with no re-auth. Combined with no unsubscribe on logout (accepted), user A keeps receiving the previous user's pushes (room numbers and notes) on a shared handset until someone else logs in. Accepted risk, but it should be written into DEVIR.md.
3. Cap edge case (pushSubscriptions.ts:75-87): ordering is by `createdAt`, which the upsert does not refresh. A user at the limit who re-registers an old endpoint can have that row deleted in the same call while the returned `id` is the deleted row's. Order by `updatedAt`/`lastUsedAt`, or exclude `row.id` from the delete.
4. The push body carries the guest's free-text note (up to 150 characters, plus product names) via fanout.ts into Google, Apple, Mozilla and WNS and onto lock screens. The plan allows this explicitly (the test enforces a 150-character limit), but it is a privacy trade-off worth confirming with the hotel. Consider omitting the note from the push body.
5. The `postMessage({type:"push"})` to a focused window has no listener. When a window is focused the user gets neither an OS notification nor an in-page signal beyond the existing SSE. Already noted in the hand-off.
6. `claimed` marks `pushed_at` even for users with no subscription, and a crash after the claim loses that push. This is by design and the bell and SSE fallback remain.

### Assessment
**Task quality:** Approved — the SSRF allowlist, user-bound subscriptions, off-request dispatch, same-origin notificationclick and uncached sw are all sound; only minor hardening (key charset validation, cap ordering, shared-device and note-privacy notes) remains.
