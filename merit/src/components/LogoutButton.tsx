"use client";

import type { FormEvent } from "react";
import { clearUserLocalState } from "@/components/staff/clearUserLocalState";
import { unsubscribePushOnLogout } from "@/shell/push/unsubscribeOnLogout";

/**
 * Signs the user out. A plain POST form: GET /cikis does not exist, so a link or image on another
 * site cannot log anyone out, and the route checks the Origin header. The user's own local state
 * (`merit.u.*`, sessionStorage) is cleared first and this device's push subscription is removed (bounded to 1 s) so the next person on a shared device sees none of it.
 */
export function LogoutButton({ className, label = "Oturumu Kapat", menuitem }: { className?: string; label?: string; menuitem?: boolean }) {
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    event.preventDefault();
    clearUserLocalState();
    // Push aboneliği en çok 1 sn beklenir; sonuç ne olursa olsun form gönderilir.
    void unsubscribePushOnLogout().finally(() => form.submit());
  };
  return (
    <form method="post" action="/cikis" onSubmit={onSubmit}>
      <button
        type="submit"
        role={menuitem ? "menuitem" : undefined}
        className={
          className ??
          "min-h-11 w-full rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        }
      >
        {label}
      </button>
    </form>
  );
}
