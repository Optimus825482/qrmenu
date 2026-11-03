"use client";

import { answer, useConfirmRequest } from "@/shell/confirm";
import { useEffect } from "react";
import { setNotifySurface } from "@/shell/notify";
import { SnackbarHost } from "./Snackbar";
import { ConfirmSheet } from "./ConfirmSheet";
import { ReasonDialog } from "./ReasonDialog";
import { answerReason, useReasonRequest } from "./reason";

/**
 * Single host for the promise dialogs: the same `confirm()` / `alertDialog()` / `askReason()`
 * request is drawn on the chosen surface. Staff and POS pages (kat, depo, ops) mount
 * `variant="sheet"` (bottom sheet + reason dialog + snackbars); the XP desktop keeps its own
 * message box (mounted by ShellClient), so `variant="xp"` only adds the reason dialog.
 */
export function ConfirmHost({ variant }: { variant: "xp" | "sheet" }) {
  const request = useConfirmRequest();
  const reason = useReasonRequest();
  useEffect(() => {
    if (variant === "sheet") setNotifySurface("snackbar");
  }, [variant]);
  return (
    <>
      {variant === "xp" ? null : (
        <>
          <ConfirmSheet
            open={request !== null}
            // A new question remounts the sheet so focus moves to its default button again.
            key={request ? `${request.title}\u0000${request.message}` : "closed"}
            title={request?.title ?? ""}
            message={request?.message}
            danger={request?.danger}
            alert={request?.kind === "alert"}
            confirmLabel={request?.confirmLabel ?? "Evet"}
            cancelLabel={request?.cancelLabel ?? (request?.danger ? "Vazgeç" : "Hayır")}
            onConfirm={() => answer(true)}
            onCancel={() => answer(false)}
          />
          <SnackbarHost />
        </>
      )}
      <ReasonDialog
        open={reason !== null}
        key={reason ? `r:${reason.title}` : "r:closed"}
        title={reason?.title ?? ""}
        message={reason?.message}
        reasons={reason?.reasons ?? []}
        minLength={reason?.minLength ?? 3}
        confirmLabel={reason?.confirmLabel ?? "Onayla"}
        danger={reason?.danger}
        onConfirm={(value) => answerReason(value)}
        onCancel={() => answerReason(null)}
      />
    </>
  );
}
