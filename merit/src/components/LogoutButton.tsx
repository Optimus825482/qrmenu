"use client";

import { clearUserLocalState } from "@/components/staff/clearUserLocalState";

/**
 * Signs the user out. A plain POST form: GET /cikis does not exist, so a link or image on another
 * site cannot log anyone out, and the route checks the Origin header. The user's own local state
 * (`merit.u.*`, sessionStorage) is cleared first so the next person on a shared device sees none of it.
 */
export function LogoutButton({ className, label = "Oturumu Kapat", menuitem }: { className?: string; label?: string; menuitem?: boolean }) {
  return (
    <form method="post" action="/cikis" onSubmit={() => clearUserLocalState()}>
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
