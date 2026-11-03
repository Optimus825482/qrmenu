# UX Task 4 raporu

Durum: DONE. Commit: bkz. `git log` (feat(ux): personel/POS'ta tarayıcı diyalogları kaldırıldı ...).

Yapılanlar
- Yeni: `ReasonDialog`, `ConfirmSheet`, `ConfirmHost` (variant xp|sheet), `reason.ts` (askReason), `useDialogFocus`, `src/modules/order/ui/reasons.ts`, `src/app/depo/layout.tsx`.
- Dönüşen çağrılar (10, brief 9 demişti): garson prompt, iptal confirm (yazdır sorusu kaldırıldı, bildirim), depo/tanimlar 5 confirm, depo/doluluk-yukle confirm, kat/duzeltme-onay confirm, kat/qr alert (satır içi role=alert), kat RoomQrModal alert (Teyit Et boşken pasif). Kasa ret modalı ve /kasa/iptal iki aşama -> tek sebep diyaloğu.
- ESLint: no-restricted-globals + no-restricted-properties (window/globalThis). `npx eslint` 0 hata.
- Testler: reason-dialog, confirm-sheet, uxSourceRules (yeni kural; bu dosya T3 commitine (0d0cc5f) süpürüldü), e2e noBrowserDialogs (4 akış), opsScreens uyarlandı.
- Başarı geri bildirimi T3 `notify` ile; ConfirmHost sheet varyantı SnackbarHost'u bağlar ve yüzeyi snackbar yapar.

Sapmalar / devir
- `src/shell/confirm.ts` düzenlenmedi (kural): `askReason` `src/components/ui/reason.ts` içinde; ileride confirmStore yanına taşınabilir. `ConfirmHost variant="xp"` yalnız ReasonDialog ekler (XP ConfirmDialog'u ShellClient çiziyor).
- Dokunma yükseklikleri `var(--tap-std/--tap-pri)` + yedek değer.
- depo/tanimlar e2e: depo.cok tanım düzenleme yetkisi yok, spec admin ile.

Doğrulama
- npm check: 1216 geçti / 5 kalan (4 dosya) benim dışımda: sse-session (session.closed), SSE_EVENT_TYPES "mybar.created" vb.
- next build tamam. Tam e2e: 104 geçti, 4 başarısız (hepsi kat.mr/garson girişinde /erisimim?hos-geldin=1 zorunlu özeti (UX T11) ve definitions.spec Kullanıcı Yönetimi satırı): commandCenter:155, definitionChain:216, shell:48, definitions:420.
